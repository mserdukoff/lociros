from __future__ import annotations

import logging
import re

from app.core.once import load_once
from app.models.schemas import ConjPiece, MorphInfo, Token
from app.services.data import vocab_bands
from app.services.roots import (
    dediac,
    make_root_part,
    normalize_lemma,
    pattern_to_form,
)

logger = logging.getLogger(__name__)

# Letters and tashkeel, not Arabic punctuation (؟ ، ؛).
_WORD = re.compile(
    r"(?:(?![\u060C\u061B\u061F\u066A\u06D4])"
    r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF])+"
)

POS_MAP = {
    "noun": "NOUN",
    "noun_prop": "PROPN",
    "noun_num": "NUM",
    "noun_quant": "NOUN",
    "adj": "ADJ",
    "adj_comp": "ADJ",
    "adj_num": "ADJ",
    "adv": "ADV",
    "adv_interrog": "ADV",
    "adv_rel": "ADV",
    "pron": "PRON",
    "pron_dem": "PRON",
    "pron_exclam": "PRON",
    "pron_interrog": "PRON",
    "pron_rel": "PRON",
    "verb": "VERB",
    "verb_pseudo": "VERB",
    "part": "PART",
    "part_dem": "PART",
    "part_det": "DET",
    "part_focus": "PART",
    "part_fut": "PART",
    "part_interrog": "PART",
    "part_neg": "PART",
    "part_noun": "PART",
    "part_restrict": "PART",
    "part_verb": "PART",
    "part_voc": "PART",
    "prep": "ADP",
    "abbrev": "NOUN",
    "punc": "PUNCT",
    "conj": "CCONJ",
    "conj_sub": "SCONJ",
    "interj": "INTJ",
    "digit": "NUM",
    "latin": "X",
}

CASE_MAP = {"n": "nom", "a": "acc", "g": "gen"}
ASP_MAP = {"p": "perf", "i": "impf", "c": "impr"}
TENSE_FROM_ASP = {"p": "past", "i": "pres", "c": None}
MOOD_MAP = {"i": "indc", "s": "subj", "j": "juss"}
VOICE_MAP = {"a": "act", "p": "pass"}
STATE_MAP = {"d": "def", "i": "indef", "c": "const"}
GENDER_MAP = {"m": "masc", "f": "fem"}
NUMBER_MAP = {"s": "sg", "d": "du", "p": "pl"}
PERSON_MAP = {"1": "1", "2": "2", "3": "3"}

# Longest first. Surface forms of attached pronouns (undiacritized).
_CLITIC_SUFFIXES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("3d_poss", ("هما",)),
    ("2d_poss", ("كما",)),
    ("3d_pron", ("هما",)),
    ("2d_pron", ("كما",)),
    ("3d_dobj", ("هما",)),
    ("2d_dobj", ("كما",)),
    ("1s_dobj", ("ني",)),
    ("1s_pron", ("ني",)),
    ("1p_poss", ("نا",)),
    ("1p_pron", ("نا",)),
    ("1p_dobj", ("نا",)),
    ("2mp_poss", ("كم",)),
    ("2mp_pron", ("كم",)),
    ("2mp_dobj", ("كم",)),
    ("2fp_poss", ("كن",)),
    ("2fp_pron", ("كن",)),
    ("2fp_dobj", ("كن",)),
    ("3mp_poss", ("هم",)),
    ("3mp_pron", ("هم",)),
    ("3mp_dobj", ("هم",)),
    ("3fp_poss", ("هن",)),
    ("3fp_pron", ("هن",)),
    ("3fp_dobj", ("هن",)),
    ("3fs_poss", ("ها",)),
    ("3fs_pron", ("ها",)),
    ("3fs_dobj", ("ها",)),
    ("1s_poss", ("ي",)),
    ("1s_pron", ("ي",)),
    ("2ms_poss", ("ك",)),
    ("2fs_poss", ("ك",)),
    ("2ms_pron", ("ك",)),
    ("2fs_pron", ("ك",)),
    ("2ms_dobj", ("ك",)),
    ("2fs_dobj", ("ك",)),
    ("3ms_poss", ("ه",)),
    ("3ms_pron", ("ه",)),
    ("3ms_dobj", ("ه",)),
)

_CLITIC_BY_ENC = {enc: sufs for enc, sufs in _CLITIC_SUFFIXES}

_CLITIC_LABEL = {
    "1s_poss": "my",
    "1p_poss": "our",
    "2ms_poss": "your (m)",
    "2fs_poss": "your (f)",
    "2d_poss": "your (dual)",
    "2mp_poss": "your (pl)",
    "2fp_poss": "your (f.pl)",
    "3ms_poss": "his",
    "3fs_poss": "her",
    "3d_poss": "their (dual)",
    "3mp_poss": "their",
    "3fp_poss": "their (f)",
    "1s_dobj": "me",
    "1p_dobj": "us",
    "2ms_dobj": "you (m)",
    "2fs_dobj": "you (f)",
    "2d_dobj": "you (dual)",
    "2mp_dobj": "you (pl)",
    "2fp_dobj": "you (f.pl)",
    "3ms_dobj": "him",
    "3fs_dobj": "her",
    "3d_dobj": "them (dual)",
    "3mp_dobj": "them",
    "3fp_dobj": "them (f)",
    "1s_pron": "me",
    "1p_pron": "us",
    "2ms_pron": "you (m)",
    "2fs_pron": "you (f)",
    "2d_pron": "you (dual)",
    "2mp_pron": "you (pl)",
    "2fp_pron": "you (f.pl)",
    "3ms_pron": "him",
    "3fs_pron": "her",
    "3d_pron": "them (dual)",
    "3mp_pron": "them",
    "3fp_pron": "them (f)",
}

_FALLBACK_SUFFIXES = (
    ("هما", "3d_poss"),
    ("كما", "2d_poss"),
    ("ني", "1s_dobj"),
    ("نا", "1p_poss"),
    ("كم", "2mp_poss"),
    ("كن", "2fp_poss"),
    ("هم", "3mp_poss"),
    ("هن", "3fp_poss"),
    ("ها", "3fs_poss"),
    ("ي", "1s_poss"),
    ("ك", "2ms_poss"),
    ("ه", "3ms_poss"),
)


def _clitic_enc(analysis: dict | None) -> str | None:
    if not analysis:
        return None
    enc = str(analysis.get("enc0") or "")
    if enc in {"", "0", "na", "u", "None"}:
        return None
    if enc.endswith(("_poss", "_dobj", "_iobj", "_pron")):
        return enc
    return None


def _stem_matches_lemma(stem: str, lemma: str) -> bool:
    if not stem or not lemma:
        return False
    a = normalize_lemma(stem)
    b = normalize_lemma(lemma)
    if a == b:
        return True
    # ة → ت before a possessive (مدرسته / مدرسة).
    if a.endswith("ت") and b == a[:-1] + "ة":
        return True
    if a.endswith("ت") and b == a[:-1] + "ه":
        return True
    return False


def _split_suffix(surface: str, suffixes: tuple[str, ...]) -> tuple[str, str] | None:
    text = dediac(surface)
    for suf in suffixes:
        if len(text) > len(suf) and text.endswith(suf):
            return text[: -len(suf)], suf
    return None


def clitic_pieces(
    surface: str,
    lemma: str | None,
    enclitic: str | None,
    pos: str | None = None,
) -> list[ConjPiece]:
    """Split an attached pronoun off the surface. Pure; used by tests and grammar."""
    enc = enclitic
    split = _split_suffix(surface, _CLITIC_BY_ENC[enc]) if enc and enc in _CLITIC_BY_ENC else None
    if split is None:
        text = dediac(surface)
        lemma_n = normalize_lemma(lemma or "")
        for suf, guessed in _FALLBACK_SUFFIXES:
            if len(text) <= len(suf) or not text.endswith(suf):
                continue
            stem = text[: -len(suf)]
            if lemma_n and not _stem_matches_lemma(stem, lemma_n):
                continue
            if pos == "VERB" and guessed.endswith("_poss"):
                guessed = guessed.replace("_poss", "_dobj")
            elif pos == "ADP" and guessed.endswith("_poss"):
                guessed = guessed.replace("_poss", "_pron")
            enc = guessed
            split = (stem, suf)
            break
    if not split or not enc:
        return []
    stem, suf = split
    if not stem:
        return []
    return [
        ConjPiece(text=stem, label="stem"),
        ConjPiece(text=suf, label=_CLITIC_LABEL.get(enc, "pronoun")),
    ]


def _prefer_clitic(analyzer, word: str, analysis: dict | None) -> dict | None:
    """If MLE missed a possessive, pick the shortest matching clitic lemma."""
    if _clitic_enc(analysis):
        return analysis
    if analyzer is None:
        return analysis
    scored: list[tuple[int, dict]] = []
    try:
        raw = analyzer.analyze(word)
    except Exception:
        return analysis
    for cand in raw:
        enc = _clitic_enc(cand)
        if not enc:
            continue
        lex = normalize_lemma(_feat(cand, "lex") or "")
        if not lex:
            continue
        split = _split_suffix(word, _CLITIC_BY_ENC.get(enc, ()))
        if not split:
            continue
        if _stem_matches_lemma(split[0], lex):
            scored.append((len(lex), cand))
    if not scored:
        return analysis
    scored.sort(key=lambda row: row[0])
    return scored[0][1]


def _feat(analysis: dict, *keys: str) -> str:
    for key in keys:
        val = analysis.get(key)
        if val and str(val) not in {"na", "u", "0", ""}:
            return str(val)
    return ""


def morph_from_analysis(analysis: dict, surface: str) -> MorphInfo:
    """Map a CAMeL analysis dict onto MorphInfo. Pure; used by tests."""
    lex = _feat(analysis, "lex", "lemma") or surface
    lemma = normalize_lemma(lex) or normalize_lemma(surface) or surface
    raw_pos = _feat(analysis, "pos")
    pos = POS_MAP.get(raw_pos, raw_pos.upper() if raw_pos else None)
    if raw_pos == "noun_prop":
        pos_detail = "proper-noun"
    else:
        pos_detail = None

    asp = _feat(analysis, "asp")
    tense = TENSE_FROM_ASP.get(asp)
    # سـ / سوف future marker lives on a proclitic.
    for key in ("prc3", "prc2", "prc1", "prc0"):
        prc = str(analysis.get(key) or "")
        if "sa_fut" in prc or prc.startswith("s_fut") or "sawfa" in prc:
            tense = "fut"
            break

    mood = MOOD_MAP.get(_feat(analysis, "mod"))
    if asp == "c":
        mood = "impr"

    pattern = _feat(analysis, "pattern") or None
    form = pattern_to_form(pattern) if pos == "VERB" else None

    diac = _feat(analysis, "diac") or None
    return MorphInfo(
        lemma=lemma,
        pos=pos,
        case=CASE_MAP.get(_feat(analysis, "cas")),
        gender=GENDER_MAP.get(_feat(analysis, "gen")),
        number=NUMBER_MAP.get(_feat(analysis, "num")),
        tense=tense,
        aspect=ASP_MAP.get(asp),
        mood=mood,
        reading=diac,
        form=form,
        pos_detail=pos_detail,
        conj_type=pattern,
        voice=VOICE_MAP.get(_feat(analysis, "vox")),
        person=PERSON_MAP.get(_feat(analysis, "per")),
        state=STATE_MAP.get(_feat(analysis, "stt")),
        enclitic=_clitic_enc(analysis),
    )


def tokenize_ar(text: str) -> list[tuple[str, str, bool]]:
    """Split into (surface, trailing_ws, is_word) keeping original gaps."""
    out: list[tuple[str, str, bool]] = []
    i = 0
    n = len(text)
    while i < n:
        m = _WORD.match(text, i)
        if m:
            j = m.end()
            k = j
            while k < n and text[k].isspace():
                k += 1
            out.append((m.group(0), text[j:k], True))
            i = k
            continue
        if text[i].isspace():
            k = i
            while k < n and text[k].isspace():
                k += 1
            if out:
                prev = out[-1]
                out[-1] = (prev[0], prev[1] + text[i:k], prev[2])
            else:
                out.append((text[i:k], "", False))
            i = k
            continue
        j = i + 1
        while j < n and not text[j].isspace() and not _WORD.match(text, j):
            j += 1
        k = j
        while k < n and text[k].isspace():
            k += 1
        out.append((text[i:j], text[j:k], False))
        i = k
    return out


@load_once
def _camel():
    try:
        from camel_tools.disambig.mle import MLEDisambiguator
        from camel_tools.morphology.analyzer import Analyzer
        from camel_tools.morphology.database import MorphologyDB

        db = MorphologyDB.builtin_db()
        analyzer = Analyzer(db)
        try:
            mle = MLEDisambiguator.pretrained()
        except Exception:
            logger.warning("CAMeL MLE disambiguator unavailable; using first analysis")
            mle = None
        return analyzer, mle
    except Exception:
        logger.warning("CAMeL Tools morphological database is not installed")
        return None, None


def camel_available() -> bool:
    analyzer, _ = _camel()
    return analyzer is not None


def _analyze_words(words: list[str]) -> list[dict | None]:
    analyzer, mle = _camel()
    if analyzer is None:
        return [None] * len(words)
    if mle is not None and words:
        try:
            disambig = mle.disambiguate(words)
            out: list[dict | None] = []
            for item, word in zip(disambig, words):
                analyses = getattr(item, "analyses", None) or []
                if analyses:
                    scored = analyses[0]
                    analysis = getattr(scored, "analysis", scored)
                    if isinstance(analysis, dict):
                        out.append(_prefer_clitic(analyzer, word, analysis))
                    else:
                        out.append(None)
                else:
                    raw = analyzer.analyze(word)
                    out.append(_prefer_clitic(analyzer, word, raw[0] if raw else None))
            return out
        except Exception:
            logger.exception("CAMeL disambiguation failed")
    out = []
    for word in words:
        raw = analyzer.analyze(word)
        out.append(_prefer_clitic(analyzer, word, raw[0] if raw else None))
    return out


def analyze_word_ar(word: str) -> MorphInfo:
    pieces = tokenize_ar(word)
    surface = next((p[0] for p in pieces if p[2]), word)
    analyses = _analyze_words([surface])
    analysis = analyses[0] if analyses else None
    if not analysis:
        return MorphInfo(lemma=normalize_lemma(surface) or surface)
    return morph_from_analysis(analysis, surface)


def analyze_text_ar(text: str, language: str = "ar") -> list[Token]:
    bands = vocab_bands(language)
    pieces = tokenize_ar(text)
    word_surfaces = [p[0] for p in pieces if p[2]]
    analyses = _analyze_words(word_surfaces)
    ai = 0
    tokens: list[Token] = []
    for surface, trailing, is_word in pieces:
        if not is_word:
            tokens.append(Token(text=surface, ws=trailing, is_word=False))
            continue
        analysis = analyses[ai] if ai < len(analyses) else None
        ai += 1
        if analysis:
            morph = morph_from_analysis(analysis, surface)
            root = make_root_part(
                analysis.get("root"),
                pattern=_feat(analysis, "pattern") or None,
                form=morph.form,
            )
        else:
            morph = MorphInfo(lemma=normalize_lemma(surface) or surface)
            root = None
        tokens.append(
            Token(
                text=surface,
                ws=trailing,
                is_word=True,
                lemma=morph.lemma,
                morph=morph,
                level=bands.get(morph.lemma),
                root=root,
            )
        )
    return tokens
