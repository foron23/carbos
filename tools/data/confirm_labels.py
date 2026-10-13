#!/usr/bin/env python3
"""Confirma etiquetas de la cola de revision y materializa un dataset limpio.

Tool de mantenimiento (revision humana), NO es el pipeline de opt-in del usuario:
todo queda local en data/ (ignorado por git), sin subida ni claims medicos.

Reutiliza load_foods de tools/data/fetch_images.py como parser del catalogo.
Requiere SOLO stdlib (json, argparse, shutil, hashlib, pathlib, unicodedata);
no necesita torch/CLIP/Pillow.

Entradas:
  --queue   data/labels/review.queue.jsonl (o review.jsonl para el set completo)
  --catalog src/catalog/catalog.ts (ids validos = nombres de carpeta ImageFolder)

Salidas:
  data/confirmed/<class_id>/<stem>__<sha8(relpath)>.<ext>   arbol ImageFolder
  data/labels/confirmed.jsonl                                log append-only

Uso:
  python3 tools/data/confirm_labels.py --accept-agree --queue data/labels/review.jsonl
  python3 tools/data/confirm_labels.py --class tomate,pan_blanco
  python3 tools/data/confirm_labels.py --decisions - < decisiones.jsonl
  python3 tools/data/confirm_labels.py --dry-run --accept-folder

Referencia spec 12 / D11: "ayudar a mejorar el reconocimiento", sin subida opt-in
ni afirmaciones medicas/diagnosticas/certificacion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from fetch_images import load_foods  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "src/catalog/catalog.ts"
DEFAULT_QUEUE = ROOT / "data/labels/review.queue.jsonl"
DEFAULT_OUT = ROOT / "data/confirmed"
DEFAULT_LOG = ROOT / "data/labels/confirmed.jsonl"
# Los modos automaticos (--accept-agree / --accept-folder) NO son revision humana:
# se materializan en data/proposed y se marcan reviewed=false. Solo la revision
# humana por imagen produce etiquetas "confirmadas".
DEFAULT_PROPOSED_OUT = ROOT / "data/proposed"
DEFAULT_PROPOSED_LOG = ROOT / "data/labels/proposed.jsonl"
AUTO_SOURCES = {"accept-agree", "accept-folder"}

REJECT_LABEL = "__reject__"
IGNORED_EXTS = {".jpeg", ".webp"}
ALLOWED_ACTIONS = {"accept", "topk", "label", "reject", "skip"}


# ---------------------------------------------------------------------------
# Utilidades puras
# ---------------------------------------------------------------------------
def normalize_id(text: str | None) -> str:
    """Normaliza para busqueda: minusculas, sin acentos, sin separadores."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return "".join(ch for ch in stripped.lower() if ch.isalnum())


def build_catalog_index(foods: list[dict]) -> list[tuple[str, str]]:
    """Devuelve pares (termino_normalizado, id) para id/es/en/synonyms."""
    pairs: list[tuple[str, str]] = []
    for food in foods:
        terms = [food.get("id"), food.get("es"), food.get("en"), *(food.get("synonyms") or [])]
        for term in terms:
            norm = normalize_id(term)
            if norm:
                pairs.append((norm, food["id"]))
    return pairs


def search_catalog(index: list[tuple[str, str]], query: str, limit: int = 20) -> list[str]:
    """Ids cuyo id/nombre/sinonimo coincide con query (exacto > prefijo > contiene)."""
    q = normalize_id(query)
    if not q:
        return []
    exact: list[str] = []
    prefix: list[str] = []
    contains: list[str] = []
    seen: set[str] = set()
    for term, cid in index:
        if cid in seen:
            continue
        if term == q:
            exact.append(cid)
            seen.add(cid)
        elif term.startswith(q):
            prefix.append(cid)
            seen.add(cid)
    seen2 = set(exact)
    for term, cid in index:
        if cid in seen2:
            continue
        if q in term:
            contains.append(cid)
            seen2.add(cid)
    ordered = exact + prefix + contains
    return ordered[:limit]


def resolve_decision(
    row: dict,
    action: str,
    label: str | None = None,
    index: int | None = None,
    valid_ids: set[str] | None = None,
) -> dict:
    """Traduce una accion a una decision normalizada; ValueError si es invalida."""
    action = (action or "").strip().lower()
    folder_class = row.get("folderClass")
    if action in ("accept", "accept-agree", "accept-folder"):
        if not folder_class:
            raise ValueError("folderClass ausente (fila flat): usa topk/label/reject")
        return {"label": folder_class, "source": action, "materialize": True}
    if action == "topk":
        chosen = label
        if chosen is None and index is not None:
            topk = row.get("topk") or []
            if not (0 <= index < len(topk)):
                raise ValueError(f"indice topk fuera de rango: {index}")
            chosen = topk[index]["id"]
        if not chosen:
            raise ValueError("topk requiere label o index")
        return {"label": chosen, "source": "topk", "materialize": True}
    if action in ("label", "manual", "search"):
        if not label:
            raise ValueError("label requerido")
        source = "manual" if action in ("label", "manual") else "search"
        return {"label": label, "source": source, "materialize": True}
    if action in ("reject", "reject_unknown"):
        return {"label": REJECT_LABEL, "source": "reject", "materialize": False}
    if action == "skip":
        return {"label": None, "source": "skip", "materialize": False, "skip": True}
    raise ValueError(f"accion desconocida: {action!r}")


def dest_name(path: str, class_id: str) -> Path:
    """data/confirmed/<class_id>/<stem>__<sha8(path)>.<ext> (evita colisiones)."""
    src = Path(path)
    stem = src.stem or "image"
    ext = src.suffix.lower() or ".jpg"
    digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:8]
    return Path(class_id) / f"{stem}__{digest}{ext}"


def load_queue(path: Path) -> list[dict]:
    """Lee un JSONL de cola; ValueError si una linea no es JSON o no es objeto."""
    rows: list[dict] = []
    with path.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{lineno}: JSON invalido: {exc}") from exc
            if not isinstance(row, dict) or not row.get("path"):
                raise ValueError(f"{path}:{lineno}: falta 'path'")
            rows.append(row)
    return rows


def load_decided(log_path: Path) -> dict[str, dict]:
    """Resume: mapa path -> ultima fila del log (append-only, gana la ultima)."""
    decided: dict[str, dict] = {}
    if not log_path.exists():
        return decided
    with log_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(rec, dict) and rec.get("path"):
                decided[rec["path"]] = rec
    return decided


def is_materialized(rec: dict, out_dir: Path) -> bool:
    """Reconciliacion log<->disco: reject siempre decidido; aceptado requiere archivo."""
    label = rec.get("label")
    if label == REJECT_LABEL:
        return True
    if not label:
        return False
    return (out_dir / dest_name(rec["path"], label)).exists()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Materializacion / log
# ---------------------------------------------------------------------------
def materialize(src: Path, dest: Path, hardlink: bool) -> str:
    """Copia (default) o hardlink con fallback a copia. Nunca mueve/borra origen."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return "exists"
    if hardlink:
        try:
            os.link(src, dest)
            return "hardlink"
        except OSError:
            pass
    shutil.copy2(src, dest)
    return "copy"


def append_log(log_path: Path, row: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# Presentacion
# ---------------------------------------------------------------------------
_COLOR = True


def paint(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def fmt_topk(topk: list[dict]) -> str:
    parts = [f"[{i}] {t['id']}({t.get('p', 0):.3f})" for i, t in enumerate(topk)]
    return " ".join(parts)


def resolve_src(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else (ROOT / p)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Revisa la cola y materializa etiquetas. La revision humana por "
        "imagen produce data/confirmed; los modos automaticos producen data/proposed "
        "(propuesto, NO confirmado)."
    )
    p.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    p.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="destino (default: data/confirmed; en modo auto: data/proposed)",
    )
    p.add_argument(
        "--log",
        type=Path,
        default=None,
        help="log de decisiones (default: data/labels/confirmed.jsonl; auto: proposed.jsonl)",
    )
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    p.add_argument("--limit", type=int, default=0, help="max filas, 0=todas")
    p.add_argument("--class", dest="classes", default="", help="filtra por folderClass (csv)")
    p.add_argument("--topk", type=int, default=0, help="max propuestas mostradas")
    p.add_argument(
        "--accept-agree",
        action="store_true",
        help="auto (SIN revision): materializa folderClass si agree -> data/proposed",
    )
    p.add_argument(
        "--accept-folder",
        action="store_true",
        help="auto (SIN revision): materializa folderClass siempre -> data/proposed",
    )
    p.add_argument("--decisions", default=None, help="JSONL de decisiones; '-' = stdin")
    p.add_argument("--copy", action="store_true", help="materializa por copia (default)")
    p.add_argument("--hardlink", action="store_true", help="materializa por hardlink (fallback copia)")
    p.add_argument("--redo", action="store_true", help="ignora resume y reprocesa")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-color", action="store_true")
    args = p.parse_args()
    auto = args.accept_agree or args.accept_folder
    if args.out_dir is None:
        args.out_dir = DEFAULT_PROPOSED_OUT if auto else DEFAULT_OUT
    if args.log is None:
        args.log = DEFAULT_PROPOSED_LOG if auto else DEFAULT_LOG
    return args


def select_rows(rows: list[dict], classes: list[str], limit: int) -> list[dict]:
    if classes:
        wanted = set(classes)
        rows = [r for r in rows if r.get("folderClass") in wanted]
    if limit and limit > 0:
        rows = rows[:limit]
    return rows


def record(row: dict, label: str, source: str, reviewed: bool, via: str) -> dict:
    topk = row.get("topk") or []
    return {
        "path": row["path"],
        "label": label,
        "source": source,
        "reviewed": bool(reviewed),
        "via": via,
        "ts": now_iso(),
        "folderClass": row.get("folderClass"),
        "top1": topk[0]["id"] if topk else None,
        "agree": row.get("agree"),
    }


def apply_decision(row: dict, dec: dict, args: argparse.Namespace, counters: dict) -> None:
    path = row["path"]
    label = dec["label"]
    source = dec["source"]
    reviewed = source not in AUTO_SOURCES
    via = "auto" if source in AUTO_SOURCES else ("machine" if args.decisions else "interactive")

    if dec.get("skip"):
        counters["skipped"] += 1
        counters["handled"].add(path)
        print(paint(f"SKIP   {path}", "90"))
        return

    if label == REJECT_LABEL:
        counters["rejected"] += 1
        counters["handled"].add(path)
        if not args.dry_run:
            append_log(args.log, record(row, label, source, reviewed, via))
        print(paint(f"REJECT {path}", "31") + (paint(" (dry-run)", "90") if args.dry_run else ""))
        return

    if label not in counters["valid_ids"]:
        counters["errors"] += 1
        print(f"WARN   {path}: label '{label}' no es id del catalogo; se omite", file=sys.stderr)
        return

    src = resolve_src(path)
    if not src.exists():
        counters["errors"] += 1
        counters["handled"].add(path)
        print(f"WARN   {path}: imagen origen ausente; se omite", file=sys.stderr)
        return

    if src.suffix.lower() in IGNORED_EXTS:
        print(
            f"AVISO  {path}: extension '{src.suffix}' no la ve distill_clip (.png/.jpg); "
            "quedara fuera del entrenamiento",
            file=sys.stderr,
        )

    dest_rel = dest_name(path, label)
    dest_abs = args.out_dir / dest_rel
    counters["accepted"] += 1
    counters["handled"].add(path)
    suffix = ""
    if not args.dry_run:
        mode = materialize(src, dest_abs, args.hardlink and not args.copy)
        append_log(args.log, record(row, label, source, reviewed, via))
        suffix = paint(f" [{mode}]", "90")
    else:
        suffix = paint(" (dry-run)", "90")
    print(paint(f"ACCEPT {label:<16}", "32") + f"{path} -> {dest_rel}{suffix}")


def show_row(idx: int, total: int, row: dict, topk: list[dict]) -> None:
    agree = row.get("agree")
    flag = paint("agree", "32") if agree else paint("disagree", "33") if agree is False else "n/a"
    folder = row.get("folderClass") or paint("(flat: sin folderClass)", "33")
    print()
    print(paint(f"[{idx}/{total}]", "36") + f" {row['path']}")
    print(f"  carpeta: {folder}   top1/margen: {flag} {row.get('margin', '-')}")
    print(f"  propuestas: {fmt_topk(topk)}")


def interactive_decide(
    idx: int,
    total: int,
    row: dict,
    valid_ids: set[str],
    index: list[tuple[str, str]],
    args: argparse.Namespace,
) -> tuple[str, dict | None]:
    raw_topk = row.get("topk") or []
    topk = raw_topk[: args.topk] if args.topk > 0 else raw_topk
    while True:
        show_row(idx, total, row, topk)
        try:
            key = input("  [0..%d/a/s/r/n/q/?] > " % (len(topk) - 1) if topk else "  [a/s/r/n/q/?] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return "quit", None
        low = key.lower()
        if key == "" or low == "a":
            cid = row.get("folderClass")
            if not cid:
                print("  fila flat sin folderClass: usa numero/s/r/n")
                continue
            if cid not in valid_ids:
                print(f"  folderClass '{cid}' no es id del catalogo; usa topk/busqueda")
                continue
            return "ok", {"label": cid, "source": "accept", "materialize": True}
        if low == "q":
            return "quit", None
        if low == "n":
            return "skip", {"label": None, "source": "skip", "materialize": False, "skip": True}
        if low == "r":
            return "ok", {"label": REJECT_LABEL, "source": "reject", "materialize": False}
        if low in ("?", "h"):
            print("  0..K-1 elegir propuesta | a/Enter aceptar carpeta | s buscar | "
                  "r rechazar/no comida | n saltar | q salir")
            continue
        if low == "s":
            try:
                query = input("  buscar: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return "quit", None
            matches = search_catalog(index, query)
            if not matches:
                print("  sin coincidencias")
                continue
            for i, cid in enumerate(matches):
                print(f"    [{i}] {cid}")
            try:
                sel = input("  numero (Enter=cancelar): ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return "quit", None
            if sel.isdigit() and int(sel) < len(matches):
                return "ok", {"label": matches[int(sel)], "source": "search", "materialize": True}
            if sel:
                print("  seleccion invalida")
            continue
        if key.isdigit():
            i = int(key)
            if 0 <= i < len(topk):
                return "ok", {"label": topk[i]["id"], "source": "topk", "materialize": True}
            print("  numero fuera de rango")
            continue
        manual = normalize_id(key)
        hit = next((cid for cid in valid_ids if normalize_id(cid) == manual), None)
        if hit:
            return "ok", {"label": hit, "source": "manual", "materialize": True}
        print("  tecla no reconocida (?)")


def load_decisions(path_arg: str) -> list[dict]:
    stream = sys.stdin if path_arg == "-" else open(path_arg, encoding="utf-8")
    decisions: list[dict] = []
    try:
        for lineno, line in enumerate(stream, 1):
            line = line.strip()
            if not line:
                continue
            try:
                dec = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"decisiones:{lineno}: JSON invalido: {exc}") from exc
            if not isinstance(dec, dict) or not dec.get("path"):
                raise ValueError(f"decisiones:{lineno}: falta 'path'")
            decisions.append(dec)
    finally:
        if stream is not sys.stdin:
            stream.close()
    return decisions


def main() -> int:
    global _COLOR
    args = parse_args()
    _COLOR = not args.no_color and sys.stdout.isatty()

    for label, path in (("catalogo", args.catalog), ("cola", args.queue)):
        if not path.exists():
            print(f"error: {label} no encontrado: {path}", file=sys.stderr)
            return 2
    if args.decisions and args.decisions != "-" and not Path(args.decisions).exists():
        print(f"error: decisiones no encontrado: {args.decisions}", file=sys.stderr)
        return 2

    try:
        foods = load_foods(args.catalog)
    except SystemExit as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if not foods:
        print("error: catalogo sin foods", file=sys.stderr)
        return 2
    valid_ids = {f["id"] for f in foods}
    index = build_catalog_index(foods)

    try:
        rows = load_queue(args.queue)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    classes = [c.strip() for c in args.classes.split(",") if c.strip()]
    selected = select_rows(rows, classes, args.limit)
    selected_by_path = {r["path"]: r for r in selected}
    if not selected:
        print("error: la cola no tiene filas seleccionadas", file=sys.stderr)
        return 2

    decided = {} if args.redo else {
        p: r for p, r in load_decided(args.log).items() if is_materialized(r, args.out_dir)
    }

    counters = {
        "valid_ids": valid_ids,
        "accepted": 0,
        "rejected": 0,
        "skipped": 0,
        "already": 0,
        "errors": 0,
        "handled": set(),
    }
    quit_requested = False

    if args.decisions is not None:
        try:
            decisions = load_decisions(args.decisions)
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        for dec in decisions:
            row = selected_by_path.get(dec.get("path"))
            if row is None:
                continue
            if row["path"] in decided:
                counters["already"] += 1
                counters["handled"].add(row["path"])
                print(paint(f"ALREADY {row['path']}", "90"))
                continue
            try:
                action = dec.get("action", "accept")
                if action not in ALLOWED_ACTIONS:
                    raise ValueError(f"accion desconocida: {action!r}")
                resolved = resolve_decision(
                    row,
                    action,
                    label=dec.get("label"),
                    index=dec.get("index"),
                    valid_ids=valid_ids,
                )
            except ValueError as exc:
                counters["errors"] += 1
                print(f"WARN   {row['path']}: {exc}", file=sys.stderr)
                continue
            apply_decision(row, resolved, args, counters)
    elif args.accept_agree or args.accept_folder:
        source = "accept-folder" if args.accept_folder else "accept-agree"
        for row in selected:
            if row["path"] in decided:
                counters["already"] += 1
                counters["handled"].add(row["path"])
                continue
            if args.accept_agree and not row.get("agree"):
                counters["skipped"] += 1
                counters["handled"].add(row["path"])
                print(paint(f"SKIP   {row['path']} (desacuerdo)", "90"))
                continue
            try:
                resolved = resolve_decision(row, source, valid_ids=valid_ids)
            except ValueError as exc:
                counters["errors"] += 1
                print(f"WARN   {row['path']}: {exc}", file=sys.stderr)
                continue
            apply_decision(row, resolved, args, counters)
    else:
        total = len(selected)
        for n, row in enumerate(selected, 1):
            if row["path"] in decided:
                counters["already"] += 1
                counters["handled"].add(row["path"])
                continue
            state, dec = interactive_decide(n, total, row, valid_ids, index, args)
            if state == "quit":
                quit_requested = True
                break
            if state == "skip":
                counters["skipped"] += 1
                counters["handled"].add(row["path"])
                print(paint(f"SKIP   {row['path']}", "90"))
                continue
            if dec is not None:
                apply_decision(row, dec, args, counters)

    handled = counters["handled"]
    remaining = max(0, len(selected) - len(handled))
    print(
        "\nresumen: "
        f"seleccionadas={len(selected)} procesadas={len(handled)} "
        f"aceptadas={counters['accepted']} rechazadas={counters['rejected']} "
        f"saltadas={counters['skipped']} ya_decididas={counters['already']} "
        f"errores={counters['errors']} restantes={remaining}"
    )
    return 3 if quit_requested else 0


if __name__ == "__main__":
    raise SystemExit(main())
