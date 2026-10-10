from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.db import (
    SHELF_QUARANTINE,
    Base,
    GenerationJobRow,
    SessionLocal,
    UserRow,
    engine,
)
from app.models.schemas import Calibration
from app.services import rate_limit
from app.services.auth import issue_token
from app.services.generate import _persist
from app.services.generation_jobs import (
    STATUS_FAILED,
    STATUS_RUNNING,
    reclaim_stale_jobs,
)

DEVICE = {"X-Device-Id": "device-sec-12345"}


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
    # No context manager: skip lifespan so init_db and the job workers never start.
    return TestClient(app)


def _quarantined(db) -> str:
    row = _persist(
        db,
        language="ja",
        level="A1",
        topic="fail",
        genre="daily_life",
        title="失敗",
        text="私は学生です。",
        tokens=[],
        calibration=Calibration(
            passed=False,
            attempts=2,
            overlevel_lemma_rate=0.4,
            subordinate_rate=0,
            forbidden_case_rate=0,
            forbidden_tense_rate=0,
            forbidden_pos_rate=0,
            flags=["ja:te_iru (いる)"],
            warnings=[],
        ),
    )
    assert row.shelf_status == SHELF_QUARANTINE
    return row.id


def test_legacy_auth_is_off_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    assert client.post("/api/auth/magic", json={"email": "a@b.co"}).status_code == 404
    assert client.get("/api/auth/magic/callback?token=x").status_code == 404
    assert client.get("/api/auth/google", follow_redirects=False).status_code == 404
    assert client.get("/api/auth/google/callback?code=x").status_code == 404


def test_magic_link_is_single_use(client, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")
    res = client.post("/api/auth/magic", json={"email": "reader@example.com"})
    assert res.status_code == 200
    token = res.json()["link"].split("token=")[1]
    first = client.get(f"/api/auth/magic/callback?token={token}", follow_redirects=False)
    assert first.status_code in {302, 307}
    second = client.get(f"/api/auth/magic/callback?token={token}", follow_redirects=False)
    assert second.status_code == 400


def test_generate_requires_identity(client):
    res = client.post("/api/generate", json={"level": "A2", "topic": "rain", "language": "ja"})
    assert res.status_code == 401


def test_generate_applies_monthly_cap_without_require_auth(client, monkeypatch):
    monkeypatch.setattr(settings, "require_auth_enabled", False)
    monkeypatch.setattr(settings, "generate_monthly_cap", 1)
    body = {"level": "A2", "language": "ja"}
    first = client.post("/api/generate", json={**body, "topic": "rain"}, headers=DEVICE)
    assert first.status_code == 202
    second = client.post("/api/generate", json={**body, "topic": "snow"}, headers=DEVICE)
    assert second.status_code == 429


def test_translation_requires_identity(client, db):
    assert client.get("/api/passages/nope/translation").status_code == 401


def test_lab_flag_is_admin_only(client, db, monkeypatch):
    passage_id = _quarantined(db)
    monkeypatch.setattr(settings, "admin_emails", "admin@example.com")
    assert client.get(f"/api/passages/{passage_id}?lab=1").status_code == 404

    reader = UserRow(email="reader@example.com")
    admin = UserRow(email="admin@example.com")
    db.add_all([reader, admin])
    db.commit()

    as_reader = {"Authorization": f"Bearer {issue_token(reader.id)}"}
    assert client.get(f"/api/passages/{passage_id}?lab=1", headers=as_reader).status_code == 404

    as_admin = {"Authorization": f"Bearer {issue_token(admin.id)}"}
    res = client.get(f"/api/passages/{passage_id}?lab=1", headers=as_admin)
    assert res.status_code == 200
    assert client.get(f"/api/passages/{passage_id}", headers=as_admin).status_code == 404


def test_stale_running_jobs_are_failed(db):
    now = datetime.now(timezone.utc)
    db.add_all(
        [
            GenerationJobRow(
                id="stale",
                status=STATUS_RUNNING,
                level="A2",
                topic="t",
                language="ja",
                device_id="device-sec-12345",
                created_at=now - timedelta(minutes=30),
                started_at=now - timedelta(minutes=20),
            ),
            GenerationJobRow(
                id="fresh",
                status=STATUS_RUNNING,
                level="A2",
                topic="t2",
                language="ja",
                device_id="device-sec-12345",
                created_at=now - timedelta(minutes=2),
                started_at=now - timedelta(minutes=1),
            ),
        ]
    )
    db.commit()
    assert reclaim_stale_jobs(db, now) == 1
    db.expire_all()
    assert db.get(GenerationJobRow, "stale").status == STATUS_FAILED
    assert db.get(GenerationJobRow, "fresh").status == STATUS_RUNNING


def test_rate_limit_window():
    rate_limit.reset()
    assert all(rate_limit.hit("k", 3, 60) for _ in range(3))
    assert not rate_limit.hit("k", 3, 60)
    assert rate_limit.hit("other", 3, 60)


def test_events_are_rate_limited(client):
    body = {"kind": "landing_view"}
    codes = [client.post("/api/events", json=body, headers=DEVICE).status_code for _ in range(61)]
    assert codes[:60] == [200] * 60
    assert codes[60] == 429


def test_placement_choose_sets_level(client):
    body = {"language": "ja", "level": "B1"}
    assert client.post("/api/placement/choose", json=body).status_code == 400
    res = client.post("/api/placement/choose", json=body, headers=DEVICE)
    assert res.status_code == 200
    assert res.json()["level"] == "B1"
    library = client.get("/api/library?language=ja", headers=DEVICE).json()
    assert library["placed"] is True
    assert library["placement"] == "B1"
    bad = client.post("/api/placement/choose", json={"language": "ja", "level": "C2"}, headers=DEVICE)
    assert bad.status_code == 422


def _keys(language: str, level: str, right: bool = True) -> list[int]:
    from app.services.placement import _LADDER

    keys = [q[2] for q in _LADDER[language][level]["questions"]]
    return keys if right else [(k + 1) % 3 for k in keys]


def test_placement_ladder_saves_only_when_done(client):
    one = {"language": "ja", "stages": [{"level": "A1", "answers": _keys("ja", "A1")}]}
    res = client.post("/api/placement", json=one, headers=DEVICE).json()
    assert res["done"] is False and res["next_level"] == "A2" and res["level"] is None
    assert client.get("/api/library?language=ja", headers=DEVICE).json()["placed"] is False

    assert client.get("/api/placement?language=ja&level=A2").json()["level"] == "A2"
    assert client.get("/api/placement?language=ja&level=C1").status_code == 400

    full = {
        "language": "ja",
        "stages": [
            {"level": "A1", "answers": _keys("ja", "A1")},
            {"level": "A2", "answers": _keys("ja", "A2", right=False)},
        ],
    }
    res = client.post("/api/placement", json=full, headers=DEVICE).json()
    assert res["done"] is True and res["level"] == "A1"
    assert client.get("/api/library?language=ja", headers=DEVICE).json()["placement"] == "A1"

    skip = {"language": "ja", "stages": [{"level": "B2", "answers": _keys("ja", "B2")}]}
    assert client.post("/api/placement", json=skip, headers=DEVICE).status_code == 400


def test_old_single_passage_submit_still_places(client):
    res = client.post(
        "/api/placement", json={"language": "ru", "answers": _keys("ru", "A1")}, headers=DEVICE
    ).json()
    assert res["done"] is True and res["level"] == "A2"


def test_recheck_after_a_long_break(client, db):
    from app.models.db import LearnerRow

    client.post("/api/placement/choose", json={"language": "it", "level": "B1"}, headers=DEVICE)
    assert client.get("/api/library?language=it", headers=DEVICE).json()["recheck_from"] is None

    learner = db.query(LearnerRow).filter_by(device_id=DEVICE["X-Device-Id"], language="it").one()
    learner.updated_at = datetime.now(timezone.utc) - timedelta(days=45)
    db.commit()
    assert client.get("/api/library?language=it", headers=DEVICE).json()["recheck_from"] == "B1"

    recheck = {
        "language": "it",
        "start": "B1",
        "stages": [
            {"level": "B1", "answers": _keys("it", "B1", right=False)},
            {"level": "A2", "answers": _keys("it", "A2")},
        ],
    }
    res = client.post("/api/placement", json=recheck, headers=DEVICE).json()
    assert res["level"] == "A2"
    library = client.get("/api/library?language=it", headers=DEVICE).json()
    assert library["placement"] == "A2" and library["recheck_from"] is None


def test_keep_level_dismisses_the_recheck(client, db):
    from app.models.db import LearnerRow

    assert client.post("/api/placement/keep", json={"language": "ja"}, headers=DEVICE).status_code == 404
    client.post("/api/placement/choose", json={"language": "ja", "level": "B2"}, headers=DEVICE)
    learner = db.query(LearnerRow).filter_by(device_id=DEVICE["X-Device-Id"], language="ja").one()
    learner.updated_at = datetime.now(timezone.utc) - timedelta(days=60)
    db.commit()
    assert client.get("/api/library?language=ja", headers=DEVICE).json()["recheck_from"] == "B2"
    res = client.post("/api/placement/keep", json={"language": "ja"}, headers=DEVICE)
    assert res.json() == {"ok": True, "level": "B2"}
    assert client.get("/api/library?language=ja", headers=DEVICE).json()["recheck_from"] is None
