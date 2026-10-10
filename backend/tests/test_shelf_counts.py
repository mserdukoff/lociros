import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.db import SHELF_QUARANTINE, Base, PassageRow
from app.services import library


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _passage(pid, language, *, passed=True, genre=None, status=None):
    row = PassageRow(
        id=pid,
        language=language,
        level="A2",
        topic="t",
        genre=genre,
        title="t",
        text="t",
        tokens_json="[]",
        calibration_json=json.dumps({"passed": passed}),
        word_count=1,
    )
    if status:
        row.shelf_status = status
    return row


def test_shelf_counts_only_counts_passages_a_reader_can_open():
    library._counts_cache = None
    db = _session()
    db.add_all(
        [
            _passage("a", "ja"),
            _passage("b", "ja", genre="story"),
            _passage("c", "ja", passed=False),
            _passage("d", "ja", genre="news"),
            _passage("e", "ja", status=SHELF_QUARANTINE),
            _passage("f", "it"),
        ]
    )
    db.commit()
    assert library.shelf_counts(db) == {"ja": 2, "it": 1}
    library._counts_cache = None


def test_public_catalog_lists_the_same_passages_as_the_counts():
    library._catalog_cache = None
    db = _session()
    db.add_all(
        [
            _passage("a", "ja"),
            _passage("b", "ja", genre="story"),
            _passage("c", "ja", passed=False),
            _passage("d", "ja", genre="news"),
            _passage("e", "ja", status=SHELF_QUARANTINE),
            _passage("f", "it"),
        ]
    )
    db.commit()
    items = library.public_catalog(db)
    assert sorted(item["id"] for item in items) == ["a", "b", "f"]
    assert set(items[0]) >= {"id", "language", "level", "title", "created_at"}
    assert "text" not in items[0]
    library._catalog_cache = None


def _tok(text, lemma, pos, is_word=True):
    return {"text": text, "lemma": lemma, "is_word": is_word, "morph": {"pos": pos, "lemma": lemma or text}}


def test_cached_lemma_stats_match_token_stats():
    from app.services import learner

    learner.clear_lemma_cache()
    db = _session()
    row = _passage("p", "ru")
    row.tokens_json = json.dumps(
        [
            _tok("кошка", "кошка", "NOUN"),
            _tok("и", "и", "CONJ"),
            _tok("кошки", "кошка", "NOUN"),
            _tok("спит", "спать", "VERB"),
            _tok(".", None, "PNCT", is_word=False),
        ]
    )
    db.add(row)
    db.commit()
    seen = {"кошка"}
    expected = learner.lemma_token_stats(learner.tokens_from_row(row), "ru", seen)

    entry = learner.passage_lemmas(db, learner.shelf_rows(db, "ru"))["p"]
    assert entry.stats(seen) == expected
    assert "и" in entry.all

    row.tokens_json = "[]"
    db.commit()
    again = learner.passage_lemmas(db, learner.shelf_rows(db, "ru"))["p"]
    assert again.stats(seen) == expected, "second call is served from the cache"
    learner.clear_lemma_cache()
