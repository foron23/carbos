#!/usr/bin/env python3
"""Importa un bundle de contribuciones de usuarios (spec 12) al dataset local.

El bundle lo produce la app (export opt-in) o un formulario; este script es el
**receptor**, sin servidor: valida el consentimiento y la licencia, verifica que
cada fichero es una imagen real, **elimina EXIF/GPS**, deduplica por sha256 y
deja las imagenes en `data/contrib/<clase>/` con un log append-only.

Formato del bundle (zip o directorio):

    contributions-<ts>.zip
      consent.json   {"format":"carbos-contrib","version":1,"license":"CC0-1.0",
                      "granted_at":"...","app_version":"...","images":N}
      metadata.csv   cabecera `path,class_id`; una fila por imagen
      images/<class_id>/<name>.<ext>

La licencia por defecto es **CC0-1.0** (la mas compatible con el proyecto AGPL-3.0).
Un bundle sin `consent.json` o con licencia no permitida se rechaza entero.

Uso:
    python3 tools/data/import_contributions.py --bundle contributions-2026-10-13.zip
    python3 tools/data/import_contributions.py --bundle ./inbox --dry-run
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_images import load_foods  # noqa: E402
from package_dataset import strip_metadata  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "src/catalog/catalog.ts"
DEFAULT_OUT = ROOT / "data/contrib"
DEFAULT_LOG = ROOT / "data/labels/contrib.jsonl"
DEFAULT_LICENSES = {"CC0-1.0"}
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_MAGIC = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"RIFF": "webp",
}


def sniff_ext(data: bytes) -> str | None:
    for magic, ext in IMAGE_MAGIC.items():
        if data.startswith(magic):
            if ext == "webp" and data[8:12] != b"WEBP":
                continue
            return ext
    return None


class Bundle:
    """Acceso uniforme a un bundle en zip o en directorio."""

    def __init__(self, path: Path):
        self.path = path
        self._zip = zipfile.ZipFile(path) if path.is_file() else None

    def names(self) -> list[str]:
        if self._zip:
            return [n for n in self._zip.namelist() if not n.endswith("/")]
        return [str(p.relative_to(self.path)) for p in self.path.rglob("*") if p.is_file()]

    def read(self, name: str) -> bytes:
        if self._zip:
            return self._zip.read(name)
        return (self.path / name).read_bytes()


def read_consent(bundle: Bundle) -> dict:
    try:
        raw = bundle.read("consent.json")
    except (KeyError, FileNotFoundError):
        raise SystemExit("error: falta consent.json en el bundle (spec 12: consentimiento explicito)")
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: consent.json invalido: {exc}")


def read_metadata(bundle: Bundle) -> list[dict]:
    try:
        raw = bundle.read("metadata.csv")
    except (KeyError, FileNotFoundError):
        raise SystemExit("error: falta metadata.csv (path,class_id) en el bundle")
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
    for row in rows:
        if not row.get("path") or not row.get("class_id"):
            raise SystemExit("error: metadata.csv debe tener cabecera path,class_id")
    return rows


def load_decided(log_path: Path) -> set[str]:
    if not log_path.exists():
        return set()
    seen = set()
    for line in log_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            seen.add(json.loads(line)["sha256"])
        except (json.JSONDecodeError, KeyError):
            continue
    return seen


def append_log(log_path: Path, row: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Importa contribuciones de usuarios (spec 12).")
    p.add_argument("--bundle", type=Path, required=True, help="zip o directorio del bundle")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--log", type=Path, default=DEFAULT_LOG)
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    p.add_argument(
        "--require-license",
        default=",".join(sorted(DEFAULT_LICENSES)),
        help="licencias aceptadas (csv); por defecto CC0-1.0",
    )
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.bundle.exists():
        print(f"error: no existe {args.bundle}", file=sys.stderr)
        return 2

    allowed = {x.strip() for x in args.require_license.split(",") if x.strip()}
    bundle = Bundle(args.bundle)
    consent = read_consent(bundle)
    license_id = str(consent.get("license", "")).strip()
    if license_id not in allowed:
        print(
            f"error: licencia '{license_id or '(vacia)'}' no aceptada (permitidas: {sorted(allowed)})",
            file=sys.stderr,
        )
        return 2
    if consent.get("format") != "carbos-contrib":
        print("error: consent.json no declara format 'carbos-contrib'", file=sys.stderr)
        return 2

    foods = {f["id"] for f in load_foods(args.catalog)}
    rows = read_metadata(bundle)
    decided = load_decided(args.log)

    imported = skipped_dup = rejected = 0
    for row in rows:
        name = row["path"].lstrip("/")
        class_id = row["class_id"].strip()
        if class_id not in foods:
            print(f"WARN {name}: clase '{class_id}' no esta en el catalogo; se omite", file=sys.stderr)
            rejected += 1
            continue
        try:
            data = bundle.read(name)
        except (KeyError, FileNotFoundError):
            print(f"WARN {name}: imagen ausente; se omite", file=sys.stderr)
            rejected += 1
            continue
        ext = sniff_ext(data)
        if ext is None:
            print(f"WARN {name}: no es una imagen reconocible; se omite", file=sys.stderr)
            rejected += 1
            continue
        clean = strip_metadata(data, ext)  # EXIF/GPS fuera antes de guardar
        digest = hashlib.sha256(clean).hexdigest()
        if digest in decided:
            skipped_dup += 1
            continue
        dest_rel = Path(class_id) / f"{digest[:16]}.{ext}"
        imported += 1
        decided.add(digest)
        print(f"OK   {class_id}/{dest_rel.name}  <- {name} ({license_id})")
        if not args.dry_run:
            dest = args.out / dest_rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(clean)
            try:
                logged = dest.resolve().relative_to(ROOT).as_posix()
            except ValueError:
                logged = str(dest.resolve())
            append_log(
                args.log,
                {
                    "path": logged,
                    "label": class_id,
                    "license": license_id,
                    "sha256": digest,
                    "source": "user",
                    "reviewed": "user",
                    "ts": consent.get("granted_at"),
                },
            )

    print(
        f"\nresumen: bundle={args.bundle} licencia={license_id} "
        f"importadas={imported} duplicadas={skipped_dup} rechazadas={rejected} "
        f"-> {args.out}" + (" (dry-run)" if args.dry_run else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
