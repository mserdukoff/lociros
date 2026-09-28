from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.db import TrialEventRow
from app.services.identity import Identity

# Sent by the browser through POST /api/events.
CLIENT_EVENTS = ("landing_view", "demo_tap", "start_click", "placement_start", "session_start")
# Written by the API itself, so a browser cannot inflate them.
SERVER_EVENTS = ("placement_done", "read_complete", "account_linked", "comprehension")

FUNNEL_STEPS = (
    ("landing_view", "landing_view"),
    ("demo_tap", "demo_tap"),
    ("start_click", "start_click"),
    ("placement_start", "placement_start"),
    ("placement_done", "placement_done"),
    ("first_rating", "read_complete"),
    ("account_linked", "account_linked"),
)

RETURN_WINDOWS = (2, 7)


def record_event(
    db: Session,
    *,
    kind: str,
    identity: Identity | None = None,
    passage_id: str | None = None,
    payload: dict | None = None,
    commit: bool = True,
) -> TrialEventRow:
    row = TrialEventRow(
        kind=kind,
        device_id=identity.device_id if identity else None,
        user_id=identity.user_id if identity else None,
        passage_id=passage_id,
        payload_json=json.dumps(payload, ensure_ascii=False) if payload else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    if commit:
        db.commit()
    return row


def record_account_linked(db: Session, identity: Identity) -> None:
    """Once per device and account. The sign-in bridge calls the session route on every load."""
    if not identity.device_id or not identity.user_id:
        return
    exists = (
        db.query(TrialEventRow.id)
        .filter(
            TrialEventRow.kind == "account_linked",
            TrialEventRow.device_id == identity.device_id,
            TrialEventRow.user_id == identity.user_id,
        )
        .first()
    )
    if exists is None:
        record_event(db, kind="account_linked", identity=identity)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def funnel_metrics(db: Session, days: int = 30, now: datetime | None = None) -> dict:
    """Devices that viewed the landing page in the window, and how far each got.

    A device counts once per step. Returns are measured from the device's first
    session: a return is any session on a later UTC day within N days, and only
    devices first seen at least N days ago are in that denominator.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    kinds = {kind for _, kind in FUNNEL_STEPS} | {"session_start"}
    rows = (
        db.query(TrialEventRow.kind, TrialEventRow.device_id, TrialEventRow.created_at)
        .filter(
            TrialEventRow.created_at >= cutoff,
            TrialEventRow.device_id.isnot(None),
            TrialEventRow.kind.in_(kinds),
        )
        .all()
    )
    by_kind: dict[str, set[str]] = {}
    sessions: dict[str, set[date]] = {}
    for kind, device, created in rows:
        by_kind.setdefault(kind, set()).add(device)
        if kind == "session_start":
            sessions.setdefault(device, set()).add(_as_utc(created).date())

    cohort = by_kind.get("landing_view", set())
    size = len(cohort)
    steps = []
    for name, kind in FUNNEL_STEPS:
        reached = len(cohort & by_kind.get(kind, set())) if name != "landing_view" else size
        steps.append(
            {
                "step": name,
                "devices": reached,
                "rate": round(reached / size, 3) if size else 0.0,
            }
        )

    returns = []
    today = now.date()
    for window in RETURN_WINDOWS:
        eligible = 0
        returned = 0
        for device, days_seen in sessions.items():
            first = min(days_seen)
            if (today - first).days < window:
                continue
            eligible += 1
            if any(0 < (d - first).days <= window for d in days_seen):
                returned += 1
        returns.append(
            {
                "window_days": window,
                "eligible": eligible,
                "returned": returned,
                "rate": round(returned / eligible, 3) if eligible else 0.0,
            }
        )
    return {
        "window_days": days,
        "landing_devices": size,
        "steps": steps,
        "returns": returns,
        "sticky_test": _sticky_arms(db, cutoff, by_kind.get("placement_done", set())),
    }


def _sticky_arms(db: Session, cutoff: datetime, placed: set[str]) -> list[dict]:
    """placement_done rate for each arm of the mobile sticky-bar test, by first landing view."""
    rows = (
        db.query(TrialEventRow.device_id, TrialEventRow.payload_json)
        .filter(
            TrialEventRow.kind == "landing_view",
            TrialEventRow.created_at >= cutoff,
            TrialEventRow.device_id.isnot(None),
            TrialEventRow.payload_json.isnot(None),
        )
        .order_by(TrialEventRow.created_at)
        .all()
    )
    arm_of: dict[str, str] = {}
    for device, raw in rows:
        if device in arm_of:
            continue
        try:
            arm = json.loads(raw).get("sticky_arm")
        except (ValueError, AttributeError):
            continue
        if arm in ("sticky", "control"):
            arm_of[device] = arm
    out = []
    for arm in ("sticky", "control"):
        devices = {d for d, a in arm_of.items() if a == arm}
        done = len(devices & placed)
        out.append(
            {
                "arm": arm,
                "devices": len(devices),
                "placement_done": done,
                "rate": round(done / len(devices), 3) if devices else 0.0,
            }
        )
    return out if arm_of else []


def trial_metrics(db: Session, days: int = 30) -> dict:
    from app.models.db import FeedbackRow, LearnerReadRow

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    reads = (
        db.query(LearnerReadRow)
        .filter(LearnerReadRow.created_at >= cutoff)
        .all()
    )
    by_account: dict[str, set[str]] = {}
    for row in reads:
        key = f"user:{row.user_id}" if row.user_id else f"device:{row.device_id}"
        by_account.setdefault(key, set()).add(row.passage_id)
    learners = len(by_account)
    second = sum(1 for ids in by_account.values() if len(ids) >= 2)
    second_rate = round(second / learners, 3) if learners else 0.0

    feedback = (
        db.query(FeedbackRow)
        .filter(FeedbackRow.created_at >= cutoff)
        .all()
    )
    on_level_hard = 0
    on_level_total = 0
    from app.models.db import PassageRow

    for fb in feedback:
        passage = db.get(PassageRow, fb.passage_id)
        if passage is None:
            continue
        on_level_total += 1
        if fb.rating == "too_hard":
            on_level_hard += 1
    too_hard_rate = round(on_level_hard / on_level_total, 3) if on_level_total else 0.0

    wtp = (
        db.query(TrialEventRow)
        .filter(
            TrialEventRow.created_at >= cutoff,
            TrialEventRow.kind.in_(("wtp", "pay_intent", "want_more_generates")),
        )
        .count()
    )
    return {
        "window_days": days,
        "learners_with_reads": learners,
        "second_text_completion": second_rate,
        "second_text_pass": second_rate >= 0.4,
        "too_hard_rate": too_hard_rate,
        "calibration_trust_pass": too_hard_rate < 0.15,
        "unsolicited_wtp": wtp,
        "wtp_pass": wtp >= 5,
        "go": second_rate >= 0.4 and too_hard_rate < 0.15 and wtp >= 5,
        "funnel": funnel_metrics(db, days=days),
    }
