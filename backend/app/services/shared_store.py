"""Optional Redis shared by every API replica.

Callers fall back to process memory when REDIS_URL is unset or Redis is down,
so a Redis outage loosens limits instead of failing requests.
"""

from __future__ import annotations

import logging
import threading
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

RETRY_AFTER_SECONDS = 10.0

_client = None
_down_until = 0.0
_lock = threading.Lock()


def client():
    """The shared Redis client, or None when unset or recently unreachable."""
    global _client
    if not settings.redis_url or time.monotonic() < _down_until:
        return None
    if _client is None:
        with _lock:
            if _client is None:
                import redis

                _client = redis.Redis.from_url(
                    settings.redis_url,
                    socket_timeout=0.25,
                    socket_connect_timeout=0.25,
                    health_check_interval=30,
                )
    return _client


def mark_down(exc: Exception) -> None:
    """Skip Redis for a few seconds so an outage does not add latency to every request."""
    global _down_until
    with _lock:
        if time.monotonic() >= _down_until:
            logger.warning("Redis unavailable, using process memory: %s", exc)
        _down_until = time.monotonic() + RETRY_AFTER_SECONDS


def reset() -> None:
    global _client, _down_until
    with _lock:
        _client = None
        _down_until = 0.0
