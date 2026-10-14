#!/usr/bin/env python3
"""Genera `public/model-manifest.json` de produccion a partir de los pesos reales.

Copia el detector y el clasificador a `weights/` (nombres canonicos), calcula
sha256/bytes y escribe el manifest que consume la app (`model-manifest.json`,
E3/D24). Los pesos viven **en este mismo repo** (`weights/`, fuera de `public/`
para no entrar en el artefacto de Pages) y se sirven por **jsDelivr desde un
tag**; la app los descarga una sola vez y verifica el sha256.

Uso (tras exportar los modelos con tools/shortlist/):

    make weights-manifest WEIGHTS_VERSION=0.1.0

Luego commitea `weights/` + `public/model-manifest.json` y crea el tag
`weights-<version>`. El sha256 casa porque se commitean los bytes exactos.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DETECTOR = ROOT / "eval/cache/models/yolo11n_coco.onnx"
DEFAULT_CLASSIFIER = ROOT / "eval/cache/models/mobilenet_v3_large_imagenet.int8.onnx"
DEFAULT_CLASSES = ROOT / "eval/cache/classifier-mobilenet_v3_large_imagenet.json"
DEFAULT_STAGE = ROOT / "weights"
DEFAULT_OUT = ROOT / "public/model-manifest.json"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera el manifest de produccion.")
    parser.add_argument("--detector", type=Path, default=DEFAULT_DETECTOR)
    parser.add_argument("--classifier", type=Path, default=DEFAULT_CLASSIFIER)
    parser.add_argument("--classes", type=Path, default=DEFAULT_CLASSES)
    parser.add_argument("--classes-field", default="classes")
    parser.add_argument("--version", default="0.1.0", help="tag/version de la release de pesos")
    parser.add_argument(
        "--repo",
        default="foron23/carbos",
        help="repo de GitHub que aloja los pesos (mismo repo por defecto)",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help="base de los pesos; por defecto jsDelivr sobre <repo>@weights-<version>/weights",
    )
    parser.add_argument(
        "--detector-base",
        default=None,
        help="base propia del detector (por defecto, la comun). Util para reutilizar un "
        "asset sin cambios desde un tag anterior (p.ej. weights-0.2.0) si el CDN del tag "
        "nuevo no lo sirve.",
    )
    parser.add_argument(
        "--classifier-base",
        default=None,
        help="base propia del clasificador (por defecto, la comun).",
    )
    parser.add_argument("--stage", type=Path, default=DEFAULT_STAGE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--detector-name", default="detector.onnx")
    parser.add_argument("--classifier-name", default="classifier.int8.onnx")
    parser.add_argument("--detector-version", default="yolo11n-coco")
    parser.add_argument("--classifier-version", default="mobilenet_v3_large-imagenet")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base = args.base_url or (
        f"https://cdn.jsdelivr.net/gh/{args.repo}@weights-{args.version}/weights"
    ).rstrip("/")
    detector_base = (args.detector_base or base).rstrip("/")
    classifier_base = (args.classifier_base or base).rstrip("/")

    for path in (args.detector, args.classifier, args.classes):
        if not path.is_file():
            raise SystemExit(f"no existe: {path}")

    args.stage.mkdir(parents=True, exist_ok=True)
    detector_staged = args.stage / args.detector_name
    classifier_staged = args.stage / args.classifier_name
    shutil.copy2(args.detector, detector_staged)
    shutil.copy2(args.classifier, classifier_staged)

    classes = json.loads(args.classes.read_text(encoding="utf-8"))[args.classes_field]

    manifest = {
        "detector": {
            "version": args.detector_version,
            "url": f"{detector_base}/{args.detector_name}",
            "sha256": sha256_of(detector_staged),
            "bytes": detector_staged.stat().st_size,
        },
        "classifier": {
            "version": args.classifier_version,
            "url": f"{classifier_base}/{args.classifier_name}",
            "sha256": sha256_of(classifier_staged),
            "bytes": classifier_staged.stat().st_size,
            "classes": classes,
        },
    }
    args.out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"staging:  {args.stage}")
    print(f"  -> {detector_staged.name}   ({manifest['detector']['bytes']} bytes)")
    print(f"  -> {classifier_staged.name} ({manifest['classifier']['bytes']} bytes)")
    print(f"manifest: {args.out}")
    print(f"clases:   {len(classes)}")
    print()
    print("Siguiente paso: commitear weights/ + public/model-manifest.json y crear el tag")
    print(f"  git add weights public/model-manifest.json && git commit && git tag weights-{args.version}")
    print(f"Base de descarga (jsDelivr, mismo repo): {base}")


if __name__ == "__main__":
    main()
