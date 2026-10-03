"""Trial, Stripe subscriptions, and the paywall.

Signed-in readers get `TRIAL_DAYS` free from their first visit. After that,
reading needs a Stripe subscription. Guests get `FREE_GUEST_PASSAGES` before
they are asked to sign up. The paywall is on in production unless
`PAYWALL_ENABLED=false`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db import StripeEventRow, UserRow
from app.services.identity import Identity

logger = logging.getLogger(__name__)

STATUS_GUEST = "guest"
STATUS_TRIAL = "trial"
STATUS_ACTIVE = "active"
STATUS_GRACE = "grace"
STATUS_EXPIRED = "expired"

ENTITLED = {STATUS_TRIAL, STATUS_ACTIVE, STATUS_GRACE}

# Stripe statuses that keep the shelf open.
_STRIPE_ACTIVE = {"active", "trialing"}
_STRIPE_GRACE = {"past_due"}

CODE_SIGNUP = "signup_required"
CODE_SUBSCRIBE = "subscription_required"


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Entitlement:
    status: str
    paywall: bool
    trial_ends_at: datetime | None = None
    plan: str | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    has_customer: bool = False

    @property
    def entitled(self) -> bool:
        return not self.paywall or self.status in ENTITLED

    @property
    def trial_days_left(self) -> int | None:
        if self.status != STATUS_TRIAL or self.trial_ends_at is None:
            return None
        seconds = (self.trial_ends_at - _now()).total_seconds()
        return max(0, int((seconds + 86399) // 86400))

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "entitled": self.entitled,
            "paywall": self.paywall,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "trial_days_left": self.trial_days_left,
            "plan": self.plan,
            "current_period_end": (
                self.current_period_end.isoformat() if self.current_period_end else None
            ),
            "cancel_at_period_end": self.cancel_at_period_end,
            "has_customer": self.has_customer,
            "billing_ready": settings.billing_configured,
        }


def ensure_trial(user: UserRow) -> bool:
    """Start the trial on first sight. Returns True when the row changed."""
    if user.trial_ends_at is not None:
        return False
    user.trial_ends_at = _now() + timedelta(days=settings.trial_days)
    return True


def user_entitlement(user: UserRow) -> Entitlement:
    from app.services.admin import is_admin_user

    base = dict(
        paywall=settings.paywall,
        trial_ends_at=_utc(user.trial_ends_at),
        plan=user.subscription_plan,
        current_period_end=_utc(user.current_period_end),
        cancel_at_period_end=bool(user.cancel_at_period_end),
        has_customer=bool(user.stripe_customer_id),
    )
    if is_admin_user(user):
        return Entitlement(status=STATUS_ACTIVE, **base)
    sub = (user.subscription_status or "").lower()
    if sub in _STRIPE_ACTIVE:
        return Entitlement(status=STATUS_ACTIVE, **base)
    if sub in _STRIPE_GRACE:
        return Entitlement(status=STATUS_GRACE, **base)
    trial_end = _utc(user.trial_ends_at)
    if trial_end is not None and trial_end > _now():
        return Entitlement(status=STATUS_TRIAL, **base)
    return Entitlement(status=STATUS_EXPIRED, **base)


def entitlement(db: Session, identity: Identity) -> Entitlement:
    if identity.user_id is None:
        return Entitlement(status=STATUS_GUEST, paywall=settings.paywall)
    user = db.get(UserRow, identity.user_id)
    if user is None:
        return Entitlement(status=STATUS_GUEST, paywall=settings.paywall)
    if ensure_trial(user):
        db.commit()
    return user_entitlement(user)


def paywall_error(code: str) -> HTTPException:
    if code == CODE_SIGNUP:
        detail = "Create a free account to keep reading. Your first week is free."
    else:
        detail = "Your free week is over. Subscribe to keep reading."
    return HTTPException(status_code=402, detail={"code": code, "message": detail})


def require_entitled(db: Session, identity: Identity) -> None:
    if not settings.paywall:
        return
    ent = entitlement(db, identity)
    if ent.entitled:
        return
    raise paywall_error(CODE_SIGNUP if ent.status == STATUS_GUEST else CODE_SUBSCRIBE)


def can_open_passage(db: Session, identity: Identity, passage_id: str) -> None:
    """Guests may open a few passages; accounts need a trial or subscription."""
    if not settings.paywall:
        return
    if identity.user_id is not None:
        require_entitled(db, identity)
        return
    from app.services.learner import read_ids

    already = read_ids(db, identity) if identity.can_persist else set()
    if passage_id in already or len(already) < settings.free_guest_passages:
        return
    raise paywall_error(CODE_SIGNUP)


# --- Stripe ---------------------------------------------------------------


def _client():
    if not settings.billing_configured:
        raise HTTPException(status_code=503, detail="Billing is not configured yet.")
    import stripe

    return stripe.StripeClient(settings.stripe_secret_key)


def _as_dict(obj) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return dict(obj)


def plan_for_price(price_id: str | None) -> str | None:
    if not price_id:
        return None
    if price_id == settings.stripe_price_annual:
        return "annual"
    if price_id == settings.stripe_price_monthly:
        return "monthly"
    return "other"


def _price_for_plan(plan: str) -> str:
    price = settings.stripe_price_annual if plan == "annual" else settings.stripe_price_monthly
    if not price:
        raise HTTPException(status_code=400, detail="That plan is not available.")
    return price


def _require_user(db: Session, identity: Identity) -> UserRow:
    if identity.user_id is None:
        raise HTTPException(status_code=401, detail="Sign in first.")
    user = db.get(UserRow, identity.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in first.")
    return user


def _ensure_customer(db: Session, user: UserRow) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customer = _as_dict(
        _client().v1.customers.create(
            params={
                "email": user.email or None,
                "name": user.display_name or None,
                "metadata": {"user_id": str(user.id)},
            }
        )
    )
    user.stripe_customer_id = customer["id"]
    db.commit()
    return user.stripe_customer_id


def _return_path(path: str | None, fallback: str) -> str:
    if path and path.startswith("/") and not path.startswith("//"):
        return path
    return fallback


def create_checkout_session(
    db: Session, identity: Identity, plan: str, return_to: str | None = None
) -> str:
    user = _require_user(db, identity)
    ent = user_entitlement(user)
    if ent.status == STATUS_ACTIVE and user.stripe_subscription_id:
        raise HTTPException(status_code=409, detail="You already have a subscription.")
    price = _price_for_plan(plan)
    customer = _ensure_customer(db, user)
    base = settings.public_base_url.rstrip("/")
    after = _return_path(return_to, "/library")
    subscription_data: dict = {"metadata": {"user_id": str(user.id)}}
    trial_end = _utc(user.trial_ends_at)
    # Stripe wants a trial end at least 48 hours out; shorter remainders bill now.
    if trial_end is not None and trial_end - _now() > timedelta(hours=49):
        subscription_data["trial_end"] = int(trial_end.timestamp())
    params: dict = {
        "mode": "subscription",
        "customer": customer,
        "client_reference_id": str(user.id),
        "line_items": [{"price": price, "quantity": 1}],
        "success_url": f"{base}/billing/success?session_id={{CHECKOUT_SESSION_ID}}&next={after}",
        "cancel_url": f"{base}/pricing?canceled=1&next={after}",
        "allow_promotion_codes": True,
        "subscription_data": subscription_data,
        "customer_update": {"address": "auto", "name": "auto"},
    }
    if settings.stripe_automatic_tax:
        params["automatic_tax"] = {"enabled": True}
    session = _as_dict(_client().v1.checkout.sessions.create(params=params))
    return session["url"]


def create_portal_session(db: Session, identity: Identity) -> str:
    user = _require_user(db, identity)
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account yet.")
    base = settings.public_base_url.rstrip("/")
    session = _as_dict(
        _client().v1.billing_portal.sessions.create(
            params={"customer": user.stripe_customer_id, "return_url": f"{base}/settings"}
        )
    )
    return session["url"]


def cancel_subscription_now(user: UserRow) -> None:
    """Used when an account is deleted: stop billing immediately."""
    if not user.stripe_subscription_id or not settings.stripe_secret_key:
        return
    if (user.subscription_status or "") in {"canceled", "incomplete_expired"}:
        return
    try:
        _client().v1.subscriptions.cancel(user.stripe_subscription_id)
    except Exception:
        logger.exception("Could not cancel Stripe subscription %s", user.stripe_subscription_id)


def fetch_subscription(subscription_id: str) -> dict:
    return _as_dict(_client().v1.subscriptions.retrieve(subscription_id))


def _ts(value) -> datetime | None:
    if value in (None, ""):
        return None
    return datetime.fromtimestamp(int(value), tz=timezone.utc)


def _find_user(db: Session, customer_id: str | None, user_hint: str | None) -> UserRow | None:
    if customer_id:
        row = db.query(UserRow).filter(UserRow.stripe_customer_id == customer_id).one_or_none()
        if row is not None:
            return row
    if user_hint and str(user_hint).isdigit():
        row = db.get(UserRow, int(user_hint))
        if row is not None:
            if customer_id and not row.stripe_customer_id:
                row.stripe_customer_id = customer_id
            return row
    return None


def apply_subscription(db: Session, sub: dict) -> UserRow | None:
    customer = sub.get("customer")
    if isinstance(customer, dict):
        customer = customer.get("id")
    hint = (sub.get("metadata") or {}).get("user_id")
    user = _find_user(db, customer, hint)
    if user is None:
        logger.warning("Stripe subscription %s has no matching user", sub.get("id"))
        return None
    items = ((sub.get("items") or {}).get("data")) or []
    first = items[0] if items else {}
    price = (first.get("price") or {}).get("id")
    period_end = sub.get("current_period_end") or first.get("current_period_end")
    user.stripe_subscription_id = sub.get("id")
    user.subscription_status = sub.get("status")
    user.subscription_plan = plan_for_price(price)
    user.current_period_end = _ts(period_end)
    user.cancel_at_period_end = bool(sub.get("cancel_at_period_end"))
    return user


def verify_webhook(payload: bytes, signature: str | None) -> dict:
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Billing is not configured yet.")
    import stripe

    try:
        stripe.WebhookSignature.verify_header(
            payload.decode("utf-8"), signature, settings.stripe_webhook_secret
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Bad signature") from None
    return json.loads(payload)


def handle_webhook(db: Session, event: dict) -> bool:
    """Apply one Stripe event. Returns False when it was already applied."""
    event_id = event.get("id")
    kind = event.get("type") or ""
    if not event_id:
        raise HTTPException(status_code=400, detail="Event has no id")
    if db.get(StripeEventRow, event_id) is not None:
        return False
    obj = (event.get("data") or {}).get("object") or {}
    user: UserRow | None = None

    if kind == "checkout.session.completed":
        user = _find_user(db, obj.get("customer"), obj.get("client_reference_id"))
        sub_id = obj.get("subscription")
        if user is not None and sub_id:
            try:
                apply_subscription(db, fetch_subscription(sub_id))
            except Exception:
                logger.exception("Could not fetch subscription %s", sub_id)
                user.stripe_subscription_id = sub_id
                user.subscription_status = user.subscription_status or "active"
    elif kind in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
    }:
        user = apply_subscription(db, obj)
    elif kind == "invoice.payment_failed":
        user = _find_user(db, obj.get("customer"), None)
        if user is not None and user.subscription_status in _STRIPE_ACTIVE:
            user.subscription_status = "past_due"
    elif kind == "invoice.paid":
        user = _find_user(db, obj.get("customer"), None)
        if user is not None and user.subscription_status == "past_due":
            user.subscription_status = "active"

    db.add(StripeEventRow(id=event_id, kind=kind[:80]))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    if user is not None and kind in {"checkout.session.completed", "customer.subscription.deleted"}:
        from app.services.trial import record_billing_event

        record_billing_event(
            db,
            user.id,
            "subscribed" if kind == "checkout.session.completed" else "churned",
            {"plan": user.subscription_plan},
        )
    return True
