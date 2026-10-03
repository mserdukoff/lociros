"""One shared news passage per language and band, once each UTC day.

The event comes from a wire RSS item. The model only rewrites it into the
level rules. If the feed or the level check fails, that day is skipped.
"""

from __future__ import annotations

import logging
import re
import threading
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.request import Request, urlopen

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db import LearnerNewsSaveRow, NewsIssueRow, PassageRow, SessionLocal
from app.models.schemas import NewsNotice
from app.services.identity import Identity, apply_owner_filter
from app.services.learner import _as_identity, calibration_passed

logger = logging.getLogger(__name__)

_FEEDS = (
    ("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"),
)
_TAG = re.compile(r"<[^>]+>")
_lock = threading.Lock()
_inflight: set[str] = set()


def _strip(value: str | None) -> str:
    text = _TAG.sub(" ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def fetch_wire() -> dict | None:
    for source, url in _FEEDS:
        try:
            req = Request(url, headers={"User-Agent": "Lociros/1.0"})
            with urlopen(req, timeout=8) as res:
                raw = res.read()
            root = ET.fromstring(raw)
        except Exception:
            logger.exception("News feed failed: %s", url)
            continue
        item = root.find(".//item")
        if item is None:
            continue
        title = _strip(item.findtext("title"))
        link = _strip(item.findtext("link"))
        description = _strip(item.findtext("description"))
        if not title:
            continue
        published = datetime.now(timezone.utc).date().isoformat()
        pub = item.findtext("pubDate")
        if pub:
            try:
                published = parsedate_to_datetime(pub).date().isoformat()
            except (TypeError, ValueError, OverflowError):
                pass
        brief = title if not description else f"{title}\n{description[:1200]}"
        return {
            "source": source,
            "url": link[:500],
            "title": title[:180],
            "brief": brief,
            "date": published,
        }
    return None


def schedule_daily_news(language: str, level: str) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    key = f"{today}|{language}|{level}"
    with _lock:
        if key in _inflight:
            return
        _inflight.add(key)
    issue_id: int | None = None
    db = SessionLocal()
    try:
        existing = (
            db.query(NewsIssueRow)
            .filter(
                NewsIssueRow.issue_date == today,
                NewsIssueRow.language == language,
                NewsIssueRow.level == level,
            )
            .one_or_none()
        )
        if existing is not None:
            return
        row = NewsIssueRow(
            issue_date=today,
            language=language,
            level=level,
            status="pending",
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return
        issue_id = row.id
    finally:
        db.close()
        with _lock:
            _inflight.discard(key)
    if issue_id is not None:
        threading.Thread(
            target=_build_issue,
            args=(issue_id,),
            daemon=True,
            name=f"news-{key}",
        ).start()


def active_bands(db: Session, days: int = 14) -> set[tuple[str, str]]:
    """(language, level) pairs with a placed learner active in the last `days`."""
    from datetime import timedelta

    from app.models.db import LearnerRow

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(LearnerRow.language, LearnerRow.level)
        .filter(LearnerRow.placed == 1, LearnerRow.updated_at >= cutoff)
        .distinct()
        .all()
    )
    shown = {
        "ja": True,
        "ru": settings.show_russian,
        "it": settings.show_italian,
        "ar": settings.show_arabic,
    }
    return {(lang, level) for lang, level in rows if shown.get(lang)}


def schedule_all_news() -> int:
    db = SessionLocal()
    try:
        bands = active_bands(db)
    finally:
        db.close()
    for language, level in sorted(bands):
        try:
            schedule_daily_news(language, level)
        except Exception:
            logger.exception("Could not schedule news for %s %s", language, level)
    return len(bands)


_scheduler_stop = threading.Event()
_scheduler: threading.Thread | None = None


def start_news_scheduler(interval_seconds: float = 3600) -> None:
    """Build each day's news in the background instead of on a library request."""
    global _scheduler
    if _scheduler is not None and _scheduler.is_alive():
        return
    _scheduler_stop.clear()

    def loop() -> None:
        while not _scheduler_stop.is_set():
            try:
                schedule_all_news()
            except Exception:
                logger.exception("News scheduler tick failed")
            _scheduler_stop.wait(interval_seconds)

    _scheduler = threading.Thread(target=loop, daemon=True, name="news-scheduler")
    _scheduler.start()


def stop_news_scheduler() -> None:
    _scheduler_stop.set()


def _mark(db: Session, issue_id: int, status: str, **fields) -> None:
    issue = db.get(NewsIssueRow, issue_id)
    if issue is None:
        return
    issue.status = status
    for name, value in fields.items():
        setattr(issue, name, value)
    db.commit()


def _build_issue(issue_id: int) -> None:
    from app.services.generate import generate_passage

    db = SessionLocal()
    try:
        issue = db.get(NewsIssueRow, issue_id)
        if issue is None or issue.status != "pending":
            return
        if not settings.openrouter_api_key:
            _mark(db, issue_id, "skipped")
            return
        lead = fetch_wire()
        if lead is None:
            _mark(db, issue_id, "skipped")
            return
        issue.headline = lead["title"][:300]
        issue.source_name = lead["source"]
        issue.source_url = lead["url"]
        db.commit()
        from app.services.llm_usage import charged_to

        with charged_to("system:news"):
            passage = generate_passage(
                db,
                issue.level,
                lead["title"],
                "news",
                issue.language,
                news_brief=f"Date: {lead['date']}\n{lead['brief']}",
            )
        if not passage.calibration.passed:
            _mark(db, issue_id, "skipped")
            return
        row = db.get(PassageRow, passage.id)
        if row is None or not calibration_passed(row):
            _mark(db, issue_id, "skipped")
            return
        row.source_name = lead["source"]
        row.source_url = lead["url"] or None
        row.source_date = lead["date"]
        row.genre = "news"
        row.topic = "News"
        _mark(
            db,
            issue_id,
            "public",
            passage_id=row.id,
            source_name=lead["source"],
            source_url=lead["url"] or None,
            headline=lead["title"][:300],
        )
    except Exception:
        logger.exception("Daily news failed for issue %s", issue_id)
        db.rollback()
        try:
            _mark(db, issue_id, "skipped")
        except Exception:
            logger.exception("Could not mark news issue %s skipped", issue_id)
    finally:
        db.close()


def news_notice(
    db: Session,
    language: str,
    level: str,
    already_read: set[str],
    saved_ids: set[str] | None = None,
) -> NewsNotice | None:
    today = datetime.now(timezone.utc).date().isoformat()
    issue = (
        db.query(NewsIssueRow)
        .filter(
            NewsIssueRow.issue_date == today,
            NewsIssueRow.language == language,
            NewsIssueRow.level == level,
            NewsIssueRow.status == "public",
        )
        .one_or_none()
    )
    if issue is None or not issue.passage_id:
        return None
    row = db.get(PassageRow, issue.passage_id)
    if row is None or not calibration_passed(row):
        return None
    kept = saved_ids or set()
    return NewsNotice(
        passage_id=row.id,
        title=row.title,
        language=language,  # type: ignore[arg-type]
        level=level,  # type: ignore[arg-type]
        source_name=row.source_name or issue.source_name,
        source_date=row.source_date,
        saved=row.id in kept,
        read=row.id in already_read,
    )


def saved_news_ids(db: Session, identity: Identity | str, language: str) -> set[str]:
    ident = _as_identity(identity)
    if not ident.can_persist:
        return set()
    query = apply_owner_filter(db.query(LearnerNewsSaveRow), LearnerNewsSaveRow, ident)
    rows = query.filter(LearnerNewsSaveRow.language == language).all()
    return {row.passage_id for row in rows}


def save_news(
    db: Session,
    identity: Identity | str,
    passage_id: str,
    language: str,
    saved: bool,
) -> bool:
    ident = _as_identity(identity)
    if not ident.can_persist:
        raise ValueError("A device id is required to save a passage.")
    issue = (
        db.query(NewsIssueRow)
        .filter(
            NewsIssueRow.passage_id == passage_id,
            NewsIssueRow.language == language,
            NewsIssueRow.status == "public",
        )
        .first()
    )
    if issue is None:
        raise ValueError("That news passage is not available to save.")
    query = apply_owner_filter(db.query(LearnerNewsSaveRow), LearnerNewsSaveRow, ident)
    row = (
        query.filter(LearnerNewsSaveRow.passage_id == passage_id)
        .order_by(LearnerNewsSaveRow.id)
        .first()
    )
    if saved and row is None:
        db.add(
            LearnerNewsSaveRow(
                device_id=ident.device_id or f"user-{ident.user_id}",
                user_id=ident.user_id,
                language=language,
                passage_id=passage_id,
                saved_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        return True
    if not saved and row is not None:
        db.delete(row)
        db.commit()
    return saved
