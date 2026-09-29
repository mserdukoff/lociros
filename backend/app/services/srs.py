from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.db import LearnerCardRow
from app.models.schemas import ReviewCard
from app.services.gloss import resolve_gloss
from app.services.identity import Identity, apply_owner_filter

RATING_QUALITY = {
    "again": 0,
    "hard": 3,
    "good": 4,
    "easy": 5,
}


def upsert_card(
    db: Session,
    identity: Identity,
    *,
    language: str,
    lemma: str,
    gloss: str | None,
    reading: str | None,
    context: str | None,
    passage_id: str | None,
    commit: bool = True,
) -> LearnerCardRow:
    owner_device = identity.device_id or f"user-{identity.user_id}"
    query = apply_owner_filter(db.query(LearnerCardRow), LearnerCardRow, identity)
    row = (
        query.filter(
            LearnerCardRow.language == language,
            LearnerCardRow.lemma == lemma,
        )
        .order_by(LearnerCardRow.id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if row is None:
        row = LearnerCardRow(
            device_id=owner_device,
            user_id=identity.user_id,
            language=language,
            lemma=lemma,
            gloss=gloss,
            reading=reading,
            context=context,
            passage_id=passage_id,
            ease=2.5,
            interval=0,
            reps=0,
            due_at=now,
            created_at=now,
        )
        db.add(row)
    else:
        if gloss:
            row.gloss = gloss
        if reading:
            row.reading = reading
        if context:
            row.context = context
        if passage_id:
            row.passage_id = passage_id
    if commit:
        db.commit()
    return row


def due_cards(
    db: Session, identity: Identity, language: str, limit: int = 20
) -> list[ReviewCard]:
    now = datetime.now(timezone.utc)
    query = apply_owner_filter(db.query(LearnerCardRow), LearnerCardRow, identity)
    rows = (
        query.filter(
            LearnerCardRow.language == language,
            LearnerCardRow.due_at <= now,
        )
        .order_by(LearnerCardRow.due_at.asc())
        .limit(limit)
        .all()
    )
    changed = False
    for r in rows:
        if not r.gloss:
            gloss = resolve_gloss(r.lemma, r.language)
            if gloss:
                r.gloss = gloss
                changed = True
    if changed:
        db.commit()
    return [
        ReviewCard(
            id=r.id,
            lemma=r.lemma,
            gloss=r.gloss,
            reading=r.reading,
            context=r.context,
            language=r.language,  # type: ignore[arg-type]
            due_at=r.due_at,
        )
        for r in rows
    ]


def due_count(db: Session, identity: Identity, language: str) -> int:
    now = datetime.now(timezone.utc)
    query = apply_owner_filter(db.query(LearnerCardRow), LearnerCardRow, identity)
    return (
        query.filter(
            LearnerCardRow.language == language,
            LearnerCardRow.due_at <= now,
        ).count()
    )


def review_card(db: Session, identity: Identity, card_id: int, rating: str) -> ReviewCard:
    query = apply_owner_filter(db.query(LearnerCardRow), LearnerCardRow, identity)
    row = query.filter(LearnerCardRow.id == card_id).one_or_none()
    if row is None:
        raise KeyError("card")
    quality = RATING_QUALITY.get(rating, 4)
    now = datetime.now(timezone.utc)
    if quality < 3:
        row.reps = 0
        row.interval = 0
        row.due_at = now + timedelta(minutes=10)
    else:
        if row.reps == 0:
            row.interval = 1
        elif row.reps == 1:
            row.interval = 6
        else:
            row.interval = max(1, round(row.interval * row.ease))
        row.reps += 1
        row.ease = max(1.3, row.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
        if rating == "hard":
            row.interval = max(1, round(row.interval * 0.8))
        elif rating == "easy":
            row.interval = max(1, round(row.interval * 1.3))
        row.due_at = now + timedelta(days=row.interval)
    if not row.gloss:
        row.gloss = resolve_gloss(row.lemma, row.language)
    db.commit()
    return ReviewCard(
        id=row.id,
        lemma=row.lemma,
        gloss=row.gloss,
        reading=row.reading,
        context=row.context,
        language=row.language,  # type: ignore[arg-type]
        due_at=row.due_at,
    )


def export_rows(
    db: Session, identity: Identity, language: str
) -> list[dict[str, str]]:
    query = apply_owner_filter(db.query(LearnerCardRow), LearnerCardRow, identity)
    rows = (
        query.filter(LearnerCardRow.language == language)
        .order_by(LearnerCardRow.created_at.desc())
        .all()
    )
    out: list[dict[str, str]] = []
    for row in rows:
        out.append(
            {
                "lemma": row.lemma,
                "reading": row.reading or "",
                "gloss": row.gloss or "",
                "context": row.context or "",
                "language": row.language,
            }
        )
    if not out:
        from app.models.db import LearnerStarRow

        stars = apply_owner_filter(db.query(LearnerStarRow), LearnerStarRow, identity)
        for row in stars.filter(LearnerStarRow.language == language).all():
            out.append(
                {
                    "lemma": row.lemma,
                    "reading": row.reading or "",
                    "gloss": row.gloss or "",
                    "context": row.context or "",
                    "language": row.language,
                }
            )
    return out
