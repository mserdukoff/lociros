import threading
import time
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.models.db import Base, GenerationJobRow, SessionLocal, engine
from app.services import generate, generation_jobs, llm
from app.services.generation_jobs import (
    STATUS_PENDING,
    claim_next_job,
    enqueue_generation,
    requeue_in_flight,
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


def test_no_db_connection_held_during_llm_call(monkeypatch, db):
    seen = {}

    def fake_llm(*a, **k):
        seen["in_transaction"] = db.in_transaction()
        seen["checked_out"] = engine.pool.checkedout()
        raise RuntimeError("stop after the LLM call")

    monkeypatch.setattr(generate, "generate_passage_text", fake_llm)
    with pytest.raises(RuntimeError):
        generate.generate_passage(db, "A2", "quiet cafe", None, "ja")
    assert seen == {"in_transaction": False, "checked_out": 0}


def test_requeue_in_flight_returns_jobs_to_queue(db):
    identity = Identity(user_id=None, device_id="device-abc12345")
    job = enqueue_generation(
        db,
        level="A2",
        topic="night train",
        genre=None,
        language="ja",
        identity=identity,
        known_lemmas=None,
    )
    claimed = claim_next_job(db)
    assert claimed is not None and claimed.id == job.id
    generation_jobs._in_flight.add(job.id)
    try:
        assert requeue_in_flight() == 1
    finally:
        generation_jobs._in_flight.discard(job.id)
    db.expire_all()
    row = db.get(GenerationJobRow, job.id)
    assert row.status == STATUS_PENDING
    assert row.started_at is None


def test_prompt_lists_every_allowed_word():
    prompt = llm.build_passage_prompt("A1", "a cat", language="it")
    allowed = llm.allowed_words("A1", "it").split(", ")
    assert len(allowed) > 300
    assert all(w in prompt for w in allowed[:50])
    assert "Previous draft" not in prompt


def test_rewrite_edits_the_failed_draft():
    prompt = llm.build_passage_prompt(
        "A2",
        "a cat",
        language="ru",
        correction_flags=["case:ins (хлебом)", "lemma:прилавок=unknown"],
        previous_text="Я иду на рынок за хлебом.",
    )
    assert "Previous draft:\nЯ иду на рынок за хлебом." in prompt
    assert "replace each with an allowed word, or rephrase: прилавок" in prompt
    assert "case:ins (хлебом)" in prompt


def test_unparseable_passage_json_is_retried_once(monkeypatch):
    replies = iter(['{"title": "T", "text": "cut off', '{"title": "T", "text": "Ciao.", "translation": "Hi."}'])
    monkeypatch.setattr(llm, "_complete", lambda *a, **k: next(replies))
    assert llm.generate_passage_text("A1", "hi", language="it") == ("T", "Ciao.", "Hi.")


def test_routing_body(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "a/primary")
    monkeypatch.setattr(settings, "llm_fallback_models", "b/one, a/primary,c/two")
    monkeypatch.setattr(settings, "llm_provider_sort", "throughput")
    monkeypatch.setattr(settings, "llm_reasoning_effort", "")
    assert llm.routing_body() == {
        "provider": {"sort": "throughput"},
        "models": ["a/primary", "b/one", "c/two"],
    }
    monkeypatch.setattr(settings, "llm_fallback_models", "")
    monkeypatch.setattr(settings, "llm_provider_sort", "")
    assert llm.routing_body() == {}


class _StalledStream:
    """Sends nothing until closed, like OpenRouter holding a busy request open."""

    def __init__(self):
        self._closed = threading.Event()
        self.response = SimpleNamespace(close=self._closed.set)

    def __iter__(self):
        self._closed.wait(5)
        raise ConnectionError("connection closed")

    def close(self):
        self._closed.set()


def test_llm_call_has_hard_deadline(monkeypatch):
    fake = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=lambda **kw: _StalledStream())
        )
    )
    monkeypatch.setattr(llm, "_client", lambda: fake)
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        llm._complete("hi", temperature=0, timeout=0.2)
    assert time.monotonic() - started < 2


def test_llm_stream_joins_content_and_records_usage(monkeypatch):
    chunks = [
        SimpleNamespace(model="m", usage=None, choices=[SimpleNamespace(delta=SimpleNamespace(content='{"a"'))]),
        SimpleNamespace(model="m", usage=None, choices=[SimpleNamespace(delta=SimpleNamespace(content=": 1}"))]),
        SimpleNamespace(model="m", usage=SimpleNamespace(prompt_tokens=3, completion_tokens=4), choices=[]),
    ]

    class Stream(list):
        response = SimpleNamespace(close=lambda: None)

        def close(self):
            pass

    fake = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kw: Stream(chunks)))
    )
    recorded = []
    monkeypatch.setattr(llm, "_client", lambda: fake)
    monkeypatch.setattr(llm, "record_usage", recorded.append)
    assert llm._complete("hi", temperature=0, timeout=5, json_mode=True) == '{"a": 1}'
    assert recorded[0].usage.completion_tokens == 4
