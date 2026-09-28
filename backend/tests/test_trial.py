from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.db import Base, LearnerReadRow, TrialEventRow
from app.services.identity import Identity
from app.services.trial import funnel_metrics, record_account_linked, record_event, trial_metrics


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_trial_metrics_counts_second_reads_and_wtp():
    db = _session()
    ident = Identity(user_id=None, device_id="trial-device-1")
    now = datetime.now(timezone.utc)
    db.add(LearnerReadRow(device_id=ident.device_id, passage_id="p1", created_at=now))
    db.add(LearnerReadRow(device_id=ident.device_id, passage_id="p2", created_at=now))
    db.commit()
    record_event(db, kind="wtp", identity=ident)
    metrics = trial_metrics(db, days=30)
    assert metrics["learners_with_reads"] == 1
    assert metrics["second_text_completion"] == 1.0
    assert metrics["second_text_pass"] is True
    assert metrics["unsolicited_wtp"] >= 1
    assert "funnel" in metrics


def _event(db, kind, device, at):
    db.add(TrialEventRow(kind=kind, device_id=device, created_at=at))


def test_funnel_counts_each_device_once_per_step():
    db = _session()
    now = datetime.now(timezone.utc)
    for device in ("a", "b", "c", "d"):
        _event(db, "landing_view", device, now)
    _event(db, "landing_view", "a", now)
    _event(db, "start_click", "a", now)
    _event(db, "start_click", "a", now)
    _event(db, "start_click", "b", now)
    _event(db, "placement_done", "a", now)
    _event(db, "read_complete", "a", now)
    _event(db, "read_complete", "a", now)
    _event(db, "placement_done", "stranger", now)
    db.commit()
    funnel = funnel_metrics(db, days=30, now=now)
    steps = {s["step"]: s for s in funnel["steps"]}
    assert funnel["landing_devices"] == 4
    assert steps["start_click"]["devices"] == 2
    assert steps["start_click"]["rate"] == 0.5
    assert steps["placement_done"]["devices"] == 1
    assert steps["first_rating"]["devices"] == 1
    assert steps["account_linked"]["devices"] == 0


def test_funnel_returns_only_count_devices_old_enough():
    db = _session()
    now = datetime(2026, 9, 20, 12, tzinfo=timezone.utc)
    _event(db, "session_start", "back", now - timedelta(days=8))
    _event(db, "session_start", "back", now - timedelta(days=7))
    _event(db, "session_start", "gone", now - timedelta(days=8))
    _event(db, "session_start", "late", now - timedelta(days=8))
    _event(db, "session_start", "late", now - timedelta(days=3))
    _event(db, "session_start", "new", now)
    db.commit()
    returns = {r["window_days"]: r for r in funnel_metrics(db, days=30, now=now)["returns"]}
    assert returns[2]["eligible"] == 3
    assert returns[2]["returned"] == 1
    assert returns[7]["eligible"] == 3
    assert returns[7]["returned"] == 2


def test_sticky_test_compares_placement_by_arm():
    db = _session()
    now = datetime.now(timezone.utc)
    ident = lambda d: Identity(user_id=None, device_id=d)  # noqa: E731
    record_event(db, kind="landing_view", identity=ident("s1"), payload={"sticky_arm": "sticky"})
    record_event(db, kind="landing_view", identity=ident("s2"), payload={"sticky_arm": "sticky"})
    record_event(db, kind="landing_view", identity=ident("c1"), payload={"sticky_arm": "control"})
    record_event(db, kind="landing_view", identity=ident("x"), payload={"variant": "shader"})
    record_event(db, kind="placement_done", identity=ident("s1"))
    arms = {a["arm"]: a for a in funnel_metrics(db, days=30, now=now)["sticky_test"]}
    assert arms["sticky"]["devices"] == 2
    assert arms["sticky"]["placement_done"] == 1
    assert arms["sticky"]["rate"] == 0.5
    assert arms["control"]["devices"] == 1
    assert arms["control"]["placement_done"] == 0


def test_sticky_test_is_empty_when_the_flag_is_off():
    db = _session()
    record_event(db, kind="landing_view", identity=Identity(user_id=None, device_id="a"))
    assert funnel_metrics(db, days=30)["sticky_test"] == []


def test_account_linked_is_recorded_once_per_device():
    db = _session()
    ident = Identity(user_id=7, device_id="dev-1")
    record_account_linked(db, ident)
    record_account_linked(db, ident)
    record_account_linked(db, Identity(user_id=None, device_id="dev-2"))
    assert db.query(TrialEventRow).filter(TrialEventRow.kind == "account_linked").count() == 1
