from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.db import Base, GenerateQuotaRow, LlmUsageRow, SessionLocal, UserRow, engine
from app.services import llm_usage, quota, rate_limit
from app.services.auth import issue_token
from app.services.identity import Identity


@pytest.fixture()
def db():
    assert engine.url.get_backend_name() == "sqlite", "refusing to drop tables outside SQLite"
    Base.metadata.create_all(bind=engine)
    rate_limit.reset()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    return TestClient(app)


def test_oversized_body_is_rejected(client, monkeypatch):
    big = "x" * (settings.max_body_bytes + 10)
    res = client.post(
        "/api/events",
        content=big,
        headers={"Content-Type": "application/json", "X-Device-Id": "device-hard-1234"},
    )
    assert res.status_code == 413


def test_event_payload_is_capped(client):
    res = client.post(
        "/api/events",
        json={"kind": "passage_open", "payload": {"blob": "y" * 5000}},
        headers={"X-Device-Id": "device-hard-1234"},
    )
    assert res.status_code == 422


def test_quota_stops_at_cap(db, monkeypatch):
    monkeypatch.setattr(settings, "generate_monthly_cap", 2)
    identity = Identity(device_id="device-quota-1234", user_id=None)
    quota.consume_generate(db, identity)
    quota.consume_generate(db, identity)
    with pytest.raises(Exception) as exc:
        quota.consume_generate(db, identity)
    assert getattr(exc.value, "status_code", None) == 429
    row = db.query(GenerateQuotaRow).one()
    assert row.count == 2


def test_legacy_tokens_rejected_when_disabled(client, db, monkeypatch):
    user = UserRow(email="legacy@example.com", display_name="Legacy")
    db.add(user)
    db.commit()
    token = issue_token(user.id)

    monkeypatch.setattr(settings, "allow_legacy_tokens", True)
    res = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res.json()["user_id"] == user.id

    monkeypatch.setattr(settings, "allow_legacy_tokens", False)
    res = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res.json()["authenticated"] is False


def test_llm_usage_accumulates_per_account(db):
    completion = SimpleNamespace(usage=SimpleNamespace(prompt_tokens=100, completion_tokens=40))
    with llm_usage.charged_to("user:7"):
        llm_usage.record(completion)
        llm_usage.record(completion)
    llm_usage.record(completion)

    rows = {r.account_key: r for r in db.query(LlmUsageRow).all()}
    assert rows["user:7"].calls == 2
    assert rows["user:7"].prompt_tokens == 200
    assert rows["user:7"].completion_tokens == 80
    assert rows[llm_usage.SYSTEM].calls == 1
    top = llm_usage.top_accounts(db)
    assert top[0]["account"] == "user:7"
