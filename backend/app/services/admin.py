from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db import (
    FeedbackRow,
    GenerationJobRow,
    LearnerNewsSaveRow,
    LearnerReadRow,
    LearnerRow,
    LearnerStarRow,
    LearnerTapRow,
    NewsIssueRow,
    PassageRow,
    UserRow,
)
from app.models.schemas import AdminCount, AdminJobRow, AdminOverview, AdminUserRow
from app.services.identity import Identity
from app.services.llm_usage import top_accounts
from app.services.trial import trial_metrics


def _plan_label(user: UserRow) -> str:
    from app.services.billing import user_entitlement

    if is_admin_user(user):
        return "admin"
    ent = user_entitlement(user)
    if ent.status == "active" and user.subscription_plan:
        return user.subscription_plan
    return ent.status


def is_admin_user(user: UserRow | None) -> bool:
    return bool(user and settings.is_admin_email(user.email))


def require_admin(
    db: Session,
    identity: Identity,
) -> UserRow:
    if not identity.user_id:
        raise HTTPException(status_code=401, detail="Sign in to view admin.")
    user = db.get(UserRow, identity.user_id)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin only.")
    assert user is not None
    return user


def _counts(rows: list[tuple]) -> list[AdminCount]:
    return [AdminCount(key=str(key), count=int(count or 0)) for key, count in rows]


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def admin_overview(db: Session) -> AdminOverview:
    cutoff = _since(7)
    users = db.query(UserRow).order_by(UserRow.created_at.desc()).limit(80).all()
    user_ids = [row.id for row in users]

    reads_by_user: dict[int, int] = {}
    stars_by_user: dict[int, int] = {}
    jobs_by_user: dict[int, int] = {}
    if user_ids:
        reads_by_user = dict(
            db.query(LearnerReadRow.user_id, func.count())
            .filter(LearnerReadRow.user_id.in_(user_ids))
            .group_by(LearnerReadRow.user_id)
            .all()
        )
        stars_by_user = dict(
            db.query(LearnerStarRow.user_id, func.count())
            .filter(LearnerStarRow.user_id.in_(user_ids))
            .group_by(LearnerStarRow.user_id)
            .all()
        )
        jobs_by_user = dict(
            db.query(GenerationJobRow.user_id, func.count())
            .filter(GenerationJobRow.user_id.in_(user_ids))
            .group_by(GenerationJobRow.user_id)
            .all()
        )

    recent_jobs = (
        db.query(GenerationJobRow)
        .order_by(GenerationJobRow.created_at.desc())
        .limit(30)
        .all()
    )

    return AdminOverview(
        api={
            "ok": True,
            "name": "lociros",
            "env": settings.app_env,
            "db": "supabase" if settings.is_supabase else (
                "sqlite" if settings.sqlalchemy_url().startswith("sqlite") else "postgres"
            ),
            "require_auth": settings.require_auth,
            "generate_workers": settings.generate_workers,
            "show_russian": settings.show_russian,
            "show_italian": settings.show_italian,
            "show_arabic": settings.show_arabic,
        },
        totals={
            "users": db.query(func.count(UserRow.id)).scalar() or 0,
            "signed_in": db.query(func.count(UserRow.id)).filter(UserRow.auth_id.isnot(None)).scalar()
            or 0,
            "passages": db.query(func.count(PassageRow.id)).scalar() or 0,
            "reads": db.query(func.count(LearnerReadRow.id)).scalar() or 0,
            "stars": db.query(func.count(LearnerStarRow.id)).scalar() or 0,
            "taps": db.query(func.count(LearnerTapRow.id)).scalar() or 0,
            "jobs": db.query(func.count(GenerationJobRow.id)).scalar() or 0,
            "learners": db.query(func.count(LearnerRow.id)).scalar() or 0,
            "news_issues": db.query(func.count(NewsIssueRow.id)).scalar() or 0,
            "news_saves": db.query(func.count(LearnerNewsSaveRow.id)).scalar() or 0,
            "feedback": db.query(func.count(FeedbackRow.id)).scalar() or 0,
        },
        passages_by_language=_counts(
            db.query(PassageRow.language, func.count()).group_by(PassageRow.language).all()
        ),
        passages_by_level=_counts(
            db.query(PassageRow.level, func.count()).group_by(PassageRow.level).all()
        ),
        passages_by_shelf=_counts(
            db.query(PassageRow.shelf_status, func.count()).group_by(PassageRow.shelf_status).all()
        ),
        jobs_by_status=_counts(
            db.query(GenerationJobRow.status, func.count()).group_by(GenerationJobRow.status).all()
        ),
        activity_7d={
            "new_users": db.query(func.count(UserRow.id))
            .filter(UserRow.created_at >= cutoff)
            .scalar()
            or 0,
            "reads": db.query(func.count(LearnerReadRow.id))
            .filter(LearnerReadRow.created_at >= cutoff)
            .scalar()
            or 0,
            "taps": db.query(func.count(LearnerTapRow.id))
            .filter(LearnerTapRow.seen_at >= cutoff)
            .scalar()
            or 0,
            "jobs": db.query(func.count(GenerationJobRow.id))
            .filter(GenerationJobRow.created_at >= cutoff)
            .scalar()
            or 0,
            "feedback": db.query(func.count(FeedbackRow.id))
            .filter(FeedbackRow.created_at >= cutoff)
            .scalar()
            or 0,
            "news_saves": db.query(func.count(LearnerNewsSaveRow.id))
            .filter(LearnerNewsSaveRow.saved_at >= cutoff)
            .scalar()
            or 0,
        },
        trial=trial_metrics(db, days=30),
        llm_usage=top_accounts(db),
        recent_users=[
            AdminUserRow(
                id=row.id,
                email=row.email,
                display_name=row.display_name,
                has_auth=row.auth_id is not None,
                created_at=row.created_at,
                reads=int(reads_by_user.get(row.id) or 0),
                stars=int(stars_by_user.get(row.id) or 0),
                jobs=int(jobs_by_user.get(row.id) or 0),
                plan=_plan_label(row),
            )
            for row in users
        ],
        recent_jobs=[
            AdminJobRow(
                id=row.id,
                status=row.status,
                language=row.language,
                level=row.level,
                topic=row.topic,
                user_id=row.user_id,
                error=row.error,
                created_at=row.created_at,
                finished_at=row.finished_at,
            )
            for row in recent_jobs
        ],
    )
