from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.db import Base, NewsIssueRow
from app.models.schemas import MorphInfo, Token
from app.services.comprehension import questions_from_english
from app.services.generate import hold_news_to_level, save_authored_passage
from app.services.learner import get_or_create_learner, set_placed_level
from app.services.library import list_library
from app.services.news import save_news
from app.services.placement import (
    _LADDER,
    LEVELS,
    next_step,
    placement_read,
    score_legacy,
)
from app.services.validator import ValidationResult, vocab_exempt


def _right(language: str, level: str) -> list[int]:
    return [q[2] for q in _LADDER[language][level]["questions"]]


def _wrong(language: str, level: str) -> list[int]:
    return [(k + 1) % 3 for k in _right(language, level)]


def test_every_language_has_a_passage_per_band():
    for language, ladder in _LADDER.items():
        assert tuple(ladder) == LEVELS, language
        for level, spec in ladder.items():
            assert spec["text"] and spec["title"], (language, level)
            assert len(spec["questions"]) == 4, (language, level)
            for _prompt, choices, key in spec["questions"]:
                assert 0 <= key < len(choices) == 3, (language, level)


def test_first_placement_climbs_until_a_fail():
    stages = [("A1", _right("ja", "A1"))]
    step = next_step("ja", "A1", stages)
    assert not step.done and step.next_level == "A2"
    stages.append(("A2", _right("ja", "A2")))
    stages.append(("B1", _wrong("ja", "B1")))
    step = next_step("ja", "A1", stages)
    assert step.done and step.level == "A2"


def test_one_easy_passage_no_longer_means_b2():
    # Every A1 answer right, then lost at A2: that reader is A1, not B2.
    step = next_step("ru", "A1", [("A1", _right("ru", "A1")), ("A2", _wrong("ru", "A2"))])
    assert step.level == "A1"
    assert next_step("ru", "A1", [("A1", _wrong("ru", "A1"))]).level == "A1"
    climb = [(level, _right("it", level)) for level in LEVELS]
    assert next_step("it", "A1", climb).level == "B2"


def test_recheck_starts_at_the_old_band():
    down = next_step("ar", "B1", [("B1", _wrong("ar", "B1"))])
    assert not down.done and down.next_level == "A2"
    settled = next_step("ar", "B1", [("B1", _wrong("ar", "B1")), ("A2", _right("ar", "A2"))])
    assert settled.level == "A2"
    up = next_step("ar", "B1", [("B1", _right("ar", "B1")), ("B2", _wrong("ar", "B2"))])
    assert up.level == "B1"
    floor = [(level, _wrong("ar", level)) for level in ("B1", "A2", "A1")]
    assert next_step("ar", "B1", floor).level == "A1"


def test_ladder_rejects_skipping_ahead():
    import pytest

    with pytest.raises(ValueError):
        next_step("ja", "A1", [("B2", _right("ja", "B2"))])
    with pytest.raises(ValueError):
        next_step("ja", "A1", [("A1", _wrong("ja", "A1")), ("A2", _right("ja", "A2"))])


def test_legacy_single_passage_caps_at_a2():
    assert score_legacy("ja", _right("ja", "A1")).level == "A2"
    assert score_legacy("ja", _wrong("ja", "A1")).level == "A1"


def test_placement_read_is_plain_text():
    for language in ("ja", "ru", "it", "ar"):
        for level in LEVELS:
            body = placement_read(language, level).model_dump()
            assert set(body) == {"language", "level", "title", "text", "questions"}
            assert body["level"] == level and body["text"]


def test_questions_come_from_the_translation():
    built = questions_from_english(
        "Tanaka read a newspaper at the station. The train came at eight. He drank water at the office.",
        "a morning commute",
    )
    assert 2 <= len(built) <= 3
    for question in built:
        assert question["answer_index"] < len(question["choices"])
        answer = question["choices"][question["answer_index"]]
        assert answer


def _result(passed: bool = True, overlevel: float = 0.0) -> ValidationResult:
    return ValidationResult(
        passed=passed,
        overlevel_lemma_rate=overlevel,
        subordinate_rate=0.0,
        forbidden_case_rate=0.0,
        forbidden_tense_rate=0.0,
        forbidden_pos_rate=0.0,
    )


def test_news_hold_rejects_english_left_in_japanese():
    held = hold_news_to_level("朝", "彼は annihilate と言った。", "ja", "B2", _result())
    assert held.passed is False
    assert any(flag.startswith("script:") for flag in held.flags)


def test_news_hold_rejects_vocabulary_above_the_band():
    held = hold_news_to_level("朝", "田中さんは駅で新聞を読みました。", "ja", "B2", _result(overlevel=0.4))
    assert held.passed is False
    assert any(flag.startswith("news:") for flag in held.flags)


def test_news_hold_keeps_an_in_band_draft():
    held = hold_news_to_level("朝", "田中さんは駅で新聞を読みました。", "ja", "B2", _result(overlevel=0.2))
    assert held.passed is True


def test_unsaved_news_is_featured_and_stays_off_the_shelf():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    row = save_authored_passage(
        db,
        language="ja",
        level="A2",
        topic="a morning paper",
        genre="news",
        title="朝の新聞",
        text="田中さんは駅で新聞を読みました。",
        translation="Tanaka read a newspaper at the station.",
    )
    today = datetime.now(timezone.utc).date().isoformat()
    db.add(
        NewsIssueRow(
            issue_date=today,
            language="ja",
            level="A2",
            status="public",
            passage_id=row.id,
            source_name="BBC News",
            headline="A morning paper",
            created_at=datetime.now(timezone.utc),
        )
    )
    learner = get_or_create_learner(db, "device-news-1", "ja")
    set_placed_level(learner, "A2")
    db.commit()

    library = list_library(db, "ja", "device-news-1")
    assert library.news_notice is not None
    assert library.news_notice.passage_id == row.id
    assert library.news_notice.saved is False
    assert library.news_notice.level == "A2"
    assert all(item.id != row.id for item in library.items)
    assert library.next_id != row.id

    assert save_news(db, "device-news-1", row.id, "ja", True) is True
    kept = list_library(db, "ja", "device-news-1")
    assert kept.news_notice is not None and kept.news_notice.saved is True
    assert all(item.id != row.id for item in kept.items)

    issue = db.query(NewsIssueRow).one()
    issue.issue_date = "2020-01-01"
    db.commit()
    later = list_library(db, "ja", "device-news-1")
    assert later.news_notice is None
    assert any(item.id == row.id for item in later.items)

    assert save_news(db, "device-news-1", row.id, "ja", False) is False
    dropped = list_library(db, "ja", "device-news-1")
    assert all(item.id != row.id for item in dropped.items)


def test_katakana_names_are_not_graded_vocabulary():
    tok = Token(
        text="ロンドン",
        lemma="ロンドン",
        morph=MorphInfo(lemma="ロンドン", pos="noun"),
    )
    assert vocab_exempt(tok)
    number = Token(
        text="2026",
        lemma="2026",
        morph=MorphInfo(lemma="2026", pos="NOUN"),
    )
    assert vocab_exempt(number)
