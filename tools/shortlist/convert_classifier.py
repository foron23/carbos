#!/usr/bin/env python3
"""Convierte un clasificador de transformers (Hugging Face) a ONNX int8 y escribe su fragmento.

Requiere transformers + torch + onnxruntime (venv de la shortlist). Uso:
  tools/shortlist/.venv/bin/python tools/shortlist/convert_classifier.py \
      --model Lumia101/Food101-EfficientNet-B0 --name efficientnet_b0_food101
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "eval/cache"
MODELS = CACHE / "models"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convierte un clasificador HF a ONNX int8.")
    parser.add_argument("--model", required=True, help="id del modelo en Hugging Face")
    parser.add_argument("--name", required=True, help="nombre corto de salida")
    parser.add_argument("--size", type=int, default=224)
    parser.add_argument("--no-quantize", action="store_true")
    return parser.parse_args()


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    args = parse_args()
    import torch
    from transformers import AutoModelForImageClassification

    MODELS.mkdir(parents=True, exist_ok=True)
    model = AutoModelForImageClassification.from_pretrained(args.model).eval()
    id2label = model.config.id2label
    classes = [id2label[i] for i in range(len(id2label))]

    fp32 = MODELS / f"{args.name}.onnx"
    dummy = torch.randn(1, 3, args.size, args.size)
    torch.onnx.export(
        model,
        dummy,
        str(fp32),
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )

    final = fp32
    if not args.no_quantize:
        try:
            from onnxruntime.quantization import QuantType, quantize_dynamic

            quantized = MODELS / f"{args.name}.int8.onnx"
            quantize_dynamic(str(fp32), str(quantized), weight_type=QuantType.QInt8)
            final = quantized
        except Exception as error:  # noqa: BLE001 - la cuantizacion es opcional
            print(f"  cuantizacion fallida ({error}); uso fp32")

    entry = {
        "version": f"food101-{args.name}",
        "url": f"/models/{final.name}",
        "sha256": sha256_of(final),
        "bytes": final.stat().st_size,
        "classes": classes,
    }
    (CACHE / f"classifier-{args.name}.json").write_text(
        json.dumps(entry, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{args.model} -> {final} ({final.stat().st_size} bytes, {len(classes)} clases)")


if __name__ == "__main__":
    main()
