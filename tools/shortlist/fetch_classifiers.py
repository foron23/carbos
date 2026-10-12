#!/usr/bin/env python3
"""Descarga los clasificadores ONNX de la shortlist y escribe sus fragmentos.

Solo usa la stdlib. Los pesos van a eval/cache/models/ (gitignored) y las etiquetas
Food-101 se toman del config del modelo Swin de onnx-community. Ver
docs/specs/09-experimento.md.
"""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "eval/cache"
MODELS = CACHE / "models"

LABELS_URL = (
    "https://huggingface.co/onnx-community/swin-finetuned-food101-ONNX/resolve/main/config.json"
)

CLASSIFIERS = {
    "swin_food101_int8": {
        "url": "https://huggingface.co/onnx-community/swin-finetuned-food101-ONNX/resolve/main/onnx/model_int8.onnx",
        "file": "swin_food101_int8.onnx",
        "version": "food101-swin-int8",
    },
}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "carbos-shortlist"})
    with urllib.request.urlopen(request) as response:
        return response.read()


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  ya existe: {dest.name}")
        return
    request = urllib.request.Request(url, headers={"User-Agent": "carbos-shortlist"})
    with urllib.request.urlopen(request) as response, dest.open("wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)
    print(f"  descargado: {dest.name} ({dest.stat().st_size} bytes)")


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_labels() -> list[str]:
    config = json.loads(fetch(LABELS_URL))
    id2label = config.get("id2label") or {}
    return [id2label[str(i)] for i in range(len(id2label))]


def main() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    labels = load_labels()
    (CACHE / "food101-labels.json").write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")
    print(f"Food-101 labels: {len(labels)}")

    for name, spec in CLASSIFIERS.items():
        print(name)
        dest = MODELS / spec["file"]
        download(spec["url"], dest)
        entry = {
            "version": spec["version"],
            "url": f"/models/{spec['file']}",
            "sha256": sha256_of(dest),
            "bytes": dest.stat().st_size,
            "classes": labels,
        }
        (CACHE / f"classifier-{name}.json").write_text(
            json.dumps(entry, indent=2) + "\n", encoding="utf-8"
        )
        print(f"  fragmento: classifier-{name}.json")


if __name__ == "__main__":
    main()
