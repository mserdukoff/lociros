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
