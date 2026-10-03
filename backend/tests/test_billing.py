import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.db import (
    Base,
    FeedbackRow,
    GenerationJobRow,
    LearnerReadRow,
    LearnerStarRow,
    SessionLocal,
    StripeEventRow,
    UserRow,
    engine,
)
from app.models.schemas import Calibration
from app.services import billing, rate_limit
from app.services.auth import issue_token
from app.services.generate import _persist

DEVICE = {"X-Device-Id": "device-bill-12345"}
SECRET = "whsec_test"


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
def paywall(monkeypatch):
    monkeypatch.setattr(settings, "paywall_enabled", True)
    monkeypatch.setattr(settings, "stripe_webhook_secret", SECRET)
    monkeypatch.setattr(settings, "stripe_price_monthly", "price_month")
    monkeypatch.setattr(settings, "stripe_price_annual", "price_year")
    monkeypatch.setattr(settings, "admin_emails", "")


@pytest.fixture()
def client(db):
    return TestClient(app)


def _passage(db, topic: str = "rain") -> str:
    row = _persist(
        db,
        language="ja",
        level="A1",
        topic=topic,
        genre="daily_life",
        title=topic,
        text="私は学生です。",
        tokens=[],
        calibration=Calibration(
            passed=True,
            attempts=1,
            overlevel_lemma_rate=0,
            subordinate_rate=0,
            forbidden_case_rate=0,
            forbidden_tense_rate=0,
            forbidden_pos_rate=0,
            flags=[],
            warnings=[],
        ),
    )
    return row.id


def _user(db, **fields) -> UserRow:
    user = UserRow(email=fields.pop("email", "reader@example.com"), **fields)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: UserRow) -> dict:
    return {"Authorization": f"Bearer {issue_token(user.id)}", **DEVICE}


def _signed(event: dict) -> tuple[bytes, dict]:
    payload = json.dumps(event).encode()
    ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"}


def _sub_event(event_id: str, kind: str, customer: str, status: str, user_id: int | None = None):
    return {
        "id": event_id,
        "type": kind,
        "data": {
            "object": {
                "id": "sub_1",
                "customer": customer,
                "status": status,
                "cancel_at_period_end": False,
                "metadata": {"user_id": str(user_id)} if user_id else {},
                "items": {
                    "data": [
                        {
                            "price": {"id": "price_year"},
                            "current_period_end": int(time.time()) + 86400 * 365,
                        }
                    ]
                },
            }
        },
    }


def test_paywall_off_by_default_outside_production(client, db, monkeypatch):
    monkeypatch.setattr(settings, "paywall_enabled", None)
    monkeypatch.setattr(settings, "app_env", "development")
    first, second = _passage(db, "a"), _passage(db, "b")
    db.add(LearnerReadRow(device_id=DEVICE["X-Device-Id"], passage_id=first))
    db.commit()
    assert client.get(f"/api/passages/{second}", headers=DEVICE).status_code == 200


def test_guest_gets_one_free_passage(client, db, paywall):
    first, second = _passage(db, "a"), _passage(db, "b")
    assert client.get(f"/api/passages/{first}", headers=DEVICE).status_code == 200
    db.add(LearnerReadRow(device_id=DEVICE["X-Device-Id"], passage_id=first))
    db.commit()
    assert client.get(f"/api/passages/{first}", headers=DEVICE).status_code == 200
    res = client.get(f"/api/passages/{second}", headers=DEVICE)
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "signup_required"


def test_new_account_starts_trial(client, db, paywall):
    user = _user(db)
    me = client.get("/api/me", headers=_auth(user)).json()
    assert me["entitlement"]["status"] == "trial"
    assert me["entitlement"]["trial_days_left"] == settings.trial_days
    db.refresh(user)
    assert user.trial_ends_at is not None


def test_expired_trial_is_paywalled(client, db, paywall):
    user = _user(db, trial_ends_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    passage = _passage(db)
    res = client.get(f"/api/passages/{passage}", headers=_auth(user))
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "subscription_required"
    gen = client.post(
        "/api/generate",
        json={"level": "A2", "topic": "snow", "language": "ja"},
        headers=_auth(user),
    )
    assert gen.status_code == 402
    assert client.get("/api/me", headers=_auth(user)).json()["entitlement"]["status"] == "expired"


def test_past_due_keeps_access(db, paywall):
    user = _user(
        db,
        trial_ends_at=datetime.now(timezone.utc) - timedelta(days=30),
        subscription_status="past_due",
    )
    assert billing.user_entitlement(user).status == "grace"
    assert billing.user_entitlement(user).entitled


def test_webhook_rejects_bad_signature(client, db, paywall):
    res = client.post(
        "/api/billing/webhook",
        content=b"{}",
        headers={"stripe-signature": "t=1,v1=nope"},
    )
    assert res.status_code == 400


def test_webhook_activates_and_cancels(client, db, paywall):
    user = _user(
        db,
        trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1),
        stripe_customer_id="cus_1",
    )
    passage = _passage(db)
    payload, headers = _signed(
        _sub_event("evt_1", "customer.subscription.created", "cus_1", "active")
    )
    res = client.post("/api/billing/webhook", content=payload, headers=headers)
    assert res.status_code == 200 and res.json()["applied"] is True
    db.refresh(user)
    assert user.subscription_status == "active"
    assert user.subscription_plan == "annual"
    assert user.current_period_end is not None
    assert client.get(f"/api/passages/{passage}", headers=_auth(user)).status_code == 200

    again = client.post("/api/billing/webhook", content=payload, headers=headers)
    assert again.json()["applied"] is False
    assert db.query(StripeEventRow).count() == 1

    payload, headers = _signed(
        _sub_event("evt_2", "customer.subscription.deleted", "cus_1", "canceled")
    )
    client.post("/api/billing/webhook", content=payload, headers=headers)
    db.refresh(user)
    assert user.subscription_status == "canceled"
    assert client.get(f"/api/passages/{passage}", headers=_auth(user)).status_code == 402


def test_webhook_links_customer_by_metadata(client, db, paywall):
    user = _user(db)
    payload, headers = _signed(
        _sub_event("evt_3", "customer.subscription.updated", "cus_new", "trialing", user.id)
    )
    client.post("/api/billing/webhook", content=payload, headers=headers)
    db.refresh(user)
    assert user.stripe_customer_id == "cus_new"
    assert user.subscription_status == "trialing"


def test_checkout_session_completed_fetches_subscription(client, db, paywall, monkeypatch):
    user = _user(db)
    sub = _sub_event("x", "x", "cus_9", "active", user.id)["data"]["object"]
    monkeypatch.setattr(billing, "fetch_subscription", lambda _id: sub)
    event = {
        "id": "evt_4",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "customer": "cus_9",
                "client_reference_id": str(user.id),
                "subscription": "sub_1",
            }
        },
    }
    payload, headers = _signed(event)
    client.post("/api/billing/webhook", content=payload, headers=headers)
    db.refresh(user)
    assert user.subscription_status == "active"
    assert user.stripe_customer_id == "cus_9"


def test_checkout_needs_billing_config(client, db, paywall, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    user = _user(db)
    res = client.post("/api/billing/checkout", json={"plan": "monthly"}, headers=_auth(user))
    assert res.status_code == 503


def test_delete_account_removes_everything(client, db, monkeypatch):
    user = _user(db, stripe_subscription_id="sub_x", subscription_status="active")
    passage = _passage(db)
    db.add_all(
        [
            LearnerStarRow(device_id="d", user_id=user.id, language="ja", lemma="雨"),
            FeedbackRow(passage_id=passage, rating="just_right", user_id=user.id),
            GenerationJobRow(id="job1", level="A1", topic="t", language="ja", user_id=user.id),
        ]
    )
    db.commit()
    cancelled = []
    monkeypatch.setattr(billing, "cancel_subscription_now", lambda u: cancelled.append(u.id))
    from app.services import account

    deleted = []
    monkeypatch.setattr(account, "delete_supabase_user", lambda auth_id: deleted.append(auth_id))
    user_id = user.id
    res = client.delete("/api/me", headers=_auth(user))
    assert res.status_code == 200
    db.expire_all()
    assert db.get(UserRow, user_id) is None
    assert db.query(FeedbackRow).filter(FeedbackRow.user_id == user_id).count() == 0
    assert db.query(GenerationJobRow).filter(GenerationJobRow.user_id == user_id).count() == 0
    assert db.query(LearnerStarRow).filter(LearnerStarRow.user_id == user_id).count() == 0
    assert cancelled == [user_id]
    assert len(deleted) == 1


def test_export_and_profile_update(client, db):
    user = _user(db)
    db.add(LearnerStarRow(device_id="d", user_id=user.id, language="ja", lemma="雨", gloss="rain"))
    db.commit()
    data = client.get("/api/me/export", headers=_auth(user)).json()
    assert data["account"]["email"] == "reader@example.com"
    assert data["saved_words"][0]["lemma"] == "雨"
    res = client.patch("/api/me", json={"display_name": "Mira"}, headers=_auth(user))
    assert res.status_code == 200
    assert res.json()["display_name"] == "Mira"
