#!/usr/bin/env python3
"""Empaqueta el dataset de imagenes (catalogo Carbos) en un bundle reproducible.

Construye `dist/dataset/` con `images/<clase>/<nnn>.<ext>`, `metadata.csv`,
`ATTRIBUTION.md`, `DATASET-CARD.md`, `NOTICE`, `LICENSE`, `LICENSES/` y
`STATS.json`; opcionalmente genera un archivo `.tar.gz`/`.zip` deterministico
(orden fijo, mtime fijo, sin uid/gid) y su `.sha256`.

Modos de entrada:
  * confirmado (preferido):  --confirmed <data/confirmed | confirmed.jsonl | ImageFolder>
  * fallback:                 --images <data/images> [--labels <labels.jsonl>] [--confirmed-only]

Solo stdlib: no requiere torch/transformers/Pillow. Las imagenes de Wikimedia
se copian tal cual; las contribuciones de usuario (modo confirmado) se
re-empaquetan *sin* metadatos EXIF/GPS (privacidad, spec 12).

Ojo con licencias: este script NO reutiliza `is_free()` de fetch_images.py
(su regex descartaria las CC BY / CC BY-SA / GFDL). Usa un clasificador
consciente de SPDX.

Uso:
  python3 tools/data/package_dataset.py --images data/images --format dir
  python3 tools/data/package_dataset.py --images data/images --labels data/labels/review.jsonl \
      --confirmed-only --free-only --format targz --out dist/dataset
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import html
import json
import re
import shutil
import struct
import sys
import tarfile
import zipfile
from pathlib import Path

try:  # mismo parser de catalogo que fetch_images.py / review_labels.py
    from fetch_images import load_foods
except ImportError:  # ejecucion como modulo o desde otro cwd
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from fetch_images import load_foods

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "src/catalog/catalog.ts"
DEFAULT_IMAGES = ROOT / "data/images"
DEFAULT_CONFIRMED = ROOT / "data/confirmed"
DEFAULT_PROPOSED = ROOT / "data/proposed"
DEFAULT_LABELS = ROOT / "data/labels/review.jsonl"
DEFAULT_OUT = ROOT / "dist/dataset"
DEFAULT_LICENSE = ROOT / "LICENSE"
DEFAULT_SUMMARY = ROOT / "data/labels/summary.json"
TOOL_VERSION = "0.1.0"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")

# ---------------------------------------------------------------------------
# Licencias: clasificador SPDX-aware (NO reutilizar FREE_RE de fetch_images.py)
# ---------------------------------------------------------------------------
FAMILY_META = {
    "cc0": {
        "label": "CC0 1.0 Universal (Public Domain Dedication)",
        "url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": False,
        "share_alike": False,
    },
    "public-domain": {
        "label": "Public domain / no known restrictions",
        "url": "https://en.wikipedia.org/wiki/Public_domain",
        "attribution": False,
        "share_alike": False,
    },
    "cc-by": {
        "label": "Creative Commons Attribution (CC BY)",
        "url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": True,
        "share_alike": False,
    },
    "cc-by-sa": {
        "label": "Creative Commons Attribution-ShareAlike (CC BY-SA)",
        "url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": True,
        "share_alike": True,
    },
    "gfdl": {
        "label": "GNU Free Documentation License (GFDL)",
        "url": "https://www.gnu.org/licenses/fdl-1.3.html",
        "attribution": True,
        "share_alike": True,
    },
    "attribution": {
        "label": "Attribution (generic; consultar la pagina de origen)",
        "url": "https://commons.wikimedia.org/wiki/Commons:Licensing",
        "attribution": True,
        "share_alike": False,
    },
    "nonfree": {
        "label": "Non-free / restricted",
        "url": "",
        "attribution": False,
        "share_alike": False,
    },
    "unknown": {
        "label": "Unknown / undetermined",
        "url": "",
        "attribution": False,
        "share_alike": False,
    },
}
ALLOW_FAMILIES = {"cc0", "public-domain", "cc-by", "cc-by-sa", "gfdl", "attribution"}
NONFREE_RE = re.compile(
    r"non-?free|non-?commercial|all rights reserved|fair use|copyright|"
    r"no-?deriv|\bnc\b|\bnd\b"
)


def _version(text: str) -> str | None:
    m = re.search(r"(\d+(?:\.\d+)?)", text)
    return m.group(1) if m else None


def classify_license(raw: str | None) -> dict:
    """Mapea el LicenseShortName crudo de Wikimedia a una familia + obligaciones."""
    s = (raw or "").strip()
    low = s.lower()

    def res(fam: str, spdx: str, allowed: bool, attr: bool) -> dict:
        return {
            "raw": s,
            "family": fam,
            "spdx": spdx,
            "redistribution_allowed": allowed,
            "requires_attribution": attr,
        }

    if not low or "unknown" in low:
        return res("unknown", "LicenseRef-Unknown", False, False)
    if NONFREE_RE.search(low):
        return res("nonfree", "LicenseRef-Proprietary", False, False)
    # Formas compactas sin separadores (p.ej. "CCBYNC4.0", "ccbynd"): los \b de
    # NONFREE_RE no las ven y el startswith("ccby") las colaria como libres.
    compact = re.sub(r"[^a-z0-9]", "", low)
    if "ccby" in compact and ("nc" in compact or "nd" in compact):
        return res("nonfree", "LicenseRef-Proprietary", False, False)
    if (
        "cc0" in low
        or "public domain" in low
        or low in ("pd", "public-domain")
        or low.startswith("pd")
        or "no restrictions" in low
        or "no known restrictions" in low
    ):
        return res("public-domain", "LicenseRef-Public-Domain", True, False)
    if (
        "cc by-sa" in low
        or "cc-by-sa" in low
        or "ccbysa" in low
        or re.search(r"\bcc\s*by\s*sa\b", low)
    ):
        return res("cc-by-sa", f"CC-BY-SA-{_version(low) or '4.0'}", True, True)
    if "cc by" in low or "cc-by" in low or low.startswith("ccby"):
        return res("cc-by", f"CC-BY-{_version(low) or '4.0'}", True, True)
    if "gfdl" in low or "gnu free documentation" in low or re.search(r"\bfdl\b", low):
        return res("gfdl", f"GFDL-{_version(low) or '1.3'}-only", True, True)
    if "attribution" in low:
        return res("attribution", "LicenseRef-Attribution", True, True)
    return res("unknown", "LicenseRef-Unknown", False, False)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except (ValueError, OSError):
        return path.resolve().as_posix()


def clean_author(value) -> str:
    if not value:
        return "Unknown"
    text = html.unescape(str(value))
    text = TAG_RE.sub(" ", text)
    return WS_RE.sub(" ", text).strip() or "Unknown"


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                rows.append(obj)
    return rows


def iter_images(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(
        (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES),
        key=lambda p: p.name,
    )


# ---------------------------------------------------------------------------
# Metadatos EXIF/GPS: borrado sin recomprimir (JPEG/PNG/WebP)
# ---------------------------------------------------------------------------
def strip_metadata(data: bytes, ext: str) -> bytes:
    ext = ext.lower().lstrip(".")
    try:
        if ext in ("jpg", "jpeg"):
            return _strip_jpeg(data)
        if ext == "png":
            return _strip_png(data)
        if ext == "webp":
            return _strip_webp(data)
    except (struct.error, ValueError, IndexError):
        return data
    return data


def _strip_jpeg(data: bytes) -> bytes:
    if data[:2] != b"\xff\xd8":
        return data
    out = bytearray(data[:2])
    i, n = 2, len(data)
    while i + 1 < n:
        if data[i] != 0xFF:
            out += data[i:]
            return bytes(out)
        j = i
        while j < n and data[j] == 0xFF:
            j += 1
        if j >= n:
            out += data[i:]
            return bytes(out)
        marker = data[j]
        if marker == 0xD9 or marker == 0xDA:  # EOI / SOS -> resto literal
            out += data[i:]
            return bytes(out)
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            out += data[i:j + 1]
            i = j + 1
            continue
        if j + 2 >= n:
            out += data[i:]
            return bytes(out)
        seg_len = struct.unpack(">H", data[j + 1:j + 3])[0]
        seg_start = j + 1
        seg_end = seg_start + seg_len
        if seg_len < 2 or seg_end > n:
            out += data[i:]
            return bytes(out)
        payload = data[seg_start + 2:seg_end]
        drop = False
        if marker == 0xE1 and (
            payload[:6] == b"Exif\x00\x00"
            or payload.startswith(b"http://ns.adobe.com/xap/1.0/")
            or payload.startswith(b"http://ns.adobe.com/xmp/extension/")
        ):
            drop = True
        elif marker == 0xED:  # APP13 (IPTC / Photoshop)
            drop = True
        elif marker == 0xFE:  # COM
            drop = True
        if not drop:
            out += data[i:seg_end]
        i = seg_end
    out += data[i:]
    return bytes(out)


def _strip_png(data: bytes) -> bytes:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return data
    out = bytearray(data[:8])
    i, n = 8, len(data)
    drop = {b"eXIf", b"tEXt", b"iTXt", b"zTXt", b"tIME"}
    while i + 8 <= n:
        length = struct.unpack(">I", data[i:i + 4])[0]
        ctype = data[i + 4:i + 8]
        end = i + 12 + length
        if end > n:
            out += data[i:]
            return bytes(out)
        if ctype not in drop:
            out += data[i:end]
        if ctype == b"IEND":
            out += data[end:]
            return bytes(out)
        i = end
    out += data[i:]
    return bytes(out)


def _strip_webp(data: bytes) -> bytes:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return data
    chunks: list[tuple[bytes, bytes]] = []
    i, n = 12, len(data)
    while i + 8 <= n:
        fourcc = data[i:i + 4]
        size = struct.unpack("<I", data[i + 4:i + 8])[0]
        payload = data[i + 8:i + 8 + size]
        if len(payload) < size:
            return data
        chunks.append((fourcc, payload))
        i = i + 8 + size + (size & 1)
    body = bytearray()
    for fourcc, payload in chunks:
        if fourcc in (b"EXIF", b"XMP "):
            continue
        if fourcc == b"VP8X" and payload:
            flags = bytearray(payload)
            flags[0] &= ~0x08  # EXIF
            flags[0] &= ~0x04  # XMP
            payload = bytes(flags)
        body += fourcc + struct.pack("<I", len(payload)) + payload
        if len(payload) & 1:
            body += b"\x00"
    return bytes(b"RIFF") + struct.pack("<I", 4 + len(body)) + b"WEBP" + bytes(body)


# ---------------------------------------------------------------------------
# Atribuciones
# ---------------------------------------------------------------------------
def load_attribution(images_root: Path) -> dict:
    """Indexa attribution.jsonl por (classId, basename) y por ruta relativa."""
    by_key: dict[tuple[str, str], dict] = {}
    by_rel: dict[str, dict] = {}
    if not images_root.is_dir():
        return {"by_key": by_key, "by_rel": by_rel}
    for attr_path in sorted(images_root.glob("*/attribution.jsonl")):
        folder = attr_path.parent.name
        for rec in read_jsonl(attr_path):
            cid = str(rec.get("classId") or folder)
            fname = Path(str(rec.get("file") or "")).name
            if fname:
                by_key[(cid, fname)] = rec
            if rec.get("file"):
                by_rel[Path(str(rec["file"])).as_posix()] = rec
    return {"by_key": by_key, "by_rel": by_rel}


def find_attribution(index: dict, class_id: str, src: Path) -> dict | None:
    rec = index["by_key"].get((class_id, src.name))
    if rec is None:
        rec = index["by_rel"].get(rel(src))
    return rec


def synth_user_attribution(class_id: str) -> dict:
    return {
        "title": f"User contribution ({class_id})",
        "author": "Anonymous contributor",
        "license": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "sourceUrl": "",
        "pageUrl": "",
        "classId": class_id,
        "userContribution": True,
    }


# ---------------------------------------------------------------------------
# Recoleccion de trabajos
# ---------------------------------------------------------------------------
def _resolve_input(path_str: str) -> Path:
    p = Path(path_str)
    if p.is_absolute():
        return p
    cand = ROOT / p
    return cand if cand.exists() else p


def collect_confirmed(args, index: dict, foods: dict) -> tuple[list[dict], dict]:
    """Modo confirmado: JSONL con {path,label,...} o ImageFolder."""
    jobs: list[dict] = []
    dropped = {"not_confirmed": 0, "missing_source": 0, "unknown_class": 0, "missing_attribution": 0}
    cpath = args.confirmed
    jsonl_path: Path | None = None
    if cpath.is_file():
        jsonl_path = cpath
    elif cpath.is_dir():
        candidate = cpath / "confirmed.jsonl"
        if candidate.is_file():
            jsonl_path = candidate
    else:
        raise SystemExit(f"error: --confirmed no encontrado: {cpath}")

    if jsonl_path is not None:
        for rec in read_jsonl(jsonl_path):
            label = rec.get("label")
            if label in (None, "", "null"):
                dropped["not_confirmed"] += 1
                continue
            if args.confirmed_only and rec.get("agree") is False:
                dropped["not_confirmed"] += 1
                continue
            label = str(label)
            if label not in foods:
                dropped["unknown_class"] += 1
                continue
            raw_path = rec.get("path") or rec.get("file")
            if not raw_path:
                dropped["missing_source"] += 1
                continue
            src = _resolve_input(str(raw_path))
            if not src.is_file():
                dropped["missing_source"] += 1
                continue
            lookup_class = str(rec.get("folderClass") or label)
            attr = find_attribution(index, lookup_class, src)
            if attr is None:
                attr = synth_user_attribution(label)
            jobs.append(
                {
                    "src": src,
                    "origin": "confirmed",
                    "class_id": label,
                    "attr": attr,
                    "confirmed": True,
                }
            )
    else:  # ImageFolder data/confirmed/<class>/<img>
        for class_dir in sorted(p for p in cpath.iterdir() if p.is_dir()):
            class_id = class_dir.name
            if class_id not in foods:
                dropped["unknown_class"] += 1
                continue
            for src in iter_images(class_dir):
                attr = find_attribution(index, class_id, src)
                if attr is None:
                    attr = synth_user_attribution(class_id)
                jobs.append(
                    {
                        "src": src,
                        "origin": "confirmed",
                        "class_id": class_id,
                        "attr": attr,
                        "confirmed": True,
                    }
                )
    return jobs, dropped


def _label_lookup(label_map: dict, class_id: str, src: Path) -> dict | None:
    rec = label_map.get((src.parent.name, src.name))
    if rec is None:
        rec = label_map.get(rel(src))
    return rec


def collect_images(args, index: dict, foods: dict) -> tuple[list[dict], dict]:
    """Modo fallback: ImageFolder data/images con etiquetas opcionales."""
    jobs: list[dict] = []
    dropped = {"not_confirmed": 0, "unknown_class": 0, "missing_attribution": 0}
    label_map: dict = {}
    if args.labels:
        for rec in read_jsonl(args.labels):
            p = rec.get("path")
            if not p:
                continue
            src = Path(str(p))
            label_map[(src.parent.name, src.name)] = rec
            label_map[src.as_posix()] = rec

    root = args.images
    if not root.is_dir():
        raise SystemExit(f"error: --images no encontrado: {root}")

    for class_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        for src in iter_images(class_dir):
            label = class_dir.name
            if label_map:
                rec = _label_lookup(label_map, class_dir.name, src)
                if rec is None:
                    # sin registro de etiqueta: usar la clase de carpeta
                    label = class_dir.name
                else:
                    label = rec.get("label") or rec.get("folderClass") or class_dir.name
                    if args.confirmed_only and (
                        rec.get("label") in (None, "", "null") and rec.get("folderClass") is None
                    ):
                        dropped["not_confirmed"] += 1
                        continue
                    if args.confirmed_only and rec.get("agree") is False:
                        dropped["not_confirmed"] += 1
                        continue
            label = str(label)
            if label not in foods:
                dropped["unknown_class"] += 1
                continue
            attr = find_attribution(index, class_dir.name, src)
            if attr is None:
                dropped["missing_attribution"] += 1
                continue
            jobs.append(
                {
                    "src": src,
                    "origin": "images",
                    "class_id": label,
                    "attr": attr,
                    "confirmed": False,
                }
            )
    return jobs, dropped


# ---------------------------------------------------------------------------
# Filtrado, nombres y materializacion
# ---------------------------------------------------------------------------
def resolve_mode(args) -> str:
    given = [x for x in (args.confirmed, args.proposed, args.images) if x is not None]
    if len(given) > 1:
        raise SystemExit("error: usa solo uno de --confirmed / --proposed / --images")
    if args.confirmed is not None:
        return "confirmed"
    if args.proposed is not None:
        return "proposed"
    if args.images is not None:
        return "images"
    if DEFAULT_CONFIRMED.exists():
        args.confirmed = DEFAULT_CONFIRMED
        return "confirmed"
    print(
        f"AVISO: {rel(DEFAULT_CONFIRMED)} no existe; uso fallback --images {rel(DEFAULT_IMAGES)}",
        file=sys.stderr,
    )
    args.images = DEFAULT_IMAGES
    return "images"


def apply_license_filter(jobs: list[dict], args) -> tuple[list[dict], dict]:
    kept: list[dict] = []
    dropped = {"nonfree": 0, "free_only": 0, "nonfree_included": 0}
    raw_before: dict[str, int] = {}
    for job in jobs:
        cls = classify_license(job["attr"].get("license"))
        job["lic"] = cls
        raw_before[cls["raw"] or "(empty)"] = raw_before.get(cls["raw"] or "(empty)", 0) + 1
        if args.free_only:
            if cls["family"] in ALLOW_FAMILIES:
                kept.append(job)
            else:
                dropped["free_only"] += 1
            continue
        if not args.include_nonfree and not cls["redistribution_allowed"]:
            dropped["nonfree"] += 1
            continue
        if cls["family"] in ("nonfree", "unknown"):
            dropped["nonfree_included"] += 1
        kept.append(job)
    return kept, {"dropped": dropped, "raw_before": raw_before}


def apply_min_per_class(jobs: list[dict], min_per_class: int) -> tuple[list[dict], dict]:
    if min_per_class <= 0:
        return jobs, {}
    counts: dict[str, int] = {}
    for job in jobs:
        counts[job["class_id"]] = counts.get(job["class_id"], 0) + 1
    dropped = {cid: n for cid, n in counts.items() if n < min_per_class}
    kept = [j for j in jobs if j["class_id"] not in dropped]
    return kept, dropped


def assign_names(jobs: list[dict], seed: int | None) -> None:
    by_class: dict[str, list[dict]] = {}
    for job in jobs:
        by_class.setdefault(job["class_id"], []).append(job)
    for class_id in sorted(by_class):
        group = sorted(by_class[class_id], key=lambda j: (j["src"].parent.name, j["src"].name))
        if seed is not None:
            import random

            random.Random(seed).shuffle(group)
        for i, job in enumerate(group, start=1):
            ext = job["src"].suffix.lower().lstrip(".") or "jpg"
            job["out_rel"] = f"images/{class_id}/{i:03d}.{ext}"
            job["seq"] = i


def materialize(jobs: list[dict], out_dir: Path, args) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for job in jobs:
        dest = out_dir / job["out_rel"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        strip = job["origin"] == "confirmed" or args.no_exif
        if strip:
            data = strip_metadata(job["src"].read_bytes(), job["src"].suffix)
            dest.write_bytes(data)
        else:
            shutil.copyfile(job["src"], dest)


def write_metadata_csv(jobs: list[dict], out_dir: Path) -> None:
    columns = ["path", "class", "author", "license", "licenseUrl", "sourceUrl", "pageUrl"]
    with (out_dir / "metadata.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(columns)
        for job in sorted(jobs, key=lambda j: j["out_rel"]):
            a = job["attr"]
            writer.writerow(
                [
                    job["out_rel"],
                    job["class_id"],
                    clean_author(a.get("author")),
                    a.get("license") or "",
                    a.get("licenseUrl") or "",
                    a.get("sourceUrl") or "",
                    a.get("pageUrl") or "",
                ]
            )


def write_attribution_md(jobs: list[dict], out_dir: Path) -> None:
    groups: dict[str, list[dict]] = {}
    for job in sorted(jobs, key=lambda j: j["out_rel"]):
        groups.setdefault(job["lic"]["family"], []).append(job)
    lines = [
        "# Attribution",
        "",
        "Credits for every image shipped in this bundle, grouped by license family.",
        "The authoritative per-image fields are also in `metadata.csv` and the source",
        "`attribution.jsonl` records (Wikimedia Commons).",
        "",
        "> **Indication of changes (CC BY / CC BY-SA / GFDL):** images sourced from",
        "> Wikimedia Commons may be resized derivatives (maximum width 640 px) of the",
        "> original file. When resized, the image is an adaptation of the original.",
        "",
    ]
    for family in sorted(groups):
        meta = FAMILY_META.get(family, FAMILY_META["unknown"])
        lines.append(f"## {meta['label']}")
        if meta["url"]:
            lines.append("")
            lines.append(f"License reference: <{meta['url']}>")
        lines.append("")
        for job in groups[family]:
            a = job["attr"]
            author = clean_author(a.get("author"))
            title = a.get("title") or job["src"].name
            lic = a.get("license") or "Unknown"
            lic_url = a.get("licenseUrl") or ""
            parts = [f"- **{job['out_rel']}** — *{title}* by **{author}** ({lic}"]
            parts.append(f", {lic_url})" if lic_url else ")")
            trailer = []
            if a.get("sourceUrl"):
                trailer.append(f"source: <{a['sourceUrl']}>")
            if a.get("pageUrl"):
                trailer.append(f"page: <{a['pageUrl']}>")
            if a.get("userContribution"):
                trailer.append("user contribution (opt-in, spec 12)")
            if trailer:
                parts.append(" — " + " · ".join(trailer))
            lines.append("".join(parts))
        lines.append("")
    write_text(out_dir / "ATTRIBUTION.md", "\n".join(lines).rstrip() + "\n")


def write_notice(jobs: list[dict], out_dir: Path) -> None:
    families = sorted({job["lic"]["family"] for job in jobs})
    share_alike = "cc-by-sa" in families or "gfdl" in families
    attribution = any(FAMILY_META.get(f, {}).get("attribution") for f in families)
    lines = [
        "# NOTICE",
        "",
        "This bundle aggregates two independent works with **separate copyright regimes**:",
        "",
        "1. **Software** — the Carbos source code is licensed under **AGPL-3.0** (see `LICENSE`).",
        "   AGPL-3.0 is a strong network copyleft covering the code only.",
        "2. **Image dataset** — each image keeps the license declared by its author",
        "   (see `ATTRIBUTION.md` / `metadata.csv`). The image layer is **not** relicensed",
        "   by AGPL-3.0.",
        "",
        "Neither copyleft relicenses the other. This is a mere aggregation/collection:",
        "the AGPL-3.0 code and the image files remain under their own terms.",
        "",
    ]
    if attribution:
        lines += [
            "## Attribution obligations",
            "",
            "For every CC BY, CC BY-SA or GFDL image the bundle provides: title, author,",
            "license name and URL, source URL and page URL, plus an indication of changes",
            "(resizing). These are the §3(a) requirements of the CC licenses.",
            "",
        ]
    if share_alike:
        lines += [
            "## Share-alike scope",
            "",
            "This dataset contains CC BY-SA / GFDL images. Share-alike applies to the",
            "**image layer**: adaptations of those images must remain under a compatible",
            "BY-SA (or GFDL) license. It does **not** extend to the AGPL-3.0 software, and",
            "the AGPL-3.0 does not extend to the images.",
            "",
        ]
    lines += [
        "## AGPL source offer",
        "",
        "Carbos is distributed under AGPL-3.0. If you interact with it over a network,",
        "the corresponding source is offered at the project repository",
        "(see the repository README for the canonical URL).",
        "",
        "## No medical use",
        "",
        "This dataset is for food recognition / carbohydrate estimation support only.",
        "It is not a medical device and must not be used for diagnosis, dosing or",
        "treatment decisions.",
        "",
    ]
    write_text(out_dir / "NOTICE", "\n".join(lines).rstrip() + "\n")


def write_licenses_dir(jobs: list[dict], out_dir: Path) -> None:
    licenses_dir = out_dir / "LICENSES"
    licenses_dir.mkdir(parents=True, exist_ok=True)
    seen: dict[str, dict] = {}
    for job in jobs:
        spdx = job["lic"]["spdx"]
        seen.setdefault(spdx, job["lic"])
    for spdx in sorted(seen):
        cls = seen[spdx]
        meta = FAMILY_META.get(cls["family"], FAMILY_META["unknown"])
        safe = re.sub(r"[^A-Za-z0-9._-]", "-", spdx)
        body = [
            f"# {meta['label']}",
            "",
            f"- SPDX-ish identifier: `{spdx}`",
            f"- Family: `{cls['family']}`",
            f"- Redistribution allowed: {cls['redistribution_allowed']}",
            f"- Requires attribution: {cls['requires_attribution']}",
        ]
        if meta["url"]:
            body.append(f"- Canonical license text: <{meta['url']}>")
        body += [
            "",
            "Full license text is available at the URL above. This file is a reference,",
            "not a substitute for the license itself.",
            "",
        ]
        write_text(licenses_dir / f"{safe}.txt", "\n".join(body).rstrip() + "\n")


def write_license(out_dir: Path, license_path: Path) -> str:
    if license_path.is_file():
        shutil.copyfile(license_path, out_dir / "LICENSE")
        return rel(license_path)
    write_text(
        out_dir / "LICENSE",
        "AGPL-3.0 not found at packaging time; see the project repository.\n",
    )
    return "(missing)"


def write_dataset_card(jobs: list[dict], out_dir: Path, stats: dict, args) -> None:
    classes = sorted({j["class_id"] for j in jobs})
    families = sorted({j["lic"]["family"] for j in jobs})
    agreement = stats.get("agreement") or {}
    lines = [
        "# Dataset Card — Carbos food images",
        "",
        f"Tool: `package_dataset.py` v{args.version} · mode: `{args.mode}` · format: `{args.format}`",
        "",
        "## Provenance",
        "",
        f"- Images sourced from **Wikimedia Commons** ({stats['images_total']} shipped across",
        f"  {len(classes)} catalog classes), downloaded with `tools/data/fetch_images.py` (D25).",
        "- Classes are the `id` values of `src/catalog/catalog.ts` (154 foods).",
    ]
    if args.mode == "confirmed":
        lines.append("- Image labels come from explicit human confirmation (spec 12, opt-in).")
    elif args.mode == "proposed":
        lines.append(
            "- Image labels are **machine-proposed (CLIP agreement), NOT human-confirmed**;"
        )
        lines.append("  treat them as weak labels, not ground truth.")
    else:
        lines.append(
            "- Image labels in the fallback mode are **not ground truth**: `folderClass` is a",
        )
        lines.append("  query-level bucket, and CLIP's top-1 is only a proposal.")
    lines += [
        "",
        "## Quality caveats",
        "",
        "- The folder class reflects the **search query**, not human validation; source data",
        "  contains noise (e.g. museum/band/article images).",
    ]
    if agreement:
        lines.append(
            f"- CLIP zero-shot agreement (top-1 == folder) was "
            f"**{agreement.get('agreementRate')}**; "
            f"{agreement.get('flaggedForReview')} of {agreement.get('images')} images were queued "
            "for review and are unconfirmed."
        )
    lines += [
        "- Images are 640 px-class web derivatives, not original captures.",
        "- No per-image bounding boxes or portion measurements.",
        "",
        "## Intended use",
        "",
        "- Food recognition and carbohydrate estimation support for the Carbos catalog.",
        "- Research / model training (linear probe / distillation, D32).",
        "",
        "## Out of scope / ethics",
        "",
        "- **Not a medical device.** No diagnosis, dosing or treatment claims.",
        "- Benchmark bias disclosure (D25): the reference benchmark is **Nutrition5k**, whose",
        "  imagery comes mainly from **California cafeterias**; results do not transfer",
        "  directly to other populations or cuisines.",
        "- User-contributed images (if any) are opt-in per photo, with no accounts or",
        "  identifiers, and EXIF/GPS stripped before packaging (spec 12).",
        "",
        "## Licensing",
        "",
        f"License families present: {', '.join(f'`{f}`' for f in families) or '(none)'}.",
        "See `ATTRIBUTION.md`, `NOTICE` and `LICENSES/`. The AGPL-3.0 code license and the",
        "image licenses are independent; see `NOTICE`.",
        "",
    ]
    write_text(out_dir / "DATASET-CARD.md", "\n".join(lines).rstrip() + "\n")


def build_stats(jobs: list[dict], args, dropped: dict, license_info: dict, min_dropped: dict, archive: dict | None) -> dict:
    per_class: dict[str, int] = {}
    family_counts: dict[str, int] = {}
    raw_counts: dict[str, int] = {}
    for job in sorted(jobs, key=lambda j: j["out_rel"]):
        per_class[job["class_id"]] = per_class.get(job["class_id"], 0) + 1
        family_counts[job["lic"]["family"]] = family_counts.get(job["lic"]["family"], 0) + 1
        raw = job["lic"]["raw"] or "(empty)"
        raw_counts[raw] = raw_counts.get(raw, 0) + 1

    agreement = None
    if DEFAULT_SUMMARY.is_file():
        try:
            s = json.loads(DEFAULT_SUMMARY.read_text(encoding="utf-8"))
            agreement = {
                "model": s.get("model"),
                "agreementRate": s.get("agreementRate"),
                "flaggedForReview": s.get("flaggedForReview"),
                "images": s.get("images"),
            }
        except (json.JSONDecodeError, OSError):
            agreement = None

    stats = {
        "tool": "package_dataset.py",
        "version": args.version,
        "mode": args.mode,
        "format": args.format,
        "free_only": bool(args.free_only),
        "include_nonfree": bool(args.include_nonfree),
        "confirmed_only": bool(args.confirmed_only),
        "seed": args.seed,
        "images_total": len(jobs),
        "classes": len(per_class),
        "images_per_class": {k: per_class[k] for k in sorted(per_class)},
        "license_families": {k: family_counts[k] for k in sorted(family_counts)},
        "license_distribution": {k: raw_counts[k] for k in sorted(raw_counts)},
        "input_license_distribution": license_info.get("raw_before", {}),
        "dropped": {
            "by_reason": dropped,
            "nonfree_or_unknown": license_info.get("dropped", {}),
            "below_min_per_class": min_dropped,
        },
        "min_per_class": args.min_per_class,
        "agreement": agreement,
        "sources": {
            "images": rel(args.images) if args.images else None,
            "confirmed": rel(args.confirmed) if args.confirmed else None,
            "labels": rel(args.labels) if args.labels else None,
            "catalog": rel(args.catalog),
        },
        "archive": archive,
        "medical_claims": False,
    }
    return stats


# ---------------------------------------------------------------------------
# Archivos deterministicos
# ---------------------------------------------------------------------------
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_targz(bundle: Path, archive: Path) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    entries = sorted(bundle.rglob("*"), key=lambda p: p.relative_to(bundle).as_posix())
    with archive.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as gz:
            with tarfile.open(fileobj=gz, mode="w", format=tarfile.GNU_FORMAT) as tar:
                for path in entries:
                    arc = path.relative_to(bundle).as_posix()
                    info = tar.gettarinfo(str(path), arcname=arc)
                    info.mtime = 0
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    info.mode = 0o755 if path.is_dir() else 0o644
                    if path.is_dir():
                        tar.addfile(info)
                    else:
                        with path.open("rb") as fh:
                            tar.addfile(info, fh)


def write_zip(bundle: Path, archive: Path) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    entries = sorted(bundle.rglob("*"), key=lambda p: p.relative_to(bundle).as_posix())
    date_time = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in entries:
            arc = path.relative_to(bundle).as_posix()
            if path.is_dir():
                info = zipfile.ZipInfo(arc + "/", date_time=date_time)
                info.external_attr = (0o40755 << 16) | 0x10
                info.compress_type = zipfile.ZIP_STORED
                zf.writestr(info, b"")
            else:
                info = zipfile.ZipInfo(arc, date_time=date_time)
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(info, path.read_bytes())


def make_archive(bundle: Path, out_dir: Path, fmt: str) -> dict:
    ext = {"zip": "zip", "targz": "tar.gz"}[fmt]
    archive = out_dir.parent / f"{out_dir.name}.{ext}"
    archive.unlink(missing_ok=True)
    if fmt == "zip":
        write_zip(bundle, archive)
    else:
        write_targz(bundle, archive)
    digest = sha256_file(archive)
    (out_dir.parent / f"{out_dir.name}.{ext}.sha256").write_text(
        f"{digest}  {archive.name}\n", encoding="utf-8"
    )
    return {"name": archive.name, "path": rel(archive), "sha256": digest, "bytes": archive.stat().st_size}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Empaqueta el dataset del catalogo en un bundle reproducible.",
    )
    p.add_argument("--format", choices=("dir", "zip", "targz"), default="targz")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--confirmed", type=Path, default=None, help="data/confirmed (JSONL o ImageFolder)")
    p.add_argument(
        "--proposed",
        type=Path,
        default=None,
        help="data/proposed (etiquetas automaticas, NO confirmadas por humanos)",
    )
    p.add_argument("--images", type=Path, default=None, help="data/images (fallback ImageFolder)")
    p.add_argument("--labels", type=Path, default=None, help="JSONL de etiquetas (modo fallback)")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    p.add_argument("--min-per-class", type=int, default=0)
    p.add_argument("--free-only", action="store_true", help="solo familias redistribuibles (allowlist)")
    p.add_argument("--include-nonfree", action="store_true", help="incluye licencias no libres (con aviso)")
    p.add_argument("--confirmed-only", action="store_true", help="exige etiqueta explicita")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--no-exif", action="store_true", help="borra EXIF/GPS de todas las imagenes")
    p.add_argument("--version", default=TOOL_VERSION)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    args.out = args.out.expanduser().resolve()

    if not args.catalog.is_file():
        print(f"error: catalogo no encontrado: {args.catalog}", file=sys.stderr)
        return 2
    try:
        foods = {f["id"]: f for f in load_foods(args.catalog)}
    except SystemExit as exc:
        print(f"error: no se pudo leer el catalogo: {exc}", file=sys.stderr)
        return 2
    if not foods:
        print("error: catalogo vacio", file=sys.stderr)
        return 2

    args.mode = resolve_mode(args)
    if args.mode == "proposed" and args.images is None:
        args.images = args.proposed  # ImageFolder con clase = carpeta, pero etiquetas NO confirmadas
    if args.labels is None and args.mode == "images":
        args.labels = None  # explicito: sin etiquetas => clase = carpeta

    print(f"modo: {args.mode} -> {args.out}  (formato: {args.format})")

    try:
        if args.mode == "confirmed":
            index = load_attribution(args.images or DEFAULT_IMAGES)
            jobs, dropped = collect_confirmed(args, index, foods)
        else:
            index = load_attribution(args.images)
            jobs, dropped = collect_images(args, index, foods)
    except SystemExit as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if not jobs:
        print("error: seleccion vacia tras recolectar", file=sys.stderr)
        return 1

    jobs, license_info = apply_license_filter(jobs, args)
    if not jobs:
        print("error: seleccion vacia tras el filtro de licencias", file=sys.stderr)
        return 1

    if args.include_nonfree and any(j["lic"]["family"] in ("nonfree", "unknown") for j in jobs):
        print("AVISO: se incluyen licencias no libres/desconocidas (--include-nonfree)", file=sys.stderr)

    jobs, min_dropped = apply_min_per_class(jobs, args.min_per_class)
    if not jobs:
        print("error: seleccion vacia tras --min-per-class", file=sys.stderr)
        return 1

    assign_names(jobs, args.seed)
    materialize(jobs, args.out, args)

    write_metadata_csv(jobs, args.out)
    write_attribution_md(jobs, args.out)
    write_license(args.out, DEFAULT_LICENSE)
    write_licenses_dir(jobs, args.out)
    write_notice(jobs, args.out)

    # DATASET-CARD.md y STATS.json deben existir *antes* de empaquetar, para que
    # el archivo (zip/tar.gz) tambien los incluya. El bloque `archive` no puede
    # contener el sha256 del propio archivo (seria autorreferente), asi que el
    # STATS.json del bundle lo deja en null; el detalle va en el .sha256 hermano.
    stats = build_stats(jobs, args, dropped, license_info, min_dropped, None)
    write_dataset_card(jobs, args.out, stats, args)
    write_text(args.out / "STATS.json", json.dumps(stats, ensure_ascii=False, indent=2) + "\n")

    archive = None
    if args.format != "dir":
        archive = make_archive(args.out, args.out, args.format)

    partial = dropped.get("missing_attribution", 0) > 0
    print(f"OK {len(jobs)} imagenes en {stats['classes']} clases -> {args.out}")
    if archive:
        print(f"archivo: {archive['path']} ({archive['bytes']} bytes) sha256={archive['sha256'][:16]}...")
    if partial:
        print(
            f"PARCIAL: {dropped['missing_attribution']} imagenes sin attribution.jsonl (omitidas)",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
