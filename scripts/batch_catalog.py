#!/usr/bin/env python3
"""Batch-generate catalog passages via the live LLM loop.

Usage (from repo root, with OPENROUTER_API_KEY and the target DATABASE_URL set):

    PYTHONPATH=backend python scripts/batch_catalog.py --language it --level A2 --count 12
    PYTHONPATH=backend python scripts/batch_catalog.py --language ar --levels A1,A2,B1,B2 --count 10

`--count` is per level. Topics rotate through a fixed list so a run does not
repeat itself until it has used every topic. Failed calibrations are
quarantined and never seeded to the public shelf. Token use is recorded under
the `system:catalog` account in llm_usage.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.db import PassageRow, SessionLocal, init_db  # noqa: E402
from app.services.generate import generate_passage  # noqa: E402
from app.services.llm_usage import charged_to  # noqa: E402
from app.services.tts import synthesize_passage  # noqa: E402

TOPICS = [
    ("a quiet kitchen", "daily_life"),
    ("the last train", "travel"),
    ("a small festival", "folklore"),
    ("Monday at the office", "work"),
    ("rain in the city", "news"),
    ("a letter from home", "daily_life"),
    ("buying fruit at the market", "daily_life"),
    ("a walk by the river", "travel"),
    ("a lost umbrella", "daily_life"),
    ("the new neighbour", "daily_life"),
    ("a birthday dinner", "daily_life"),
    ("moving to a new flat", "daily_life"),
    ("a night bus", "travel"),
    ("a hotel by the sea", "travel"),
    ("missing the ferry", "travel"),
    ("a mountain village", "travel"),
    ("the fox and the farmer", "folklore"),
    ("a king who could not sleep", "folklore"),
    ("the clever daughter", "folklore"),
    ("a well that answered questions", "folklore"),
    ("a job interview", "work"),
    ("the café before opening", "work"),
    ("a teacher's first day", "work"),
    ("a late delivery", "work"),
    ("a library reopens", "news"),
    ("a heatwave", "news"),
    ("a new bridge in town", "news"),
    ("a local football match", "news"),
    ("learning to cook", "daily_life"),
    ("an old photograph", "daily_life"),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=10, help="passages per level")
    parser.add_argument("--level", default="A2", choices=["A1", "A2", "B1", "B2"])
    parser.add_argument("--levels", default="", help="comma-separated, overrides --level")
    parser.add_argument("--language", default="ja", choices=["ja", "ru", "it", "ar"])
    parser.add_argument("--offset", type=int, default=0, help="start further into the topic list")
    parser.add_argument("--audio", action="store_true")
    args = parser.parse_args()

    levels = [lv.strip().upper() for lv in args.levels.split(",") if lv.strip()] or [args.level]
    init_db()
    db = SessionLocal()
    passed = 0
    quarantined = 0
    failed = 0
    try:
        with charged_to("system:catalog"):
            for level in levels:
                for i in range(args.count):
                    n = args.offset + i
                    topic, genre = TOPICS[n % len(TOPICS)]
                    if n >= len(TOPICS):
                        topic = f"{topic} ({n // len(TOPICS) + 1})"
                    try:
                        result = generate_passage(db, level, topic, genre, args.language)
                    except Exception as exc:
                        db.rollback()
                        failed += 1
                        print(f"FAIL  {level} {topic}: {exc}")
                        continue
                    if result.calibration.passed:
                        passed += 1
                        print(f"OK  {result.level} {result.title}")
                        if args.audio:
                            _add_audio(db, result.id)
                    else:
                        quarantined += 1
                        print(f"QUARANTINE  {level} {result.title} flags={result.calibration.flags[:4]}")
    finally:
        db.close()
    print(f"passed={passed} quarantined={quarantined} failed={failed}")


def _add_audio(db, passage_id: str) -> None:
    row = db.get(PassageRow, passage_id)
    if row is None:
        return
    synth = synthesize_passage(row)
    if synth:
        url, cues = synth
        row.audio_url = url
        row.audio_cues_json = json.dumps(cues, ensure_ascii=False)
        db.commit()


if __name__ == "__main__":
    main()
