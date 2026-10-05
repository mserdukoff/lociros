from __future__ import annotations

import hmac
import ipaddress
import threading
import time
from collections import deque

from fastapi import Header, HTTPException, Request

from app.core.config import settings
from app.services import shared_store
from app.services.identity import valid_device_id

# Windows live in Redis when REDIS_URL is set, so every API replica enforces one
# shared limit. Without Redis each process keeps its own window and the
# effective limit scales with the replica count.
_hits: dict[str, deque[float]] = {}
_lock = threading.Lock()
_MAX_KEYS = 50_000

PROXY_HEADER = "x-lociros-proxy"
CLIENT_IP_HEADER = "x-client-ip"


def client_ip(request: Request) -> str:
    """The end user's address.

    Every browser request reaches the API through the Vercel proxy, so the
    socket peer is a shared Vercel egress address. The proxy forwards the real
    address alongside PROXY_SECRET; anything else gets the peer address.
    IPv6 is grouped by /64, the block one subscriber usually holds.
    """
    host = request.client.host if request.client else "unknown"
    secret = settings.proxy_secret
    if secret:
        given = request.headers.get(PROXY_HEADER, "")
        if given and hmac.compare_digest(given.encode(), secret.encode()):
            host = request.headers.get(CLIENT_IP_HEADER, "").strip() or host
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return host
    if addr.version == 6:
        return str(ipaddress.ip_network(f"{addr}/64", strict=False).network_address)
    return str(addr)


def _client_key(request: Request, x_device_id: str | None) -> str:
    user_id = getattr(request.state, "user_id", None)
    if user_id is not None:
        return f"user:{user_id}"
    device = valid_device_id(x_device_id)
    if device:
        return f"device:{device}"
    return f"ip:{client_ip(request)}"


def _memory_hit(key: str, limit: int, window_seconds: float) -> bool:
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


def _redis_hit(redis, key: str, limit: int, window_seconds: float) -> bool:
    """Sliding-window estimate from two fixed windows: one round trip, no Lua."""
    now = time.time()
    slot = int(now // window_seconds)
    into = (now % window_seconds) / window_seconds
    current = f"rl:{key}:{slot}"
    pipe = redis.pipeline(transaction=True)
    pipe.incr(current)
    pipe.expire(current, int(window_seconds * 2) + 1)
    pipe.get(f"rl:{key}:{slot - 1}")
    count, _, previous = pipe.execute()
    return int(previous or 0) * (1 - into) + count <= limit


def hit(key: str, limit: int, window_seconds: float) -> bool:
    """Record one hit for `key`; False when it would exceed `limit` per window."""
    redis = shared_store.client()
    if redis is not None:
        try:
            return _redis_hit(redis, key, limit, window_seconds)
        except Exception as exc:  # noqa: BLE001 - any Redis failure falls back
            shared_store.mark_down(exc)
    return _memory_hit(key, limit, window_seconds)


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
        ok = hit(f"{name}:{caller}", limit, window_seconds)
        if ok and not caller.startswith("ip:"):
            ok = hit(f"{name}:ip:{client_ip(request)}", limit * IP_MULTIPLIER, window_seconds)
        if not ok:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Wait a minute and try again.",
            )

    return dependency
