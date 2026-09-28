import pytest

from app.models.db import Base, LearnerRow, LearnerStarRow, SessionLocal, UserRow, engine
from app.services.identity import Identity, merge_guest_into_user
from app.services.learner import get_learner, list_stars


@pytest.fixture()
def db():
    assert engine.url.get_backend_name() == "sqlite", "refusing to drop tables outside SQLite"
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def _user(db) -> int:
    user = UserRow(email="reader@example.com")
    db.add(user)
    db.commit()
    return user.id


def _learner(db, device: str, level: str, placed: int, user_id: int | None = None) -> None:
    db.add(
        LearnerRow(
            device_id=device,
            user_id=user_id,
            language="ja",
            level=level,
            placed=placed,
        )
    )
    db.commit()


def test_placed_account_keeps_its_band(db):
    uid = _user(db)
    _learner(db, "phone-00000001", "B1", 1, uid)
    _learner(db, "laptop-0000001", "A1", 1)

    merge_guest_into_user(db, "laptop-0000001", uid)

    row = get_learner(db, Identity(user_id=uid, device_id="laptop-0000001"), "ja")
    assert row is not None
    assert row.level == "B1"
    assert db.query(LearnerRow).count() == 1


def test_unplaced_account_takes_the_browser_band(db):
    uid = _user(db)
    _learner(db, "phone-00000001", "A2", 0, uid)
    _learner(db, "laptop-0000001", "B2", 1)

    merge_guest_into_user(db, "laptop-0000001", uid)

    row = get_learner(db, Identity(user_id=uid, device_id=None), "ja")
    assert row is not None
    assert (row.level, row.placed) == ("B2", 1)


def test_new_rows_move_and_duplicates_drop(db):
    uid = _user(db)
    db.add(LearnerStarRow(device_id="phone-00000001", user_id=uid, language="ja", lemma="猫"))
    db.add(LearnerStarRow(device_id="laptop-0000001", language="ja", lemma="猫"))
    db.add(LearnerStarRow(device_id="laptop-0000001", language="ja", lemma="犬"))
    db.commit()

    merge_guest_into_user(db, "laptop-0000001", uid)

    lemmas = sorted(s.lemma for s in list_stars(db, Identity(user_id=uid, device_id=None), "ja"))
    assert lemmas == ["犬", "猫"]
