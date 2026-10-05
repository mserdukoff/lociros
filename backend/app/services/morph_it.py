from __future__ import annotations

import re

from app.core.once import load_once
from app.models.schemas import MorphInfo, Token
from app.services.data import vocab_bands

_LATIN = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]")

TENSE_MAP = {"Pres": "pres", "Past": "past", "Fut": "fut", "Imp": "impf"}
MOOD_MAP = {"Ind": "indc", "Imp": "impr", "Sub": "subj", "Cnd": "cond"}
NUMBER_MAP = {"Sing": "sg", "Plur": "pl"}
GENDER_MAP = {"Masc": "masc", "Fem": "fem", "Neut": "neut"}
FORM_MAP = {"Fin": "fin", "Inf": "inf", "Part": "part", "Ger": "ger"}


@load_once
def italian_nlp():
    import spacy

    return spacy.load("it_core_news_md")


def _morph_get(token, key: str) -> str | None:
    values = token.morph.get(key)
    return values[0] if values else None


def morph_from_spacy(token) -> MorphInfo:
    lemma = (token.lemma_ or token.text).lower()
    pos = token.pos_ or None
    if pos == "PROPN":
        pos_detail = "proper-noun"
    else:
        pos_detail = None
    return MorphInfo(
        lemma=lemma,
        pos=pos,
        case=None,
        gender=GENDER_MAP.get(_morph_get(token, "Gender") or ""),
        number=NUMBER_MAP.get(_morph_get(token, "Number") or ""),
        tense=TENSE_MAP.get(_morph_get(token, "Tense") or ""),
        aspect=None,
        mood=MOOD_MAP.get(_morph_get(token, "Mood") or ""),
        form=FORM_MAP.get(_morph_get(token, "VerbForm") or ""),
        pos_detail=pos_detail,
    )


def analyze_word_it(word: str) -> MorphInfo:
    doc = italian_nlp()(word)
    for tok in doc:
        if _LATIN.search(tok.text):
            return morph_from_spacy(tok)
    return MorphInfo(lemma=word.lower())


def analyze_text_it(text: str, language: str = "it") -> list[Token]:
    bands = vocab_bands(language)
    doc = italian_nlp()(text)
    tokens: list[Token] = []
    spacy_tokens = list(doc)
    for i, tok in enumerate(spacy_tokens):
        end = tok.idx + len(tok.text)
        nxt = spacy_tokens[i + 1].idx if i + 1 < len(spacy_tokens) else len(text)
        trailing = text[end:nxt]
        is_word = bool(_LATIN.search(tok.text))
        if not is_word:
            tokens.append(Token(text=tok.text, ws=trailing, is_word=False))
            continue
        morph = morph_from_spacy(tok)
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
