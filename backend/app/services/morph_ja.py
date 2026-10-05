from __future__ import annotations

import re
import threading

from app.core.once import load_once
from app.models.schemas import MorphInfo, Token
from app.services.data import vocab_bands
from app.services.kanji import breakdown

# The cached Sudachi tokenizer below is a single Rust-backed object shared
# by every request. FastAPI runs sync endpoints in a thread pool, and two
# threads calling tokenize() on it at once crash with "RuntimeError: Already
# borrowed" — Sudachi's tokenize() isn't reentrant. Gloss resolution now
# calls this on ordinary passage reads (not just generation), which made
# concurrent reads common enough to hit this reliably, so every call is
# serialized through this lock.
_SUDACHI_LOCK = threading.Lock()

_PUNCT_POS = {"補助記号", "空白"}
_KATAKANA_START = 0x30A1
_KATAKANA_END = 0x30F6
_KATA_TO_HIRA = 0x60

POS_EN = {
    "名詞": "noun",
    "動詞": "verb",
    "形容詞": "i-adj",
    "形状詞": "na-adj",
    "副詞": "adverb",
    "連体詞": "prenominal",
    "助詞": "particle",
    "助動詞": "aux",
    "感動詞": "interjection",
    "代名詞": "pronoun",
    "接頭辞": "prefix",
    "接尾辞": "suffix",
    "接続詞": "conjunction",
}

POS1_EN = {
    "係助詞": "binding",
    "格助詞": "case",
    "接続助詞": "conjunctive",
    "終助詞": "final",
    "副助詞": "adverbial",
    "準体助詞": "nominal",
    "非自立可能": "bound",
    "助動詞語幹": "aux-stem",
    "固有名詞": "proper-noun",
}

CONTENT_POS_JA = {"名詞", "動詞", "形容詞", "形状詞", "副詞"}

# UniDic lists a few everyday words under their formal dictionary reading.
# 私 as a pronoun is ワタクシ there; A1–B2 texts mean わたし.
_SPOKEN_READING = {
    ("私", "わたくし"): "わたし",
}


def spoken_reading(surface: str, reading: str | None) -> str | None:
    if not reading:
        return reading
    return _SPOKEN_READING.get((surface, reading), reading)


def kata_to_hira(text: str) -> str:
    out = []
    for ch in text:
        cp = ord(ch)
        if _KATAKANA_START <= cp <= _KATAKANA_END:
            out.append(chr(cp - _KATA_TO_HIRA))
        else:
            out.append(ch)
    return "".join(out)


@load_once
def sudachi():
    from sudachipy import dictionary, tokenizer

    tok = dictionary.Dictionary().create()
    mode = tokenizer.Tokenizer.SplitMode.C
    return tok, mode


def _pos_tuple(m) -> tuple[str, ...]:
    return tuple(m.part_of_speech())


def _pos_detail(pos: tuple[str, ...]) -> str | None:
    if len(pos) < 2 or pos[1] in {"*", ""}:
        return None
    return POS1_EN.get(pos[1], pos[1])


def _conj_type(pos: tuple[str, ...]) -> str | None:
    if len(pos) < 5 or pos[4] in {"*", ""}:
        return None
    raw = pos[4]
    if raw.startswith("五段"):
        return "godan"
    if "一段" in raw:
        return "ichidan"
    if "サ行変格" in raw:
        return "sahen"
    if "カ行変格" in raw:
        return "kahen"
    if raw == "形容詞":
        return "i-adj"
    if raw.startswith("助動詞"):
        return "aux"
    return raw


def morph_from_sudachi(m) -> MorphInfo:
    pos = _pos_tuple(m)
    pos0 = pos[0] if pos else None
    form = pos[5] if len(pos) > 5 and pos[5] not in {"*", ""} else None
    lemma = m.dictionary_form() or m.surface()
    surface = m.surface()
    reading = spoken_reading(surface, kata_to_hira(m.reading_form() or "")) or ""
    if reading == kata_to_hira(surface) or reading == lemma:
        # still useful for kanji
        if not re.search(r"[\u4e00-\u9faf]", surface):
            reading = None
    return MorphInfo(
        lemma=lemma,
        pos=POS_EN.get(pos0, pos0),
        reading=reading or None,
        form=form,
        pos_detail=_pos_detail(pos),
        conj_type=_conj_type(pos),
    )


def analyze_word_ja(word: str) -> MorphInfo:
    tok, mode = sudachi()
    with _SUDACHI_LOCK:
        ms = tok.tokenize(word, mode)
    if not ms:
        return MorphInfo(lemma=word)
    return morph_from_sudachi(ms[0])


def analyze_text_ja(text: str, language: str = "ja") -> list[Token]:
    bands = vocab_bands(language)
    tok, mode = sudachi()
    with _SUDACHI_LOCK:
        ms = list(tok.tokenize(text, mode))
    tokens: list[Token] = []
    for i, m in enumerate(ms):
        surface = m.surface()
        end = m.end()
        next_start = ms[i + 1].begin() if i + 1 < len(ms) else len(text)
        trailing = text[end:next_start]
        pos = _pos_tuple(m)
        pos0 = pos[0] if pos else ""
        if pos0 in _PUNCT_POS or not surface.strip():
            tokens.append(Token(text=surface, ws=trailing, is_word=False))
            continue
        morph = morph_from_sudachi(m)
        tokens.append(
            Token(
                text=surface,
                ws=trailing,
                is_word=True,
                lemma=morph.lemma,
                morph=morph,
                level=bands.get(morph.lemma),
                kanji=breakdown(surface, morph.reading),
            )
        )
    return tokens
