from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.db import Base
from app.services.generate import complete_read, save_authored_passage
from app.services.learner import bump_level, lemma_token_stats, pick_next_id
from app.services.library import list_library
from app.services.morph import analyze_text


def test_bump_level_moves_one_step():
    assert bump_level("A2", "too_easy") == "B1"
    assert bump_level("A2", "too_hard") == "A1"
    assert bump_level("A1", "too_hard") == "A1"
    assert bump_level("B2", "too_easy") == "B2"
    assert bump_level("A2", "just_right") == "A2"


def test_lemma_token_stats_counts_occurrences():
    tokens = analyze_text("これは本です。本は新しいです。", "ja")
    new, recycled = lemma_token_stats(tokens, "ja", set())
    assert new > 0
    assert recycled == 0
    seen = {"本"}
    new2, recycled2 = lemma_token_stats(tokens, "ja", seen)
    assert recycled2 >= 2
    assert new2 == new - recycled2


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_too_easy_raises_placement_after_three_signals():
    db = _session()
    first = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="home",
        genre="daily_life",
        title="私の朝",
        text="私は学生です。これは本です。本は新しいです。",
    )
    second = save_authored_passage(
        db,
        language="ja",
        level="B1",
        topic="reading",
        genre="daily_life",
        title="電車で本を読む",
        text="今、本を読んでいます。友達は駅にいます。",
    )
    one = complete_read(db, first.id, "too_easy", "test-device-1")
    assert one is not None
    assert one["placement"] == "A2"
    complete_read(db, first.id, "too_easy", "test-device-1")
    three = complete_read(db, first.id, "too_easy", "test-device-1")
    assert three is not None
    assert three["placement"] == "B1"
    assert three["next_id"] == second.id

    library = list_library(db, "ja", "test-device-1")
    assert library.placement == "B1"
    assert library.next_id == second.id
    read = next(item for item in library.items if item.id == first.id)
    unread = next(item for item in library.items if item.id == second.id)
    assert read.read
    assert not unread.read
    assert unread.recycled_lemmas >= 1


def test_reader_placed_by_reading_alone_gets_a_recheck():
    from datetime import timedelta

    from app.models.db import LearnerReadRow, LearnerRow

    db = _session()
    passage = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="home",
        genre="daily_life",
        title="私の朝",
        text="私は学生です。これは本です。",
    )
    complete_read(db, passage.id, "just_right", "test-device-9")
    learner = db.query(LearnerRow).filter_by(device_id="test-device-9", language="ja").one()
    assert learner.placed == 1
    old = datetime.now(timezone.utc) - timedelta(days=45)
    learner.updated_at = old
    db.query(LearnerReadRow).filter_by(device_id="test-device-9").update({"created_at": old})
    db.commit()
    assert list_library(db, "ja", "test-device-9").recheck_from == "A2"


def test_learner_create_race_keeps_pending_rows(monkeypatch):
    from app.models.db import FeedbackRow, LearnerRow
    from app.services import learner as learner_mod

    db = _session()
    db.add(LearnerRow(device_id="race-device-1", language="ja", level="A2", consecutive_up=0, consecutive_down=0))
    db.commit()
    db.add(FeedbackRow(passage_id="p1", rating="too_easy", device_id="race-device-1"))

    real = learner_mod.get_learner
    calls = {"n": 0}

    def stale_then_real(*args, **kwargs):
        calls["n"] += 1
        return None if calls["n"] == 1 else real(*args, **kwargs)

    monkeypatch.setattr(learner_mod, "get_learner", stale_then_real)
    row = learner_mod.get_or_create_learner(db, "race-device-1", "ja")
    db.commit()
    assert row.level == "A2"
    assert db.query(FeedbackRow).count() == 1


def test_pick_next_skips_read_at_same_level():
    db = _session()
    a = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="a",
        genre="daily_life",
        title="A",
        text="私は学生です。これは本です。",
    )
    b = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="b",
        genre="daily_life",
        title="B",
        text="母は家にいます。水を飲みます。",
    )
    complete_read(db, a.id, "too_hard", "test-device-2")
    nxt = pick_next_id(db, "ja", "A1", {a.id}, exclude_id=a.id)
    assert nxt == b.id


def test_just_right_ingests_without_moving_level():
    db = _session()
    first = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="home",
        genre="daily_life",
        title="私の朝",
        text="私は学生です。これは本です。本は新しいです。",
    )
    result = complete_read(db, first.id, "just_right", "test-device-3")
    assert result is not None
    assert result["placement"] == "A2"
    assert result["new_lemmas"] > 0
    library = list_library(db, "ja", "test-device-3")
    assert library.placement == "A2"
    read = next(item for item in library.items if item.id == first.id)
    assert read.read
    assert library.seen_lemmas > 0


def test_pick_next_prefers_a_tapped_lemma_at_the_same_level():
    db = _session()
    with_book = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="book",
        genre="daily_life",
        title="本",
        text="これは本です。本は新しいです。",
    )
    without = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="home",
        genre="daily_life",
        title="家",
        text="母は家にいます。水を飲みます。",
    )
    with_book.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    without.created_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
    db.commit()
    nxt = pick_next_id(db, "ja", "A2", set(), tapped={"本"})
    assert nxt == with_book.id


def test_star_and_unstar_lemma():
    from app.services.learner import list_stars, star_lemma, unstar_lemma

    db = _session()
    passage = save_authored_passage(
        db,
        language="ja",
        level="A1",
        topic="table",
        genre="daily_life",
        title="これは本です",
        text="これは本です。本は新しいです。",
    )
    word = star_lemma(db, "test-device-4", "ja", "本", "book", passage.id)
    assert word.lemma == "本"
    assert word.gloss == "book"
    assert word.title == "これは本です"
    listed = list_stars(db, "test-device-4", "ja")
    assert [w.lemma for w in listed] == ["本"]
    star_lemma(db, "test-device-4", "ja", "本", "book", passage.id)
    assert len(list_stars(db, "test-device-4", "ja")) == 1
    assert unstar_lemma(db, "test-device-4", "ja", "本")
    assert list_stars(db, "test-device-4", "ja") == []
