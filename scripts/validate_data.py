#!/usr/bin/env python3
"""Validate the generated JSON before deployment."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "top100.json"
INITIAL_PATH = ROOT / "assets" / "initial-data.js"
CJK = re.compile(r"[\u3400-\u9fff]")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    try:
        document = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"cannot read {DATA_PATH}: {exc}")

    items = document.get("items")
    if not isinstance(items, list) or len(items) != 100:
        fail(f"expected 100 items, got {len(items) if isinstance(items, list) else type(items).__name__}")

    ranks = [item.get("rank") for item in items]
    if ranks != list(range(1, 101)):
        fail("ranks must be exactly 1..100")

    names = [item.get("full_name") for item in items]
    if any(not isinstance(name, str) or "/" not in name for name in names):
        fail("every full_name must use owner/repository format")
    if len(set(names)) != 100:
        fail("repository names must be unique")

    stars = [int(item.get("stars") or 0) for item in items]
    if any(stars[index] < stars[index + 1] for index in range(len(stars) - 1)):
        fail("stars must be sorted descending")

    valid_grades = {"A", "B", "C", "D"}
    for item in items:
        name = item["full_name"]
        summary = str(item.get("summary_zh") or "")
        if len(summary) < 18 or not CJK.search(summary):
            fail(f"{name}: missing useful Traditional Chinese summary")
        if item.get("grade") not in valid_grades:
            fail(f"{name}: invalid grade {item.get('grade')!r}")
        fit = item.get("fit_score")
        if not isinstance(fit, int) or not 1 <= fit <= 5:
            fail(f"{name}: fit_score must be an integer from 1 to 5")
        points = item.get("key_points_zh")
        if not isinstance(points, list) or len(points) < 3:
            fail(f"{name}: key_points_zh must contain at least 3 points")
        if not str(item.get("html_url") or "").startswith("https://github.com/"):
            fail(f"{name}: invalid GitHub URL")

    meta = document.get("meta") or {}
    if meta.get("count") not in (None, 100):
        fail("meta.count does not match dataset")

    initial = INITIAL_PATH.read_text(encoding="utf-8")
    if not initial.startswith("window.__INITIAL_DATA__ = "):
        fail("assets/initial-data.js does not contain the offline fallback")

    print(f"OK: 100 repositories, {sum(1 for item in items if item.get('summary_zh'))} summaries, stars sorted descending")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
