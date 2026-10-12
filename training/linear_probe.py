#!/usr/bin/env python3
"""Cabeza nueva (linear probe) para Carbos.

Congela un backbone preentrenado y entrena solo la capa final con las clases del
catalogo. Proceso y uso: docs/specs/08-linear-probe.md.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Entrena una cabeza nueva (linear probe) sobre un backbone congelado."
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=Path("training/data"),
        help="Raiz estilo ImageFolder: <data>/<clase>/*.jpg",
    )
    parser.add_argument("--out", type=Path, default=Path("training/out"), help="Directorio de salida")
    parser.add_argument(
        "--backbone",
        default="mobilenet_v3_small",
        choices=["mobilenet_v3_small", "mobilenet_v3_large", "efficientnet_b0", "resnet18"],
    )
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Prueba el pipeline con tensores aleatorios (sin datos ni red)",
    )
    return parser.parse_args()


def replace_head(model, backbone: str, num_classes: int):
    import torch.nn as nn

    if backbone.startswith("mobilenet_v3") or backbone.startswith("efficientnet"):
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = nn.Linear(in_features, num_classes)
        return model.classifier[-1]
    if backbone.startswith("resnet"):
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, num_classes)
        return model.fc
    raise ValueError(f"backbone no soportado: {backbone}")


def build_model(backbone: str, num_classes: int, pretrained: bool = True):
    from torchvision import models

    if backbone == "mobilenet_v3_small":
        weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        model = models.mobilenet_v3_small(weights=weights)
    elif backbone == "mobilenet_v3_large":
        weights = models.MobileNet_V3_Large_Weights.DEFAULT if pretrained else None
        model = models.mobilenet_v3_large(weights=weights)
    elif backbone == "efficientnet_b0":
        weights = models.EfficientNet_B0_Weights.DEFAULT if pretrained else None
        model = models.efficientnet_b0(weights=weights)
    elif backbone == "resnet18":
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        model = models.resnet18(weights=weights)
    else:
        raise ValueError(f"backbone no soportado: {backbone}")

    head = replace_head(model, backbone, num_classes)
    for param in model.parameters():
        param.requires_grad = False
    for param in head.parameters():
        param.requires_grad = True
    return model, head


def make_transforms(image_size: int):
    from torchvision import transforms

    normalize = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(image_size, scale=(0.6, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            normalize,
        ]
    )
    eval_tf = transforms.Compose(
        [
            transforms.Resize(int(image_size * 1.14)),
            transforms.CenterCrop(image_size),
            transforms.ToTensor(),
            normalize,
        ]
    )
    return train_tf, eval_tf


def run(args: argparse.Namespace) -> None:
    import torch
    from torch import nn
    from torch.utils.data import DataLoader, Subset
    from torchvision import datasets

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    if args.dry_run:
        num_classes = 4
        classes = [f"clase_{i}" for i in range(num_classes)]
        model, head = build_model(args.backbone, num_classes, pretrained=False)
        model.to(device)
        images = torch.randn(args.batch_size, 3, args.image_size, args.image_size).to(device)
        labels = torch.randint(0, num_classes, (args.batch_size,)).to(device)
        train_batches = [(images, labels)]
        val_batches = [(images, labels)]
    else:
        if not args.data.exists():
            raise SystemExit(
                f"No existe el directorio de datos: {args.data}\n"
                "Crea training/data/<clase>/*.jpg (ver docs/specs/08-linear-probe.md)."
            )
        train_tf, eval_tf = make_transforms(args.image_size)
        base_train = datasets.ImageFolder(args.data, transform=train_tf)
        base_eval = datasets.ImageFolder(args.data, transform=eval_tf)
        classes = base_train.classes
        num_classes = len(classes)
        if num_classes < 2:
            raise SystemExit("Se necesitan al menos 2 clases en el set de datos.")

        indices = list(range(len(base_train)))
        random.Random(args.seed).shuffle(indices)
        val_size = int(len(indices) * args.val_split)
        val_idx, train_idx = indices[:val_size], indices[val_size:]
        train_loader = DataLoader(
            Subset(base_train, train_idx),
            batch_size=args.batch_size,
            shuffle=True,
            num_workers=args.workers,
        )
        val_loader = DataLoader(
            Subset(base_eval, val_idx),
            batch_size=args.batch_size,
            shuffle=False,
            num_workers=args.workers,
        )
        model, head = build_model(args.backbone, num_classes, pretrained=True)
        model.to(device)

    optimizer = torch.optim.Adam(head.parameters(), lr=args.lr)
    criterion = nn.CrossEntropyLoss()

    for epoch in range(args.epochs):
        model.train()
        loss_sum = 0.0
        for images, labels in train_batches if args.dry_run else train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(images), labels)
            loss.backward()
            optimizer.step()
            loss_sum += float(loss.item())

        model.eval()
        correct = total = 0
        with torch.no_grad():
            for images, labels in val_batches if args.dry_run else val_loader:
                images, labels = images.to(device), labels.to(device)
                predictions = model(images).argmax(dim=1)
                correct += int((predictions == labels).sum().item())
                total += int(labels.numel())
        accuracy = correct / total if total else 0.0
        print(f"epoch {epoch + 1}/{args.epochs}  loss={loss_sum:.4f}  val_acc={accuracy:.3f}")

    args.out.mkdir(parents=True, exist_ok=True)
    torch.save(model, args.out / "model.pt")
    (args.out / "classes.json").write_text(
        json.dumps(classes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"modelo: {args.out / 'model.pt'}")
    print(f"clases: {args.out / 'classes.json'}  ({num_classes})")


def main() -> None:
    run(parse_args())


if __name__ == "__main__":
    main()
