"""Account deletion and a full export of what Lociros stores about a reader."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db import (
    FeedbackRow,
    GenerateQuotaRow,
    GenerationJobRow,
    LearnerCardRow,
    LearnerLemmaRow,
    LearnerNewsSaveRow,
    LearnerReadRow,
    LearnerRow,
    LearnerStarRow,
    LearnerTapRow,
    LlmUsageRow,
    MagicLinkRow,
    TrialEventRow,
    UserRow,
)
from app.services.identity import Identity, apply_owner_filter

logger = logging.getLogger(__name__)

_OWNED = (
    LearnerCardRow,
    LearnerLemmaRow,
    LearnerStarRow,
    LearnerReadRow,
    LearnerRow,
    LearnerTapRow,
    LearnerNewsSaveRow,
    TrialEventRow,
    FeedbackRow,
    GenerationJobRow,
)


def delete_supabase_user(auth_id) -> bool:
    """Remove the Supabase Auth user so signing in again does not recreate the account."""
    base = settings.effective_supabase_url
    key = settings.supabase_service_role_key
    if not auth_id or not base or not key:
        if auth_id:
            logger.warning("Supabase service key not set; auth user %s was not deleted", auth_id)
        return False
    import httpx

    try:
        res = httpx.delete(
            f"{base}/auth/v1/admin/users/{auth_id}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=15,
        )
    except httpx.HTTPError:
        logger.exception("Could not reach Supabase to delete auth user %s", auth_id)
        return False
    if res.status_code not in (200, 204, 404):
        logger.error("Supabase refused to delete auth user %s: %s", auth_id, res.text[:300])
        return False
    return True


def delete_account(db: Session, user: UserRow) -> None:
    from app.services.billing import cancel_subscription_now

    cancel_subscription_now(user)
    for model in _OWNED:
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)
    key = f"user:{user.id}"
    db.query(GenerateQuotaRow).filter(GenerateQuotaRow.account_key == key).delete()
    db.query(LlmUsageRow).filter(LlmUsageRow.account_key == key).delete()
    if user.email:
        db.query(MagicLinkRow).filter(MagicLinkRow.email == user.email).delete()
    auth_id = user.auth_id
    db.delete(user)
    db.commit()
    delete_supabase_user(auth_id)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _rows(db: Session, model, identity: Identity, fields: tuple[str, ...]) -> list[dict]:
    query = apply_owner_filter(db.query(model), model, identity)
    out = []
    for row in query.all():
        item = {}
        for name in fields:
            value = getattr(row, name)
            item[name] = _iso(value) if isinstance(value, datetime) else value
        out.append(item)
    return out


def export_account(db: Session, identity: Identity) -> dict:
    user = db.get(UserRow, identity.user_id) if identity.user_id else None
    profile = None
    if user is not None:
        profile = {
            "email": user.email,
            "display_name": user.display_name,
            "created_at": _iso(user.created_at),
            "trial_ends_at": _iso(user.trial_ends_at),
            "subscription_status": user.subscription_status,
            "subscription_plan": user.subscription_plan,
            "current_period_end": _iso(user.current_period_end),
        }
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "product": "Lociros",
        "account": profile,
        "levels": _rows(
            db, LearnerRow, identity, ("language", "level", "placed", "updated_at")
        ),
        "saved_words": _rows(
            db,
            LearnerStarRow,
            identity,
            ("language", "lemma", "gloss", "reading", "context", "passage_id", "created_at"),
        ),
        "review_cards": _rows(
            db,
            LearnerCardRow,
            identity,
            ("language", "lemma", "gloss", "ease", "interval", "reps", "due_at", "created_at"),
        ),
        "finished_passages": _rows(db, LearnerReadRow, identity, ("passage_id", "created_at")),
        "words_met": _rows(db, LearnerLemmaRow, identity, ("language", "lemma", "created_at")),
        "words_tapped": _rows(db, LearnerTapRow, identity, ("language", "lemma", "seen_at")),
        "saved_news": _rows(
            db, LearnerNewsSaveRow, identity, ("language", "passage_id", "saved_at")
        ),
        "ratings": _rows(db, FeedbackRow, identity, ("passage_id", "rating", "created_at")),
        "custom_requests": _rows(
            db,
            GenerationJobRow,
            identity,
            ("id", "status", "language", "level", "topic", "passage_id", "created_at"),
        ),
    }
