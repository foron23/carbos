#!/usr/bin/env python3
"""Exporta YOLO11n (COCO) a ONNX para la shortlist (D28).

Requiere ultralytics + torch (ver tools/shortlist/README o docs/specs/09-experimento.md).
Uso: tools/shortlist/.venv/bin/python tools/shortlist/export_yolo11n.py
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "eval/cache"
MODELS = CACHE / "models"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    from ultralytics import YOLO

    CACHE.mkdir(parents=True, exist_ok=True)
    MODELS.mkdir(parents=True, exist_ok=True)
    os.chdir(CACHE)

    model = YOLO("yolo11n.pt")
    exported = Path(model.export(format="onnx", imgsz=640, opset=17, dynamic=False, simplify=False))
    dest = MODELS / "yolo11n_coco.onnx"
    shutil.copyfile(exported, dest)

    names = model.names
    (CACHE / "detector-classes.json").write_text(
        json.dumps(names, indent=2) + "\n", encoding="utf-8"
    )
    entry = {
        "version": "yolo11n-coco",
        "url": "/models/yolo11n_coco.onnx",
        "sha256": sha256_of(dest),
        "bytes": dest.stat().st_size,
    }
    (CACHE / "detector.json").write_text(json.dumps(entry, indent=2) + "\n", encoding="utf-8")

    print(f"detector: {dest} ({dest.stat().st_size} bytes)")
    print(f"clases COCO: {len(names)}")


if __name__ == "__main__":
    main()
