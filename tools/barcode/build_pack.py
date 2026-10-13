#!/usr/bin/env python3
"""Genera un pack offline de codigos de barras desde el dump JSONL de Open Food Facts.

Implementa la Fase A / opcion E de la spec 17: un fichero descargable formado por
JSONL gzip + manifest firmado (sha256), que la app importa una sola vez en
IndexedDB y consulta en local por barcode.

Filtra por pais (`countries_tags`), exige un EAN-13 valido y
`nutriments.carbohydrates_100g` presente, y proyecta un registro minimo por
producto. Escribe:

  <out>.jsonl.gz        JSONL gzip, un producto por linea, ordenado por barcode
  <out>.manifest.json   {format, version, locale, url, bytes, sha256,
                         product_count, generated_at}

Con `--packs-manifest` genera ademas el **manifest hospedado** que la app
consulta para descubrir y descargar los packs (mismo patron que el manifest de
pesos): `{format, version, packs:[{id, locale, url, sha256, bytes,
product_count, generated_at}]}`. Sin `--input` emite una lista `packs` vacia
(util para bootstrap/ejemplo).

Fuentes:
    --from-api   API de busqueda de OFF (search-a-licious): pack sin bajar el dump.
                 Pagina por faceta de pais. Con --partition divide por prefijo de
                 codigo y subdivide los que saturan la ventana de 10000, lo que
                 permite recorrer el pais casi entero (--limit 0 = todo). Es el modo
                 por defecto de `make barcode-pack`.
    --input      dump JSONL/JSONL.gz (local o URL) para el pack completo por streaming.

Uso:
    make barcode-pack                                   # ~50k productos ES (~3 min)
    make barcode-pack BARCODE_ARGS="--from-api --partition --limit 0"   # pais entero
    python3 tools/barcode/build_pack.py --input dump.jsonl.gz --out /tmp/es --limit 100
    python3 tools/barcode/build_pack.py --input dump.jsonl.gz --out /tmp/es \
        --packs-manifest /tmp/packs.json --base-url https://cdn.example/barcode

Solo biblioteca estandar; en modo dump lee en streaming (nunca el dump entero en
memoria) y en modo API pagina con retrasos de cortesia.

Aviso: los datos son de Open Food Facts (ODbL-1.0). El pack derivado es ODbL;
no se commitea (ver tools/barcode/README.md).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

DEFAULT_URL = "https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz"
# API de busqueda (search-a-licious): permite construir un pack pequeno sin bajar
# el dump completo de ~7 GB. Devuelve productos por faceta de pais.
SEARCH_URL = "https://search.openfoodfacts.org/search"
USER_AGENT = "Carbos/0.0.0 (barcode pack builder)"
FORMAT = "carbos-barcode-pack"
VERSION = 1
PACKS_FORMAT = "carbos-barcode-packs"
PACKS_VERSION = 1
SOURCE = "Open Food Facts (ODbL-1.0)"
DEFAULT_COUNTRIES = "en:spain"
DEFAULT_OUT = "tools/barcode/out/es"

# Pais OFF -> locale del pack. El fallback es "en".
COUNTRY_LOCALE = {
    "en:spain": "es",
    "en:france": "fr",
    "en:italy": "it",
    "en:portugal": "pt",
    "en:germany": "de",
    "en:united-kingdom": "en",
    "en:united-states": "en",
}


def now_iso() -> str:
    """Timestamp UTC en ISO 8601 (segundos)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_ms() -> int:
    """Timestamp epoch en milisegundos (campo `savedAt` de ScannedProduct)."""
    return int(time.time() * 1000)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Construye un pack offline de codigos de barras (Open Food Facts)."
    )
    parser.add_argument(
        "--input",
        default=None,
        help=f"JSONL o JSONL.gz local, o URL (por defecto: {DEFAULT_URL})",
    )
    parser.add_argument(
        "--from-api",
        action="store_true",
        help="Construye el pack desde la API de busqueda de OFF (sin el dump de ~7 GB).",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=10000,
        help="Productos por pagina en modo --from-api (max 10000; por defecto: 10000).",
    )
    parser.add_argument(
        "--api-delay",
        type=float,
        default=1.0,
        help="Segundos entre paginas en modo --from-api (cortesia/rate-limit).",
    )
    parser.add_argument(
        "--partition",
        action="store_true",
        help="En modo --from-api, particiona por prefijo de codigo para superar el "
        "techo de 10000 de una sola consulta (permite el pais casi entero).",
    )
    parser.add_argument(
        "--split",
        action="store_true",
        help="Escribe dos packs: el principal (con nutricion) y <out>-rest (solo "
        "identificacion: EAN + nombre/marca, sin carbohidratos).",
    )
    parser.add_argument(
        "--per-country",
        action="store_true",
        help="Con varios paises, escribe un pack por pais (bajo <out>/<locale>) y los "
        "lista todos en el manifest; la app elige el de su idioma.",
    )
    parser.add_argument(
        "--countries",
        default=DEFAULT_COUNTRIES,
        help="Facetas countries_tags separadas por comas (por defecto: en:spain)",
    )
    parser.add_argument("--out", default=DEFAULT_OUT, help="Ruta base del pack (sin extension)")
    parser.add_argument("--limit", type=int, default=0, help="Maximo de productos (0 = sin limite)")
    parser.add_argument("--locale", default=None, help="Locale del pack (por defecto, segun el pais)")
    parser.add_argument("--url", default=None, help="URL declarada en el manifest (por defecto, el nombre del pack)")
    parser.add_argument(
        "--packs-manifest",
        default=None,
        help="Ruta del manifest hospedado de packs (si se omite, no se escribe)",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help="Base publica de los packs; la URL del pack sera <base-url>/<fichero>",
    )
    parser.add_argument(
        "--pack-id",
        default=None,
        help="Id del pack en el manifest hospedado (por defecto, el nombre del pack)",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Timestamp ISO 8601 a estampar (por defecto, ahora en UTC)",
    )
    return parser.parse_args()


def is_valid_ean13(code: str) -> bool:
    """Valida longitud, digitos y digito de control de un EAN-13."""
    if len(code) != 13 or not code.isdigit():
        return False
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code[:12]))
    check = (10 - total % 10) % 10
    return check == int(code[12])


def normalize_ean(raw: object) -> str | None:
    """Normaliza a EAN-13: UPC-A(12) se completa con 0 delante. None si no vale."""
    code = str(raw).strip()
    if code.isdigit() and len(code) == 12:
        code = "0" + code
    return code if is_valid_ean13(code) else None


def to_number(value: object) -> float | None:
    """Convierte a float si es un numero utilizable; si no, None."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace(",", ".")
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def clean_text(value: object) -> str:
    """Normaliza un campo de texto (trim, colapsa espacios)."""
    if value is None:
        return ""
    return " ".join(str(value).split())


def first_brand(brands: object) -> str:
    """Primer brand.

    El dump da `brands` como texto separado por comas; la API de busqueda lo da
    como lista. Se admiten ambos.
    """
    if isinstance(brands, (list, tuple)):
        for item in brands:
            text = clean_text(item)
            if text:
                return text
        return ""
    if not brands:
        return ""
    return clean_text(str(brands).split(",")[0])


def portion_grams(value: object) -> float | int:
    """Porcion por defecto en gramos: serving_quantity o 100, con clamp >= 1."""
    number = to_number(value)
    if number is None or number < 1:
        return 100
    return int(number) if number == int(number) else round(number, 2)


def project_record(product: dict, saved_at: int) -> dict | None:
    """Proyecta un producto OFF al registro minimo; None si no cumple el filtro.

    No comprueba el pais: en modo dump lo filtra `project` y en modo API la propia
    consulta ya filtra por faceta de pais.
    """
    barcode = normalize_ean(product.get("code"))
    if barcode is None:
        return None

    fallback = clean_text(product.get("product_name"))
    name_es = clean_text(product.get("product_name_es")) or fallback
    name_en = clean_text(product.get("product_name_en")) or fallback
    if not (name_es or name_en):
        return None

    record = {
        "barcode": barcode,
        "name": {"es": name_es, "en": name_en},
    }
    brand = first_brand(product.get("brands"))
    if brand:
        record["brand"] = brand
    # Los carbohidratos son opcionales: sin ellos el producto sirve para
    # identificar (nombre/marca) y el usuario completa los gramos a mano.
    carbs = to_number((product.get("nutriments") or {}).get("carbohydrates_100g"))
    if carbs is not None and carbs >= 0:
        record["carbsPer100g"] = carbs
    record["defaultPortionGrams"] = portion_grams(product.get("serving_quantity"))
    record["source"] = SOURCE
    record["savedAt"] = saved_at
    return record


def project(product: dict, saved_at: int, countries: set[str]) -> dict | None:
    """Proyecta un producto del dump; None si no es del pais o no cumple el filtro."""
    tags = {str(t).strip().lower() for t in (product.get("countries_tags") or [])}
    if not (tags & countries):
        return None
    return project_record(product, saved_at)


def iter_lines(spec: str):
    """Itera las lineas utiles de un JSONL/JSONL.gz local o remoto (streaming)."""
    if spec.startswith(("http://", "https://")):
        raw = urllib.request.urlopen(spec, timeout=120)
    else:
        raw = open(spec, "rb")
    try:
        try:
            magic = bytes(raw.peek(2)[:2])
        except (AttributeError, OSError):
            magic = b""
        stream = gzip.GzipFile(fileobj=raw) if magic == b"\x1f\x8b" else raw
        for chunk in stream:
            text = chunk.decode("utf-8", errors="replace").strip()
            if text:
                yield text
    finally:
        raw.close()


def build_records(
    input_spec: str,
    countries: list[str],
    limit: int = 0,
    saved_at: int | None = None,
) -> tuple[list[dict], int]:
    """Lee el dump y devuelve (registros ordenados, lineas leidas)."""
    saved_at = saved_at or now_ms()
    wanted = {c.strip().lower() for c in countries if c.strip()}
    records: list[dict] = []
    seen: set[str] = set()
    read = 0
    for line in iter_lines(input_spec):
        read += 1
        try:
            product = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(product, dict):
            continue
        record = project(product, saved_at, wanted)
        if record is None or record["barcode"] in seen:
            continue
        seen.add(record["barcode"])
        records.append(record)
        if limit and len(records) >= limit:
            break
    records.sort(key=lambda r: r["barcode"])
    return records, read


def http_json(url: str, timeout: int = 60, retries: int = 4) -> dict:
    """GET JSON con reintentos y backoff (la API de OFF a veces devuelve 503)."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read())
        except Exception as exc:  # red, 503, JSON invalido...
            last = exc
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"la API no respondio: {last}")


API_FIELDS = (
    "code,product_name,product_name_es,product_name_en,brands,serving_quantity,nutriments"
)
API_WINDOW = 10000  # la busqueda no pagina mas alla de este offset


def search_page(query: str, page: int, page_size: int, fields: str = API_FIELDS) -> dict:
    """Una pagina de la API de busqueda de OFF."""
    url = (
        f"{SEARCH_URL}?q={quote(query)}&page_size={page_size}&page={page}"
        f"&fields={quote(fields)}"
    )
    return http_json(url)


def _collect(
    hits: list, saved_at: int, seen: set[str], records: list[dict], limit: int
) -> int:
    """Proyecta y acumula hits (con dedup por barcode); devuelve cuantos se leyeron."""
    read = 0
    for hit in hits:
        read += 1
        if not isinstance(hit, dict):
            continue
        record = project_record(hit, saved_at)
        if record is None or record["barcode"] in seen:
            continue
        seen.add(record["barcode"])
        records.append(record)
        if limit and len(records) >= limit:
            break
    return read


def build_records_api(
    countries: list[str],
    limit: int = 0,
    page_size: int = 1000,
    delay: float = 1.0,
    saved_at: int | None = None,
    partition: bool = False,
) -> tuple[list[dict], int]:
    """Construye los registros desde la API de busqueda de OFF (sin el dump).

    Sin `partition`: una sola consulta por pais, acotada a la ventana de 10000
    documentos. Con `partition`: divide por prefijo de codigo (`code:840*`) y
    subdivide los prefijos que saturan la ventana, lo que permite recorrer el pais
    casi entero sin bajar el dump. Aplica el mismo filtro que el modo dump y una
    consulta que falla no aborta el pack (se conserva lo ya recolectado).
    """
    saved_at = saved_at or now_ms()
    wanted = [c.strip() for c in countries if c.strip()]
    base = " OR ".join(f'countries_tags:"{c}"' for c in wanted)
    page_size = max(1, min(page_size, 10000))
    window_pages = max(1, API_WINDOW // page_size)
    records: list[dict] = []
    seen: set[str] = set()
    read = 0

    if not partition:
        target_pages = (
            window_pages
            if not limit
            else min(math.ceil(limit / page_size) + 2, window_pages)
        )
        page = 1
        while page <= target_pages:
            try:
                data = search_page(base, page, page_size)
            except Exception as exc:
                print(f"AVISO: fallo la pagina {page}: {exc}", file=sys.stderr)
                break
            hits = data.get("hits") or []
            if not hits:
                break
            read += _collect(hits, saved_at, seen, records, limit)
            if limit and len(records) >= limit:
                break
            page += 1
            if delay:
                time.sleep(delay)
        records.sort(key=lambda r: r["barcode"])
        return records, read

    # Modo particionado: recorrido por prefijos de codigo.
    stack = [""]
    while stack:
        if limit and len(records) >= limit:
            break
        prefix = stack.pop()
        query = base if not prefix else f"{base} AND code:{prefix}*"
        try:
            head = search_page(query, 1, 1, fields="code")
        except Exception as exc:
            print(f"AVISO: fallo el recuento de '{prefix or 'pais'}': {exc}", file=sys.stderr)
            continue
        count = int(head.get("count") or 0)
        if count >= API_WINDOW and len(prefix) < 13:
            stack.extend(prefix + digit for digit in "0123456789")
            if delay:
                time.sleep(delay)
            continue
        pages = window_pages if not count else max(1, math.ceil(count / page_size))
        for page in range(1, min(pages, window_pages) + 1):
            if limit and len(records) >= limit:
                break
            try:
                data = search_page(query, page, page_size)
            except Exception as exc:
                print(f"AVISO: fallo la pagina {page} de '{prefix}': {exc}", file=sys.stderr)
                break
            hits = data.get("hits") or []
            if not hits:
                break
            read += _collect(hits, saved_at, seen, records, limit)
            if delay:
                time.sleep(delay)
        if delay:
            time.sleep(delay)
    records.sort(key=lambda r: r["barcode"])
    return records, read


def write_pack(
    out_base: Path,
    records: list[dict],
    locale: str,
    url: str | None = None,
    generated_at: str | None = None,
) -> dict:
    """Escribe JSONL.gz + manifest; devuelve el manifest."""
    generated_at = generated_at or now_iso()
    out_base.parent.mkdir(parents=True, exist_ok=True)
    pack_path = out_base.with_name(out_base.name + ".jsonl.gz")
    manifest_path = out_base.with_name(out_base.name + ".manifest.json")

    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as gz:
        for record in records:
            line = json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
            gz.write(line.encode("utf-8"))
    data = buffer.getvalue()
    pack_path.write_bytes(data)

    manifest = {
        "format": FORMAT,
        "version": VERSION,
        "locale": locale,
        "url": url or pack_path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "product_count": len(records),
        "generated_at": generated_at,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def pack_entry(
    manifest: dict,
    pack_file: str,
    pack_id: str,
    base_url: str | None = None,
) -> dict:
    """Entrada del manifest hospedado a partir del manifest del pack.

    La forma es la del `BarcodePacksManifest` congelado: solo los campos que la
    app necesita para descargar y verificar (url, sha256, bytes).
    """
    url = f"{base_url.rstrip('/')}/{pack_file}" if base_url else pack_file
    return {
        "id": pack_id,
        "locale": manifest["locale"],
        "url": url,
        "sha256": manifest["sha256"],
        "bytes": manifest["bytes"],
        "product_count": manifest["product_count"],
        "generated_at": manifest["generated_at"],
    }


def write_packs_manifest(path: Path, packs: list[dict]) -> dict:
    """Escribe el manifest hospedado `{format, version, packs}`; lo devuelve."""
    if path.parent and str(path.parent) not in ("", "."):
        path.parent.mkdir(parents=True, exist_ok=True)
    document = {"format": PACKS_FORMAT, "version": PACKS_VERSION, "packs": packs}
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return document


def locale_for(countries: list[str], override: str | None) -> str:
    """Locale del pack: override, o el del primer pais conocido, o "en"."""
    if override:
        return override
    for country in countries:
        key = country.strip().lower()
        if key in COUNTRY_LOCALE:
            return COUNTRY_LOCALE[key]
    return "en"


def build_source(countries: list[str], args: argparse.Namespace) -> tuple[list[dict], int]:
    """Recolecta los registros de una lista de paises (API o dump)."""
    if args.from_api:
        return build_records_api(
            countries,
            limit=args.limit,
            page_size=args.page_size,
            delay=args.api_delay,
            partition=args.partition,
        )
    return build_records(args.input or DEFAULT_URL, countries, limit=args.limit)


def write_group(
    base: Path,
    records: list[dict],
    locale: str,
    pack_id: str,
    args: argparse.Namespace,
) -> list[dict]:
    """Escribe el pack principal (con nutricion) y, si --split, el resto."""
    main_records = [r for r in records if "carbsPer100g" in r]
    rest_records = [r for r in records if "carbsPer100g" not in r]

    manifest = write_pack(
        base, main_records, locale, url=args.url, generated_at=args.generated_at
    )
    pack_path = base.with_name(base.name + ".jsonl.gz")
    print(f"  Principal: {manifest['product_count']} -> {pack_path} (sha256 {manifest['sha256'][:12]}…)")
    entries = [pack_entry(manifest, pack_path.name, pack_id, args.base_url)]

    if args.split:
        rest_base = base.with_name(base.name + "-rest")
        rest_manifest = write_pack(rest_base, rest_records, locale, generated_at=args.generated_at)
        rest_path = rest_base.with_name(rest_base.name + ".jsonl.gz")
        entries.append(
            pack_entry(rest_manifest, rest_path.name, pack_id + "-rest", args.base_url)
        )
        print(f"  Resto:     {rest_manifest['product_count']} -> {rest_path}")
    return entries


def main() -> int:
    args = parse_args()
    countries = [c.strip() for c in args.countries.split(",") if c.strip()]

    # Sin fuente (--input) ni --from-api, y con manifest hospedado: solo bootstrap
    # (lista de packs vacia), sin tocar la red ni generar pack.
    if args.packs_manifest and args.input is None and not args.from_api:
        document = write_packs_manifest(Path(args.packs_manifest), [])
        print(f"Packs manifest (vacio): {args.packs_manifest}")
        print(f"Formato:    {document['format']} v{document['version']}")
        return 0

    print(f"Paises:    {', '.join(countries)}")
    out_base = Path(args.out)
    entries: list[dict] = []

    # Con --per-country se genera un pack por pais (bajo <out>/<locale>); la app
    # elige el de su idioma. Sin el, todos los paises en un solo pack.
    groups = [[c] for c in countries] if args.per_country else [countries]
    for group in groups:
        group_locale = locale_for(group, args.locale)
        base = out_base.parent / group_locale if args.per_country else out_base
        source = (
            "Open Food Facts (API de busqueda)"
            if args.from_api
            else (args.input or DEFAULT_URL)
        )
        print(f"Locale:    {group_locale}  ->  {base}")
        print(f"Fuente:    {source}")
        records, read = build_source(group, args)
        print(f"Leidas:    {read} lineas")
        entries.extend(
            write_group(base, records, group_locale, args.pack_id or base.name, args)
        )

    if args.packs_manifest:
        write_packs_manifest(Path(args.packs_manifest), entries)
        print(f"Packs:     {args.packs_manifest} -> {', '.join(e['url'] for e in entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
