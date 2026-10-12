#!/usr/bin/env python3
"""Combina el detector y cada clasificador de la shortlist en un manifest por candidato."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "eval/cache"


def main() -> None:
    detector = json.loads((CACHE / "detector.json").read_text(encoding="utf-8"))
    for fragment in sorted(CACHE.glob("classifier-*.json")):
        name = fragment.stem.replace("classifier-", "")
        classifier = json.loads(fragment.read_text(encoding="utf-8"))
        manifest = {"detector": detector, "classifier": classifier}
        out = CACHE / f"manifest-{name}.json"
        out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"{out.name}: detector + {classifier['version']} ({len(classifier['classes'])} clases)")


if __name__ == "__main__":
    main()
