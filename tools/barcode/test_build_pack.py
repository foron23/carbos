#!/usr/bin/env python3
"""Tests del generador de packs de codigos de barras (spec 17, opcion E).

Ejecuta con pytest o directamente:
    python3 -m pytest tools/barcode/test_build_pack.py
    python3 tools/barcode/test_build_pack.py
"""

from __future__ import annotations

import gzip
import hashlib
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_pack  # noqa: E402

SPAIN_VALID = {
    "code": "8412345678905",
    "product_name_es": "Patatas fritas",
    "product_name_en": "Chips",
    "brands": "Marca X, Otra",
    "countries_tags": ["en:spain", "en:europe"],
    "nutriments": {"carbohydrates_100g": 52.3},
    "serving_quantity": "30",
}
NO_CARBS = {
    "code": "4006381333931",
    "product_name": "Sin datos",
    "countries_tags": ["en:spain"],
    "nutriments": {"sugars_100g": 5},
}
NON_SPAIN = {
    "code": "4006381333931",
    "product_name": "France",
    "countries_tags": ["en:france"],
    "nutriments": {"carbohydrates_100g": 10},
}
BAD_EAN = {
    "code": "8412345678900",
    "product_name": "Mal EAN",
    "countries_tags": ["en:spain"],
    "nutriments": {"carbohydrates_100g": 10},
}
UPC_A = {
    "code": "036000291452",
    "product_name": "Upc",
    "countries_tags": ["en:spain"],
    "nutriments": {"carbohydrates_100g": 12},
}


def write_fixture(path: Path, products: list[dict], gzipped: bool = False) -> None:
    lines = "".join(json.dumps(p, ensure_ascii=False) + "\n" for p in products)
    if gzipped:
        with gzip.open(path, "wb") as handle:
            handle.write(lines.encode("utf-8"))
    else:
        path.write_text(lines, encoding="utf-8")


def read_pack(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def test_filter_roundtrip_and_manifest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        src = tmp / "dump.jsonl"
        write_fixture(src, [SPAIN_VALID, NO_CARBS, NON_SPAIN, BAD_EAN])
        out = tmp / "es"

        # Se conservan tambien los productos sin carbs (pack "resto"): identifican.
        records, read = build_pack.build_records(str(src), ["en:spain"])
        assert read == 4
        assert [r["barcode"] for r in records] == ["4006381333931", "8412345678905"]

        main = [r for r in records if "carbsPer100g" in r]
        rest = [r for r in records if "carbsPer100g" not in r]
        assert [r["barcode"] for r in main] == ["8412345678905"]
        assert [r["barcode"] for r in rest] == ["4006381333931"]

        manifest = build_pack.write_pack(out, main, "es")
        pack = tmp / "es.jsonl.gz"
        manifest_path = tmp / "es.manifest.json"
        assert pack.is_file() and manifest_path.is_file()

        # El JSONL.gz vuelve a leerse igual.
        roundtrip = read_pack(pack)
        assert roundtrip == main
        record = roundtrip[0]
        assert record["barcode"] == "8412345678905"
        assert record["name"] == {"es": "Patatas fritas", "en": "Chips"}
        assert record["brand"] == "Marca X"
        assert record["carbsPer100g"] == 52.3
        assert record["defaultPortionGrams"] == 30
        assert isinstance(record["savedAt"], int)
        assert "Open Food Facts" in record["source"]

        # El manifest firma los bytes exactos del .gz.
        data = pack.read_bytes()
        assert manifest["format"] == "carbos-barcode-pack"
        assert manifest["version"] == 1
        assert manifest["locale"] == "es"
        assert manifest["bytes"] == len(data)
        assert manifest["sha256"] == hashlib.sha256(data).hexdigest()
        assert manifest["product_count"] == 1
        assert manifest["url"] == "es.jsonl.gz"

        # sha256_raw/raw_bytes firman el JSONL descomprimido (lo que se importa).
        raw = gzip.decompress(data)
        assert manifest["raw_bytes"] == len(raw)
        assert manifest["sha256_raw"] == hashlib.sha256(raw).hexdigest()
        assert raw == "".join(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
            for record in main
        ).encode("utf-8")
        assert manifest_path.read_text(encoding="utf-8")


def test_rest_record_has_no_carbs() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        record = build_pack.project_record(
            {"code": "4006381333931", "product_name": "Sin datos"}, 0
        )
        assert record is not None
        assert "carbsPer100g" not in record
        manifest = build_pack.write_pack(tmp / "es-rest", [record], "es")
        assert manifest["product_count"] == 1
        pack = read_pack(tmp / "es-rest.jsonl.gz")
        assert pack[0]["barcode"] == "4006381333931"
        assert "carbsPer100g" not in pack[0]


def test_gzip_input() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        src = tmp / "dump.jsonl.gz"
        write_fixture(src, [SPAIN_VALID, NON_SPAIN], gzipped=True)
        records, _ = build_pack.build_records(str(src), ["en:spain"])
        assert [r["barcode"] for r in records] == ["8412345678905"]


def test_upc_a_normalized_and_ean_checksum() -> None:
    assert build_pack.is_valid_ean13("4006381333931")
    assert not build_pack.is_valid_ean13("4006381333930")
    assert build_pack.normalize_ean("036000291452") == "0036000291452"

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        src = tmp / "dump.jsonl"
        write_fixture(src, [UPC_A])
        records, _ = build_pack.build_records(str(src), ["en:spain"])
        assert [r["barcode"] for r in records] == ["0036000291452"]


def test_locale_for_country() -> None:
    assert build_pack.locale_for(["en:spain"], None) == "es"
    assert build_pack.locale_for(["en:france"], None) == "fr"
    assert build_pack.locale_for(["en:unknown"], None) == "en"
    assert build_pack.locale_for(["en:spain"], "xx") == "xx"


def test_packs_manifest_empty() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "packs.json"
        document = build_pack.write_packs_manifest(path, [])
        assert document == {"format": "carbos-barcode-packs", "version": 1, "packs": []}
        assert json.loads(path.read_text(encoding="utf-8")) == document


def test_packs_manifest_entry_matches_pack() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        src = tmp / "dump.jsonl"
        write_fixture(src, [SPAIN_VALID])
        out = tmp / "es"
        records, _ = build_pack.build_records(str(src), ["en:spain"])
        manifest = build_pack.write_pack(
            out, records, "es", generated_at="2026-10-13T00:00:00Z"
        )

        entry = build_pack.pack_entry(
            manifest,
            pack_file="es.jsonl.gz",
            pack_id="es",
            base_url="https://cdn.example/barcode",
        )
        assert entry["id"] == "es"
        assert entry["locale"] == "es"
        assert entry["url"] == "https://cdn.example/barcode/es.jsonl.gz"
        assert entry["product_count"] == 1
        assert entry["generated_at"] == "2026-10-13T00:00:00Z"

        # sha256/bytes firman los bytes exactos del .jsonl.gz emitido.
        data = (tmp / "es.jsonl.gz").read_bytes()
        assert entry["sha256"] == hashlib.sha256(data).hexdigest()
        assert entry["bytes"] == len(data)
        assert entry["sha256"] == manifest["sha256"]
        assert entry["bytes"] == manifest["bytes"]

        # sha256_raw/raw_bytes se propagan y firman el JSONL descomprimido.
        raw = gzip.decompress(data)
        assert entry["sha256_raw"] == hashlib.sha256(raw).hexdigest()
        assert entry["raw_bytes"] == len(raw)
        assert entry["sha256_raw"] == manifest["sha256_raw"]
        assert entry["raw_bytes"] == manifest["raw_bytes"]

        path = tmp / "packs.json"
        document = build_pack.write_packs_manifest(path, [entry])
        assert document["format"] == "carbos-barcode-packs"
        assert document["version"] == 1
        assert document["packs"] == [entry]


def test_pack_entry_without_base_url_is_bare_filename() -> None:
    manifest = {
        "locale": "es",
        "sha256": "a" * 64,
        "bytes": 10,
        "product_count": 1,
        "generated_at": "2026-10-13T00:00:00Z",
    }
    entry = build_pack.pack_entry(manifest, "es.jsonl.gz", "es", base_url=None)
    assert entry["url"] == "es.jsonl.gz"
    # Un manifest antiguo sin sha256_raw/raw_bytes sigue siendo valido.
    assert "sha256_raw" not in entry
    assert "raw_bytes" not in entry


def test_first_brand_accepts_list_and_string() -> None:
    assert build_pack.first_brand(["Marca X", "Otra"]) == "Marca X"
    assert build_pack.first_brand("Marca X, Otra") == "Marca X"
    assert build_pack.first_brand([]) == ""
    assert build_pack.first_brand(None) == ""


def test_missing_name_falls_back_and_is_never_empty() -> None:
    # Falta el nombre en es: cae al otro idioma.
    one_lang = build_pack.project_record(
        {"code": "4006381333931", "product_name_en": "Milk"}, 0
    )
    assert one_lang is not None
    assert one_lang["name"] == {"es": "Milk", "en": "Milk"}

    # Falta el nombre en en: simetrico.
    other_lang = build_pack.project_record(
        {"code": "4006381333931", "product_name_es": "Leche"}, 0
    )
    assert other_lang is not None
    assert other_lang["name"] == {"es": "Leche", "en": "Leche"}

    # Sin nombre en ningun idioma: cae a la marca.
    with_brand = build_pack.project_record({"code": "4006381333931", "brands": "Marca X"}, 0)
    assert with_brand is not None
    assert with_brand["name"] == {"es": "Marca X", "en": "Marca X"}

    # Sin nombre ni marca: cae al propio barcode.
    bare = build_pack.project_record({"code": "4006381333931"}, 0)
    assert bare is not None
    assert bare["name"] == {"es": "4006381333931", "en": "4006381333931"}


def test_build_records_api_pages_and_filters() -> None:
    pages = {
        1: {
            "hits": [
                {
                    "code": "8412345678905",
                    "product_name_es": "Patatas",
                    "brands": ["Marca X", "Otra"],
                    "nutriments": {"carbohydrates_100g": 52.3},
                },
                {
                    "code": "4006381333931",
                    "product_name": "Sin carbs",
                    "brands": "X",
                    "nutriments": {"sugars_100g": 5},
                },
            ]
        },
        2: {
            "hits": [
                {
                    "code": "036000291452",
                    "product_name_es": "Upc",
                    "brands": [],
                    "nutriments": {"carbohydrates_100g": 12},
                }
            ]
        },
    }
    calls = {"n": 0}

    def fake_http(url: str, *args, **kwargs) -> dict:  # noqa: ANN002, ANN003
        calls["n"] += 1
        return pages.get(calls["n"], {"hits": []})

    original = build_pack.http_json
    build_pack.http_json = fake_http
    try:
        records, read = build_pack.build_records_api(
            ["en:spain"], limit=0, page_size=2, delay=0
        )
    finally:
        build_pack.http_json = original

    # Normaliza UPC-A, conserva el que no trae carbs (pack resto) y ordena.
    assert [r["barcode"] for r in records] == [
        "0036000291452",
        "4006381333931",
        "8412345678905",
    ]
    assert records[2]["brand"] == "Marca X"
    assert "carbsPer100g" not in records[1]
    assert read == 3


def test_build_records_api_survives_a_failing_page() -> None:
    def flaky(url: str, *args, **kwargs) -> dict:  # noqa: ANN002, ANN003
        raise RuntimeError("503")

    original = build_pack.http_json
    build_pack.http_json = flaky
    try:
        records, read = build_pack.build_records_api(["en:spain"], limit=0, delay=0)
    finally:
        build_pack.http_json = original
    assert records == []
    assert read == 0


def _run_all() -> int:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_") and callable(value)]
    failed = 0
    for test in tests:
        try:
            test()
        except AssertionError as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        else:
            print(f"PASS {test.__name__}")
    print(f"\n{build_pack.FORMAT}: {len(tests) - failed}/{len(tests)} tests OK")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
