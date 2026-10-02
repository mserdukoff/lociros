"""One short placement read per language. The score sets that language's band."""

from __future__ import annotations

from app.models.schemas import PlacementQuestion, PlacementRead, Token
from app.services.gloss import attach_glosses
from app.services.grammar import attach_grammar
from app.services.morph import analyze_text

LEVELS = ("A1", "A2", "B1", "B2")

# Parallel questions: a fact, a time or place, a cloze, then a fact that joins two sentences.
_TEXTS: dict[str, dict] = {
    "ja": {
        "title": "田中さんの朝",
        "text": (
            "けさ、田中さんは駅で新聞を読みました。"
            "電車は八時に来ました。"
            "田中さんは会社へ行きました。"
            "会社で水を飲みました。"
        ),
        "questions": [
            ("田中さんはどこで新聞を読みましたか。", ["家", "駅", "学校"], 1),
            ("電車は何時に来ましたか。", ["七時", "九時", "八時"], 2),
            ("田中さんは会社で___を飲みました。", ["水", "牛乳", "お茶"], 0),
            ("新聞のあと、田中さんはどこへ行きましたか。", ["市場", "家", "会社"], 2),
        ],
    },
    "ru": {
        "title": "Утро Анны",
        "text": (
            "Утром Анна была на рынке. Она купила хлеб и воду. "
            "Потом Анна пошла домой. Дома она пила чай."
        ),
        "questions": [
            ("Where was Anna in the morning?", ["at school", "at the station", "at the market"], 2),
            ("What did Anna buy?", ["tea and milk", "bread and water", "a book"], 1),
            ("Anna bought bread and water, then she went ___.", ["home", "to work", "to the park"], 0),
            ("What did Anna drink at home?", ["water", "tea", "coffee"], 1),
        ],
    },
    "it": {
        "title": "La mattina di Luca",
        "text": (
            "Stamattina Luca è andato al mercato. Ha comprato pane e acqua. "
            "Poi Luca è tornato a casa. A casa ha bevuto il tè."
        ),
        "questions": [
            ("Where did Luca go this morning?", ["to the office", "to the market", "to school"], 1),
            ("What did Luca buy?", ["tea and milk", "a newspaper", "bread and water"], 2),
            ("After the market, Luca went ___.", ["to the station", "home", "to work"], 1),
            ("What did Luca drink at home?", ["tea", "water", "coffee"], 0),
        ],
    },
    "ar": {
        "title": "صباح أحمد",
        "text": (
            "في الصباح ذهب أحمد إلى السوق. اشترى خبزاً وماء. "
            "ثم عاد أحمد إلى البيت. في البيت شرب شاياً."
        ),
        "questions": [
            ("Where did Ahmad go in the morning?", ["to school", "to the station", "to the market"], 2),
            ("What did Ahmad buy?", ["bread and water", "tea and milk", "a book"], 0),
            ("After the market, Ahmad went ___.", ["to work", "home", "to the park"], 1),
            ("What did Ahmad drink at home?", ["water", "coffee", "tea"], 2),
        ],
    },
}

_TOKEN_CACHE: dict[str, list[Token]] = {}


def band_for_score(correct: int, total: int = 4) -> str:
    if total <= 0:
        return "A2"
    if total == 4:
        if correct <= 1:
            return "A1"
        if correct == 2:
            return "A2"
        if correct == 3:
            return "B1"
        return "B2"
    ratio = correct / total
    if ratio <= 0.25:
        return "A1"
    if ratio <= 0.5:
        return "A2"
    if ratio <= 0.75:
        return "B1"
    return "B2"


def _tokens(language: str, text: str) -> list[Token]:
    cached = _TOKEN_CACHE.get(language)
    if cached is not None:
        return cached
    tokens = analyze_text(text, language)
    tokens = attach_glosses(tokens, use_llm=False, language=language)
    attach_grammar(tokens, language)
    _TOKEN_CACHE[language] = tokens
    return tokens


def placement_read(language: str) -> PlacementRead:
    spec = _TEXTS[language]
    questions = [
        PlacementQuestion(id=f"q{i + 1}", prompt=prompt, choices=list(choices))
        for i, (prompt, choices, _index) in enumerate(spec["questions"])
    ]
    return PlacementRead(
        language=language,  # type: ignore[arg-type]
        title=spec["title"],
        text=spec["text"],
        tokens=_tokens(language, spec["text"]),
        questions=questions,
    )


def score_placement(language: str, answers: list[int]) -> tuple[int, int, str]:
    spec = _TEXTS[language]
    keys = [item[2] for item in spec["questions"]]
    if len(answers) != len(keys):
        raise ValueError("Answer every question.")
    correct = sum(1 for got, want in zip(answers, keys) if got == want)
    return correct, len(keys), band_for_score(correct, len(keys))
