#!/usr/bin/env python3
"""Knowledge distillation: CLIP ViT-B/32 (zero-shot teacher) -> MobileNetV3-Large.

The class bank is the project catalog (src/catalog/catalog.ts) embedded with the
CLIP text tower. CLIP image embeddings over eval/cache/images/*.png are cached and
turned into soft labels (cosine / tau -> softmax); a MobileNetV3-Large head is
trained with KD, exported to ONNX (+ int8 + manifest) and validated.

Run with the shortlist venv (torch / onnxruntime / transformers live there):
  tools/shortlist/.venv/bin/python training/distill_clip.py --stage all --out training/out
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src/catalog/catalog.ts"
DEFAULT_IMAGES = ROOT / "eval/cache/images"
DEFAULT_MODEL_ID = "openai/clip-vit-large-patch14"
UNKNOWN_ID = "__unknown__"
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
UNKNOWN_PROMPTS = [
    "a photo of an empty plate",
    "a table",
    "a plain background",
    "a photo of nothing",
    "a blurry photo",
    "a plate with no food",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Destila un teacher CLIP a MobileNetV3-Large.")
    parser.add_argument("--model", default=DEFAULT_MODEL_ID, help="ID HF del teacher CLIP (default: %(default)s).")
    parser.add_argument(
        "--local-files-only",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Usar solo la cache local de HF (default: True).",
    )
    parser.add_argument("--stage", choices=["all", "teacher", "train", "export", "validate"], default="all")
    parser.add_argument("--smoke", action="store_true", help="Corrida rapida (pocas imagenes, 1 epoch).")
    parser.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    parser.add_argument("--data", type=Path, default=None, help="ImageFolder opcional (carpetas = ids del catalogo).")
    parser.add_argument("--out", type=Path, default=ROOT / "training/out")
    parser.add_argument("--max-images", type=int, default=507)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--teacher-batch-size", type=int, default=16)
    parser.add_argument("--T", type=float, default=4.0)
    parser.add_argument(
        "--tau",
        type=float,
        default=0.01,
        help="Temperatura del teacher: logits = cos / tau. ~1/100 imita la escala de CLIP "
        "(logit_scale~100); valores grandes (p.ej. 0.5) dejan el teacher casi uniforme.",
    )
    parser.add_argument("--alpha", type=float, default=0.5)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--val-frac", type=float, default=0.2)
    parser.add_argument("--train-backbone", action="store_true")
    parser.add_argument("--prompts", choices=["en_es", "en"], default="en_es")
    parser.add_argument("--version", default=None, help="Etiqueta de version del manifest (default: derivado del modelo).")
    parser.add_argument("--url", default="")
    parser.add_argument("--no-quantize", action="store_true")
    parser.add_argument("--onnx", type=Path, default=None, help="ONNX a validar (stage validate).")
    parser.add_argument(
        "--init",
        type=Path,
        default=None,
        help="Checkpoint .pt del student a REINICIALIZAR: se heredan la capa cabeza (classifier.3) "
        "de las clases que ya existian y se anaden las nuevas. Preserva la precision de las clases "
        "antiguas al ampliar el catalogo (extension de cabeza).",
    )
    parser.add_argument(
        "--init-classes",
        type=Path,
        default=None,
        help="JSON con las clases del checkpoint --init (lista, o manifest con classifier.classes).",
    )
    parser.add_argument(
        "--classes-file",
        type=Path,
        default=None,
        help="JSON (lista o manifest) que fija las clases del modelo, un subconjunto del catalogo "
        "(p. ej. las antiguas + los frutos secos nuevos). Por defecto, todas las del catalogo.",
    )
    return parser.parse_args()


# --------------------------------------------------------------------------- #
# 1. Catalog parsing (no TS parser, pure regex over the sliced `foods: [` region)
# --------------------------------------------------------------------------- #
def parse_catalog(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    start = text.index("foods: [")
    seg = text[start:]
    seg = seg[: seg.rindex("]")]
    offsets = [m.start() for m in re.finditer(r'id:\s*"', seg)]
    classes: list[dict] = []
    for i, off in enumerate(offsets):
        chunk = seg[off : offsets[i + 1] if i + 1 < len(offsets) else len(seg)]
        m_id = re.search(r'id:\s*"([^"]+)"', chunk)
        m_name = re.search(
            r'name:\s*\{\s*es:\s*"([^"]*)",\s*en:\s*"([^"]*)"\s*\}', chunk
        )
        m_syn = re.search(r"synonyms:\s*\[([^\]]*)\]", chunk)
        synonyms = re.findall(r'"([^"]*)"', m_syn.group(1)) if m_syn else []
        classes.append(
            {
                "id": m_id.group(1),
                "name_es": m_name.group(1) if m_name else "",
                "name_en": m_name.group(2) if m_name else "",
                "synonyms": [s for s in synonyms if s.strip()],
            }
        )
    return classes


def prompts_for(cls: dict, mode: str) -> list[str]:
    prompts = []
    if cls["name_en"]:
        prompts.append(f"a photo of {cls['name_en']}")
    if mode == "en_es":
        if cls["name_es"]:
            prompts.append(f"a photo of {cls['name_es']}")
        for syn in cls["synonyms"]:
            prompts.append(f"a photo of {syn}")
    if not prompts:
        prompts.append(f"a photo of {cls['id'].replace('_', ' ')}")
    return prompts


# --------------------------------------------------------------------------- #
# CLIP loader
# --------------------------------------------------------------------------- #
def load_clip(model_id: str = DEFAULT_MODEL_ID, local_files_only: bool = True):
    from transformers import CLIPModel, CLIPProcessor

    model = CLIPModel.from_pretrained(model_id, local_files_only=local_files_only)
    processor = CLIPProcessor.from_pretrained(
        model_id, local_files_only=local_files_only, use_fast=False
    )
    model.eval()
    return model, processor


def l2norm(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x, axis=-1, keepdims=True)
    return x / np.clip(n, 1e-12, None)


def build_class_bank(model, processor, classes: list[dict], mode: str) -> np.ndarray:
    import torch

    class_bank = []
    with torch.no_grad():
        for cls in classes:
            prompts = prompts_for(cls, mode)
            inputs = processor(text=prompts, return_tensors="pt", padding=True)
            feats = model.get_text_features(**inputs).cpu().numpy()
            class_bank.append(l2norm(feats).mean(axis=0))
    class_bank = l2norm(np.stack(class_bank).astype(np.float32))
    unk = []
    with torch.no_grad():
        inputs = processor(text=UNKNOWN_PROMPTS, return_tensors="pt", padding=True)
        feats = model.get_text_features(**inputs).cpu().numpy()
    unk = l2norm(l2norm(feats).mean(axis=0, keepdims=True))
    bank = np.concatenate([class_bank, unk.astype(np.float32)], axis=0)
    return bank


def text_bank_cache_key(class_order: list[str], mode: str, model_id: str = DEFAULT_MODEL_ID) -> str:
    h = hashlib.sha256()
    h.update(model_id.encode())
    h.update(mode.encode())
    h.update("\n".join(class_order).encode())
    h.update("\n".join(UNKNOWN_PROMPTS).encode())
    return h.hexdigest()[:16]


def get_class_bank(
    model, processor, classes, mode, out_dir: Path,
    model_id: str = DEFAULT_MODEL_ID, cache_path: Path | None = None,
):
    class_order = [c["id"] for c in classes] + [UNKNOWN_ID]
    key = text_bank_cache_key(class_order, mode, model_id)
    cache = cache_path if cache_path is not None else out_dir / "clip_text_bank.npz"
    if cache.exists():
        data = np.load(cache, allow_pickle=False)
        if (
            str(data["key"]) == key
            and list(data["class_order"]) == class_order
            and str(data["model"]) == model_id
        ):
            print(f"  text bank en cache: {cache}")
            return data["class_bank"].astype(np.float32), class_order
    bank = build_class_bank(model, processor, classes, mode)
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        cache, key=np.array(key), model=np.array(model_id),
        class_order=np.array(class_order), class_bank=bank,
    )
    return bank, class_order


# --------------------------------------------------------------------------- #
# Data
# --------------------------------------------------------------------------- #
def make_transform(augment: bool = False):
    from torchvision import transforms

    tfms = []
    if augment:
        tfms += [transforms.RandomResizedCrop(224), transforms.RandomHorizontalFlip()]
    else:
        tfms += [transforms.Resize(256), transforms.CenterCrop(224)]
    tfms += [transforms.ToTensor(), transforms.Normalize(MEAN, STD)]
    return transforms.Compose(tfms)


def load_image(path, transform):
    from PIL import Image

    return transform(Image.open(path).convert("RGB"))


def list_images(images_dir: Path, max_images: int, seed: int) -> list[Path]:
    paths = sorted(list(images_dir.glob("*.png")) + list(images_dir.glob("*.jpg")))
    if not paths:
        raise SystemExit(f"sin imagenes en {images_dir}")
    rng = random.Random(seed)
    rng.shuffle(paths)
    return paths[:max_images]


def split_train_val(n: int, val_frac: float, seed: int):
    rng = random.Random(seed)
    order = list(range(n))
    rng.shuffle(order)
    n_val = max(1, int(round(n * val_frac)))
    return sorted(order[n_val:]), sorted(order[:n_val])


# --------------------------------------------------------------------------- #
# Teacher: CLIP image embeddings -> soft labels
# --------------------------------------------------------------------------- #
def clip_image_embeddings(
    model, processor, paths, out_npz: Path, batch_size, class_bank, class_order, smoke,
    model_id: str = DEFAULT_MODEL_ID,
):
    import torch

    if out_npz.exists():
        data = np.load(out_npz, allow_pickle=False)
        if (
            list(data["paths"]) == [str(p) for p in paths]
            and data["image_emb"].shape[0] == len(paths)
            and list(data["class_order"]) == class_order
            and str(data.get("model", "")) == model_id
        ):
            print(f"  CLIP image embeddings en cache: {out_npz}")
            return data["image_emb"].astype(np.float32)

    from PIL import Image

    embs = []
    t0 = time.time()
    with torch.no_grad():
        for start in range(0, len(paths), batch_size):
            batch = paths[start : start + batch_size]
            images = [Image.open(p).convert("RGB") for p in batch]
            inputs = processor(images=images, return_tensors="pt")
            feats = model.get_image_features(**inputs).cpu().numpy()
            embs.append(l2norm(feats))
            if smoke:
                print(f"    clip batch {start + len(batch)}/{len(paths)} ({time.time() - t0:.1f}s)", flush=True)
    emb = np.concatenate(embs, axis=0).astype(np.float32)
    print(f"  CLIP image encode: {len(paths)} imgs en {time.time() - t0:.1f}s")
    out_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_npz,
        paths=np.array([str(p) for p in paths]),
        image_emb=emb,
        class_bank=class_bank,
        class_order=np.array(class_order),
        model=np.array(model_id),
    )
    return emb


def make_teacher_probs(image_emb: np.ndarray, class_bank: np.ndarray, tau: float) -> np.ndarray:
    cos = image_emb @ class_bank.T
    logits = cos / max(tau, 1e-6)
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return (exp / exp.sum(axis=1, keepdims=True)).astype(np.float32)


# --------------------------------------------------------------------------- #
# Optional ImageFolder labels
# --------------------------------------------------------------------------- #
def load_labeled(data_dir: Path, class_order: list[str]):
    from PIL import Image

    id_to_idx = {cid: i for i, cid in enumerate(class_order)}
    norm = {re.sub(r"[^a-z0-9]", "", cid.lower()): i for i, cid in enumerate(class_order)}
    items = []
    for folder in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        key = folder.name
        if key in id_to_idx:
            idx = id_to_idx[key]
        elif re.sub(r"[^a-z0-9]", "", key.lower()) in norm:
            idx = norm[re.sub(r"[^a-z0-9]", "", key.lower())]
        else:
            print(f"  WARN: carpeta '{key}' no mapea a id del catalogo, se omite")
            continue
        for img in sorted(list(folder.glob("*.png")) + list(folder.glob("*.jpg"))):
            items.append((img, idx))
    if not items:
        raise SystemExit(f"sin imagenes etiquetadas en {data_dir}")
    return items


# --------------------------------------------------------------------------- #
# Student
# --------------------------------------------------------------------------- #
N_CLASSES = 155


def build_student(n_out: int, train_backbone: bool):
    from torch import nn
    from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

    model = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.DEFAULT)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, n_out)
    if not train_backbone:
        for param in model.parameters():
            param.requires_grad = False
        for param in model.classifier.parameters():
            param.requires_grad = True
    return model


def _load_init_classes(path: Path) -> list[str]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict) and "classifier" in data:
        return data["classifier"]["classes"]
    if isinstance(data, dict) and "classes" in data:
        return data["classes"]
    if isinstance(data, list):
        return data
    raise SystemExit(f"no se pudieron leer las clases de {path}")


def init_student_head(model, init_pt: Path, init_classes: Path, class_order: list[str]) -> int:
    """Hereda la cabeza (`classifier.3`) de un checkpoint previo.

    Las clases que ya existian copian su fila; las nuevas conservan la
    inicializacion aleatoria de `build_student`. Asi ampliar el catalogo no
    reentrena ni degrada las clases antiguas.
    """
    import torch

    sd = torch.load(init_pt, map_location="cpu")
    # Se carga TODO el checkpoint (backbone + classifier.0, que si se entreno)
    # salvo la cabeza final, cuyas dimensiones cambian al ampliar el catalogo.
    body = {
        k: v for k, v in sd.items() if k not in ("classifier.3.weight", "classifier.3.bias")
    }
    model.load_state_dict(body, strict=False)
    old_classes = _load_init_classes(init_classes)
    ow = sd["classifier.3.weight"]
    ob = sd["classifier.3.bias"]
    new_w = model.classifier[3].weight.data
    new_b = model.classifier[3].bias.data
    index = {cid: i for i, cid in enumerate(old_classes)}
    copied = 0
    with torch.no_grad():
        for j, cid in enumerate(class_order):
            i = index.get(cid)
            if i is not None and i < ow.shape[0]:
                new_w[j] = ow[i]
                new_b[j] = ob[i]
                copied += 1
    print(f"  init: {copied}/{len(class_order)} clases heredadas de {Path(init_pt).name}")
    return copied


def trainable_params(model):
    return [p for p in model.parameters() if p.requires_grad]


def embed_backbone(model, paths, transform, batch_size, smoke):
    import torch

    model.eval()
    feats = []
    with torch.no_grad():
        for start in range(0, len(paths), batch_size):
            batch = paths[start : start + batch_size]
            x = torch.stack([load_image(p, transform) for p in batch])
            feats.append(model.avgpool(model.features(x)).flatten(1))
            if smoke and start % (batch_size * 4) == 0:
                print(f"    backbone emb {min(start + batch_size, len(paths))}/{len(paths)}", flush=True)
    return torch.cat(feats)


def train_student(model, paths, train_idx, val_idx, teacher, args, n_out, smoke):
    import torch
    import torch.nn.functional as F

    torch.manual_seed(args.seed)
    transform = make_transform(augment=args.train_backbone)

    if not args.train_backbone:
        print("  extrayendo embeddings del backbone congelado (train+val)...")
        emb = embed_backbone(model, paths, make_transform(False), args.batch_size, smoke)
        train_emb, val_emb = emb[train_idx], emb[val_idx]
    else:
        train_emb = val_emb = None

    train_t = torch.from_numpy(teacher[train_idx])
    val_t = torch.from_numpy(teacher[val_idx])

    def head_logits(emb_or_img, is_emb):
        if is_emb:
            return model.classifier(emb_or_img)
        return model(emb_or_img)

    def evaluate():
        model.eval()
        target = val_t.argmax(dim=1)
        with torch.no_grad():
            if args.train_backbone:
                logits = []
                for start in range(0, len(val_idx), args.batch_size):
                    batch = [paths[val_idx[i]] for i in range(start, min(start + args.batch_size, len(val_idx)))]
                    x = torch.stack([load_image(p, transform) for p in batch])
                    logits.append(model(x))
                logits = torch.cat(logits)
            else:
                logits = model.classifier(val_emb)
            agree = (logits.argmax(dim=1) == target).float().mean().item()
        return agree

    model.train()
    baseline = evaluate()
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
            else:
                logits = model.classifier(train_emb[chunk])
            t_prob = train_t[chunk]
            soft_s = F.log_softmax(logits / args.T, dim=1)
            kd = F.kl_div(soft_s, t_prob, reduction="batchmean") * (args.T ** 2)
            loss = kd
            if args.alpha > 0:
                y = t_prob.argmax(dim=1)
                loss = loss + args.alpha * F.cross_entropy(logits, y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
            step += 1
            if smoke or step % 10 == 0:
                print(f"    step {step} loss={loss.item():.4f}", flush=True)

    post = evaluate()
    elapsed = time.time() - t0
    print(f"  train: {step} steps en {elapsed:.1f}s  loss {losses[0]:.4f} -> {losses[-1]:.4f}")
    print(f"  post-distill agreement={post:.3f} (baseline {baseline:.3f}, chance={1.0 / n_out:.4f})")
    return {
        "baseline_agreement": baseline,
        "post_agreement": post,
        "loss_start": float(losses[0]),
        "loss_end": float(losses[-1]),
        "steps": step,
        "steps_per_epoch": steps_per_epoch,
        "train_seconds": elapsed,
    }


# --------------------------------------------------------------------------- #
# Export / validate
# --------------------------------------------------------------------------- #
def export_student(model, out_dir: Path, args, class_order):
    import torch

    out_dir.mkdir(parents=True, exist_ok=True)
    fp32 = out_dir / "student_catalog.onnx"
    model.eval()
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
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantized = out_dir / "student_catalog.int8.onnx"
        quantize_dynamic(str(fp32), str(quantized), weight_type=QuantType.QInt8)
        final = quantized
    entry = {
        "version": args.version,
        "url": args.url or final.name,
        "sha256": hashlib.sha256(final.read_bytes()).hexdigest(),
        "bytes": final.stat().st_size,
        "classes": class_order,
    }
    manifest = out_dir / "student_catalog.manifest.json"
    manifest.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  onnx: {final} ({final.stat().st_size} bytes)")
    print(f"  manifest: {manifest} classes={len(class_order)}")
    return final, entry


def onnx_predict(sess, paths, transform, batch_size):
    in_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    preds = []
    for start in range(0, len(paths), batch_size):
        batch = paths[start : start + batch_size]
        x = np.stack([np.asarray(load_image(p, transform)) for p in batch]).astype(np.float32)
        preds.append(sess.run([out_name], {in_name: x})[0].argmax(axis=1))
    return np.concatenate(preds)


def validate_onnx(onnx_path, fp32_path, paths, val_idx, teacher, transform, batch_size, class_order):
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inputs = [(i.name, i.shape) for i in sess.get_inputs()]
    outputs = [(o.name, o.shape) for o in sess.get_outputs()]
    print(f"  onnx inputs={inputs} outputs={outputs}")
    val_paths = [paths[i] for i in val_idx]
    val_t = teacher[val_idx].argmax(axis=1)
    pred = onnx_predict(sess, val_paths, transform, batch_size)
    agreement = float((pred == val_t).mean())
    result = {
        "onnx": str(onnx_path),
        "bytes": Path(onnx_path).stat().st_size,
        "loads": True,
        "input_name": inputs[0][0],
        "input_shape": list(inputs[0][1]),
        "output_name": outputs[0][0],
        "output_shape": list(outputs[0][1]),
        "agreement": agreement,
        "val_n": len(val_idx),
    }
    print(f"  onnx agreement con teacher (val n={len(val_idx)}): {agreement:.3f}")
    if fp32_path is not None and Path(fp32_path).exists():
        fs = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
        fpred = onnx_predict(fs, val_paths, transform, batch_size)
        result["fp32_int8_agreement"] = float((fpred == pred).mean())
        print(f"  fp32-vs-int8 agreement: {result['fp32_int8_agreement']:.3f}")
    return result


# --------------------------------------------------------------------------- #
def main() -> None:
    args = parse_args()
    if args.smoke:
        args.max_images = min(args.max_images, 32)
        args.epochs = min(args.epochs, 1)
    import torch

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    args.out = Path(args.out)
    args.out.mkdir(parents=True, exist_ok=True)
    transform = make_transform(False)

    model_id = args.model
    slug = model_id.rstrip("/").split("/")[-1]
    default_model = model_id == DEFAULT_MODEL_ID
    if args.version is None:
        args.version = (
            "distill-clip-vit-b32-v1"
            if default_model
            else f"distill-clip-{slug}-v1"
        )

    classes = parse_catalog(CATALOG)
    print(f"parsed catalog classes: {len(classes)}")
    class_order = [c["id"] for c in classes] + [UNKNOWN_ID]
    if args.classes_file is not None:
        class_order = _load_init_classes(args.classes_file)
        keep = set(class_order)
        classes = [c for c in classes if c["id"] in keep]
        print(f"clases fijadas por --classes-file: {len(class_order)}")
    n_out = len(class_order)

    labeled = bool(args.data)
    if not labeled:
        args.alpha = 0.0

    text_cache = args.out / ("clip_text_bank.npz" if default_model else f"clip_text_bank_{slug}.npz")
    teacher_npz = args.out / ("clip_teacher.npz" if default_model else f"clip_teacher_{slug}.npz")
    onnx_path = Path(args.onnx) if args.onnx else args.out / "student_catalog.int8.onnx"

    report_path = args.out / "student_catalog.report.json"
    report: dict = {}
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            report = {}
    report.update(
        {
            "stage": args.stage,
            "smoke": args.smoke,
            "classes": n_out,
            "catalog_classes": len(classes),
            "unknown_id": UNKNOWN_ID,
            "model": model_id,
            "prompts": args.prompts,
            "tau": args.tau,
            "T": args.T,
            "alpha": args.alpha,
        }
    )

    model_clip = processor = None
    class_bank = None

    if args.stage in ("all", "teacher", "train", "validate"):
        model_clip, processor = load_clip(model_id, args.local_files_only)
        class_bank, class_order = get_class_bank(
            model_clip, processor, classes, args.prompts, args.out, model_id, text_cache,
        )
        n_out = len(class_order)

    if labeled:
        items = load_labeled(Path(args.data), class_order)
        paths = [p for p, _ in items]
        labels = np.array([y for _, y in items], dtype=np.int64)
        train_idx, val_idx = split_train_val(len(paths), args.val_frac, args.seed)
        print(f"labeled={len(paths)} train={len(train_idx)} val={len(val_idx)}")
    else:
        paths = list_images(args.images, args.max_images, args.seed)
        labels = None
        train_idx, val_idx = split_train_val(len(paths), args.val_frac, args.seed)
        print(f"imagenes={len(paths)} train={len(train_idx)} val={len(val_idx)} stage={args.stage}")

    teacher = None
    if args.stage in ("all", "teacher", "train", "validate"):
        emb = clip_image_embeddings(
            model_clip, processor, paths, teacher_npz, args.teacher_batch_size,
            class_bank, class_order, args.smoke, model_id,
        )
        teacher = make_teacher_probs(emb, class_bank, args.tau)
        report["teacher"] = {
            "cache": str(teacher_npz),
            "classes": int(teacher.shape[1]),
            "mean_max_prob": float(teacher.max(axis=1).mean()),
            "unknown_mass": float(teacher[:, -1].mean()),
        }
        if args.stage == "teacher":
            report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            print(f"report: {report_path}")
            return

    if args.stage in ("all", "train"):
        model = build_student(n_out, args.train_backbone)
        if args.init is not None:
            if args.init_classes is None:
                raise SystemExit("--init necesita --init-classes")
            init_student_head(model, args.init, args.init_classes, class_order)
        report["train"] = train_student(model, paths, train_idx, val_idx, teacher, args, n_out, args.smoke)
        pt = args.out / "student_catalog.pt"
        torch.save(model.state_dict(), pt)
        report["student_pt"] = str(pt)

        if labeled:
            val_t = teacher[val_idx].argmax(axis=1)
            val_pred = None
            model.eval()
            if args.train_backbone:
                preds = []
                for start in range(0, len(val_idx), args.batch_size):
                    batch = [paths[val_idx[i]] for i in range(start, min(start + args.batch_size, len(val_idx)))]
                    x = torch.stack([load_image(p, transform) for p in batch])
                    with torch.no_grad():
                        preds.append(model(x).argmax(dim=1))
                val_pred = torch.cat(preds).numpy()
            else:
                # recompute embeddings for accuracy
                emb = embed_backbone(model, paths, transform, args.batch_size, args.smoke)
                with torch.no_grad():
                    val_pred = model.classifier(emb[val_idx]).argmax(dim=1).numpy()
            acc = float((val_pred == labels[val_idx]).mean())
            report["train"]["val_hard_accuracy"] = acc
            print(f"  val hard accuracy (folder labels): {acc:.3f}")

    if args.stage in ("all", "export"):
        model = build_student(n_out, args.train_backbone)
        pt = args.out / "student_catalog.pt"
        if pt.exists():
            model.load_state_dict(torch.load(pt, map_location="cpu"))
        final, entry = export_student(model, args.out, args, class_order)
        report["export"] = {"onnx": str(final), "manifest": entry}

    if args.stage in ("all", "validate"):
        fp32 = args.out / "student_catalog.onnx"
        report["validate"] = validate_onnx(
            onnx_path, fp32, paths, val_idx, teacher, transform, args.batch_size, class_order,
        )
        if "train" in report:
            report["validate"]["baseline_agreement"] = report["train"]["baseline_agreement"]
            report["validate"]["post_agreement"] = report["train"]["post_agreement"]
            report["validate"]["loss_start"] = report["train"]["loss_start"]
            report["validate"]["loss_end"] = report["train"]["loss_end"]

    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"report: {report_path}")


if __name__ == "__main__":
    main()
