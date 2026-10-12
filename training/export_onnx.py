#!/usr/bin/env python3
"""Exporta el clasificador entrenado a ONNX (int8) y escribe su manifest.

Ver docs/specs/08-linear-probe.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Exporta el clasificador a ONNX (int8) y escribe el manifest."
    )
    parser.add_argument("--model", type=Path, default=Path("training/out/model.pt"))
    parser.add_argument(
        "--classes",
        type=Path,
        default=None,
        help="classes.json (por defecto, junto al modelo)",
    )
    parser.add_argument("--out", type=Path, default=Path("training/out"))
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--version", default="0.1.0")
    parser.add_argument("--url", default="", help="URL publica de los pesos (jsDelivr/GitHub Releases)")
    parser.add_argument("--no-quantize", action="store_true", help="No cuantizar a int8")
    return parser.parse_args()


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    args = parse_args()

    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic

    if not args.model.exists():
        raise SystemExit(
            f"No existe el modelo: {args.model}\n"
            "Entrena antes con `make train` (o prueba con `make train-smoke`)."
        )

    classes_path = args.classes or args.model.with_name("classes.json")
    classes = json.loads(classes_path.read_text(encoding="utf-8")) if classes_path.exists() else []

    model = torch.load(args.model, map_location="cpu", weights_only=False)
    model.eval()

    args.out.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out / "classifier.onnx"
    dummy = torch.randn(1, 3, args.image_size, args.image_size)
    torch.onnx.export(
        model,
        dummy,
        str(onnx_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=args.opset,
    )

    final_path = onnx_path
    if not args.no_quantize:
        quantized = args.out / "classifier.int8.onnx"
        quantize_dynamic(str(onnx_path), str(quantized), weight_type=QuantType.QInt8)
        final_path = quantized

    entry = {
        "version": args.version,
        "url": args.url,
        "sha256": sha256_of(final_path),
        "bytes": final_path.stat().st_size,
        "classes": classes,
    }
    manifest_path = args.out / "classifier.manifest.json"
    manifest_path.write_text(
        json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"onnx: {final_path}")
    print(f"manifest: {manifest_path}")
    print(f"sha256: {entry['sha256']}  bytes: {entry['bytes']}  clases: {len(classes)}")


if __name__ == "__main__":
    main()
