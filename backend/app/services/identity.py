from __future__ import annotations

import re
from dataclasses import dataclass

from fastapi import Header, Request
from sqlalchemy.orm import Session

from app.models.db import (
    LearnerCardRow,
    LearnerLemmaRow,
    LearnerNewsSaveRow,
    LearnerReadRow,
    LearnerRow,
    LearnerStarRow,
    LearnerTapRow,
)

_DEVICE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def valid_device_id(device_id: str | None) -> str | None:
    if not device_id:
        return None
    value = device_id.strip()
    if _DEVICE.match(value):
        return value
    return None


@dataclass
class Identity:
    user_id: int | None
    device_id: str | None

    @property
    def account_key(self) -> str | None:
        if self.user_id is not None:
            return f"user:{self.user_id}"
        if self.device_id:
            return f"device:{self.device_id}"
        return None

    @property
    def can_persist(self) -> bool:
        return bool(self.user_id or self.device_id)


def identity_from_request(
    request: Request,
    x_device_id: str | None = Header(default=None),
) -> Identity:
    user_id = getattr(request.state, "user_id", None)
    return Identity(user_id=user_id, device_id=valid_device_id(x_device_id))


def apply_owner_filter(query, model, identity: Identity):
    if identity.user_id is not None:
        return query.filter(model.user_id == identity.user_id)
    if identity.device_id:
        return query.filter(model.device_id == identity.device_id)
    return query.filter(False)


_MERGE_KEYS = (
    (LearnerRow, ("language",)),
    (LearnerLemmaRow, ("language", "lemma")),
    (LearnerStarRow, ("language", "lemma")),
    (LearnerReadRow, ("passage_id",)),
    (LearnerCardRow, ("language", "lemma")),
    (LearnerNewsSaveRow, ("passage_id",)),
    (LearnerTapRow, ("language", "lemma")),
)


def merge_guest_into_user(db: Session, device_id: str, user_id: int) -> None:
    """Move this browser's rows onto the account.

    Lookups by user expect one row per key (one learner per language, one star
    per lemma). Where the account already has that key, the account's row is
    kept and the guest duplicate is dropped, so a placed account's band is
    never overwritten by a browser's. An account row that was never placed
    takes the browser's band.
    """
    if not device_id:
        return
    for model, fields in _MERGE_KEYS:
        owned = {
            tuple(getattr(row, f) for f in fields): row
            for row in db.query(model).filter(model.user_id == user_id).all()
        }
        guests = (
            db.query(model)
            .filter(model.device_id == device_id, model.user_id.is_(None))
            .all()
        )
        for row in guests:
            key = tuple(getattr(row, f) for f in fields)
            kept = owned.get(key)
            if kept is None:
                row.user_id = user_id
                owned[key] = row
                continue
            if model is LearnerRow and not kept.placed and row.placed:
                kept.level = row.level
                kept.placed = row.placed
                kept.consecutive_up = row.consecutive_up
                kept.consecutive_down = row.consecutive_down
            db.delete(row)
    db.commit()
