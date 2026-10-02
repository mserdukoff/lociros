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
from app.services.placement import band_for_score, score_placement
from app.services.validator import ValidationResult, vocab_exempt


def test_band_for_score_spreads_four_questions():
    assert band_for_score(0) == "A1"
    assert band_for_score(1) == "A1"
    assert band_for_score(2) == "A2"
    assert band_for_score(3) == "B1"
    assert band_for_score(4) == "B2"


def test_score_placement_uses_the_answer_key():
    correct, total, level = score_placement("ja", [1, 2, 0, 2])
    assert (correct, total, level) == (4, 4, "B2")
    correct, total, level = score_placement("ru", [0, 0, 1, 0])
    assert correct == 0
    assert level == "A1"


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
