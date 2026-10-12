#!/usr/bin/env python3
"""Genera modelos ONNX **de prueba** y un manifest local para el smoke test.

NO son modelos reales: el detector devuelve una caja fija y el clasificador, unos
logits fijos. Sirven para ver el flujo completo (manifest -> descarga -> sha256 ->
sesion -> deteccion -> clasificacion -> porcion) sin publicar pesos.

El contrato que respetan es el del runtime (ver src/model/worker.ts):
  detector:    entrada [1,3,640,640] float32 /255; salida [1, 4+nc, anchors] (YOLOv8)
  clasificador: entrada [1,3,224,224] float32 ImageNet; salida logits [1, C]

Uso: make smoke-models  (o: python3 tools/smoke/make_models.py)
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

# Etiquetas del mapa de clases (src/catalog/classmap.ts) para la demo.
CLASSES = ["spanish_omelette", "paella", "lentils"]

DETECTOR_SIZE = 640
CLASSIFIER_SIZE = 224
# Caja centrada que cae dentro de la imagen letterboxeada en cualquier aspect ratio.
DETECTOR_BOX = (320.0, 320.0, 200.0, 200.0, 0.9)


def constant_model(input_name: str, input_shape: list[int], output_name: str, value: np.ndarray):
    input_info = helper.make_tensor_value_info(input_name, TensorProto.FLOAT, input_shape)
    output_info = helper.make_tensor_value_info(
        output_name, TensorProto.FLOAT, list(value.shape)
    )
    node = helper.make_node(
        "Constant",
        inputs=[],
        outputs=[output_name],
        value=numpy_helper.from_array(value, name="value"),
    )
    graph = helper.make_graph([node], "placeholder", [input_info], [output_info])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    return model


def detector_value() -> np.ndarray:
    # [1, channels, anchors]; channels = cx, cy, w, h, cls0. Solo el ancla 0 puntua.
    value = np.zeros((1, 5, 3), dtype=np.float32)
    cx, cy, w, h, score = DETECTOR_BOX
    value[0, 0, 0], value[0, 1, 0], value[0, 2, 0], value[0, 3, 0], value[0, 4, 0] = (
        cx,
        cy,
        w,
        h,
        score,
    )
    return value


def classifier_value() -> np.ndarray:
    # [1, C]: gana el indice 0 -> CLASSES[0].
    logits = np.zeros((1, len(CLASSES)), dtype=np.float32)
    logits[0, 0] = 4.0
    return logits


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Modelos ONNX de prueba para el smoke test.")
    parser.add_argument("--models", type=Path, default=root / "public/models")
    parser.add_argument("--manifest", type=Path, default=root / "public/model-manifest.json")
    parser.add_argument("--url-base", default="/models")
    return parser.parse_args()


def verify(path: Path) -> None:
    try:
        import onnxruntime as ort
    except ImportError:
        print("  (onnxruntime no instalado: sin verificacion de sesion)")
        return
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    print(f"  sesion OK: {path.name} entradas={session.get_inputs()[0].shape}")


def main() -> None:
    args = parse_args()
    args.models.mkdir(parents=True, exist_ok=True)

    detector_path = args.models / "detector.onnx"
    classifier_path = args.models / "classifier.onnx"

    onnx.save(
        constant_model(
            "input",
            [1, 3, DETECTOR_SIZE, DETECTOR_SIZE],
            "output0",
            detector_value(),
        ),
        detector_path,
    )
    onnx.save(
        constant_model(
            "input",
            [1, 3, CLASSIFIER_SIZE, CLASSIFIER_SIZE],
            "logits",
            classifier_value(),
        ),
        classifier_path,
    )

    manifest = {
        "detector": {
            "version": "smoke",
            "url": f"{args.url_base}/detector.onnx",
            "sha256": sha256_of(detector_path),
            "bytes": detector_path.stat().st_size,
        },
        "classifier": {
            "version": "smoke",
            "url": f"{args.url_base}/classifier.onnx",
            "sha256": sha256_of(classifier_path),
            "bytes": classifier_path.stat().st_size,
            "classes": CLASSES,
        },
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"detector:   {detector_path}")
    print(f"clasificador: {classifier_path}")
    print(f"manifest:   {args.manifest}")
    verify(detector_path)
    verify(classifier_path)


if __name__ == "__main__":
    main()
