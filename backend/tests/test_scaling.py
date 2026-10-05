from types import SimpleNamespace

import fakeredis
import pytest

from app.core.config import settings
from app.services import generate, rate_limit, shared_store


def _request(peer: str, headers: dict[str, str] | None = None):
    return SimpleNamespace(
        client=SimpleNamespace(host=peer),
        headers={k.lower(): v for k, v in (headers or {}).items()},
        state=SimpleNamespace(),
    )


@pytest.fixture()
def redis(monkeypatch):
    server = fakeredis.FakeServer()
    fake = fakeredis.FakeRedis(server=server)
    shared_store.reset()
    rate_limit.reset()
    monkeypatch.setattr(settings, "redis_url", "redis://fake")
    monkeypatch.setattr(shared_store, "_client", fake)
    yield server
    shared_store.reset()


def test_replicas_share_one_window(redis):
    # Two replicas are two processes with separate memory but one Redis.
    replica_a = fakeredis.FakeRedis(server=redis)
    replica_b = fakeredis.FakeRedis(server=redis)
    assert all(rate_limit._redis_hit(replica_a, "gen:user:1", 4, 60) for _ in range(2))
    assert all(rate_limit._redis_hit(replica_b, "gen:user:1", 4, 60) for _ in range(2))
    assert not rate_limit._redis_hit(replica_a, "gen:user:1", 4, 60)
    assert rate_limit._redis_hit(replica_b, "gen:user:2", 4, 60)


def test_hit_uses_redis_when_configured(redis):
    assert all(rate_limit.hit("k", 3, 60) for _ in range(3))
    assert not rate_limit.hit("k", 3, 60)
    rate_limit.reset()
    assert not rate_limit.hit("k", 3, 60), "memory reset must not clear the shared window"


def test_redis_outage_falls_back_to_memory(monkeypatch):
    class Down:
        def pipeline(self, **_):
            raise ConnectionError("refused")

    shared_store.reset()
    rate_limit.reset()
    monkeypatch.setattr(settings, "redis_url", "redis://down")
    monkeypatch.setattr(shared_store, "_client", Down())
    assert all(rate_limit.hit("k", 2, 60) for _ in range(2))
    assert not rate_limit.hit("k", 2, 60)
    assert shared_store.client() is None, "a failed call should pause Redis use"
    shared_store.reset()


def test_translation_cooldown_is_shared(redis):
    assert generate._may_translate("p-1")
    generate._translation_attempts.clear()
    assert not generate._may_translate("p-1")
    assert generate._may_translate("p-2")


def test_client_ip_trusts_proxy_only_with_secret(monkeypatch):
    monkeypatch.setattr(settings, "proxy_secret", "s3cret")
    forwarded = {"X-Lociros-Proxy": "s3cret", "X-Client-IP": "203.0.113.7"}
    assert rate_limit.client_ip(_request("76.76.21.1", forwarded)) == "203.0.113.7"
    spoofed = {"X-Lociros-Proxy": "guess", "X-Client-IP": "203.0.113.7"}
    assert rate_limit.client_ip(_request("198.51.100.4", spoofed)) == "198.51.100.4"
    assert rate_limit.client_ip(_request("198.51.100.4", {"X-Client-IP": "1.2.3.4"})) == "198.51.100.4"


def test_client_ip_ignores_header_without_secret(monkeypatch):
    monkeypatch.setattr(settings, "proxy_secret", "")
    headers = {"X-Lociros-Proxy": "", "X-Client-IP": "203.0.113.7"}
    assert rate_limit.client_ip(_request("198.51.100.4", headers)) == "198.51.100.4"


def test_load_once_runs_loader_once_under_concurrency():
    import threading
    import time

    from app.core.once import load_once

    calls = []

    @load_once
    def loader():
        calls.append(1)
        time.sleep(0.05)
        return object()

    results = []
    threads = [threading.Thread(target=lambda: results.append(loader())) for _ in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1
    assert len({id(r) for r in results}) == 1


def test_ipv6_groups_by_subnet(monkeypatch):
    monkeypatch.setattr(settings, "proxy_secret", "")
    a = rate_limit.client_ip(_request("2001:db8:1:2::10"))
    b = rate_limit.client_ip(_request("2001:db8:1:2:ffff::1"))
    assert a == b == "2001:db8:1:2::"
