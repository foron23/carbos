#!/usr/bin/env python3
"""Genera src/catalog/catalog.ts a partir de la tabla oficial Ciqual 2020.

Los valores de carbohidratos por 100 g se toman **directamente** de Ciqual
(ANSES, Licence Ouverte). La curacion vive en tools/catalog/selection.csv
(id, nombres ES/EN, sinonimos, porcion por defecto y codigo Ciqual).

Uso: make catalog  (o: python3 tools/catalog/build_catalog.py)
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

CIQUAL_URL = "https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip"
CARBS_CONST_CODE = "31000"  # Carbohydrate (g/100g)
ATTRIBUTION = (
    "ANSES/Ciqual 2020 (Licence Ouverte) - valores de carbohidratos por 100 g; "
    "USDA FoodData Central (CC0) para ampliaciones"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera el catalogo de Carbos desde Ciqual 2020.")
    root = Path(__file__).resolve().parents[2]
    parser.add_argument("--selection", type=Path, default=root / "tools/catalog/selection.csv")
    parser.add_argument("--out", type=Path, default=root / "src/catalog/catalog.ts")
    parser.add_argument("--cache", type=Path, default=root / "tools/catalog/.cache")
    parser.add_argument("--ciqual", type=Path, default=None, help="Directorio con los XML ya extraidos")
    return parser.parse_args()


def read_text(path: Path) -> str:
    return path.read_text(encoding="windows-1252", errors="replace")


def field(block: str, tag: str) -> str:
    match = re.search(r"<%s>\s*(.*?)\s*</%s>" % (tag, tag), block, re.S)
    return match.group(1) if match else ""


def parse_number(raw: str) -> float | None:
    raw = raw.strip().replace("\xa0", "").replace(" ", "")
    if not raw or raw == "-" or raw.lower().startswith("trace"):
        return None
    raw = raw.lstrip("<").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def ensure_ciqual(cache: Path) -> Path:
    xml_dir = cache / "xml"
    if (xml_dir / "alim_2020_07_07.xml").exists():
        return xml_dir
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / "ciqual.zip"
    if not archive.exists():
        print(f"Descargando Ciqual: {CIQUAL_URL}")
        urllib.request.urlretrieve(CIQUAL_URL, archive)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(xml_dir)
    return xml_dir


def load_carbs(xml_dir: Path) -> dict[str, float]:
    carbs: dict[str, float] = {}
    text = read_text(xml_dir / "compo_2020_07_07.xml")
    for block in re.findall(r"<COMPO>(.*?)</COMPO>", text, re.S):
        if field(block, "const_code") != CARBS_CONST_CODE:
            continue
        value = parse_number(field(block, "teneur"))
        if value is not None:
            carbs[field(block, "alim_code")] = value
    return carbs


def load_names(xml_dir: Path) -> dict[str, str]:
    names: dict[str, str] = {}
    text = read_text(xml_dir / "alim_2020_07_07.xml")
    for block in re.findall(r"<ALIM>(.*?)</ALIM>", text, re.S):
        names[field(block, "alim_code")] = field(block, "alim_nom_eng")
    return names


def ts(value: object) -> str:
    return json.dumps(value, ensure_ascii=True)


def build_entry(row: dict[str, str], carbs: dict[str, float], names: dict[str, str]) -> dict:
    code = row["code"].strip()
    if code not in carbs:
        raise SystemExit(f"Ciqual no tiene carbohidratos para el codigo {code} ({row['es']})")
    synonyms = [s for s in (row.get("synonyms") or "").split("|") if s]
    return {
        "id": row["id"].strip(),
        "es": row["es"].strip(),
        "en": row["en"].strip(),
        "synonyms": synonyms,
        "carbs": carbs[code],
        "portion": int(row["portion"]),
        "source": f"Ciqual 2020 #{code} - {names.get(code, '')}".strip(),
    }


def render(entries: list[dict]) -> str:
    lines = [
        "// GENERADO por tools/catalog/build_catalog.py - no editar a mano.",
        f"// Fuente: {ATTRIBUTION}",
        "import type { Catalog } from './types';",
        "import { CATALOG_VERSION } from './types';",
        "",
        f"export const CATALOG_ATTRIBUTION = {ts(ATTRIBUTION)};",
        "",
        "export const CATALOG: Catalog = {",
        "  version: CATALOG_VERSION,",
        "  foods: [",
    ]
    for entry in entries:
        lines.append("    {")
        lines.append(f"      id: {ts(entry['id'])},")
        lines.append(f"      name: {{ es: {ts(entry['es'])}, en: {ts(entry['en'])} }},")
        lines.append(f"      synonyms: {ts(entry['synonyms'])},")
        lines.append(f"      carbsPer100g: {entry['carbs']},")
        lines.append(f"      defaultPortionGrams: {entry['portion']},")
        lines.append(f"      source: {ts(entry['source'])},")
        lines.append("    },")
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    xml_dir = args.ciqual or ensure_ciqual(args.cache)
    carbs = load_carbs(xml_dir)
    names = load_names(xml_dir)
    if not carbs:
        raise SystemExit("No se pudieron leer los carbohidratos de Ciqual.")

    with args.selection.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    entries = [build_entry(row, carbs, names) for row in rows]
    ids = [entry["id"] for entry in entries]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    if duplicates:
        raise SystemExit(f"Ids duplicados: {', '.join(duplicates)}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(entries), encoding="utf-8")
    print(f"Catalogo: {len(entries)} alimentos -> {args.out}")
    if len(entries) < 150:
        print(f"AVISO: por debajo del minimo de 150 ({len(entries)}).", file=sys.stderr)


if __name__ == "__main__":
    main()
