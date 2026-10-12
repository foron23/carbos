#!/usr/bin/env python3
"""Exporta un clasificador de torchvision (ImageNet) a ONNX (+int8) y escribe su fragmento.

El exportador de torchvision es fiable (a diferencia del de transformers). Uso:
  tools/shortlist/.venv/bin/python tools/shortlist/export_torchvision.py \
      --arch mobilenet_v3_large --name mobilenet_v3_large_imagenet
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "eval/cache"
MODELS = CACHE / "models"

WEIGHTS = {
    "mobilenet_v3_large": "MobileNet_V3_Large_Weights",
    "mobilenet_v3_small": "MobileNet_V3_Small_Weights",
    "efficientnet_b0": "EfficientNet_B0_Weights",
    "resnet18": "ResNet18_Weights",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporta un clasificador torchvision a ONNX.")
    parser.add_argument("--arch", required=True, choices=sorted(WEIGHTS))
    parser.add_argument("--name", required=True)
    parser.add_argument("--size", type=int, default=224)
    parser.add_argument("--no-quantize", action="store_true")
    return parser.parse_args()


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    args = parse_args()
    import torch
    from torchvision import models

    weights_enum = getattr(models, WEIGHTS[args.arch]).DEFAULT
    model = getattr(models, args.arch)(weights=weights_enum).eval()
    classes = list(weights_enum.meta["categories"])

    MODELS.mkdir(parents=True, exist_ok=True)
    fp32 = MODELS / f"{args.name}.onnx"
    dummy = torch.randn(1, 3, args.size, args.size)
    torch.onnx.export(
        model,
        dummy,
        str(fp32),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
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
        "version": f"{args.arch}-imagenet",
        "url": f"/models/{final.name}",
        "sha256": sha256_of(final),
        "bytes": final.stat().st_size,
        "classes": classes,
    }
    (CACHE / f"classifier-{args.name}.json").write_text(
        json.dumps(entry, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{args.arch} -> {final} ({final.stat().st_size} bytes, {len(classes)} clases)")


if __name__ == "__main__":
    main()
