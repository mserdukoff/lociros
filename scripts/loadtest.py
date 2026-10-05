"""Simulate many readers against the Lociros API and report throughput and latency.

Each virtual user gets its own device id and, with --proxy-secret, its own
client address, the way the Vercel proxy presents real visitors.

  backend/.venv/bin/python scripts/loadtest.py --url https://api.lociros.com \
      --users 100 --duration 60 --proxy-secret "$PROXY_SECRET"

Read-only traffic by default (shelf, passages, glosses, events). Never point
--with-generate at production: it queues paid LLM work.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import statistics
import time
import uuid
from collections import Counter, defaultdict

import httpx

LANGUAGES = ["ja", "ru", "it", "ar"]


class Stats:
    def __init__(self) -> None:
        self.latency: dict[str, list[float]] = defaultdict(list)
        self.status: Counter[str] = Counter()
        self.errors: Counter[str] = Counter()
        self.sessions = 0

    def add(self, name: str, status: int, seconds: float) -> None:
        self.latency[name].append(seconds)
        self.status[str(status)] += 1

    def fail(self, name: str, exc: Exception) -> None:
        self.errors[f"{name}: {type(exc).__name__}"] += 1


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p))] * 1000


async def call(client: httpx.AsyncClient, stats: Stats, name: str, method: str, path: str, **kw):
    start = time.perf_counter()
    try:
        res = await client.request(method, path, **kw)
    except httpx.HTTPError as exc:
        stats.fail(name, exc)
        return None
    stats.add(name, res.status_code, time.perf_counter() - start)
    return res


async def reader(base: str, args, stats: Stats, stop_at: float, n: int) -> None:
    headers = {"X-Device-Id": f"load-{uuid.uuid4().hex[:20]}"}
    if args.proxy_secret:
        headers["X-Lociros-Proxy"] = args.proxy_secret
        headers["X-Client-IP"] = f"10.{n // 65536 % 256}.{n // 256 % 256}.{n % 256}"
    language = random.choice(LANGUAGES)
    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=30) as client:
        while time.perf_counter() < stop_at:
            res = await call(client, stats, "library", "GET", f"/api/library?language={language}")
            ids = []
            if res is not None and res.status_code == 200:
                ids = [item["id"] for item in res.json().get("items", [])][:20]
            await call(client, stats, "me", "GET", "/api/me")
            if ids:
                pid = random.choice(ids)
                await call(client, stats, "passage", "GET", f"/api/passages/{pid}")
                await call(
                    client, stats, "gloss", "POST", "/api/gloss",
                    json={"word": "test", "passage_id": pid},
                )
                await call(
                    client, stats, "events", "POST", "/api/events",
                    json={"kind": "passage_open", "passage_id": pid},
                )
            if args.with_generate:
                await call(
                    client, stats, "generate", "POST", "/api/generate",
                    json={"language": language, "level": "A2", "topic": "cats"},
                )
            await asyncio.sleep(random.uniform(0, args.think))


SESSION_TAPS = 12


async def session(base: str, args, stats: Stats, stop_at: float, n: int) -> None:
    """One reader's full passage, in the order the app makes the calls: open
    (account, shelf, passage, stats), tap words while reading, then rate it."""
    headers = {"X-Device-Id": f"load-{uuid.uuid4().hex[:20]}"}
    if args.proxy_secret:
        headers["X-Lociros-Proxy"] = args.proxy_secret
        headers["X-Client-IP"] = f"10.{n // 65536 % 256}.{n // 256 % 256}.{n % 256}"
    language = random.choice(LANGUAGES)
    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=30) as client:
        while time.perf_counter() < stop_at:
            await call(client, stats, "me", "GET", "/api/me")
            res = await call(client, stats, "library", "GET", f"/api/library?language={language}")
            if res is None or res.status_code != 200 or not res.json().get("items"):
                await asyncio.sleep(1)
                continue
            pid = random.choice(res.json()["items"][:20])["id"]
            res = await call(client, stats, "passage", "GET", f"/api/passages/{pid}")
            await call(client, stats, "stats", "GET", f"/api/passages/{pid}/stats")
            lemmas = []
            if res is not None and res.status_code == 200:
                lemmas = [t["lemma"] for t in res.json().get("tokens", []) if t.get("is_word") and t.get("lemma")]
            for lemma in random.sample(lemmas, min(SESSION_TAPS, len(lemmas))):
                await asyncio.sleep(random.uniform(0, args.think))
                await call(
                    client, stats, "tap", "POST", "/api/taps",
                    json={"lemma": lemma, "language": language, "passage_id": pid},
                )
            await call(
                client, stats, "feedback", "POST", "/api/feedback",
                json={"passage_id": pid, "rating": "just_right"},
            )
            stats.sessions += 1


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8088")
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--think", type=float, default=0.5, help="max pause between a user's rounds (s)")
    parser.add_argument("--proxy-secret", default="")
    parser.add_argument("--with-generate", action="store_true")
    parser.add_argument(
        "--scenario", choices=["mix", "session"], default="mix",
        help="mix: shelf/passage/gloss/events loop; session: a full read with taps and feedback",
    )
    args = parser.parse_args()

    stats = Stats()
    started = time.perf_counter()
    stop_at = started + args.duration
    worker = session if args.scenario == "session" else reader
    await asyncio.gather(*(worker(args.url.rstrip("/"), args, stats, stop_at, n) for n in range(args.users)))
    elapsed = time.perf_counter() - started

    total = sum(len(v) for v in stats.latency.values())
    print(f"\n{args.users} users, {elapsed:.0f}s, {total} requests, {total / elapsed:.0f} req/s")
    if args.scenario == "session":
        print(f"{stats.sessions} passages read, {stats.sessions * 60 / elapsed:.0f} per minute")
    print(f"{'route':<10}{'count':>8}{'p50 ms':>9}{'p95 ms':>9}{'p99 ms':>9}{'mean ms':>9}")
    for name, values in sorted(stats.latency.items()):
        print(
            f"{name:<10}{len(values):>8}{pct(values, .5):>9.0f}{pct(values, .95):>9.0f}"
            f"{pct(values, .99):>9.0f}{statistics.fmean(values) * 1000:>9.0f}"
        )
    print("status:", dict(sorted(stats.status.items())))
    if stats.errors:
        print("errors:", dict(stats.errors))


if __name__ == "__main__":
    asyncio.run(main())
