#!/usr/bin/env python3
"""Experimento del modulo de deteccion (SPEC 18): techo del teacher CLIP zero-shot.

Mide, sobre los 507 platos de Nutrition5k ya cacheados, si un clasificador
ALINEADO AL CATALOGO (CLIP ViT-B/32 zero-shot, banco de textos del catalogo)
resuelve el cuello de botella real del producto: la COBERTURA (que el modelo
hable el idioma del catalogo), no la precision.

No entrena nada: usa los embeddings de imagen ya cacheados en
training/out/clip_teacher.npz (image_emb 507x512 + class_bank 155x512). Por
construccion NO hay fuga: CLIP no se entreno sobre estas imagenes.

Metricas replicadas de eval/metrics.ts (MAE carb, %MAE, MAE masa, cobertura),
para comparar con el baseline publicado (SPEC 11): MAE 15.19 g / cobertura 34.1 %.

Uso:
  tools/shortlist/.venv/bin/python training/eval_clip.py \
      --teacher training/out/clip_teacher.npz \
      --meta eval/cache/metadata --images eval/cache/images
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np

from eval_identify import ING2CAT, parse_meta  # mapeo ingrediente->catalogo y GT (doc. compartida)

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src/catalog/catalog.ts"


def parse_catalog(path: Path) -> dict[str, dict]:
    """id -> {carbs, grams} desde el literal `foods: [` de catalog.ts."""
    text = path.read_text(encoding="utf-8")
    start = text.index("foods: [")
    seg = text[start:]
    seg = seg[: seg.rindex("]")]
    offsets = [m.start() for m in re.finditer(r'id:\s*"', seg)]
    out: dict[str, dict] = {}
    for i, off in enumerate(offsets):
        chunk = seg[off : offsets[i + 1] if i + 1 < len(offsets) else len(seg)]
        cid = re.search(r'id:\s*"([^"]+)"', chunk).group(1)
        carbs = re.search(r"carbsPer100g:\s*([0-9.]+)", chunk)
        grams = re.search(r"defaultPortionGrams:\s*([0-9.]+)", chunk)
        out[cid] = {
            "carbs": float(carbs.group(1)) if carbs else 0.0,
            "grams": float(grams.group(1)) if grams else 0.0,
        }
    return out


def parse_metadata(path: Path) -> dict[str, dict]:
    """NPK5k: dish_id, total_cal, total_mass, total_fat, total_carb, total_protein, ..."""
    out: dict[str, dict] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.startswith("dish_"):
            continue
        f = raw.split(",")
        if len(f) < 5:
            continue
        try:
            out[f[0]] = {"mass": float(f[2]), "carb": float(f[4])}
        except ValueError:
            continue
    return out


def bootstrap_ci(values: list[float], iterations: int = 1000) -> tuple[float, float]:
    n = len(values)
    if n == 0:
        return (0.0, 0.0)
    seed = 123456789
    rng = np.random.default_rng(abs(seed) % (2**32))
    arr = np.asarray(values, dtype=np.float64)
    means = arr[rng.integers(0, n, size=(iterations, n))].mean(axis=1)
    means.sort()
    return (float(means[int(0.025 * iterations)]), float(means[int(0.975 * iterations)]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", type=Path, default=ROOT / "training/out/clip_teacher.npz")
    ap.add_argument("--meta", type=Path, default=ROOT / "eval/cache/metadata")
    ap.add_argument("--images", type=Path, default=ROOT / "eval/cache/images")
    ap.add_argument("--out", type=Path, default=ROOT / "training/out/teacher_eval.report.json")
    ap.add_argument("--tag", default="clip-vit-b32-zeroshot")
    args = ap.parse_args()

    catalog = parse_catalog(CATALOG)
    meta = {}
    for name in ("cafe1.csv", "cafe2.csv"):
        meta.update(parse_metadata(args.meta / name))

    data = np.load(args.teacher, allow_pickle=False)
    emb = data["image_emb"].astype(np.float32)
    bank = data["class_bank"].astype(np.float32)
    class_order = [str(c) for c in data["class_order"]]
    unknown_idx = class_order.index("__unknown__") if "__unknown__" in class_order else -1
    n_catalog = len(class_order) - (1 if unknown_idx >= 0 else 0)

    paths = [Path(str(p)) for p in data["paths"]]
    # similitud coseno (embeddings ya normalizados) -> logits por clase.
    logits = emb @ bank.T  # (N, 155)

    gt_ids, _totals = parse_meta(args.meta)
    rows = []
    hit1 = hit3 = mapped = 0
    for i, p in enumerate(paths):
        dish_id = p.stem
        if dish_id not in meta:
            continue
        gt = meta[dish_id]
        row_logits = logits[i]
        idx_all = int(np.argmax(row_logits))
        resolved = idx_all != unknown_idx
        # top-1 restringido al catalogo (siempre resuelve) para ver el techo de cobertura.
        idx_cat = int(np.argmax(row_logits[:n_catalog]))
        cid = class_order[idx_cat]
        top3 = np.argsort(-row_logits[:n_catalog])[:3]
        ids3 = [class_order[j] for j in top3]
        truth = gt_ids.get(dish_id, set())
        if truth:
            mapped += 1
            if cid in truth:
                hit1 += 1
            if any(c in truth for c in ids3):
                hit3 += 1
        food = catalog.get(cid, {"carbs": 0.0, "grams": 0.0})
        carb = food["grams"] * food["carbs"] / 100.0
        rows.append(
            {
                "id": dish_id,
                "trueCarb": gt["carb"],
                "trueMass": gt["mass"],
                "predCarb": carb,
                "predMass": food["grams"],
                "resolved": bool(resolved),
                "top1_cat": cid,
            }
        )

    n = len(rows)
    errors = [abs(r["predCarb"] - r["trueCarb"]) for r in rows]
    mae = sum(errors) / n
    mean_true = sum(r["trueCarb"] for r in rows) / n
    mae_mass = sum(abs(r["predMass"] - r["trueMass"]) for r in rows) / n
    coverage = sum(1 for r in rows if r["resolved"]) / n
    lo, hi = bootstrap_ci(errors)
    report = {
        "tag": args.tag,
        "benchmark": "nutrition5k",
        "split": "rgb_test_ids",
        "dishes": n,
        "config": "teacher CLIP zero-shot, imagen completa, top-1 sobre el catalogo (1 item/plato)",
        "maeCarb": mae,
        "maeCarbPct": mae / mean_true if mean_true else 0.0,
        "maeMass": mae_mass,
        "coverage": coverage,
        "ciLow": lo,
        "ciHigh": hi,
        "dishes_with_gt": mapped,
        "dish_recall_top1": hit1 / mapped if mapped else 0.0,
        "dish_recall_top3": hit3 / mapped if mapped else 0.0,
        "comparison": "baseline publicado (MobileNetV3 ImageNet): MAE 15.19 g / cobertura 34.1%",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\ninforme: {args.out}")


if __name__ == "__main__":
    main()
