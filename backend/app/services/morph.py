from __future__ import annotations

import re
from functools import lru_cache

import razdel

from app.core.once import load_once
from app.models.schemas import MorphInfo, Token
from app.services.data import vocab_bands

_CYRILLIC = re.compile(r"[А-Яа-яЁё]")

CASE_MAP = {
    "nomn": "nom",
    "gent": "gen",
    "gen2": "gen",
    "datv": "dat",
    "accs": "acc",
    "acc2": "acc",
    "ablt": "ins",
    "loct": "prep",
    "loc2": "prep",
    "voct": "nom",
}
TENSE_MAP = {"pres": "pres", "past": "past", "futr": "fut"}
GENDER_MAP = {"masc": "masc", "femn": "fem", "neut": "neut"}
NUMBER_MAP = {"sing": "sg", "plur": "pl"}
ASPECT_MAP = {"impf": "impf", "perf": "perf"}
MOOD_MAP = {"indc": "indc", "impr": "impr"}
_NAME_GRAMMEMES = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad"}


@load_once
def morph_analyzer():
    import pymorphy3

    return pymorphy3.MorphAnalyzer()


def analyze_word_ru(word: str) -> MorphInfo:
    parsed = morph_analyzer().parse(word)
    p = parsed[0] if parsed else None
    if p is None:
        return MorphInfo(lemma=word.lower())
    tag = p.tag
    case = CASE_MAP.get(str(tag.case)) if tag.case else None
    is_name = bool(tag.grammemes & _NAME_GRAMMEMES)
    return MorphInfo(
        lemma=(p.normal_form or word).lower(),
        pos=str(tag.POS) if tag.POS else None,
        case=case,
        gender=GENDER_MAP.get(str(tag.gender)) if tag.gender else None,
        number=NUMBER_MAP.get(str(tag.number)) if tag.number else None,
        tense=TENSE_MAP.get(str(tag.tense)) if tag.tense else None,
        aspect=ASPECT_MAP.get(str(tag.aspect)) if tag.aspect else None,
        mood=MOOD_MAP.get(str(tag.mood)) if tag.mood else None,
        pos_detail="proper-noun" if is_name else None,
    )


def analyze_text_ru(text: str, language: str = "ru") -> list[Token]:
    bands = vocab_bands(language)
    raw = list(razdel.tokenize(text))
    tokens: list[Token] = []
    for i, tok in enumerate(raw):
        end = raw[i + 1].start if i + 1 < len(raw) else len(text)
        trailing = text[tok.stop : end]
        is_word = bool(_CYRILLIC.search(tok.text))
        if not is_word:
            tokens.append(Token(text=tok.text, ws=trailing, is_word=False))
            continue
        morph = analyze_word_ru(tok.text)
        tokens.append(
            Token(
                text=tok.text,
                ws=trailing,
                is_word=True,
                lemma=morph.lemma,
                morph=morph,
                level=bands.get(morph.lemma),
            )
        )
    return tokens


def analyze_word(word: str, language: str = "ru") -> MorphInfo:
    # Copy so callers can edit the result without touching the cached analysis.
    return _analyze_word_cached(word, language).model_copy(deep=True)


@lru_cache(maxsize=50_000)
def _analyze_word_cached(word: str, language: str) -> MorphInfo:
    if language == "ja":
        from app.services.morph_ja import analyze_word_ja

        return analyze_word_ja(word)
    if language == "it":
        from app.services.morph_it import analyze_word_it

        return analyze_word_it(word)
    if language == "ar":
        from app.services.morph_ar import analyze_word_ar

        return analyze_word_ar(word)
    return analyze_word_ru(word)


def analyze_text(text: str, language: str = "ru") -> list[Token]:
    if language == "ja":
        from app.services.morph_ja import analyze_text_ja

        tokens = analyze_text_ja(text, language)
    elif language == "it":
        from app.services.morph_it import analyze_text_it

        tokens = analyze_text_it(text, language)
    elif language == "ar":
        from app.services.morph_ar import analyze_text_ar

        tokens = analyze_text_ar(text, language)
    else:
        tokens = analyze_text_ru(text, language)
    from app.services.grammar import attach_grammar

    return attach_grammar(tokens, language)


def word_count(tokens: list[Token]) -> int:
    return sum(1 for t in tokens if t.is_word)
