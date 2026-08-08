#!/usr/bin/env python3
"""Copy only deployable static files into dist/."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA_PATH = ROOT / "data" / "top100.json"
INITIAL_PATH = ROOT / "assets" / "initial-data.js"


def main() -> int:
    document = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    INITIAL_PATH.write_text(
        "window.__INITIAL_DATA__ = "
        + json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    shutil.copy2(ROOT / "index.html", DIST / "index.html")
    shutil.copytree(ROOT / "assets", DIST / "assets")
    shutil.copytree(ROOT / "data", DIST / "data")
    (DIST / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Built static site at {DIST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
