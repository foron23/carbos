#!/usr/bin/env python3
"""Etiqueta imagenes con CLIP zero-shot y propone la clase carpeta como hipotesis.

Requisitos: venv de tools/shortlist (torch CPU + transformers; modelo
openai/clip-vit-base-patch32 ya cacheado). NO importa `datasets`.

Entrada por defecto: data/images (una carpeta por id de catalogo).
Salidas en data/labels: review.jsonl, review.queue.jsonl, prompts.json, summary.json
y opcionalmente confirmed.template.jsonl.

La coincidencia top1 == nombre-de-carpeta es SOLO una propuesta; la cola
(review.queue.jsonl) es la autoritativa y requiere confirmacion humana.

Uso:
  tools/shortlist/.venv/bin/python tools/data/review_labels.py --classes pan_blanco,tomate --limit 4
  tools/shortlist/.venv/bin/python tools/data/review_labels.py --synonyms --topk 5
  tools/shortlist/.venv/bin/python tools/data/review_labels.py --flat
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from fetch_images import load_foods

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "src/catalog/catalog.ts"
DEFAULT_IMAGES = ROOT / "data/images"
DEFAULT_OUT = ROOT / "data/labels"
DEFAULT_MODEL = "openai/clip-vit-large-patch14"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


# --------------------------------------------------------------------------
# Catalogo: parser compartido con fetch_images.py (evita que las dos copias
# se desincronicen). Ver load_foods en tools/data/fetch_images.py.
# --------------------------------------------------------------------------


def build_prompts(food: dict, template: str, synonyms: bool) -> list[str]:
    base = food.get("en") or food.get("es") or food["id"]
    prompts = [template.format(base)]
    if synonyms:
        for syn in food.get("synonyms") or []:
            if syn and syn != base:
                prompts.append(template.format(syn))
    return prompts


def collect_images(folder: Path, limit: int) -> list[Path]:
    imgs = sorted(
        (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES),
        key=lambda p: p.name,
    )
    if limit and limit > 0:
        imgs = imgs[:limit]
    return imgs


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Etiquetado CLIP zero-shot con cola de revision humana.")
    p.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--classes", default="")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--topk", type=int, default=5)
    p.add_argument("--prompt-template", default="a photo of {}")
    p.add_argument("--synonyms", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--device", default="cpu")
    p.add_argument("--confirmed-template", action="store_true")
    p.add_argument("--flat", action="store_true")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if not args.images.exists():
        print(f"error: directorio de imagenes no encontrado: {args.images}", file=sys.stderr)
        return 2

    foods = load_foods(args.catalog) if args.catalog.exists() else []
    by_id = {f["id"]: f for f in foods}

    if args.flat:
        folder = args.images
        img_map: list[tuple[Path, str | None]] = [
            (p, None) for p in collect_images(folder, args.limit)
        ]
    else:
        if args.classes:
            ids = [c.strip() for c in args.classes.split(",") if c.strip()]
        else:
            ids = sorted(
                d.name for d in args.images.iterdir() if d.is_dir()
            )
        img_map = []
        present = []
        for cid in ids:
            class_dir = args.images / cid
            if not class_dir.is_dir():
                print(f"AVISO: carpeta ausente para '{cid}'", file=sys.stderr)
                continue
            imgs = collect_images(class_dir, args.limit)
            if not imgs:
                print(f"AVISO: sin imagenes para '{cid}'", file=sys.stderr)
                continue
            present.append(cid)
            img_map.extend((p, cid) for p in imgs)
        ids = present

    if not img_map:
        print("error: no hay imagenes para etiquetar", file=sys.stderr)
        return 2

    # Clases a considerar en el clasificador: folderClass cuando existe; si no,
    # todas las clases del catalogo (modo flat).
    if args.flat:
        class_ids = [f["id"] for f in foods] or [p.parent.name for p, _ in img_map]
    else:
        class_ids = list(dict.fromkeys(cid for _, cid in img_map if cid))

    prompt_map: dict[str, list[str]] = {}
    for cid in class_ids:
        food = by_id.get(cid)
        if food is None:
            food = {"id": cid, "en": cid, "es": cid, "synonyms": []}
        prompt_map[cid] = build_prompts(food, args.prompt_template, args.synonyms)

    # ------------------------------------------------------------------
    # Inferencia
    # ------------------------------------------------------------------
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor

    device = torch.device(args.device)
    processor = CLIPProcessor.from_pretrained(args.model)
    model = CLIPModel.from_pretrained(args.model).to(device).eval()

    with torch.no_grad():
        text_embs = []
        for cid in class_ids:
            inputs = processor(text=prompt_map[cid], return_tensors="pt", padding=True).to(device)
            feats = model.get_text_features(**inputs)
            feats = feats / feats.norm(dim=-1, keepdim=True)
            emb = feats.mean(dim=0)
            emb = emb / emb.norm()
            text_embs.append(emb)
        text = torch.stack(text_embs)  # [C, D]

    args.out.mkdir(parents=True, exist_ok=True)
    review_rows = []
    queue_rows = []
    confirm_rows = []
    per_class: dict[str, dict] = {cid: {"total": 0, "agree": 0} for cid in class_ids}

    for start in range(0, len(img_map), args.batch_size):
        batch = img_map[start:start + args.batch_size]
        pil = [Image.open(p).convert("RGB") for p, _ in batch]
        inputs = processor(images=pil, return_tensors="pt").to(device)
        with torch.no_grad():
            feats = model.get_image_features(**inputs)
            feats = feats / feats.norm(dim=-1, keepdim=True)
            probs = (100.0 * feats @ text.T).softmax(dim=-1)

        k = min(args.topk, len(class_ids))
        vals, idx = probs.topk(k, dim=-1)
        for row_i, (path, folder_class) in enumerate(batch):
            probs_row = vals[row_i].tolist()
            idx_row = idx[row_i].tolist()
            topk = [
                {"id": class_ids[j], "p": round(probs_row[n], 6)}
                for n, j in enumerate(idx_row)
            ]
            top1 = topk[0]["id"] if topk else None
            agree = folder_class is not None and top1 == folder_class
            margin = round(probs_row[0] - probs_row[1], 6) if len(probs_row) > 1 else 0.0
            rel = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()
            row = {
                "path": rel,
                "folderClass": folder_class,
                "topk": topk,
                "agree": agree,
                "margin": margin,
            }
            review_rows.append(row)
            if args.flat:
                per_class.setdefault(folder_class or "__flat__", {"total": 0, "agree": 0})
                per_class[folder_class or "__flat__"]["total"] += 1
            elif folder_class in per_class:
                per_class[folder_class]["total"] += 1
                per_class[folder_class]["agree"] += 1 if agree else 0

            needs_review = (not agree) or (folder_class is None)
            if needs_review:
                queue_rows.append(row)
            if args.confirmed_template:
                confirm_rows.append(
                    {
                        "path": rel,
                        "folderClass": folder_class,
                        "label": None,
                        "topk": topk,
                        "agree": agree,
                    }
                )

    def write_jsonl(path: Path, rows: list[dict]) -> None:
        with path.open("w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    write_jsonl(args.out / "review.jsonl", review_rows)
    write_jsonl(args.out / "review.queue.jsonl", queue_rows)
    (args.out / "prompts.json").write_text(
        json.dumps(prompt_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    if args.confirmed_template:
        write_jsonl(args.out / "confirmed.template.jsonl", confirm_rows)

    labeled = [r for r in review_rows if r["folderClass"] is not None]
    agreed = sum(1 for r in labeled if r["agree"])
    revision = getattr(model.config, "_commit_hash", None) or "unknown"
    summary = {
        "model": args.model,
        "revision": revision,
        "device": args.device,
        "images": len(review_rows),
        "labeled": len(labeled),
        "agreementRate": round(agreed / len(labeled), 6) if labeled else None,
        "flaggedForReview": len(queue_rows),
        "perClass": per_class,
        "promptTemplate": args.prompt_template,
        "synonyms": bool(args.synonyms),
        "flat": bool(args.flat),
    }
    (args.out / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(
        f"OK {len(review_rows)} imagenes | etiquetadas={len(labeled)} "
        f"acuerdo={summary['agreementRate']} cola={len(queue_rows)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
