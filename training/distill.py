#!/usr/bin/env python3
"""Knowledge distillation: Swin Food-101 int8 (teacher) -> MobileNetV3-Large (student).

Teacher logits are forwarded once over every image (eval/cache/images/*.png) and
cached; the frozen-backbone student head is then trained with KD + hard pseudo-labels.
Produces training/out/student_distill.onnx (+ int8 + manifest) and a report.

Run with the shortlist venv (torch/onnxruntime live there):
  tools/shortlist/.venv/bin/python training/distill.py --stage all --out training/out
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import random
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TEACHER = ROOT / "eval/cache/models/swin_food101_int8.onnx"
DEFAULT_IMAGES = ROOT / "eval/cache/images"
CLASSES = 101
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Distila Swin Food-101 int8 a MobileNetV3-Large.")
    parser.add_argument("--stage", choices=["all", "teacher", "train", "export", "validate"], default="all")
    parser.add_argument("--smoke", action="store_true", help="Corrida rapida (pocas imagenes, 1 epoch).")
    parser.add_argument("--teacher-onnx", type=Path, default=DEFAULT_TEACHER)
    parser.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    parser.add_argument("--out", type=Path, default=ROOT / "training/out")
    parser.add_argument("--teacher-logits", type=Path, default=None)
    parser.add_argument("--onnx", type=Path, default=None, help="ONNX a validar (stage validate).")
    parser.add_argument("--max-images", type=int, default=507)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--teacher-batch-size", type=int, default=8)
    parser.add_argument("--T", type=float, default=4.0)
    parser.add_argument("--alpha", type=float, default=0.3)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--val-frac", type=float, default=0.2)
    parser.add_argument("--train-backbone", action="store_true")
    parser.add_argument("--teacher-classes", type=int, default=CLASSES)
    parser.add_argument("--version", default="distill-food101-swin-v1")
    parser.add_argument("--url", default="")
    parser.add_argument("--no-quantize", action="store_true")
    return parser.parse_args()


def make_transform():
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )


def load_image(path: Path, transform):
    from PIL import Image

    return transform(Image.open(path).convert("RGB"))


def list_images(images_dir: Path, max_images: int, seed: int) -> list[Path]:
    paths = sorted(p for p in images_dir.glob("*.png"))
    if not paths:
        raise SystemExit(f"sin imagenes en {images_dir}")
    rng = random.Random(seed)
    rng.shuffle(paths)
    return paths[:max_images]


def split_train_val(paths: list[Path], val_frac: float, seed: int):
    rng = random.Random(seed)
    order = list(range(len(paths)))
    rng.shuffle(order)
    n_val = max(1, int(round(len(paths) * val_frac)))
    val = sorted(order[:n_val])
    train = sorted(order[n_val:])
    return train, val


def teacher_logits(paths, teacher_onnx, out_npz, batch_size, teacher_classes, transform, smoke):
    import onnxruntime as ort

    if out_npz.exists():
        data = np.load(out_npz, allow_pickle=False)
        if list(data["paths"]) == [str(p) for p in paths] and data["logits"].shape[0] == len(paths):
            print(f"  teacher logits en cache: {out_npz}")
            return data["logits"].astype(np.float32)

    sess = ort.InferenceSession(str(teacher_onnx), providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    print(f"  teacher: {teacher_onnx.name} in={in_name} out={out_name}")
    logits = np.zeros((len(paths), teacher_classes), dtype=np.float32)
    t0 = time.time()
    for start in range(0, len(paths), batch_size):
        batch = paths[start : start + batch_size]
        x = np.stack([np.asarray(load_image(p, transform)) for p in batch])
        logits[start : start + len(batch)] = sess.run([out_name], {in_name: x})[0]
        if smoke:
            print(f"    teacher batch {start + len(batch)}/{len(paths)} ({time.time() - t0:.1f}s)", flush=True)
    print(f"  teacher forward: {len(paths)} imgs en {time.time() - t0:.1f}s")
    out_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_npz, paths=np.array([str(p) for p in paths]), logits=logits)
    return logits


def build_student(train_backbone: bool):
    from torch import nn
    from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

    model = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.DEFAULT)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, CLASSES)
    if not train_backbone:
        for param in model.parameters():
            param.requires_grad = False
        for param in model.classifier.parameters():
            param.requires_grad = True
    return model


def trainable_params(model):
    return [p for p in model.parameters() if p.requires_grad]


def make_loss(args):
    import torch
    import torch.nn.functional as F

    def loss_fn(student_logits, teacher_logits):
        soft_s = F.log_softmax(student_logits / args.T, dim=1)
        soft_t = F.softmax(teacher_logits / args.T, dim=1)
        kd = F.kl_div(soft_s, soft_t, reduction="batchmean") * (args.T ** 2)
        hard = teacher_logits.argmax(dim=1)
        ce = F.cross_entropy(student_logits, hard)
        return kd + args.alpha * ce

    return loss_fn


def embed_paths(model, paths, transform, batch_size, smoke):
    import torch

    model.eval()
    feats = []
    with torch.no_grad():
        for start in range(0, len(paths), batch_size):
            batch = paths[start : start + batch_size]
            x = torch.stack([load_image(p, transform) for p in batch])
            e = model.avgpool(model.features(x)).flatten(1)
            feats.append(e)
    return torch.cat(feats)


def train_head(model, train_idx, val_idx, paths, teacher, args, transform, smoke):
    import torch

    loss_fn = make_loss(args)
    torch.manual_seed(args.seed)

    if not args.train_backbone:
        print("  extrayendo embeddings del backbone congelado (train+val)...")
        embeddings = embed_paths(model, paths, transform, args.batch_size, smoke)
        train_emb = embeddings[train_idx]
        val_emb = embeddings[val_idx]
        train_t = teacher[train_idx]
        val_t = teacher[val_idx]
    else:
        train_emb = val_emb = None
        train_t = teacher[train_idx]
        val_t = teacher[val_idx]

    def forward_emb(emb):
        return model.classifier(emb)

    def evaluate(val_e, val_t):
        model.eval()
        target = torch.as_tensor(np.asarray(val_t)).argmax(dim=1)
        with torch.no_grad():
            logits = forward_emb(val_e)
            agreement = (logits.argmax(dim=1) == target).float().mean().item()
        return agreement

    model.train()
    baseline = evaluate(val_emb, val_t)
    print(f"  baseline (head aleatorio) agreement={baseline:.3f}")

    optimizer = torch.optim.Adam(trainable_params(model), lr=args.lr)
    n_train = len(train_idx)
    steps_per_epoch = math.ceil(n_train / args.batch_size)
    losses = []
    step = 0
    t0 = time.time()

    for epoch in range(args.epochs):
        g = torch.Generator().manual_seed(args.seed + epoch)
        perm = torch.randperm(n_train, generator=g).tolist()
        for start in range(0, n_train, args.batch_size):
            chunk = perm[start : start + args.batch_size]
            if args.train_backbone:
                model.train()
                x = torch.stack([load_image(paths[train_idx[i]], transform) for i in chunk])
                logits = model(x)
                t_logits = torch.from_numpy(teacher[train_idx][chunk])
            else:
                logits = forward_emb(train_emb[chunk])
                t_logits = torch.from_numpy(train_t[chunk])
            optimizer.zero_grad()
            loss = loss_fn(logits, t_logits)
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
            step += 1
            if smoke or step % 10 == 0:
                print(f"    step {step} loss={loss.item():.4f}", flush=True)

    post = evaluate(val_emb, val_t)
    elapsed = time.time() - t0
    print(f"  train: {step} steps en {elapsed:.1f}s  loss {losses[0]:.4f} -> {losses[-1]:.4f}")
    print(f"  post-distill agreement={post:.3f} (baseline {baseline:.3f})")
    return {
        "baseline_agreement": baseline,
        "post_agreement": post,
        "loss_start": losses[0],
        "loss_end": losses[-1],
        "steps": step,
        "steps_per_epoch": steps_per_epoch,
        "train_seconds": elapsed,
        "losses": losses,
    }


def export_student(model, out_dir: Path, args):
    import torch

    out_dir.mkdir(parents=True, exist_ok=True)
    fp32 = out_dir / "student_distill.onnx"
    model.eval()
    dummy = torch.randn(1, 3, 224, 224)
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
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantized = out_dir / "student_distill.int8.onnx"
        quantize_dynamic(str(fp32), str(quantized), weight_type=QuantType.QInt8)
        final = quantized
    entry = {
        "version": args.version,
        "url": args.url,
        "sha256": hashlib.sha256(final.read_bytes()).hexdigest(),
        "bytes": final.stat().st_size,
        "classes": CLASSES,
    }
    manifest = out_dir / "student_distill.manifest.json"
    manifest.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  onnx: {final} ({final.stat().st_size} bytes)")
    print(f"  manifest: {manifest}")
    return final, entry


def validate_onnx(onnx_path, paths, val_idx, teacher, transform, batch_size, out_dir, fp32_path=None):
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inputs = [(i.name, i.shape) for i in sess.get_inputs()]
    outputs = [(o.name, o.shape) for o in sess.get_outputs()]
    print(f"  onnx inputs={inputs} outputs={outputs}")
    in_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name

    def top1(paths_subset):
        preds = []
        for start in range(0, len(paths_subset), batch_size):
            batch = paths_subset[start : start + batch_size]
            x = np.stack([np.asarray(load_image(p, transform)) for p in batch]).astype(np.float32)
            out = sess.run([out_name], {in_name: x})[0]
            preds.append(out.argmax(axis=1))
        return np.concatenate(preds)

    val_paths = [paths[i] for i in val_idx]
    val_t = teacher[val_idx].argmax(axis=1)
    pred = top1(val_paths)
    agreement = float((pred == val_t).mean())
    print(f"  int8 agreement con teacher (val n={len(val_idx)}): {agreement:.3f}")

    result = {
        "onnx": str(onnx_path),
        "bytes": Path(onnx_path).stat().st_size,
        "loads": True,
        "input": inputs[0][0],
        "output_shape": list(outputs[0][1]),
        "agreement": agreement,
        "val_n": len(val_idx),
    }
    if fp32_path is not None and Path(fp32_path).exists():
        fp32_sess = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
        f_in = fp32_sess.get_inputs()[0].name
        f_out = fp32_sess.get_outputs()[0].name
        preds = []
        for start in range(0, len(val_paths), batch_size):
            batch = val_paths[start : start + batch_size]
            x = np.stack([np.asarray(load_image(p, transform)) for p in batch]).astype(np.float32)
            preds.append(fp32_sess.run([f_out], {f_in: x})[0].argmax(axis=1))
        fp32_pred = np.concatenate(preds)
        result["fp32_int8_agreement"] = float((fp32_pred == pred).mean())
        print(f"  fp32-vs-int8 agreement: {result['fp32_int8_agreement']:.3f}")
    return result


def main() -> None:
    args = parse_args()
    if args.smoke:
        args.max_images = min(args.max_images, 32)
        args.epochs = min(args.epochs, 1)
    # Fijar la semilla ANTES de construir cualquier modelo: el split y la
    # inicializacion de la cabeza nueva deben ser reproducibles bit a bit.
    import torch

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    args.out = Path(args.out)
    args.out.mkdir(parents=True, exist_ok=True)
    teacher_npz = Path(args.teacher_logits) if args.teacher_logits else args.out / "teacher_logits.npz"
    onnx_path = Path(args.onnx) if args.onnx else args.out / "student_distill.int8.onnx"
    transform = make_transform()
    paths = list_images(args.images, args.max_images, args.seed)
    train_idx, val_idx = split_train_val(paths, args.val_frac, args.seed)
    print(f"imagenes={len(paths)} train={len(train_idx)} val={len(val_idx)} stage={args.stage}")

    report_path = args.out / "student_distill.report.json"
    report = {}
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            report = {}
    report.update({"stage": args.stage, "smoke": args.smoke, "max_images": len(paths)})

    teacher = None
    if args.stage in ("all", "teacher", "train", "validate"):
        teacher = teacher_logits(
            paths, args.teacher_onnx, teacher_npz, args.teacher_batch_size,
            args.teacher_classes, transform, args.smoke,
        )
        report["teacher"] = {
            "onnx": str(args.teacher_onnx),
            "logits": str(teacher_npz),
            "classes": int(teacher.shape[1]),
            "range_max": float(teacher.max()),
        }
        if args.stage == "teacher":
            (args.out / "student_distill.report.json").write_text(json.dumps(report, indent=2) + "\n")
            return

    if args.stage in ("all", "train"):
        model = build_student(args.train_backbone)
        report["train"] = train_head(model, train_idx, val_idx, paths, teacher, args, transform, args.smoke)
        torch_pt = args.out / "student_distill.pt"
        import torch

        torch.save(model.state_dict(), torch_pt)
        report["student_pt"] = str(torch_pt)

    if args.stage in ("all", "export"):
        import torch

        model = build_student(args.train_backbone)
        pt = args.out / "student_distill.pt"
        if pt.exists():
            model.load_state_dict(torch.load(pt, map_location="cpu"))
        final, entry = export_student(model, args.out, args)
        report["export"] = {"onnx": str(final), "manifest": entry}

    if args.stage in ("all", "validate"):
        fp32 = args.out / "student_distill.onnx"
        report["validate"] = validate_onnx(
            onnx_path, paths, val_idx, teacher, transform, args.batch_size, args.out, fp32,
        )
        if "train" in report:
            report["validate"]["baseline_agreement"] = report["train"]["baseline_agreement"]
            report["validate"]["post_agreement"] = report["train"]["post_agreement"]
            report["validate"]["loss_start"] = report["train"]["loss_start"]
            report["validate"]["loss_end"] = report["train"]["loss_end"]

    report_path = args.out / "student_distill.report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"report: {report_path}")


if __name__ == "__main__":
    main()
