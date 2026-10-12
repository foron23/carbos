#!/usr/bin/env python3
"""Cabeza nueva (linear probe) sobre MobileNetV3-Large entrenada con Food-101 (subset).

Valida el pipeline de fine-tuning de punta a punta: lee los parquet de Food-101 (ethz/food101),
precomputa embeddings del backbone congelado (viable en CPU), entrena la cabeza y exporta ONNX
int8 + fragmento de clasificador para el banco (eval/).

Uso:
  tools/shortlist/.venv/bin/python training/finetune_food101.py \
      --data eval/cache/food101 --max-train-per-class 150 --max-test-per-class 50
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
from pathlib import Path

import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "eval/cache"
MODELS = CACHE / "models"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Linear probe de MobileNetV3 en Food-101.")
    parser.add_argument("--data", type=Path, default=ROOT / "eval/cache/food101")
    parser.add_argument("--backbone", default="mobilenet_v3_large")
    parser.add_argument("--max-train-per-class", type=int, default=150)
    parser.add_argument("--max-test-per-class", type=int, default=50)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--lr", type=float, default=1e-2)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--name", default="food101_subset_mobilenetv3")
    parser.add_argument("--no-quantize", action="store_true")
    return parser.parse_args()


def load_samples(data_dir: Path) -> tuple[list[tuple[bytes, int]], list[str]]:
    import pyarrow.parquet as pq

    samples: list[tuple[bytes, int]] = []
    for shard in sorted(data_dir.glob("*.parquet")):
        table = pq.read_table(shard, columns=["image", "label"])
        images = table.column("image").to_pylist()
        labels = table.column("label").to_pylist()
        for image, label in zip(images, labels):
            samples.append((image["bytes"], int(label)))
    labels_path = CACHE / "food101-labels.json"
    names = json.loads(labels_path.read_text(encoding="utf-8")) if labels_path.exists() else []
    return samples, names


def split_by_class(
    samples: list[tuple[bytes, int]],
    max_train: int,
    max_test: int,
    seed: int,
) -> tuple[list[tuple[bytes, int]], list[tuple[bytes, int]]]:
    groups: dict[int, list[bytes]] = {}
    for image, label in samples:
        groups.setdefault(label, []).append(image)
    train: list[tuple[bytes, int]] = []
    test: list[tuple[bytes, int]] = []
    rng = random.Random(seed)
    for label, images in groups.items():
        rng.shuffle(images)
        train.extend((image, label) for image in images[:max_train])
        test.extend((image, label) for image in images[max_train : max_train + max_test])
    return train, test


def make_transform():
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )


def embed_all(model, samples, transform, batch_size: int) -> torch.Tensor:
    from PIL import Image

    outputs: list[torch.Tensor] = []
    with torch.no_grad():
        for start in range(0, len(samples), batch_size):
            batch = samples[start : start + batch_size]
            tensors = [transform(Image.open(io.BytesIO(image)).convert("RGB")) for image, _ in batch]
            x = torch.stack(tensors)
            outputs.append(model(x))
    return torch.cat(outputs)


def main() -> None:
    args = parse_args()
    from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

    torch.manual_seed(args.seed)
    samples, names = load_samples(args.data)
    train, test = split_by_class(samples, args.max_train_per_class, args.max_test_per_class, args.seed)
    labels = sorted({label for _, label in samples})
    classes = [names[label] if label < len(names) else str(label) for label in labels]
    index = {label: i for i, label in enumerate(labels)}
    print(f"clases={len(classes)} train={len(train)} test={len(test)}")

    weights = MobileNet_V3_Large_Weights.DEFAULT
    base = mobilenet_v3_large(weights=weights).eval()
    features = base.features
    avgpool = base.avgpool

    def backbone(x: torch.Tensor) -> torch.Tensor:
        return avgpool(features(x)).flatten(1)

    transform = make_transform()
    train_x = embed_all(backbone, train, transform, args.batch_size)
    train_y = torch.tensor([index[label] for _, label in train])
    test_x = embed_all(backbone, test, transform, args.batch_size)
    test_y = torch.tensor([index[label] for _, label in test])

    head = nn.Linear(train_x.shape[1], len(classes))
    optimizer = torch.optim.Adam(head.parameters(), lr=args.lr)
    criterion = nn.CrossEntropyLoss()
    for epoch in range(args.epochs):
        head.train()
        optimizer.zero_grad()
        loss = criterion(head(train_x), train_y)
        loss.backward()
        optimizer.step()
    head.eval()
    with torch.no_grad():
        accuracy = (head(test_x).argmax(dim=1) == test_y).float().mean().item()
    print(f"test top-1: {accuracy * 100:.1f}%")

    class FoodNet(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.features = features
            self.avgpool = avgpool
            self.classifier = head

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.classifier(self.avgpool(self.features(x)).flatten(1))

    model = FoodNet().eval()
    MODELS.mkdir(parents=True, exist_ok=True)
    fp32 = MODELS / f"{args.name}.onnx"
    torch.onnx.export(
        model,
        torch.randn(1, 3, 224, 224),
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
        "version": f"food101-subset-{args.backbone}",
        "url": f"/models/{final.name}",
        "sha256": hashlib.sha256(final.read_bytes()).hexdigest(),
        "bytes": final.stat().st_size,
        "classes": classes,
    }
    (CACHE / f"classifier-{args.name}.json").write_text(
        json.dumps(entry, indent=2) + "\n", encoding="utf-8"
    )
    print(f"modelo: {final} ({final.stat().st_size} bytes, {len(classes)} clases)")


if __name__ == "__main__":
    main()
