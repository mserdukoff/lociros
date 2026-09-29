from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import Header, HTTPException, Request

from app.services.identity import valid_device_id

# In-process only: production runs one API container with WEB_CONCURRENCY=1.
# With more processes each keeps its own window, so the effective limit scales
# with the process count.
_hits: dict[str, deque[float]] = {}
_lock = threading.Lock()
_MAX_KEYS = 50_000


def _client_key(request: Request, x_device_id: str | None) -> str:
    user_id = getattr(request.state, "user_id", None)
    if user_id is not None:
        return f"user:{user_id}"
    device = valid_device_id(x_device_id)
    if device:
        return f"device:{device}"
    host = request.client.host if request.client else "unknown"
    return f"ip:{host}"


def hit(key: str, limit: int, window_seconds: float) -> bool:
    """Record one hit for `key`; False when it would exceed `limit` per window."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        if len(_hits) > _MAX_KEYS:
            _hits.clear()
        bucket = _hits.setdefault(key, deque())
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def reset() -> None:
    with _lock:
        _hits.clear()


IP_MULTIPLIER = 5


def rate_limit(name: str, limit: int, window_seconds: float = 60):
    """FastAPI dependency: `limit` requests per `window_seconds` per caller.

    Device ids are client-chosen, so each IP also gets a looser shared window
    to stop one client rotating ids.
    """

    def dependency(request: Request, x_device_id: str | None = Header(default=None)) -> None:
        caller = _client_key(request, x_device_id)
        host = request.client.host if request.client else "unknown"
        ok = hit(f"{name}:{caller}", limit, window_seconds)
        if ok and not caller.startswith("ip:"):
            ok = hit(f"{name}:ip:{host}", limit * IP_MULTIPLIER, window_seconds)
        if not ok:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Wait a minute and try again.",
            )

    return dependency
