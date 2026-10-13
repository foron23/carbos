#!/usr/bin/env python3
"""Smoke end-to-end del pipeline de datos (spec 12 / D25).

Prueba, en un directorio temporal, el camino completo del receptor:
  1) construye un bundle de contribuciones sintetico (imagenes reales del dataset);
  2) lo importa con `import_contributions.py` (consentimiento CC0, EXIF fuera, dedupe);
  3) opcionalmente lo sube al endpoint desplegado y comprueba la respuesta.

Uso:
    python3 tools/data/selfcheck.py
    python3 tools/data/selfcheck.py --endpoint https://carbos.foron.dev/api/contrib
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
IMAGES = ROOT / "data/images"


def first_images(n: int) -> list[tuple[str, bytes]]:
    """Devuelve (class_id, bytes) de las primeras imagenes disponibles."""
    out: list[tuple[str, bytes]] = []
    for class_dir in sorted(p for p in IMAGES.iterdir() if p.is_dir()):
        for img in sorted(class_dir.glob("*.jpg")) + sorted(class_dir.glob("*.png")):
            out.append((class_dir.name, img.read_bytes()))
            break
        if len(out) >= n:
            break
    return out[:n]


def build_bundle(path: Path, images: list[tuple[str, bytes]]) -> None:
    rows = ["path,class_id"]
    with zipfile.ZipFile(path, "w") as z:
        for i, (cid, data) in enumerate(images):
            name = f"images/{cid}/{i:03d}.jpg"
            z.writestr(name, data)
            rows.append(f"{name},{cid}")
        z.writestr(
            "consent.json",
            json.dumps(
                {
                    "format": "carbos-contrib",
                    "version": 1,
                    "license": "CC0-1.0",
                    "granted_at": "2026-10-13T00:00:00Z",
                    "app_version": "selfcheck",
                    "images": len(images),
                }
            ),
        )
        z.writestr("metadata.csv", "\n".join(rows) + "\n")


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Smoke end-to-end del pipeline de datos.")
    ap.add_argument("--endpoint", default="", help="URL /api/contrib para probar el receptor")
    args = ap.parse_args()

    ok = True
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        images = first_images(2)
        if len(images) < 2:
            print("SKIP: no hay imagenes en data/images (ejecuta `make data-images`)")
            return 0
        bundle = tmp / "contributions.zip"
        build_bundle(bundle, images)
        print(f"[1] bundle sintetico: {bundle.name} ({bundle.stat().st_size} bytes, {len(images)} imgs)")

        res = run(
            [
                sys.executable,
                str(HERE / "import_contributions.py"),
                "--bundle",
                str(bundle),
                "--out",
                str(tmp / "out"),
                "--log",
                str(tmp / "log.jsonl"),
            ]
        )
        imported = (tmp / "out").rglob("*")
        files = [p for p in imported if p.is_file()]
        log_ok = (tmp / "log.jsonl").exists() and "reviewed" in (tmp / "log.jsonl").read_text()
        step2 = res.returncode == 0 and len(files) == len(images) and log_ok
        print(f"[2] import local: {'PASS' if step2 else 'FAIL'} ({len(files)} ficheros) {res.stdout.strip().splitlines()[-1] if res.stdout else res.stderr.strip()[:120]}")
        ok = ok and step2

        if args.endpoint:
            req = urllib.request.Request(
                args.endpoint,
                data=bundle.read_bytes(),
                headers={
                    "Content-Type": "application/zip",
                    "Origin": "https://carbos.foron.dev",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = json.loads(resp.read().decode())
                step3 = resp.status == 200 and body.get("ok") is True
                print(f"[3] endpoint: {'PASS' if step3 else 'FAIL'} -> {body}")
                ok = ok and step3
            except Exception as exc:  # noqa: BLE001
                print(f"[3] endpoint: FAIL -> {exc}")
                ok = False
        else:
            print("[3] endpoint: SKIP (pasa --endpoint para probarlo)")

    print("\nRESULTADO:", "OK" if ok else "FALLO")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
