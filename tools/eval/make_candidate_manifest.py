#!/usr/bin/env python3
"""Genera un manifest de evaluacion para un clasificador candidato (SPEC 18).

El banco (`make eval`) lee un `model-manifest.json` con las URLs/paths del
detector y el clasificador. Para comparar candidatos en el MISMO pipeline
(detector + recorte + clasificador + resolucion) contra el baseline, este
script escribe un manifest con rutas locales y sha256 reales.

Uso:
  python3 tools/eval/make_candidate_manifest.py \
      --classifier training/out/student_catalog.int8.onnx \
      --classes-from training/out/student_catalog.manifest.json \
      --detector weights/detector.onnx \
      --out training/out/student_catalog.eval-manifest.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def entry(path: Path, version: str, classes: list[str] | None = None) -> dict:
    path = path.resolve()
    data = {
        "version": version,
        "url": "./" + str(path.relative_to(ROOT.resolve())),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }
    if classes is not None:
        data["classes"] = classes
    return data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--detector", type=Path, default=ROOT / "weights/detector.onnx")
    ap.add_argument("--detector-version", default="yolo11n-coco")
    ap.add_argument("--classifier", type=Path, required=True)
    ap.add_argument("--classifier-version", default=None)
    ap.add_argument(
        "--classes-from",
        type=Path,
        default=None,
        help="manifest del que tomar `classes`; si se omite, --classes-file (una por linea).",
    )
    ap.add_argument("--classes-file", type=Path, default=None)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    if args.classes_from:
        src = json.loads(args.classes_from.read_text(encoding="utf-8"))
        classes = src["classes"]
        version = args.classifier_version or src.get("version") or args.classifier.stem
    elif args.classes_file:
        classes = [ln.strip() for ln in args.classes_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
        version = args.classifier_version or args.classifier.stem
    else:
        raise SystemExit("faltan --classes-from o --classes-file")

    manifest = {
        "detector": entry(args.detector, args.detector_version),
        "classifier": entry(args.classifier, version, classes),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest: {args.out}  (classifier={version}, classes={len(classes)})")


if __name__ == "__main__":
    main()
