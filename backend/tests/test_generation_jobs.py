import pytest
from fastapi import HTTPException

from app.models.db import Base, GenerationJobRow, SessionLocal, engine
from app.models.schemas import Calibration, PassageResponse
from app.services.generation_jobs import (
    STATUS_COMPLETED,
    STATUS_PENDING,
    STATUS_RUNNING,
    claim_next_job,
    enqueue_generation,
    job_owned_by,
    _process_job,
)
from app.services.identity import Identity


@pytest.fixture()
def db():
    assert engine.url.get_backend_name() == "sqlite", "refusing to drop tables outside SQLite"
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_enqueue_and_claim(db):
    identity = Identity(user_id=None, device_id="device-abc12345")
    job = enqueue_generation(
        db,
        level="A2",
        topic="morning market",
        genre="daily_life",
        language="ja",
        identity=identity,
        known_lemmas=["本"],
    )
    assert job.status == STATUS_PENDING

    claimed = claim_next_job(db)
    assert claimed is not None
    assert claimed.id == job.id
    assert claimed.status == STATUS_RUNNING

    again = claim_next_job(db)
    assert again is None


def test_pending_limit(db):
    identity = Identity(user_id=None, device_id="device-abc12345")
    for _ in range(3):
        enqueue_generation(
            db,
            level="A2",
            topic=f"topic {_}",
            genre=None,
            language="ja",
            identity=identity,
            known_lemmas=None,
        )
    with pytest.raises(HTTPException) as exc:
        enqueue_generation(
            db,
            level="A2",
            topic="one too many",
            genre=None,
            language="ja",
            identity=identity,
            known_lemmas=None,
        )
    assert exc.value.status_code == 429


def test_process_job_completes(monkeypatch, db):
    identity = Identity(user_id=None, device_id="device-abc12345")
    job = enqueue_generation(
        db,
        level="A2",
        topic="quiet cafe",
        genre=None,
        language="ja",
        identity=identity,
        known_lemmas=None,
    )
    claimed = claim_next_job(db)
    assert claimed is not None
    assert claimed.id == job.id

    fake = PassageResponse(
        id="passage-1",
        language="ja",
        level="A2",
        topic="quiet cafe",
        genre=None,
        title="Test",
        text="text",
        tokens=[],
        calibration=Calibration(
            passed=True,
            attempts=1,
            overlevel_lemma_rate=0.0,
            subordinate_rate=0.0,
            forbidden_case_rate=0.0,
            forbidden_tense_rate=0.0,
            forbidden_pos_rate=0.0,
            flags=[],
            warnings=[],
        ),
        word_count=1,
        created_at=job.created_at,
    )
    monkeypatch.setattr(
        "app.services.generation_jobs.generate_passage",
        lambda *a, **k: fake,
    )
    _process_job(claimed.id)

    db.expire_all()
    row = db.get(GenerationJobRow, job.id)
    assert row is not None
    assert row.status == STATUS_COMPLETED
    assert row.passage_id == "passage-1"


def test_job_owned_by_device_or_user(db):
    job = GenerationJobRow(
        id="j1",
        status=STATUS_PENDING,
        level="A2",
        topic="t",
        genre=None,
        language="ja",
        device_id="device-abc12345",
        user_id=7,
    )
    assert job_owned_by(job, Identity(user_id=7, device_id=None))
    assert job_owned_by(job, Identity(user_id=None, device_id="device-abc12345"))
    assert not job_owned_by(job, Identity(user_id=99, device_id="other-device9"))
