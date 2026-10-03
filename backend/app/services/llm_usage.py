"""Per-account OpenRouter token counts, so heavy users can be spotted and capped.

Callers wrap LLM work in `charged_to(account_key)`; every completion inside
adds its token usage to that account's row for the month.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from app.models.db import LlmUsageRow, SessionLocal

logger = logging.getLogger(__name__)

SYSTEM = "system"
_account: ContextVar[str | None] = ContextVar("llm_account", default=None)


@contextmanager
def charged_to(account_key: str | None):
    token = _account.set(account_key or SYSTEM)
    try:
        yield
    finally:
        _account.reset(token)


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def record(completion) -> None:
    """Add one completion's usage. Never raises: accounting must not break a request."""
    try:
        usage = getattr(completion, "usage", None)
        prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
        output = int(getattr(usage, "completion_tokens", 0) or 0)
        add(_account.get() or SYSTEM, prompt, output)
    except Exception:
        logger.exception("Could not record LLM usage")


def add(account_key: str, prompt_tokens: int, completion_tokens: int) -> None:
    month = _month()
    db = SessionLocal()
    try:
        for _ in range(2):
            row = (
                db.query(LlmUsageRow)
                .filter(LlmUsageRow.account_key == account_key, LlmUsageRow.year_month == month)
                .one_or_none()
            )
            if row is None:
                db.add(
                    LlmUsageRow(
                        account_key=account_key,
                        year_month=month,
                        calls=1,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
                )
            else:
                db.query(LlmUsageRow).filter(LlmUsageRow.id == row.id).update(
                    {
                        LlmUsageRow.calls: LlmUsageRow.calls + 1,
                        LlmUsageRow.prompt_tokens: LlmUsageRow.prompt_tokens + prompt_tokens,
                        LlmUsageRow.completion_tokens: LlmUsageRow.completion_tokens
                        + completion_tokens,
                    },
                    synchronize_session=False,
                )
            try:
                db.commit()
                return
            except IntegrityError:
                db.rollback()
    finally:
        db.close()


def top_accounts(db, limit: int = 10) -> list[dict]:
    month = _month()
    rows = (
        db.query(LlmUsageRow)
        .filter(LlmUsageRow.year_month == month)
        .order_by((LlmUsageRow.prompt_tokens + LlmUsageRow.completion_tokens).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "account": r.account_key,
            "calls": r.calls,
            "prompt_tokens": r.prompt_tokens,
            "completion_tokens": r.completion_tokens,
        }
        for r in rows
    ]
