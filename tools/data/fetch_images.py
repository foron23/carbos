#!/usr/bin/env python3
"""Descarga imagenes candidatas por id de catalogo desde Wikimedia Commons.

Solo stdlib. Escribe data/images/<id>/<nnn>.<ext> y data/images/<id>/attribution.jsonl.
El directorio data/ esta en .gitignore: las imagenes/atribuciones son locales, nunca
seversionan ni redistribuyen.

Uso:
  python3 tools/data/fetch_images.py --classes pan_blanco,tomate --per-class 4 --dry-run
  python3 tools/data/fetch_images.py --classes pan_blanco,tomate --per-class 4
  python3 tools/data/fetch_images.py --all --per-class 20 --free-only
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "src/catalog/catalog.ts"
DEFAULT_SELECTION = ROOT / "tools/catalog/selection.csv"
DEFAULT_OUT = ROOT / "data/images"
DEFAULT_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = (
    "carbos-data/0.1 (https://github.com/foron23/carbos; "
    "D25 image sourcing; contact foron23@users.noreply.github.com)"
)

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
FREE_RE = re.compile(r"(?i)cc0|public domain|^pd|no restrictions|attribution")
NONFREE_RE = re.compile(r"(?i)non-free|fair use|all rights reserved|^copyright")
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def rel_to_root(path: Path) -> str:
    """Ruta posix relativa a ROOT si es posible; si no, absoluta (--out externo)."""
    resolved = path.resolve()
    try:
        return resolved.relative_to(ROOT).as_posix()
    except ValueError:
        return resolved.as_posix()


# --------------------------------------------------------------------------
# Catalogo (mismo parser que review_labels.py; ver nota de duplicacion)
# --------------------------------------------------------------------------
def _js_string(raw: str) -> str:
    try:
        return json.loads('"' + raw + '"')
    except json.JSONDecodeError:
        return raw


def load_foods(catalog_path: Path) -> list[dict]:
    """Extrae {id, en, es, synonyms} de catalog.ts (emitido con forma fija)."""
    text = catalog_path.read_text(encoding="utf-8")
    start = text.find("foods: [")
    if start < 0:
        raise SystemExit(f"catalog: no se encontro 'foods: [' en {catalog_path}")
    body = text[start:]
    marks = list(re.finditer(r'\bid:\s*"([^"]+)"', body))
    if not marks:
        raise SystemExit(f"catalog: cero foods parseados en {catalog_path}")
    foods: list[dict] = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        chunk = body[m.end():end]
        name_m = re.search(
            r'name:\s*\{\s*es:\s*"(?P<es>[^"]*)"\s*,\s*en:\s*(?P<en>"[^"]*"|null)\s*\}',
            chunk,
        )
        if not name_m:
            raise SystemExit(f"catalog: no se pudo parsear name de id '{m.group(1)}'")
        en_raw = name_m.group("en")
        en = None if en_raw == "null" else _js_string(en_raw[1:-1])
        es = _js_string(name_m.group("es"))
        syn_m = re.search(r'synonyms:\s*\[([^\]]*)\]', chunk)
        synonyms = [_js_string(s) for s in re.findall(r'"([^"]*)"', syn_m.group(1))] if syn_m else []
        foods.append({"id": m.group(1), "en": en, "es": es, "synonyms": synonyms})
    return foods


def cross_check(foods: list[dict], selection_path: Path) -> None:
    if not selection_path.exists():
        return
    with selection_path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    ids = [r["id"] for r in rows if r.get("id")]
    if len(ids) != len(foods):
        print(
            f"AVISO catalog: catalog.ts tiene {len(foods)} ids pero selection.csv "
            f"tiene {len(ids)}; revisa el parser",
            file=sys.stderr,
        )


def pick(foods: list[dict], ids: list[str]) -> list[dict]:
    by_id = {f["id"]: f for f in foods}
    out = []
    for cid in ids:
        if cid in by_id:
            out.append(by_id[cid])
        else:
            print(f"AVISO: id desconocido '{cid}' (ignorado)", file=sys.stderr)
    return out


# --------------------------------------------------------------------------
# Atribucion / licencias
# --------------------------------------------------------------------------
def clean_author(value) -> str:
    if not value:
        return "Unknown"
    text = html.unescape(str(value))
    text = TAG_RE.sub(" ", text)
    return WS_RE.sub(" ", text).strip() or "Unknown"


def ext_value(extmetadata: dict, key: str):
    entry = extmetadata.get(key)
    if isinstance(entry, dict):
        return entry.get("value")
    return None


def license_info(extmetadata: dict) -> tuple[str, str]:
    name = ext_value(extmetadata, "LicenseShortName") or ext_value(extmetadata, "UsageTerms")
    url = ext_value(extmetadata, "LicenseUrl") or ""
    return (str(name).strip() if name else "Unknown"), str(url).strip()


def is_free(license_name: str) -> bool:
    return bool(FREE_RE.search(license_name)) and not NONFREE_RE.search(license_name)


def is_nonfree(license_name: str) -> bool:
    return bool(NONFREE_RE.search(license_name))


# --------------------------------------------------------------------------
# Red
# --------------------------------------------------------------------------
def call_api(api: str, params: dict, timeout: float, retries: int) -> dict:
    url = api + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (429, 503) and attempt < retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait = float(retry_after) if (retry_after or "").strip().isdigit() else 2.0 ** attempt
                time.sleep(wait)
                continue
            if attempt < retries:
                time.sleep(2.0 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt < retries:
                time.sleep(2.0 ** attempt)
                continue
            raise
    raise RuntimeError(f"fallo API tras {retries + 1} intentos: {last}")


def search(api: str, term: str, gsrlimit: int, width: int, timeout: float, retries: int) -> list[dict]:
    data = call_api(
        api,
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": term,
            "gsrnamespace": "6",
            "gsrlimit": str(gsrlimit),
            "prop": "imageinfo",
            "iiprop": "url|mime|size|extmetadata",
            "iiurlwidth": str(width),
        },
        timeout,
        retries,
    )
    pages = (data.get("query") or {}).get("pages") or {}
    ordered = sorted(pages.values(), key=lambda p: p.get("index", 0))
    return ordered


def download(url: str, timeout: float, retries: int) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                return resp.read(), ctype
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (429, 503) and attempt < retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait = float(retry_after) if (retry_after or "").strip().isdigit() else 2.0 ** attempt
                time.sleep(wait)
                continue
            if exc.code in (404, 403):
                raise
            if attempt < retries:
                time.sleep(2.0 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
            if attempt < retries:
                time.sleep(2.0 ** attempt)
                continue
            raise
    raise RuntimeError(f"fallo descarga tras {retries + 1} intentos: {last}")


def sniff_ext(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def image_size(data: bytes, ext: str) -> tuple[int, int] | None:
    """Dimensiones reales de los bytes descargados (solo stdlib)."""
    try:
        if ext == "png":
            if len(data) >= 24 and data[12:16] == b"IHDR":
                return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
            return None
        if ext == "jpg":
            return _jpeg_size(data)
        if ext == "webp":
            return _webp_size(data)
    except (struct.error, ValueError, IndexError):
        return None
    return None


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    i, n = 2, len(data)
    while i + 9 <= n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height = int.from_bytes(data[i + 5:i + 7], "big")
            width = int.from_bytes(data[i + 7:i + 9], "big")
            return width, height
        i += 2 + seg_len
    return None


def _webp_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[8:12] != b"WEBP":
        return None
    fourcc = data[12:16]
    if fourcc == b"VP8 ":
        width = int.from_bytes(data[26:28], "little") & 0x3FFF
        height = int.from_bytes(data[28:30], "little") & 0x3FFF
        return width, height
    if fourcc == b"VP8L":
        bits = int.from_bytes(data[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if fourcc == b"VP8X":
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    return None


# --------------------------------------------------------------------------
# Estado local / dedupe
# --------------------------------------------------------------------------
def load_existing_titles(attr_path: Path) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if not attr_path.exists():
        return mapping
    with attr_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            title, fname = rec.get("title"), rec.get("file")
            if title and fname:
                mapping[title] = Path(fname).name
    return mapping


def max_index(class_dir: Path) -> int:
    best = 0
    if class_dir.exists():
        for p in class_dir.iterdir():
            m = re.match(r"^(\d+)\.(jpg|png|webp)$", p.name)
            if m:
                best = max(best, int(m.group(1)))
    return best


def queries_for(food: dict, max_queries: int) -> tuple[list[str], list[str]]:
    en = food.get("en")
    primary = [en] if en else [food["es"]]
    primary += list(food.get("synonyms") or [])
    fallback = [food["es"]] + list(food.get("synonyms") or []) if en else []
    def uniq(seq):
        out = []
        for t in seq:
            if t and t not in out:
                out.append(t)
        return out
    return uniq(primary)[:max_queries], uniq(fallback)[:max_queries]


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Descarga imagenes candidatas de Wikimedia Commons por id de catalogo.")
    p.add_argument("--classes", default="", help="ids separados por coma")
    p.add_argument("--all", action="store_true", help="todos los ids del catalogo")
    p.add_argument("--per-class", type=int, default=20)
    p.add_argument("--width", type=int, default=640, help="iiurlwidth")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    p.add_argument("--delay", type=float, default=1.0, help="pausa entre llamadas HTTP")
    p.add_argument("--max-queries", type=int, default=3)
    p.add_argument("--gsrlimit", type=int, default=50)
    p.add_argument("--min-bytes", type=int, default=4096)
    p.add_argument("--free-only", action="store_true")
    p.add_argument("--license-allow", default=None, help="regex allowlist sobre LicenseShortName")
    p.add_argument("--api", default=DEFAULT_API)
    p.add_argument("--timeout", type=float, default=30.0)
    p.add_argument("--retries", type=int, default=3)
    p.add_argument("--overwrite", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def process_class(food, args, allow_re, counters) -> None:
    cid = food["id"]
    class_dir = args.out / cid
    attr_path = class_dir / "attribution.jsonl"
    existing = load_existing_titles(attr_path)
    next_n = max_index(class_dir) + 1
    accepted = 0
    primary, fallback = queries_for(food, args.max_queries)

    print(f"[{cid}] queries={primary}" + (f" fallback={fallback}" if fallback else ""))

    def try_terms(terms, accepted: int) -> int:
        nonlocal next_n
        seen_titles = set(existing)
        for term in terms:
            if accepted >= args.per_class:
                break
            if args.dry_run:
                continue
            time.sleep(max(args.delay, 0.0))
            try:
                pages = search(args.api, term, args.gsrlimit, args.width, args.timeout, args.retries)
            except Exception as exc:  # noqa: BLE001 - red flaky: avisar y seguir
                print(f"  AVISO [{cid}] busqueda '{term}' fallo: {exc}", file=sys.stderr)
                continue
            for page in pages:
                if accepted >= args.per_class:
                    break
                title = page.get("title", "")
                ii_list = page.get("imageinfo") or []
                if not ii_list or not title.startswith("File:"):
                    continue
                ii = ii_list[0]
                if ii.get("mime") not in ALLOWED_MIME:
                    continue
                if title in seen_titles and not args.overwrite:
                    continue
                extmetadata = ii.get("extmetadata") or {}
                lic_name, lic_url = license_info(extmetadata)
                if args.free_only and not is_free(lic_name):
                    continue
                if allow_re and not allow_re.search(lic_name):
                    continue
                if args.license_allow and not re.search(args.license_allow, lic_name):
                    continue
                thumb = ii.get("thumburl") or ii.get("url")
                if not thumb:
                    continue

                if title in existing and args.overwrite:
                    fname = existing[title]
                    target = class_dir / fname
                else:
                    target = None

                try:
                    time.sleep(max(args.delay, 0.0))
                    data, ctype = download(thumb, args.timeout, args.retries)
                except Exception as exc:  # noqa: BLE001
                    print(f"  AVISO [{cid}] descarga '{title}' fallo: {exc}", file=sys.stderr)
                    continue
                if not ctype.startswith("image/"):
                    print(f"  AVISO [{cid}] content-type no-imagen ({ctype}) para {title}", file=sys.stderr)
                    continue
                if len(data) < args.min_bytes:
                    print(f"  AVISO [{cid}] archivo pequeno ({len(data)}B) {title}", file=sys.stderr)
                    continue
                sniffed = sniff_ext(data)
                if sniffed is None:
                    print(f"  AVISO [{cid}] magic bytes desconocidos {title}", file=sys.stderr)
                    continue
                if target is None:
                    target = class_dir / f"{next_n:03d}.{sniffed}"
                    next_n += 1
                else:
                    target = target.with_suffix(f".{sniffed}")

                class_dir.mkdir(parents=True, exist_ok=True)
                part = target.with_suffix(target.suffix + ".part")
                part.write_bytes(data)
                os.replace(part, target)

                actual = image_size(data, sniffed)
                api_w = ii.get("thumbwidth") if ii.get("thumburl") else ii.get("width")
                api_h = ii.get("thumbheight") if ii.get("thumburl") else ii.get("height")
                record = {
                    "title": title,
                    "author": clean_author(ext_value(extmetadata, "Artist")),
                    "license": lic_name,
                    "licenseUrl": lic_url,
                    "sourceUrl": ii.get("url", ""),
                    "pageUrl": ii.get("descriptionurl", ""),
                    "query": term,
                    "classId": cid,
                    "file": rel_to_root(target),
                    "mime": ii.get("mime") or f"image/{sniffed}",
                    "ext": sniffed,
                    "width": actual[0] if actual else (api_w or ii.get("width")),
                    "height": actual[1] if actual else (api_h or ii.get("height")),
                    "bytes": len(data),
                }
                try:
                    with attr_path.open("a", encoding="utf-8") as fh:
                        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
                except OSError as exc:
                    target.unlink(missing_ok=True)
                    print(
                        f"  AVISO [{cid}] no se pudo escribir atribucion ({exc}); imagen descartada",
                        file=sys.stderr,
                    )
                    continue
                seen_titles.add(title)
                existing[title] = target.name
                accepted += 1
                print(f"  + {target.name}  {title}")
        return accepted

    if args.dry_run:
        print(f"[{cid}] plan: hasta {args.per_class} imagenes; terms={primary}")
        return

    accepted = try_terms(primary, accepted)
    if accepted < args.per_class and fallback:
        accepted = try_terms(fallback, accepted)

    counters[cid] = accepted
    if accepted < args.per_class:
        print(
            f"AVISO [{cid}] cuota no alcanzada: {accepted}/{args.per_class}",
            file=sys.stderr,
        )


def main() -> int:
    args = parse_args()
    args.out = args.out.expanduser().resolve()
    if not args.catalog.exists():
        print(f"error: catalogo no encontrado: {args.catalog}", file=sys.stderr)
        return 2
    foods = load_foods(args.catalog)
    cross_check(foods, DEFAULT_SELECTION)

    if args.classes:
        ids = [c.strip() for c in args.classes.split(",") if c.strip()]
        selected = pick(foods, ids)
    elif args.all or not args.classes:
        selected = foods
    else:
        selected = []

    if not selected:
        print("error: no hay clases seleccionadas", file=sys.stderr)
        return 2

    allow_re = re.compile(args.license_allow) if args.license_allow else None

    if args.dry_run:
        print(f"DRY-RUN: {len(selected)} clases, hasta {args.per_class} c/u -> {args.out}")
        for food in selected:
            primary, fallback = queries_for(food, args.max_queries)
            print(f"  {food['id']}: primario={primary} fallback={fallback if fallback else '-'}")
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    counters: dict[str, int] = {}
    for food in selected:
        try:
            process_class(food, args, allow_re, counters)
        except Exception as exc:  # noqa: BLE001 - una clase no debe tumbar el resto
            print(f"ERROR [{food['id']}]: {exc}", file=sys.stderr)
            counters[food["id"]] = -1

    total = sum(c for c in counters.values() if c > 0)
    print(f"Total descargadas/aceptadas: {total} en {len(selected)} clases")
    hard = any(c < 0 for c in counters.values())
    return 1 if hard and total == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
