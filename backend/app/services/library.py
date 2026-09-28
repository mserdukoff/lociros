from __future__ import annotations

import time

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.db import SHELF_PUBLIC, PassageRow
from app.models.schemas import LibraryItem, LibraryResponse
from app.services.identity import Identity
from app.services.learner import (
    DEFAULT_LEVEL,
    calibration_passed,
    get_learner,
    lemma_token_stats,
    list_stars,
    pick_next_id,
    read_ids,
    recent_taps,
    seen_lemmas,
    tokens_from_row,
)
from app.services.news import news_notice, saved_news_ids


_COUNTS_TTL = 600.0
_counts_cache: tuple[float, dict[str, int]] | None = None


def shelf_counts(db: Session) -> dict[str, int]:
    """Passages a reader can open from the shelf, by language. News is left out.

    The landing page reads this on every visit, and calibration is stored per row,
    so the result is kept in-process for ten minutes.
    """
    global _counts_cache
    now = time.monotonic()
    if _counts_cache is not None and now - _counts_cache[0] < _COUNTS_TTL:
        return dict(_counts_cache[1])
    rows = (
        db.query(PassageRow)
        .filter(
            PassageRow.shelf_status == SHELF_PUBLIC,
            or_(PassageRow.genre.is_(None), PassageRow.genre != "news"),
        )
        .all()
    )
    counts: dict[str, int] = {}
    for row in rows:
        if row.language and calibration_passed(row):
            counts[row.language] = counts.get(row.language, 0) + 1
    _counts_cache = (now, counts)
    return dict(counts)


def list_library(
    db: Session,
    language: str,
    identity: Identity | str | None,
) -> LibraryResponse:
    if isinstance(identity, str):
        identity = Identity(user_id=None, device_id=identity)
    rows = (
        db.query(PassageRow)
        .filter(
            PassageRow.language == language,
            PassageRow.shelf_status == SHELF_PUBLIC,
        )
        .order_by(PassageRow.created_at.desc())
        .all()
    )
    rows = [r for r in rows if calibration_passed(r)]
    placement = DEFAULT_LEVEL
    placed = True
    seen: set[str] = set()
    already_read: set[str] = set()
    tapped: set[str] = set()
    words = []
    if identity and identity.can_persist:
        learner = get_learner(db, identity, language)
        seen = seen_lemmas(db, identity, language)
        already_read = read_ids(db, identity)
        tapped = set(recent_taps(db, identity, language))
        words = list_stars(db, identity, language)
        if learner is None:
            placed = False
        else:
            placement = learner.level
            placed = bool(getattr(learner, "placed", 0)) or bool(already_read)

    next_id = pick_next_id(
        db, language, placement, already_read, tapped=tapped
    )
    items: list[LibraryItem] = []
    for row in rows:
        tokens = tokens_from_row(row)
        new, recycled = lemma_token_stats(tokens, language, seen)
        total = new + recycled
        pct = round(new / total, 3) if total else 0.0
        items.append(
            LibraryItem(
                id=row.id,
                language=row.language,  # type: ignore[arg-type]
                level=row.level,  # type: ignore[arg-type]
                topic=row.topic,
                genre=row.genre,
                title=row.title,
                word_count=row.word_count,
                created_at=row.created_at,
                passed=True,
                read=row.id in already_read,
                recommended=row.id == next_id,
                new_lemmas=new,
                recycled_lemmas=recycled,
                series_id=getattr(row, "series_id", None),
                chapter_index=getattr(row, "chapter_index", None),
                has_audio=bool(getattr(row, "audio_url", None)),
                new_lemma_pct=pct,
                source_name=getattr(row, "source_name", None),
                source_url=getattr(row, "source_url", None),
                source_date=getattr(row, "source_date", None),
            )
        )
    items.sort(
        key=lambda it: (
            0 if it.recommended else 1,
            0 if not it.read else 1,
            it.chapter_index if it.chapter_index is not None else 99,
            it.level,
            -it.created_at.timestamp() if it.created_at else 0,
        )
    )
    saved_news: set[str] = set()
    notice = None
    if identity and identity.can_persist and placed:
        saved_news = saved_news_ids(db, identity, language)
        notice = news_notice(db, language, placement, already_read, saved_news)
    featured_id = notice.passage_id if notice is not None else None
    items = [
        item
        for item in items
        if item.genre != "news" or (item.id in saved_news and item.id != featured_id)
    ]
    return LibraryResponse(
        language=language,  # type: ignore[arg-type]
        placement=placement,  # type: ignore[arg-type]
        placed=placed,
        next_id=next_id,
        seen_lemmas=len(seen),
        items=items,
        words=words,
        news_notice=notice,
    )
