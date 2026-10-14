#!/usr/bin/env python3
"""Tests del etiquetado por REGIONES (varios alimentos por imagen).

Cubre la interfaz congelada compartida por CLI (confirm_labels) y servidor
(label_server): validate_box, dest_name_box, crop_materialize, record_boxes,
is_materialized y el camino `--decisions` con "boxes".

Ejecutable sin red, con imagenes PNG generadas con PIL en un tempfile:

    python3 tools/data/test_label_regions.py
    python3 -m pytest tools/data/test_label_regions.py
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

import confirm_labels as cl  # noqa: E402

CATALOG = """export const CATALOG = {
  foods: [
    { id: "tomate", name: { es: "Tomate", en: "Tomato" }, synonyms: [] },
    { id: "pan_blanco", name: { es: "Pan blanco", en: "White bread" }, synonyms: [] },
  ],
} as const;
"""


class RegionLabelingTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(dir=tempfile.gettempdir())
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def make_png(self, name: str, size: tuple[int, int] = (200, 100)) -> Path:
        path = self.tmp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", size, (120, 60, 30)).save(path, "PNG")
        return path

    # -- validate_box -------------------------------------------------------
    def test_validate_box_accepts_valid(self) -> None:
        self.assertEqual(cl.validate_box([0.0, 0.0, 0.5, 1.0]), (0.0, 0.0, 0.5, 1.0))
        self.assertEqual(cl.validate_box((0.1, 0.2, 0.3, 0.4)), (0.1, 0.2, 0.3, 0.4))
        self.assertEqual(cl.validate_box([0, 0, 1, 1]), (0.0, 0.0, 1.0, 1.0))

    def test_validate_box_rejects_bad(self) -> None:
        bad_cases = [
            [0, 0, 0, 0.5],          # w=0
            [0, 0, 0.5, 0],          # h=0
            [1.2, 0, 0.5, 0.5],      # x>1
            [0, 0, 0.5],             # 3 elementos
            [0, 0, 0.5, 0.5, 0.1],   # 5 elementos
            [0.6, 0, 0.5, 0.5],      # x+w=1.1 desborda
            [0, 0.8, 0.5, 0.5],      # y+h=1.3 desborda
        ]
        for bad in bad_cases:
            with self.assertRaises(ValueError):
                cl.validate_box(bad)

    def test_validate_box_accepts_full_and_touching_edge(self) -> None:
        self.assertEqual(cl.validate_box([0.0, 0.0, 1.0, 1.0]), (0.0, 0.0, 1.0, 1.0))
        self.assertEqual(cl.validate_box([0.5, 0.0, 0.5, 0.5]), (0.5, 0.0, 0.5, 0.5))

    # -- dest_name_box ------------------------------------------------------
    def test_dest_name_box_deterministic_and_distinct(self) -> None:
        a = cl.dest_name_box("data/x/foo.jpg", "tomate", [0.0, 0.0, 0.5, 0.5])
        b = cl.dest_name_box("data/x/foo.jpg", "tomate", [0.0, 0.0, 0.5, 0.5])
        c = cl.dest_name_box("data/x/foo.jpg", "tomate", [0.5, 0.5, 0.5, 0.5])
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertEqual(a.suffix, ".png")
        self.assertEqual(a.parent.name, "tomate")
        self.assertEqual(a.parent.parent, Path("."))
        self.assertIn(cl._sha8("data/x/foo.jpg"), a.name)
        self.assertIn("__b", a.name)

    # -- crop_materialize ---------------------------------------------------
    def test_crop_materialize_size_parents_and_exists(self) -> None:
        src = self.make_png("orig.png", (200, 100))
        dest = self.tmp / "out" / "deep" / "crop.png"
        result = cl.crop_materialize(src, dest, [0.0, 0.0, 0.5, 1.0])
        self.assertEqual(result, "crop")
        self.assertTrue(dest.exists())
        self.assertTrue(src.exists())
        with Image.open(dest) as im:
            self.assertEqual(im.size, (100, 100))
        self.assertEqual(cl.crop_materialize(src, dest, [0.0, 0.0, 0.5, 1.0]), "exists")

    def test_crop_materialize_too_small(self) -> None:
        src = self.make_png("orig.png", (200, 100))
        dest = self.tmp / "out" / "tiny.png"
        with self.assertRaises(ValueError):
            cl.crop_materialize(src, dest, [0.0, 0.0, 0.01, 0.01])
        self.assertFalse(dest.exists())

    # -- record_boxes -------------------------------------------------------
    def test_record_boxes_shape(self) -> None:
        boxes = [
            {"label": "tomate", "box": [0.0, 0.0, 0.5, 0.5]},
            {"label": "pan_blanco", "box": [0.5, 0.5, 0.5, 0.5]},
        ]
        row = {"path": "data/x/foo.jpg", "folderClass": "tomate", "topk": [{"id": "tomate"}], "agree": True}
        rec = cl.record_boxes(row, boxes, "manual", True, "machine")
        self.assertEqual(rec["path"], "data/x/foo.jpg")
        self.assertEqual(rec["labels"], ["tomate", "pan_blanco"])
        self.assertEqual(rec["boxes"], boxes)
        self.assertEqual(rec["source"], "manual")
        self.assertIs(rec["reviewed"], True)
        self.assertEqual(rec["top1"], "tomate")
        self.assertIn("ts", rec)
        self.assertNotIn("label", rec)

    def test_record_boxes_no_topk(self) -> None:
        rec = cl.record_boxes({"path": "p.jpg"}, [], "manual", False, "machine")
        self.assertIsNone(rec["top1"])
        self.assertEqual(rec["labels"], [])

    # -- is_materialized ----------------------------------------------------
    def test_is_materialized_requires_all_crops(self) -> None:
        out = self.tmp / "confirmed"
        row = {"path": "data/x/foo.jpg"}
        boxes = [
            {"label": "tomate", "box": [0.0, 0.0, 0.5, 0.5]},
            {"label": "pan_blanco", "box": [0.5, 0.5, 0.5, 0.5]},
        ]
        rec = cl.record_boxes(row, boxes, "manual", True, "machine")
        self.assertFalse(cl.is_materialized(rec, out))
        for b in boxes:
            dest = out / cl.dest_name_box(rec["path"], b["label"], b["box"])
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"x")
        self.assertTrue(cl.is_materialized(rec, out))
        first = out / cl.dest_name_box(rec["path"], boxes[0]["label"], boxes[0]["box"])
        first.unlink()
        self.assertFalse(cl.is_materialized(rec, out))

    # -- apply_boxes_decision (counters + rollback) -------------------------
    def _args(self, out: Path, log: Path, decisions: str | None = None, dry_run: bool = False):
        return argparse.Namespace(out_dir=out, log=log, decisions=decisions, dry_run=dry_run)

    def _counters(self) -> dict:
        return {
            "valid_ids": {"tomate", "pan_blanco"},
            "accepted": 0,
            "rejected": 0,
            "skipped": 0,
            "errors": 0,
            "handled": set(),
            "already": 0,
        }

    def test_apply_boxes_empty_is_error_not_accept(self) -> None:
        row = {"path": str(self.make_png("m.png"))}
        counters = self._counters()
        args = self._args(self.tmp / "out", self.tmp / "log.jsonl", decisions="x")
        with contextlib.redirect_stderr(io.StringIO()):
            cl.apply_boxes_decision(row, {"boxes": []}, args, counters)
        self.assertEqual(counters["errors"], 1)
        self.assertEqual(counters["accepted"], 0)
        self.assertFalse((self.tmp / "out").exists())
        self.assertFalse((self.tmp / "log.jsonl").exists())

    def test_apply_boxes_non_dict_item_is_error(self) -> None:
        row = {"path": str(self.make_png("m.png"))}
        counters = self._counters()
        args = self._args(self.tmp / "out", self.tmp / "log.jsonl", decisions="x")
        with contextlib.redirect_stderr(io.StringIO()):
            cl.apply_boxes_decision(row, {"boxes": [123]}, args, counters)
        self.assertEqual(counters["errors"], 1)
        self.assertEqual(counters["accepted"], 0)

    def test_apply_boxes_rollback_on_crop_failure(self) -> None:
        src = self.make_png("m.png", (200, 100))
        row = {"path": str(src)}
        counters = self._counters()
        out = self.tmp / "out"
        log = self.tmp / "log.jsonl"
        args = self._args(out, log, decisions="x")
        boxes = [
            {"label": "tomate", "box": [0.0, 0.0, 0.5, 1.0]},      # se recorta
            {"label": "pan_blanco", "box": [0.0, 0.0, 0.001, 0.001]},  # pasa validate_box pero <16px
        ]
        with contextlib.redirect_stderr(io.StringIO()):
            cl.apply_boxes_decision(row, {"boxes": boxes}, args, counters)
        self.assertEqual(counters["errors"], 1)
        self.assertEqual(counters["accepted"], 0)
        self.assertEqual(counters["handled"], set())
        self.assertEqual(list(out.rglob("*.png")), [])  # rollback: sin huerfanos
        self.assertFalse(log.exists())

    def test_apply_boxes_dry_run_counts_without_writing(self) -> None:
        src = self.make_png("m.png", (200, 100))
        counters = self._counters()
        out = self.tmp / "out"
        args = self._args(out, self.tmp / "log.jsonl", decisions="x", dry_run=True)
        with contextlib.redirect_stdout(io.StringIO()):
            cl.apply_boxes_decision(
                {"path": str(src)},
                {"boxes": [{"label": "tomate", "box": [0.0, 0.0, 0.5, 1.0]}]},
                args,
                counters,
            )
        self.assertEqual(counters["accepted"], 1)
        self.assertEqual(counters["errors"], 0)
        self.assertFalse(out.exists())

    # -- CLI ----------------------------------------------------------------
    def test_cli_decisions_with_boxes(self) -> None:
        img = self.make_png("meal.png", (200, 100))
        catalog = self.tmp / "catalog.ts"
        catalog.write_text(CATALOG, encoding="utf-8")
        queue = self.tmp / "queue.jsonl"
        queue.write_text(json.dumps({"path": str(img), "folderClass": "tomate"}) + "\n", encoding="utf-8")
        decisions = self.tmp / "decisions.jsonl"
        decisions.write_text(
            json.dumps(
                {
                    "path": str(img),
                    "boxes": [
                        {"label": "tomate", "box": [0.0, 0.0, 0.5, 1.0]},
                        {"label": "pan_blanco", "box": [0.5, 0.0, 0.5, 1.0]},
                    ],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        out = self.tmp / "confirmed"
        log = self.tmp / "confirmed.jsonl"
        argv = [
            "confirm_labels.py",
            "--queue", str(queue),
            "--catalog", str(catalog),
            "--out-dir", str(out),
            "--log", str(log),
            "--decisions", str(decisions),
            "--no-color",
        ]
        old_argv = sys.argv
        sys.argv = argv
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = cl.main()
        finally:
            sys.argv = old_argv
        self.assertEqual(code, 0)
        crops = sorted(out.rglob("*.png"))
        self.assertEqual(len(crops), 2)
        self.assertEqual(len(cl.load_decided(log)), 1)
        rec = next(iter(cl.load_decided(log).values()))
        self.assertEqual(sorted(rec["labels"]), ["pan_blanco", "tomate"])
        self.assertTrue(cl.is_materialized(rec, out))

    def test_cli_decisions_empty_boxes_is_error(self) -> None:
        """`boxes: []` NO debe caer al camino `action` (aceptaria la foto entera)."""
        img = self.make_png("meal.png", (200, 100))
        catalog = self.tmp / "catalog.ts"
        catalog.write_text(CATALOG, encoding="utf-8")
        queue = self.tmp / "queue.jsonl"
        queue.write_text(json.dumps({"path": str(img), "folderClass": "tomate"}) + "\n", encoding="utf-8")
        decisions = self.tmp / "decisions.jsonl"
        decisions.write_text(json.dumps({"path": str(img), "boxes": []}) + "\n", encoding="utf-8")
        out = self.tmp / "confirmed"
        log = self.tmp / "confirmed.jsonl"
        old_argv = sys.argv
        sys.argv = [
            "confirm_labels.py",
            "--queue", str(queue),
            "--catalog", str(catalog),
            "--out-dir", str(out),
            "--log", str(log),
            "--decisions", str(decisions),
            "--no-color",
        ]
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = cl.main()
        finally:
            sys.argv = old_argv
        self.assertEqual(code, 0)
        self.assertEqual(list(out.rglob("*.png")), [])  # no acepta la imagen completa
        self.assertEqual(cl.load_decided(log), {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
