#!/usr/bin/env python3
"""Experimento de identificacion (SPEC 18): mide por CAJA, no solo el MAE.

El banco (`make eval`) reporta MAE de carbohidratos, que mezcla tres cosas:
cobertura, acierto de la clase y porciones. Este script añade la metrica que
el usuario percibe —"¿la app propone un alimento que ESTA en el plato?"— usando
los ingredientes reales de Nutrition5k como referencia.

Replica el pipeline on-device: detector YOLO11n (640) -> recorte +10% ->
clasificador (224) -> top-3 -> resolucion al catalogo (mapa D31 + identidad).

Metricas:
  - MAE carb / %MAE / MAE masa / cobertura (comparables con SPEC 11).
  - identificacion: precision por caja (top-1 en el plato), recall de plato
    (algun top-1 en el plato), top-3 por caja y por plato.

Uso:
  tools/shortlist/.venv/bin/python training/eval_identify.py \
      --classifier weights/classifier.int8.onnx \
      --classes-from public/model-manifest.json --tag imagenet --limit 0
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
PAD = 114.0

# ingrediente Nutrition5k -> id de catalogo (subconjunto claro y sin ambiguedad)
ING2CAT = {
    "olive oil": "aceite_oliva", "garlic": "ajo", "onions": "cebolla", "green onions": "cebolla",
    "shallots": "cebolla", "lemon juice": "limon", "lime": "limon", "broccoli": "brocoli",
    "carrot": "zanahoria", "cherry tomatoes": "tomate_cherry", "spinach (raw)": "espinacas",
    "spinach (cooked)": "espinacas", "cucumbers": "pepino", "cucumber": "pepino",
    "chicken": "pollo_pechuga", "mixed greens": "lechuga", "lettuce": "lechuga",
    "caesar salad": "lechuga", "cauliflower": "coliflor", "scrambled eggs": "huevo",
    "egg whites": "huevo", "egg": "huevo", "white rice": "arroz_blanco", "brown rice": "arroz_integral",
    "bell peppers": "pimiento_rojo", "olives": "aceitunas", "cheese pizza": "pizza",
    "pineapple": "pina", "apple": "manzana", "chard": "acelgas", "bok choy": "repollo",
    "tomatoes": "tomate", "sweet potato": "boniato", "mushroom": "champinon", "mushrooms": "champinon",
    "beef": "ternera", "squash": "calabaza", "cantaloupe": "melon", "roasted potatoes": "patata_cocida",
    "potatoes": "patata_cocida", "pork": "cerdo", "sausage": "chorizo", "almonds": "almendras",
    "blueberries": "arandano", "green beans": "judia_verde", "quinoa": "quinoa", "tofu": "soja",
    "zucchini": "calabacin", "grapes": "uva", "corn on the cob": "maiz_dulce", "salmon": "salmon",
    "banana": "platano", "avocado": "aguacate", "peas": "guisantes", "chickpeas": "garbanzos",
    "lentils": "lentejas", "yogurt": "yogur_natural", "milk": "leche_entera", "butter": "mantequilla",
    "shrimp": "gambas", "tuna": "atun", "mango": "mango", "peach": "melocoton", "strawberry": "fresa",
    "watermelon": "sandia", "orange": "naranja", "kale": "repollo", "brussels sprouts": "repollo",
    "jalapenos": "pimiento_verde", "chili": "pimiento_rojo", "pasta": "pasta_cocida",
    "spaghetti": "pasta_cocida", "bread": "pan_blanco", "rice": "arroz_blanco",
    "cheddar cheese": "queso_curado", "cheese": "queso_curado", "feta cheese": "queso_fresco",
    "bacon": "cerdo", "ham": "jamon_cocido", "turkey": "pavo", "sweet corn": "maiz_dulce",
    "green pepper": "pimiento_verde", "red pepper": "pimiento_rojo", "onion": "cebolla",
    "potato": "patata_cocida",
}


def parse_catalog(path: Path) -> dict[str, dict]:
    text = path.read_text(encoding="utf-8")
    seg = text[text.index("foods: ["):]
    seg = seg[: seg.rindex("]")]
    offsets = [m.start() for m in re.finditer(r'id:\s*"', seg)]
    out = {}
    for i, off in enumerate(offsets):
        ch = seg[off : offsets[i + 1] if i + 1 < len(offsets) else len(seg)]
        cid = re.search(r'id:\s*"([^"]+)"', ch).group(1)
        carbs = re.search(r"carbsPer100g:\s*([0-9.]+)", ch)
        grams = re.search(r"defaultPortionGrams:\s*([0-9.]+)", ch)
        out[cid] = {"carbs": float(carbs.group(1)) if carbs else 0.0,
                    "grams": float(grams.group(1)) if grams else 0.0}
    return out


def parse_classmap(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    seg = text[text.index("DEFAULT_CLASSMAP"):]
    seg = seg[seg.index("{"): seg.index("};") + 1]
    return {m.group(1): m.group(2) for m in re.finditer(r"([a-zA-Z0-9_]+):\s*'([^']+)'", seg)}


def normalize_label(label: str) -> str:
    return re.sub(r"[\s-]+", "_", label.strip().lower())


def parse_meta(dirpath: Path):
    gt_ids, totals = {}, {}
    for name in ("cafe1.csv", "cafe2.csv"):
        for raw in (dirpath / name).read_text(encoding="utf-8").splitlines():
            if not raw.startswith("dish_"):
                continue
            f = raw.split(",")
            totals[f[0]] = {"mass": float(f[2]), "carb": float(f[4])}
            s, i = set(), 6
            while i + 1 < len(f):
                nm = f[i + 1].strip().lower()
                try:
                    g = float(f[i + 2])
                except ValueError:
                    g = 0
                if nm in ING2CAT and g > 5:
                    s.add(ING2CAT[nm])
                i += 7
            gt_ids[f[0]] = s
    return gt_ids, totals


def letterbox(img: Image.Image, size: int = 640):
    w, h = img.size
    scale = min(size / w, size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    canvas = Image.new("RGB", (size, size), (int(PAD),) * 3)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    canvas.paste(img.resize((nw, nh), Image.BILINEAR), (ox, oy))
    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    return np.transpose(arr, (2, 0, 1))[None], scale, ox, oy


def nchw_imagenet(img: Image.Image):
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return np.transpose(arr, (2, 0, 1))[None].astype(np.float32)


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return 0 if union <= 0 else inter / union


def detect(sess, img, score_t=0.25, iou_t=0.45, max_det=12):
    tensor, scale, ox, oy = letterbox(img)
    out = sess.run(None, {sess.get_inputs()[0].name: tensor})[0][0]  # (84, anchors)
    ch, anchors = out.shape
    num_classes = ch - 4
    scores = out[4:, :]
    best = scores.max(0)
    classes = scores.argmax(0)
    idx = np.where(best >= score_t)[0]
    cx, cy, w, h = out[0, idx], out[1, idx], out[2, idx], out[3, idx]
    boxes = np.stack([cx - w / 2, cy - h / 2, w, h], axis=1)
    order = np.argsort(-best[idx])
    kept = []
    for k in order:
        b = boxes[k]
        if w[k] <= 0 or h[k] <= 0:
            continue
        if all(iou(b, boxes[j]) <= iou_t for j in kept):
            kept.append(k)
        if len(kept) >= max_det:
            break
    out_boxes = []
    for k in kept:
        bx = (boxes[k][0] - ox) / scale
        by = (boxes[k][1] - oy) / scale
        bw = boxes[k][2] / scale
        bh = boxes[k][3] / scale
        out_boxes.append((bx, by, bw, bh, int(classes[idx[k]]), float(best[idx[k]])))
    return out_boxes


def resolve(label, classmap, catalog):
    n = normalize_label(label)
    cid = classmap.get(label) or classmap.get(n)
    if cid and cid in catalog:
        return cid
    if label in catalog:
        return label
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detector", type=Path, default=ROOT / "weights/detector.onnx")
    ap.add_argument("--classifier", type=Path, required=True)
    ap.add_argument("--classes-from", type=Path, required=True)
    ap.add_argument("--images", type=Path, default=ROOT / "eval/cache/images")
    ap.add_argument("--meta", type=Path, default=ROOT / "eval/cache/metadata")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument(
        "--oracle",
        choices=["detector", "full", "center"],
        default="detector",
        help="Localizacion: detector COCO (real), 'full' (caja = imagen completa, sin detector) "
        "o 'center' (recorte central 0.7). full/center aislan el clasificador del detector.",
    )
    ap.add_argument("--tag", required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    catalog = parse_catalog(ROOT / "src/catalog/catalog.ts")
    classmap = parse_classmap(ROOT / "src/catalog/classmap.ts")
    gt_ids, totals = parse_meta(args.meta)
    classes = json.loads(args.classes_from.read_text(encoding="utf-8"))["classifier"]["classes"]

    det = ort.InferenceSession(str(args.detector), providers=["CPUExecutionProvider"])
    clf = ort.InferenceSession(str(args.classifier), providers=["CPUExecutionProvider"])
    clf_in = clf.get_inputs()[0].name

    paths = sorted(args.images.glob("*.png"))
    if args.limit > 0:
        paths = paths[: args.limit]

    boxes_total = boxes_resolved = 0
    box_hit1 = box_hit3 = 0
    dish_hit1 = dish_hit3 = 0
    mae = mae_dedupe = mae_single = mae_area = 0.0
    mae_m = 0.0
    mean_true = 0.0
    n = 0
    for p in paths:
        did = p.stem
        gt = gt_ids.get(did, set())
        tot = totals.get(did)
        if not tot:
            continue
        img = Image.open(p).convert("RGB")
        if args.oracle == "full":
            dets = [(0.0, 0.0, float(img.width), float(img.height), -1, 1.0)]
        elif args.oracle == "center":
            s = 0.7
            w, h = img.width * s, img.height * s
            dets = [((img.width - w) / 2, (img.height - h) / 2, w, h, -1, 1.0)]
        else:
            dets = detect(det, img)
        items: list[dict] = []  # detecciones resueltas: {cid, score, area}
        top1_ids: list[str | None] = []
        top3_ids: list[str | None] = []
        for (bx, by, bw, bh, dcls, dscore) in dets:
            boxes_total += 1
            mx, my = bw * 0.1, bh * 0.1
            x0, y0 = max(0, bx - mx), max(0, by - my)
            x1, y1 = min(img.width, bx + bw + mx), min(img.height, by + bh + my)
            if x1 <= x0 or y1 <= y0:
                continue
            crop = img.crop((x0, y0, x1, y1)).resize((224, 224), Image.BILINEAR)
            logits = clf.run(None, {clf_in: nchw_imagenet(crop)})[0][0]
            top3 = np.argsort(-logits)[:3]
            ids = [resolve(classes[i], classmap, catalog) for i in top3]
            t1 = ids[0]
            top1_ids.append(t1)
            top3_ids.extend(ids)
            if t1:
                boxes_resolved += 1
                items.append(
                    {
                        "cid": t1,
                        "score": float(logits[top3[0]]),
                        "area": max(0.0, (bw / img.width) * (bh / img.height)),
                    }
                )
            if gt:
                if t1 in gt:
                    box_hit1 += 1
                if any(c in gt for c in ids if c):
                    box_hit3 += 1
        n += 1
        true_carb, true_mass = tot["carb"], tot["mass"]

        def carb_of(sel):
            return sum(catalog[c["cid"]]["grams"] * catalog[c["cid"]]["carbs"] / 100.0 for c in sel)

        # variantes de agregacion de porcion (D1)
        pred_sum = carb_of(items)
        seen, dedup = set(), []
        for c in sorted(items, key=lambda c: -c["score"]):
            if c["cid"] not in seen:
                seen.add(c["cid"])
                dedup.append(c)
        pred_dedupe = carb_of(dedup)
        pred_single = carb_of(items[:1])  # top-1 mas seguro (items ya ordenado por bbox, no score)
        if items:
            best = max(items, key=lambda c: c["score"])
            pred_single = carb_of([best])
        area_tot = sum(c["area"] for c in items)
        pred_area = (
            sum(
                catalog[c["cid"]]["grams"] * catalog[c["cid"]]["carbs"] / 100.0 * (c["area"] / area_tot)
                for c in items
            )
            if area_tot > 0
            else pred_sum
        )
        pred_mass = sum(catalog[c["cid"]]["grams"] for c in items)
        mae_m += abs(pred_mass - true_mass)
        mae += abs(pred_sum - true_carb)
        mae_dedupe += abs(pred_dedupe - true_carb)
        mae_single += abs(pred_single - true_carb)
        mae_area += abs(pred_area - true_carb)
        mean_true += true_carb
        if gt:
            if any(c in gt for c in top1_ids if c):
                dish_hit1 += 1
            if any(c in gt for c in top3_ids if c):
                dish_hit3 += 1

    mapped = sum(1 for p in paths if gt_ids.get(p.stem))
    report = {
        "tag": args.tag,
        "oracle": args.oracle,
        "dishes": n,
        "avg_detections": float(boxes_total / n),
        "coverage": float(boxes_resolved / boxes_total) if boxes_total else 0,
        "maeCarb": float(mae / n),
        "maeCarb_dedupe": float(mae_dedupe / n),
        "maeCarb_single": float(mae_single / n),
        "maeCarb_area": float(mae_area / n),
        "maeCarbPct": float((mae / n) / (mean_true / n)) if mean_true else 0,
        "maeMass": float(mae_m / n),
        "dishes_with_gt": mapped,
        "box_top1_precision": float(box_hit1 / boxes_total) if boxes_total else 0,
        "box_top3_precision": float(box_hit3 / boxes_total) if boxes_total else 0,
        "dish_recall_top1": float(dish_hit1 / mapped) if mapped else 0,
        "dish_recall_top3": float(dish_hit3 / mapped) if mapped else 0,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
