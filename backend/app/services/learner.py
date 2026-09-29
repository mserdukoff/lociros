from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.db import (
    SHELF_PUBLIC,
    LearnerLemmaRow,
    LearnerReadRow,
    LearnerRow,
    LearnerStarRow,
    LearnerTapRow,
    PassageRow,
)
from app.models.schemas import StarredWord, Token
from app.services.gloss import resolve_gloss
from app.services.identity import Identity, apply_owner_filter, valid_device_id
from app.services.validator import CONTENT_POS as RU_CONTENT
from app.services.validator_ja import CONTENT_POS as JA_CONTENT
from app.services.validator_it import CONTENT_POS as IT_CONTENT
from app.services.validator_ar import CONTENT_POS as AR_CONTENT

LEVELS = ("A1", "A2", "B1", "B2")
DEFAULT_LEVEL = "A2"
PLACEMENT_STREAK = 3

__all__ = [
    "LEVELS",
    "DEFAULT_LEVEL",
    "valid_device_id",
    "content_tokens",
    "unique_content_lemmas",
    "lemma_token_stats",
    "tokens_from_row",
    "calibration_passed",
    "bump_level",
    "apply_placement",
    "get_learner",
    "get_or_create_learner",
    "seen_lemmas",
    "read_ids",
    "ingest_passage",
    "starred_lemmas",
    "list_stars",
    "star_lemma",
    "unstar_lemma",
    "pick_next_id",
]


def content_tokens(tokens: list[Token], language: str) -> list[Token]:
    if language == "ja":
        allowed = JA_CONTENT
    elif language == "it":
        allowed = IT_CONTENT
    elif language == "ar":
        allowed = AR_CONTENT
    else:
        allowed = RU_CONTENT
    out: list[Token] = []
    for tok in tokens:
        if not tok.is_word or not tok.lemma or not tok.morph:
            continue
        if tok.morph.pos in allowed:
            out.append(tok)
    return out


def unique_content_lemmas(tokens: list[Token], language: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for tok in content_tokens(tokens, language):
        lemma = tok.lemma or ""
        if lemma and lemma not in seen:
            seen.add(lemma)
            ordered.append(lemma)
    return ordered


def lemma_token_stats(
    tokens: list[Token],
    language: str,
    seen: set[str],
) -> tuple[int, int]:
    """Count content-word tokens as new vs already seen (not unique lemmas)."""
    new = 0
    recycled = 0
    for tok in content_tokens(tokens, language):
        lemma = tok.lemma or ""
        if lemma in seen:
            recycled += 1
        else:
            new += 1
    return new, recycled


def tokens_from_row(row: PassageRow) -> list[Token]:
    return [Token.model_validate(t) for t in json.loads(row.tokens_json)]


def calibration_passed(row: PassageRow) -> bool:
    try:
        data = json.loads(row.calibration_json)
        return bool(data.get("passed"))
    except Exception:
        return False


def bump_level(level: str, rating: str) -> str:
    idx = LEVELS.index(level) if level in LEVELS else LEVELS.index(DEFAULT_LEVEL)
    if rating == "too_easy":
        idx = min(idx + 1, len(LEVELS) - 1)
    elif rating == "too_hard":
        idx = max(idx - 1, 0)
    return LEVELS[idx]


def apply_placement(learner: LearnerRow, rating: str) -> str:
    """Require three consecutive same-direction ratings before a band change."""
    up = getattr(learner, "consecutive_up", 0) or 0
    down = getattr(learner, "consecutive_down", 0) or 0
    if rating == "too_easy":
        up += 1
        down = 0
        if up >= PLACEMENT_STREAK:
            learner.level = bump_level(learner.level, "too_easy")
            up = 0
    elif rating == "too_hard":
        down += 1
        up = 0
        if down >= PLACEMENT_STREAK:
            learner.level = bump_level(learner.level, "too_hard")
            down = 0
    else:
        up = 0
        down = 0
    learner.consecutive_up = up
    learner.consecutive_down = down
    learner.updated_at = datetime.now(timezone.utc)
    return learner.level


def set_placed_level(learner: LearnerRow, level: str) -> str:
    if level not in LEVELS:
        level = DEFAULT_LEVEL
    learner.level = level
    learner.placed = 1
    learner.consecutive_up = 0
    learner.consecutive_down = 0
    learner.updated_at = datetime.now(timezone.utc)
    return learner.level


def _guest_identity(device_id: str) -> Identity:
    return Identity(user_id=None, device_id=device_id)


def _as_identity(identity: Identity | str, device_id: str | None = None) -> Identity:
    if isinstance(identity, Identity):
        return identity
    return Identity(user_id=None, device_id=identity or device_id)


def get_learner(
    db: Session,
    identity: Identity | str,
    language: str,
    device_id: str | None = None,
) -> LearnerRow | None:
    ident = _as_identity(identity, device_id)
    query = apply_owner_filter(db.query(LearnerRow), LearnerRow, ident)
    return (
        query.filter(LearnerRow.language == language).order_by(LearnerRow.id).first()
    )


def get_or_create_learner(
    db: Session,
    identity: Identity | str,
    language: str,
    device_id: str | None = None,
) -> LearnerRow:
    ident = _as_identity(identity, device_id)
    row = get_learner(db, ident, language)
    if row is not None:
        if ident.user_id is not None and row.user_id is None:
            row.user_id = ident.user_id
        return row
    row = LearnerRow(
        device_id=ident.device_id or f"user-{ident.user_id}",
        user_id=ident.user_id,
        language=language,
        level=DEFAULT_LEVEL,
        consecutive_up=0,
        consecutive_down=0,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        row = get_learner(db, ident, language)
        if row is None:
            raise
    return row


def seen_lemmas(
    db: Session,
    identity: Identity | str,
    language: str,
    device_id: str | None = None,
) -> set[str]:
    ident = _as_identity(identity, device_id)
    query = apply_owner_filter(db.query(LearnerLemmaRow.lemma), LearnerLemmaRow, ident)
    rows = query.filter(LearnerLemmaRow.language == language).all()
    return {r[0] for r in rows}


def record_tap(
    db: Session,
    identity: Identity | str,
    language: str,
    lemma: str,
    device_id: str | None = None,
) -> None:
    ident = _as_identity(identity, device_id)
    if not ident.can_persist:
        return
    lemma = lemma.strip()
    if not lemma:
        return
    owner_device = ident.device_id or f"user-{ident.user_id}"
    query = apply_owner_filter(db.query(LearnerTapRow), LearnerTapRow, ident)
    row = (
        query.filter(
            LearnerTapRow.language == language,
            LearnerTapRow.lemma == lemma,
        )
        .order_by(LearnerTapRow.id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(
            LearnerTapRow(
                device_id=owner_device,
                user_id=ident.user_id,
                language=language,
                lemma=lemma,
                seen_at=now,
            )
        )
    else:
        row.seen_at = now
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def recent_taps(
    db: Session,
    identity: Identity | str,
    language: str,
    device_id: str | None = None,
    limit: int = 12,
) -> list[str]:
    ident = _as_identity(identity, device_id)
    if not ident.can_persist:
        return []
    query = apply_owner_filter(db.query(LearnerTapRow), LearnerTapRow, ident)
    rows = (
        query.filter(LearnerTapRow.language == language)
        .order_by(LearnerTapRow.seen_at.desc())
        .limit(limit)
        .all()
    )
    return [row.lemma for row in rows]


def read_ids(
    db: Session,
    identity: Identity | str,
    device_id: str | None = None,
) -> set[str]:
    ident = _as_identity(identity, device_id)
    query = apply_owner_filter(db.query(LearnerReadRow.passage_id), LearnerReadRow, ident)
    rows = query.all()
    return {r[0] for r in rows}


def ingest_passage(
    db: Session,
    identity: Identity | str,
    language: str,
    passage_id: str,
    tokens: list[Token],
    device_id: str | None = None,
) -> None:
    ident = _as_identity(identity, device_id)
    now = datetime.now(timezone.utc)
    existing = seen_lemmas(db, ident, language)
    owner_device = ident.device_id or f"user-{ident.user_id}"
    for lemma in unique_content_lemmas(tokens, language):
        if lemma in existing:
            continue
        db.add(
            LearnerLemmaRow(
                device_id=owner_device,
                user_id=ident.user_id,
                language=language,
                lemma=lemma,
                created_at=now,
            )
        )
        existing.add(lemma)
    already_q = apply_owner_filter(db.query(LearnerReadRow), LearnerReadRow, ident)
    already = (
        already_q.filter(LearnerReadRow.passage_id == passage_id)
        .order_by(LearnerReadRow.id)
        .first()
    )
    if already is None:
        db.add(
            LearnerReadRow(
                device_id=owner_device,
                user_id=ident.user_id,
                passage_id=passage_id,
                created_at=now,
            )
        )


def _level_priority(placement: str) -> list[str]:
    if placement not in LEVELS:
        placement = DEFAULT_LEVEL
    idx = LEVELS.index(placement)
    order = [placement]
    if idx + 1 < len(LEVELS):
        order.append(LEVELS[idx + 1])
    if idx - 1 >= 0:
        order.append(LEVELS[idx - 1])
    for lv in LEVELS:
        if lv not in order:
            order.append(lv)
    return order


def starred_lemmas(
    db: Session,
    identity: Identity | str,
    language: str,
    device_id: str | None = None,
) -> set[str]:
    ident = _as_identity(identity, device_id)
    query = apply_owner_filter(db.query(LearnerStarRow.lemma), LearnerStarRow, ident)
    rows = query.filter(LearnerStarRow.language == language).all()
    return {r[0] for r in rows}


def list_stars(
    db: Session,
    identity: Identity | str,
    language: str,
    device_id: str | None = None,
) -> list[StarredWord]:
    ident = _as_identity(identity, device_id)
    query = apply_owner_filter(db.query(LearnerStarRow), LearnerStarRow, ident)
    rows = (
        query.filter(LearnerStarRow.language == language)
        .order_by(LearnerStarRow.created_at.desc())
        .all()
    )
    passage_ids = [r.passage_id for r in rows if r.passage_id]
    titles: dict[str, str] = {}
    if passage_ids:
        for row in (
            db.query(PassageRow.id, PassageRow.title)
            .filter(PassageRow.id.in_(passage_ids))
            .all()
        ):
            titles[row[0]] = row[1]
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
        StarredWord(
            lemma=r.lemma,
            gloss=r.gloss,
            passage_id=r.passage_id,
            title=titles.get(r.passage_id) if r.passage_id else None,
            language=r.language,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _context_sentence(tokens: list[Token], language: str, lemma: str) -> str | None:
    from app.services.sentences import sentence_text_for_lemma

    return sentence_text_for_lemma(tokens, language, lemma)


def star_lemma(
    db: Session,
    identity: Identity | str,
    language: str,
    lemma: str,
    gloss: str | None,
    passage_id: str | None,
    device_id: str | None = None,
    reading: str | None = None,
) -> StarredWord:
    ident = _as_identity(identity, device_id)
    now = datetime.now(timezone.utc)
    owner_device = ident.device_id or f"user-{ident.user_id}"
    query = apply_owner_filter(db.query(LearnerStarRow), LearnerStarRow, ident)
    row = (
        query.filter(
            LearnerStarRow.language == language,
            LearnerStarRow.lemma == lemma,
        )
        .order_by(LearnerStarRow.id)
        .first()
    )
    context = None
    if passage_id:
        passage = db.get(PassageRow, passage_id)
        if passage is not None:
            context = _context_sentence(tokens_from_row(passage), language, lemma)
    if row is None:
        row = LearnerStarRow(
            device_id=owner_device,
            user_id=ident.user_id,
            language=language,
            lemma=lemma,
            gloss=gloss,
            reading=reading,
            passage_id=passage_id,
            context=context,
            created_at=now,
        )
        db.add(row)
    else:
        if gloss:
            row.gloss = gloss
        if passage_id:
            row.passage_id = passage_id
        if reading:
            row.reading = reading
        if context:
            row.context = context
    from app.services.srs import upsert_card

    upsert_card(
        db,
        ident,
        language=language,
        lemma=lemma,
        gloss=gloss or row.gloss,
        reading=reading or row.reading,
        context=context or row.context,
        passage_id=passage_id or row.passage_id,
        commit=False,
    )
    db.commit()
    title = None
    if row.passage_id:
        passage = db.get(PassageRow, row.passage_id)
        title = passage.title if passage else None
    return StarredWord(
        lemma=row.lemma,
        gloss=row.gloss,
        passage_id=row.passage_id,
        title=title,
        language=language,  # type: ignore[arg-type]
    )


def unstar_lemma(
    db: Session,
    identity: Identity | str,
    language: str,
    lemma: str,
    device_id: str | None = None,
) -> bool:
    ident = _as_identity(identity, device_id)
    query = apply_owner_filter(db.query(LearnerStarRow), LearnerStarRow, ident)
    row = (
        query.filter(
            LearnerStarRow.language == language,
            LearnerStarRow.lemma == lemma,
        )
        .order_by(LearnerStarRow.id)
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def _row_lemmas(row: PassageRow) -> set[str]:
    try:
        data = json.loads(row.tokens_json)
    except Exception:
        return set()
    return {
        item.get("lemma")
        for item in data
        if isinstance(item, dict) and item.get("lemma")
    }


def pick_next_id(
    db: Session,
    language: str,
    placement: str,
    already_read: set[str],
    exclude_id: str | None = None,
    tapped: set[str] | None = None,
) -> str | None:
    rows = (
        db.query(PassageRow)
        .filter(
            PassageRow.language == language,
            PassageRow.shelf_status == SHELF_PUBLIC,
        )
        .order_by(PassageRow.created_at.desc())
        .all()
    )
    rows = [r for r in rows if calibration_passed(r) and (r.genre or "") != "news"]
    if not rows:
        return None

    def series_next() -> str | None:
        if not exclude_id:
            return None
        current = db.get(PassageRow, exclude_id)
        if current is None or not current.series_id:
            return None
        nxt = (
            db.query(PassageRow)
            .filter(
                PassageRow.series_id == current.series_id,
                PassageRow.shelf_status == SHELF_PUBLIC,
                PassageRow.chapter_index > (current.chapter_index or 0),
            )
            .order_by(PassageRow.chapter_index.asc())
            .first()
        )
        if nxt and nxt.id not in already_read:
            return nxt.id
        return None

    series_id = series_next()
    if series_id:
        return series_id

    looked = tapped or set()

    def score(row: PassageRow, prefer_taps: bool) -> tuple[int, float]:
        created = row.created_at.timestamp() if row.created_at else 0.0
        overlap = len(_row_lemmas(row) & looked) if prefer_taps and looked else 0
        return (-overlap, -created)

    for index, level in enumerate(_level_priority(placement)):
        unread = [
            r
            for r in rows
            if r.level == level and r.id not in already_read and r.id != exclude_id
        ]
        if unread:
            unread.sort(key=lambda row: score(row, index == 0))
            return unread[0].id

    rest = [r for r in rows if r.id != exclude_id]
    if not rest:
        return rows[0].id
    rest.sort(key=lambda row: score(row, False))
    return rest[0].id
