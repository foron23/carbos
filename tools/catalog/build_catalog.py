#!/usr/bin/env python3
"""Genera src/catalog/catalog.ts a partir de la tabla oficial Ciqual 2020.

Los valores de carbohidratos por 100 g se toman **directamente** de Ciqual
(ANSES, Licence Ouverte) o de las fuentes auxiliares curadas que se describen
abajo. La curacion vive en tools/catalog/selection.csv
(id, nombres ES/EN, sinonimos, porcion por defecto, codigo y fuente).

Ademas de los carbohidratos (const_code 31000), desde SPEC 26 el generador lee
los macros de Ciqual con `load_macros` (const_code -> campo):

  - 25000 -> proteinPer100g
  - 40000 -> fatPer100g
  - 328   -> kcalPer100g (energia de la fuente)
  - 34100 -> fiberPer100g
  - 32000 -> sugarsPer100g

Reglas de composicion:

  - kcal: si la fuente trae 328 se publica tal cual; si falta pero hay proteina y
    grasa, se deriva `4p + 4c + 9f` (c = carbs 31000) y se marca kcalDerived.
    Si no se puede calcular, se omite.
  - fibra y azucares: **solo** de la fuente; lo que falte se omite (no se deriva).
  - `own`: los macros se derivan de los ingredientes igual que los carbos; la kcal
    es `4p + 4c + 9f` de la propia receta marcada como derivada.

selection.csv incorpora la columna opcional `source`:

  - `ciqual` (por defecto si falta o viene vacia): `code` = alim_code Ciqual.
    Exige que Ciqual tenga carbohidratos (const_code 31000) para ese codigo.
  - `usda`: `code` = fdcId de USDA FoodData Central (CC0). Lee usda.json.
  - `own`: `code` = id de una receta en recipes.json. Deriva los carbohidratos
    de sus ingredientes (que deben estar ya construidos y NO ser `own`; por
    eso se resuelven en dos pasadas: primero no-own, luego own). Publica la
    cifra como rango de incertidumbre.

JSON auxiliares (offline, deterministas; sin red):

  tools/catalog/usda.json  -> mapa plano {fdcId: {"carbs": number, "name": str}}
      - `carbs` = carbohidratos por 100 g (nutriente FDC 1005, "by difference").
      - `name` = descripcion del alimento.
      - Objeto vacio `{}` por defecto (hoy no hay filas `usda` en la seleccion).
      - Se tolera tambien la forma envuelta {"foods": {fdcId: {...}}} y las
        claves equivalentes "carbsPer100g"/"description".

  tools/catalog/recipes.json -> mapa plano {id_receta: receta}
      - receta = {"title": str,
                  "yieldGrams": number (opcional; fallback = suma de gramos),
                  "uncertainty": number (opcional; 0.15 por defecto),
                  "ingredients": [{"id": str, "grams": number}, ...]}
      - carbsPer100g = sum(grams * carbs_ing / 100) / yieldGrams * 100.
      - Se publica como carbsRange = [nominal*(1-u), nominal*(1+u)] (2 decimales).
      - Se tolera tambien la forma envuelta {"recipes": {id_receta: receta}}.

Uso: make catalog  (o: python3 tools/catalog/build_catalog.py)
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

CIQUAL_URL = "https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip"
CARBS_CONST_CODE = "31000"  # Carbohydrate (g/100g)
MACRO_CONSTS = {  # const_code -> campo de la entrada
    "25000": "proteinPer100g",  # Protein (g/100g)
    "40000": "fatPer100g",  # Fat (g/100g)
    "328": "kcalPer100g",  # Energy (kcal/100g)
    "34100": "fiberPer100g",  # Dietary fibre (g/100g)
    "32000": "sugarsPer100g",  # Sugars (g/100g)
}
MACRO_FIELDS = (
    "proteinPer100g",
    "fatPer100g",
    "fiberPer100g",
    "sugarsPer100g",
)
USDA_MACRO_KEYS = {  # campo -> claves equivalentes aceptadas en usda.json
    "proteinPer100g": ("proteinPer100g", "protein"),
    "fatPer100g": ("fatPer100g", "fat"),
    "kcalPer100g": ("kcalPer100g", "kcal", "energyKcalPer100g"),
    "fiberPer100g": ("fiberPer100g", "fiber"),
    "sugarsPer100g": ("sugarsPer100g", "sugars"),
}
DEFAULT_SOURCE = "ciqual"
VALID_SOURCES = ("ciqual", "usda", "own")
DEFAULT_UNCERTAINTY = 0.15
RANGE_DECIMALS = 2
MIN_FOODS = 150
ATTRIBUTION = (
    "ANSES/Ciqual 2020 (Licence Ouverte) - carbohidratos, macros y energia "
    "por 100 g; USDA FoodData Central (CC0) para ampliaciones"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera el catalogo de Carbos desde Ciqual 2020.")
    root = Path(__file__).resolve().parents[2]
    parser.add_argument("--selection", type=Path, default=root / "tools/catalog/selection.csv")
    parser.add_argument("--out", type=Path, default=root / "src/catalog/catalog.ts")
    parser.add_argument("--cache", type=Path, default=root / "tools/catalog/.cache")
    parser.add_argument("--ciqual", type=Path, default=None, help="Directorio con los XML ya extraidos")
    parser.add_argument("--usda", type=Path, default=root / "tools/catalog/usda.json")
    parser.add_argument("--recipes", type=Path, default=root / "tools/catalog/recipes.json")
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


def load_macros(xml_dir: Path) -> dict[str, dict[str, float]]:
    """Devuelve {campo: {alim_code: valor}} para los const_code de MACRO_CONSTS."""
    macros: dict[str, dict[str, float]] = {name: {} for name in MACRO_CONSTS.values()}
    text = read_text(xml_dir / "compo_2020_07_07.xml")
    for block in re.findall(r"<COMPO>(.*?)</COMPO>", text, re.S):
        name = MACRO_CONSTS.get(field(block, "const_code"))
        if name is None:
            continue
        value = parse_number(field(block, "teneur"))
        if value is not None:
            macros[name][field(block, "alim_code")] = value
    return macros


def load_names(xml_dir: Path) -> dict[str, str]:
    names: dict[str, str] = {}
    text = read_text(xml_dir / "alim_2020_07_07.xml")
    for block in re.findall(r"<ALIM>(.*?)</ALIM>", text, re.S):
        names[field(block, "alim_code")] = field(block, "alim_nom_eng")
    return names


def load_json(path: Path, label: str) -> dict:
    if not path.exists():
        raise SystemExit(f"Falta el fichero {label}: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{label} no es JSON valido ({path}): {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit(f"{label} debe ser un objeto JSON ({path})")
    return data


def load_usda(path: Path) -> dict:
    """Devuelve {fdcId: item}. Acepta forma plana o {"foods": {...}}."""
    data = load_json(path, "usda.json")
    foods = data.get("foods")
    return foods if isinstance(foods, dict) else data


def load_recipes(path: Path) -> dict:
    """Devuelve {id_receta: receta}. Acepta forma plana o {"recipes": {...}}."""
    data = load_json(path, "recipes.json")
    recipes = data.get("recipes")
    return recipes if isinstance(recipes, dict) else data


def source_of(row: dict) -> str:
    return (row.get("source") or "").strip().lower() or DEFAULT_SOURCE


def _synonyms(row: dict) -> list[str]:
    return [s.strip() for s in (row.get("synonyms") or "").split("|") if s.strip()]


def _base_fields(row: dict) -> dict:
    return {
        "id": row["id"].strip(),
        "es": row["es"].strip(),
        "en": row["en"].strip(),
        "synonyms": _synonyms(row),
        "portion": int(row["portion"]),
    }


def usda_carbs(item: dict) -> float:
    if "carbs" in item:
        return item["carbs"]
    return item["carbsPer100g"]


def usda_name(item: dict) -> str:
    return item.get("name") or item.get("description") or ""


def _usda_macro(item: dict, target: str) -> float | None:
    for key in USDA_MACRO_KEYS[target]:
        value = item.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None


def attach_ciqual_macros(entry: dict, code: str, macros: dict[str, dict[str, float]]) -> None:
    """Adjunta protein/fat/fiber/sugars de la fuente y kcal (fuente o 4/4/9)."""
    for name in MACRO_FIELDS:
        value = macros[name].get(code)
        if value is not None:
            entry[name] = value
    kcal = macros["kcalPer100g"].get(code)
    if kcal is not None:
        entry["kcalPer100g"] = kcal
    elif "proteinPer100g" in entry and "fatPer100g" in entry:
        # kcal derivada 4/4/9; se redondea a 2 decimales para un catalogo estable.
        entry["kcalPer100g"] = round(
            4 * entry["proteinPer100g"] + 4 * entry["carbs"] + 9 * entry["fatPer100g"],
            RANGE_DECIMALS,
        )
        entry["kcalDerived"] = True


def attach_usda_macros(entry: dict, item: dict) -> None:
    """Copia los macros presentes en el item USDA; los ausentes se omiten."""
    for target in USDA_MACRO_KEYS:
        value = _usda_macro(item, target)
        if value is not None:
            entry[target] = value


def build_entry(
    row: dict, carbs: dict[str, float], macros: dict[str, dict[str, float]], names: dict[str, str], usda: dict
) -> dict:
    """Entrada para source=ciqual|usda (nunca own). Sin IO."""
    src = source_of(row)
    code = row["code"].strip()
    entry = _base_fields(row)
    if src == "ciqual":
        if code not in carbs:
            raise SystemExit(
                f"Ciqual no tiene carbohidratos para el codigo {code} "
                f"({entry['es']}) [source=ciqual]"
            )
        entry["carbs"] = carbs[code]
        entry["source"] = f"Ciqual 2020 #{code} - {names.get(code, '')}".strip()
        attach_ciqual_macros(entry, code, macros)
    elif src == "usda":
        item = usda.get(code)
        if item is None:
            raise SystemExit(
                f"usda.json no tiene fdcId {code} ({entry['es']}) [source=usda]"
            )
        entry["carbs"] = usda_carbs(item)
        entry["source"] = f"USDA FDC #{code} - {usda_name(item)}".strip()
        attach_usda_macros(entry, item)
    else:
        raise SystemExit(
            f"source desconocido '{src}' en id {entry['id']} (esperado ciqual|usda|own)"
        )
    return entry


def build_own_entry(
    row: dict, recipes: dict, index: dict[str, dict], own_ids: set[str]
) -> dict:
    """Entrada source=own: deriva carbs de ingredientes ya construidos. Sin IO."""
    entry = _base_fields(row)
    rid = row["code"].strip()
    recipe = recipes.get(rid)
    if recipe is None:
        raise SystemExit(
            f"recipes.json no tiene la receta {rid} ({entry['es']}) [source=own]"
        )
    ingredients = recipe.get("ingredients") or []
    total = 0.0
    macro_totals = {name: 0.0 for name in MACRO_FIELDS}
    macro_seen = {name: False for name in MACRO_FIELDS}
    used: list[str] = []
    for ingredient in ingredients:
        fid = str(ingredient["id"]).strip()
        if fid in own_ids:
            raise SystemExit(
                f"receta {rid}: ingrediente {fid} es un plato own "
                "(usa ingredientes base, no guisos)"
            )
        if fid not in index:
            raise SystemExit(
                f"receta {rid}: ingrediente {fid} no existe en el catalogo "
                "(¿typo de id?)"
            )
        factor = ingredient["grams"] / 100.0
        total += factor * index[fid]["carbs"]
        for name in MACRO_FIELDS:
            value = index[fid].get(name)
            if value is not None:
                macro_totals[name] += factor * value
                macro_seen[name] = True
        used.append(fid)
    yield_grams = recipe.get("yieldGrams") or sum(i["grams"] for i in ingredients)
    if not yield_grams:
        raise SystemExit(
            f"receta {rid}: no se puede derivar el rendimiento "
            "(yieldGrams=0 y sin ingredientes)"
        )
    nominal = total / yield_grams * 100.0
    uncertainty = recipe.get("uncertainty", DEFAULT_UNCERTAINTY)
    lo = round(max(0.0, nominal * (1 - uncertainty)), RANGE_DECIMALS)
    hi = round(nominal * (1 + uncertainty), RANGE_DECIMALS)
    entry["carbs"] = round(nominal, RANGE_DECIMALS)
    entry["range"] = [lo, hi]
    for name in MACRO_FIELDS:  # deriva solo los macros presentes en algun ingrediente
        if macro_seen[name]:
            entry[name] = round(macro_totals[name] / yield_grams * 100.0, RANGE_DECIMALS)
    if "proteinPer100g" in entry and "fatPer100g" in entry:  # kcal 4/4/9 de la receta
        entry["kcalPer100g"] = round(
            4 * entry["proteinPer100g"] + 4 * entry["carbs"] + 9 * entry["fatPer100g"],
            RANGE_DECIMALS,
        )
        entry["kcalDerived"] = True
    entry["source"] = (
        f"Receta propia #{rid} - derivada de {len(ingredients)} ingredientes: "
        f"{', '.join(used)}"
    )
    return entry


def build(
    rows: list[dict],
    carbs: dict[str, float],
    macros: dict[str, dict[str, float]],
    names: dict[str, str],
    usda: dict,
    recipes: dict,
) -> list[dict]:
    """Dos pasadas: no-own -> indice; own resuelve contra el indice ya construido."""
    own_ids = {row["id"].strip() for row in rows if source_of(row) == "own"}
    index: dict[str, dict] = {}
    out: dict[str, dict] = {}
    for row in rows:  # 1a pasada: no-own -> indice
        if source_of(row) == "own":
            continue
        entry = build_entry(row, carbs, macros, names, usda)
        if entry["id"] in index:
            raise SystemExit(f"Ids duplicados: {entry['id']}")
        index[entry["id"]] = entry
        out[entry["id"]] = entry
    for row in rows:  # 2a pasada: own resuelve ya index
        if source_of(row) != "own":
            continue
        entry = build_own_entry(row, recipes, index, own_ids)
        if entry["id"] in out:
            raise SystemExit(f"Ids duplicados: {entry['id']}")
        out[entry["id"]] = entry
    return [out[row["id"].strip()] for row in rows]  # orden del CSV preservado


def ts(value: object) -> str:
    return json.dumps(value, ensure_ascii=True)


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
        if entry.get("range"):
            lo, hi = entry["range"]
            lines.append(f"      carbsRange: [{lo}, {hi}],")
        for name in ("proteinPer100g", "fatPer100g", "kcalPer100g"):
            if name in entry:
                lines.append(f"      {name}: {entry[name]},")
        if entry.get("kcalDerived"):
            lines.append("      kcalDerived: true,")
        for name in ("fiberPer100g", "sugarsPer100g"):
            if name in entry:
                lines.append(f"      {name}: {entry[name]},")
        lines.append(f"      defaultPortionGrams: {entry['portion']},")
        lines.append(f"      source: {ts(entry['source'])},")
        lines.append("    },")
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    with args.selection.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    sources = {source_of(row) for row in rows}
    unknown = sources - set(VALID_SOURCES)
    if unknown:
        raise SystemExit(
            f"source desconocido '{sorted(unknown)[0]}' en la seleccion "
            "(esperado ciqual|usda|own)"
        )

    carbs: dict[str, float] = {}
    macros: dict[str, dict[str, float]] = {}
    names: dict[str, str] = {}
    if "ciqual" in sources:
        xml_dir = args.ciqual or ensure_ciqual(args.cache)
        carbs = load_carbs(xml_dir)
        macros = load_macros(xml_dir)
        names = load_names(xml_dir)
        if not carbs:
            raise SystemExit("No se pudieron leer los carbohidratos de Ciqual.")

    usda = load_usda(args.usda) if "usda" in sources else {}
    recipes = load_recipes(args.recipes) if "own" in sources else {}

    entries = build(rows, carbs, macros, names, usda, recipes)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(entries), encoding="utf-8")
    print(f"Catalogo: {len(entries)} alimentos -> {args.out}")
    if len(entries) < MIN_FOODS:
        print(f"AVISO: por debajo del minimo de {MIN_FOODS} ({len(entries)}).", file=sys.stderr)


if __name__ == "__main__":
    main()
