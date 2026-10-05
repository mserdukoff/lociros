"""Time the real passage pipeline against OpenRouter, per model.

Runs `generate_passage` on a throwaway SQLite database (never Supabase) and
records every OpenRouter call: wall time, output tokens, and which step made it.

    cd backend && python ../scripts/bench_generation.py \
        --models openai/gpt-4o-mini,google/gemini-3.1-flash-lite \
        --langs ru,it,ja,ar --levels A2,B1 --concurrency 8
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

_DB = Path(tempfile.mkdtemp(prefix="lociros-bench-")) / "bench.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ["SKIP_SEED"] = "true"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.config import settings  # noqa: E402
from app.models.db import SessionLocal, init_db  # noqa: E402
from app.services import generate as generate_module  # noqa: E402
from app.services import llm  # noqa: E402
from app.services.generate import generate_passage  # noqa: E402

# Every run must hit the LLM; the topic cache would hand back earlier passages.
generate_module.find_cached_passage = lambda *a, **k: None

TOPICS = [
    "a rainy day at the market",
    "a lost cat in the neighbourhood",
    "the first day at a new job",
    "a weekend trip to the mountains",
    "cooking dinner for friends",
    "a missed train",
    "a visit to grandmother",
    "a football match in the park",
]

_local = threading.local()
_calls_lock = threading.Lock()
_orig_complete = llm._complete
_orig_record = llm.record_usage


def _record(completion) -> None:
    usage = getattr(completion, "usage", None)
    _local.last_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    _local.last_model = getattr(completion, "model", "")
    _orig_record(completion)


def _timed_complete(prompt, **kw):
    step = sys._getframe(1).f_code.co_name
    started = time.perf_counter()
    try:
        return _orig_complete(prompt, **kw)
    finally:
        elapsed = time.perf_counter() - started
        with _calls_lock:
            _local.calls.append(
                {
                    "step": step,
                    "seconds": elapsed,
                    "tokens": getattr(_local, "last_tokens", 0),
                    "model": getattr(_local, "last_model", ""),
                }
            )


llm._complete = _timed_complete
llm.record_usage = _record


def _pricing() -> dict[str, tuple[float, float]]:
    try:
        with urllib.request.urlopen("https://openrouter.ai/api/v1/models", timeout=10) as r:
            data = json.load(r)["data"]
    except Exception:
        return {}
    return {
        m["id"]: (float(m["pricing"]["prompt"]), float(m["pricing"]["completion"]))
        for m in data
        if m.get("pricing")
    }


def _one(language: str, level: str, topic: str) -> dict:
    _local.calls = []
    db = SessionLocal()
    started = time.perf_counter()
    error = None
    passage = None
    try:
        passage = generate_passage(db, level, topic, None, language)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"[:160]
    finally:
        db.close()
    return {
        "language": language,
        "level": level,
        "seconds": time.perf_counter() - started,
        "calls": list(_local.calls),
        "passed": bool(passage and passage.calibration.passed),
        "attempts": passage.calibration.attempts if passage else 0,
        "words": passage.word_count if passage else 0,
        "error": error,
        "passage": passage,
    }


def run_jobs(jobs: list[tuple[str, str, str]], concurrency: int) -> tuple[list[dict], float]:
    wall = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        results = list(pool.map(lambda j: _one(*j), jobs))
    return results, time.perf_counter() - wall


def _pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def bench(model: str, langs: list[str], levels: list[str], per: int, concurrency: int) -> dict:
    settings.llm_model = model
    jobs = []
    n = 0
    for lang in langs:
        for level in levels:
            for _ in range(per):
                jobs.append((lang, level, TOPICS[n % len(TOPICS)]))
                n += 1
    results, wall = run_jobs(jobs, concurrency)
    return {"model": model, "wall": wall, "results": results}


def report(run: dict, prices: dict) -> None:
    rs = run["results"]
    ok = [r for r in rs if not r["error"]]
    totals = [r["seconds"] for r in ok]
    drafts = [c for r in ok for c in r["calls"] if c["step"] == "generate_passage_text"]
    rates = [c["tokens"] / c["seconds"] for c in drafts if c["seconds"] > 0.5 and c["tokens"]]
    steps: dict[str, list[float]] = {}
    for r in ok:
        for c in r["calls"]:
            steps.setdefault(c["step"], []).append(c["seconds"])
    out_tokens = sum(c["tokens"] for r in ok for c in r["calls"])
    price = prices.get(run["model"])
    print(f"\n== {run['model']}  ({len(ok)}/{len(rs)} ok, wall {run['wall']:.0f}s)")
    if not ok:
        for r in rs[:3]:
            print("   error:", r["error"])
        return
    print(
        f"   per passage: mean {statistics.mean(totals):.1f}s  p50 {_pct(totals, .5):.1f}s  "
        f"p90 {_pct(totals, .9):.1f}s  max {max(totals):.1f}s"
    )
    print(
        f"   passed level {sum(r['passed'] for r in ok)}/{len(ok)}  "
        f"rewrites {sum(r['attempts'] > 1 for r in ok)}/{len(ok)}  "
        f"calls/passage {statistics.mean(len(r['calls']) for r in ok):.1f}  "
        f"words {statistics.mean(r['words'] for r in ok):.0f}"
    )
    if rates:
        print(f"   draft speed {statistics.median(rates):.0f} tok/s (median)")
    for step, secs in sorted(steps.items()):
        print(f"   {step:<24} n={len(secs):<3} mean {statistics.mean(secs):5.1f}s  max {max(secs):5.1f}s")
    if price:
        per_passage = out_tokens / len(ok) * price[1]
        print(f"   output cost ~${per_passage * 1000:.2f} per 1,000 passages (output tokens only)")
    by_lang: dict[str, list[float]] = {}
    for r in ok:
        by_lang.setdefault(r["language"], []).append(r["seconds"])
    print("   by language: " + "  ".join(f"{k} {statistics.mean(v):.1f}s" for k, v in by_lang.items()))
    for r in rs:
        if r["error"]:
            print("   error:", r["language"], r["level"], r["error"])


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--models", default=settings.llm_model)
    p.add_argument("--langs", default="ru,it,ja,ar")
    p.add_argument("--levels", default="A2,B1")
    p.add_argument("--per", type=int, default=1, help="passages per language and level")
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--provider-sort", default=None, help="throughput, latency, price, or none")
    p.add_argument("--reasoning", default=None, help="OpenRouter reasoning effort for thinking models")
    args = p.parse_args()

    if not settings.openrouter_api_key:
        sys.exit("OPENROUTER_API_KEY is not set in backend/.env")
    if args.provider_sort is not None:
        settings.llm_provider_sort = "" if args.provider_sort == "none" else args.provider_sort
    if args.reasoning is not None:
        settings.llm_reasoning_effort = args.reasoning
    init_db()
    prices = _pricing()
    langs = [s for s in args.langs.split(",") if s]
    levels = [s for s in args.levels.split(",") if s]
    print(
        f"provider sort={settings.llm_provider_sort or 'default'}  "
        f"concurrency={args.concurrency}  db={_DB}"
    )
    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        report(bench(model, langs, levels, args.per, args.concurrency), prices)


if __name__ == "__main__":
    main()
