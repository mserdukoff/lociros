"""Background generation jobs — decouple long LLM work from HTTP workers."""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db import GenerationJobRow, SessionLocal
from app.models.schemas import GenerateJobResponse, PassageResponse
from app.services.generate import find_cached_passage, generate_passage, get_passage
from app.services.identity import Identity

logger = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
STALE_RUNNING_SECONDS = 600
RECLAIM_EVERY_SECONDS = 60
_last_reclaim = float("-inf")
_reclaim_lock = threading.Lock()

_stop = threading.Event()
_threads: list[threading.Thread] = []


def _is_postgres() -> bool:
    return settings.sqlalchemy_url().startswith("postgresql")


def pending_count(db: Session, identity: Identity) -> int:
    filters = [GenerationJobRow.status.in_([STATUS_PENDING, STATUS_RUNNING])]
    owner = []
    if identity.user_id is not None:
        owner.append(GenerationJobRow.user_id == identity.user_id)
    if identity.device_id:
        owner.append(GenerationJobRow.device_id == identity.device_id)
    if not owner:
        return 0
    return db.query(GenerationJobRow).filter(*filters, or_(*owner)).count()


def enqueue_generation(
    db: Session,
    *,
    level: str,
    topic: str,
    genre: str | None,
    language: str,
    identity: Identity,
    known_lemmas: list[str] | None,
    reuse_lemmas: list[str] | None = None,
) -> GenerationJobRow:
    if pending_count(db, identity) >= settings.generate_max_pending:
        raise HTTPException(
            status_code=429,
            detail="Too many passages generating. Wait for one to finish.",
        )
    row = GenerationJobRow(
        id=str(uuid.uuid4()),
        status=STATUS_PENDING,
        level=level,
        topic=topic,
        genre=genre,
        language=language,
        known_lemmas_json=_lemma_payload(known_lemmas, reuse_lemmas),
        device_id=identity.device_id,
        user_id=identity.user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _lemma_payload(
    known_lemmas: list[str] | None,
    reuse_lemmas: list[str] | None,
) -> str | None:
    if reuse_lemmas:
        return json.dumps(
            {"known": known_lemmas or [], "reuse": reuse_lemmas},
            ensure_ascii=False,
        )
    if known_lemmas:
        return json.dumps(known_lemmas, ensure_ascii=False)
    return None


def _lemma_lists(raw: str | None) -> tuple[list[str] | None, list[str] | None]:
    if not raw:
        return None, None
    parsed = json.loads(raw)
    if isinstance(parsed, dict):
        known = parsed.get("known") or None
        reuse = parsed.get("reuse") or None
        return known, reuse
    if isinstance(parsed, list):
        return parsed, None
    return None, None


def reclaim_stale_jobs(db: Session, now: datetime | None = None) -> int:
    """Fail jobs left `running` by a worker that died mid-generation."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=STALE_RUNNING_SECONDS)
    count = (
        db.query(GenerationJobRow)
        .filter(
            GenerationJobRow.status == STATUS_RUNNING,
            GenerationJobRow.started_at < cutoff,
        )
        .update(
            {
                GenerationJobRow.status: STATUS_FAILED,
                GenerationJobRow.error: "Generation timed out. Try again.",
                GenerationJobRow.finished_at: now,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    if count:
        logger.warning("Marked %s stale generation job(s) as failed", count)
    return count


def _maybe_reclaim(db: Session, now: datetime) -> None:
    global _last_reclaim
    tick = time.monotonic()
    with _reclaim_lock:
        if tick - _last_reclaim < RECLAIM_EVERY_SECONDS:
            return
        _last_reclaim = tick
    reclaim_stale_jobs(db, now)


def claim_next_job(db: Session) -> GenerationJobRow | None:
    now = datetime.now(timezone.utc)
    _maybe_reclaim(db, now)
    if _is_postgres():
        row = db.execute(
            text(
                """
                UPDATE generation_jobs
                SET status = :running, started_at = :now
                WHERE id = (
                    SELECT id FROM generation_jobs
                    WHERE status = :pending
                    ORDER BY created_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                RETURNING id
                """
            ),
            {"running": STATUS_RUNNING, "pending": STATUS_PENDING, "now": now},
        ).first()
        if row is None:
            db.rollback()
            return None
        job_id = row[0]
        db.commit()
        return db.get(GenerationJobRow, job_id)

    job = (
        db.query(GenerationJobRow)
        .filter(GenerationJobRow.status == STATUS_PENDING)
        .order_by(GenerationJobRow.created_at.asc())
        .with_for_update()
        .first()
    )
    if job is None:
        db.rollback()
        return None
    job.status = STATUS_RUNNING
    job.started_at = now
    db.commit()
    db.refresh(job)
    return job


def _process_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(GenerationJobRow, job_id)
        if job is None or job.status != STATUS_RUNNING:
            return
        known, reuse = _lemma_lists(job.known_lemmas_json)
        cached = find_cached_passage(
            db, job.level, job.topic, job.genre, job.language
        )
        if cached is not None:
            job.status = STATUS_COMPLETED
            job.passage_id = cached.id
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            return
        from app.services.llm_usage import charged_to

        account = (
            f"user:{job.user_id}"
            if job.user_id
            else f"device:{job.device_id}"
            if job.device_id
            else None
        )
        with charged_to(account):
            passage = generate_passage(
                db,
                job.level,
                job.topic,
                job.genre,
                job.language,
                known_lemmas=known,
                reuse_lemmas=reuse,
            )
        job.status = STATUS_COMPLETED
        job.passage_id = passage.id
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except RuntimeError as exc:
        db.rollback()
        job = db.get(GenerationJobRow, job_id)
        if job is not None:
            job.status = STATUS_FAILED
            job.error = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    except Exception:
        logger.exception("Generation job %s failed", job_id)
        db.rollback()
        job = db.get(GenerationJobRow, job_id)
        if job is not None:
            job.status = STATUS_FAILED
            job.error = "Generation failed. Try again in a moment."
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def _worker_loop() -> None:
    while not _stop.is_set():
        db = SessionLocal()
        try:
            job = claim_next_job(db)
        finally:
            db.close()
        if job is None:
            _stop.wait(0.5)
            continue
        _process_job(job.id)


def start_workers(count: int | None = None) -> None:
    global _threads
    n = settings.generate_workers if count is None else count
    if n <= 0:
        logger.info("Generation workers disabled (GENERATE_WORKERS=%s)", n)
        return
    _stop.clear()
    _threads = []
    for i in range(n):
        t = threading.Thread(
            target=_worker_loop, name=f"gen-worker-{i}", daemon=True
        )
        t.start()
        _threads.append(t)
    logger.info("Started %s generation worker thread(s)", n)


def stop_workers() -> None:
    _stop.set()
    for t in _threads:
        t.join(timeout=2.0)
    _threads.clear()


def job_owned_by(job: GenerationJobRow, identity: Identity) -> bool:
    if identity.user_id is not None and job.user_id == identity.user_id:
        return True
    if identity.device_id and job.device_id == identity.device_id:
        return True
    return False


def job_to_response(db: Session, job: GenerationJobRow) -> GenerateJobResponse:
    passage: PassageResponse | None = None
    if job.status == STATUS_COMPLETED and job.passage_id:
        passage = get_passage(db, job.passage_id)
    return GenerateJobResponse(
        job_id=job.id,
        status=job.status,  # type: ignore[arg-type]
        passage=passage,
        error=job.error,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


def run_forever() -> None:
    """Dedicated worker process entrypoint."""
    from app.models.db import init_db

    init_db()
    start_workers()
    logger.info("Generation worker process running")
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        stop_workers()
