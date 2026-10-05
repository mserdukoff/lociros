from __future__ import annotations

import re

from app.models.schemas import Token
from app.services.data import grammar_rules, level_rank, vocab_bands
from app.services.validator import ValidationResult, vocab_exempt

CONTENT_POS = {"NOUN", "VERB", "ADJ", "ADV", "PROPN"}
AUX_LEMMAS = {"essere", "avere"}
CLITIC_LEMMAS = {
    "mi",
    "ti",
    "lo",
    "la",
    "li",
    "le",
    "ci",
    "vi",
    "gli",
    "ne",
    "si",
    "me",
    "te",
    "ce",
}
CLITIC_CLUSTERS = {
    "glielo",
    "gliela",
    "glieli",
    "gliele",
}
SUBORDINATE_LEMMAS = {
    "perché",
    "quando",
    "se",
    "mentre",
    "sebbene",
    "benché",
    "affinché",
    "nonostante",
    "poiché",
    "siccome",
    "purché",
    "qualora",
    "che",
}


def _prev_word_index(tokens: list[Token], index: int) -> int | None:
    for j in range(index - 1, -1, -1):
        if tokens[j].is_word:
            return j
    return None


def _next_word(tokens: list[Token], index: int) -> Token | None:
    for t in tokens[index + 1 :]:
        if t.is_word:
            return t
    return None


def _prev_word(tokens: list[Token], index: int) -> Token | None:
    j = _prev_word_index(tokens, index)
    return tokens[j] if j is not None else None


def _is_sentence_initial(tokens: list[Token], index: int) -> bool:
    for t in reversed(tokens[:index]):
        if not t.is_word:
            if t.text in ".!?…":
                return True
            continue
        return False
    return True


def _is_aux(tok: Token) -> bool:
    if not tok.morph:
        return False
    lemma = tok.lemma or tok.morph.lemma
    pos = tok.morph.pos or ""
    return lemma in AUX_LEMMAS and pos in {"AUX", "VERB"}


def _form(tok: Token) -> str:
    return (tok.morph.form if tok.morph else None) or ""


def _pos(tok: Token) -> str:
    return (tok.morph.pos if tok.morph else None) or ""


def _in_passato_prossimo(tokens: list[Token], index: int, tok: Token) -> bool:
    if _form(tok) != "part":
        return False
    prev_i = _prev_word_index(tokens, index)
    if prev_i is None:
        return False
    prev = tokens[prev_i]
    if _is_aux(prev):
        return True
    if _pos(prev) in {"ADV", "PRON"}:
        earlier_i = _prev_word_index(tokens, prev_i)
        if earlier_i is not None and _is_aux(tokens[earlier_i]):
            return True
    return False


TONIC_PRONOUNS = {"me", "te", "sé"}
# Every imperfetto has the -v- ending except essere's (ero, era, eravamo...).
_IMPERFETTO = re.compile(r"(?:[aei]v(?:o|i|a|amo|ate|ano)|^er(?:o|i|a|avamo|avate|ano))$")


def _is_clitic(tok: Token, prev: Token | None = None) -> bool:
    lemma = (tok.lemma or "").lower()
    if lemma in CLITIC_CLUSTERS:
        return True
    if lemma not in CLITIC_LEMMAS:
        return False
    # "per me", "con te": stressed pronouns after a preposition, not clitics.
    if (tok.text or "").lower() in TONIC_PRONOUNS and prev is not None and _pos(prev) == "ADP":
        return False
    return _pos(tok) == "PRON"


def _tense(tok: Token) -> str:
    """spaCy sometimes tags present forms ('tornano') as imperfetto."""
    tense = (tok.morph.tense if tok.morph else None) or ""
    if tense == "impf" and not _IMPERFETTO.search((tok.text or "").lower()):
        return "pres"
    return tense


def _has_subject_before(tokens: list[Token], index: int) -> bool:
    for t in reversed(tokens[:index]):
        if not t.is_word:
            if any(ch in t.text for ch in ".!?…:;,"):
                return False
            continue
        if _pos(t) in {"NOUN", "PROPN"} or (_pos(t) == "PRON" and not _is_clitic(t)):
            return True
    return False


def _mood(tokens: list[Token], index: int, tok: Token) -> str:
    """spaCy tags 'Marco cammina' as imperative (3sg present = 2sg imperative).
    A verb with a subject before it in the same clause is indicative."""
    mood = (tok.morph.mood if tok.morph else None) or ""
    if mood == "impr" and _has_subject_before(tokens, index):
        return "indc"
    return mood


def _detect_constructions(tokens: list[Token], i: int, tok: Token) -> list[str]:
    hits: list[str] = []
    lemma = tok.lemma or ""
    morph = tok.morph
    form = (morph.form if morph else None) or ""
    tense = _tense(tok)
    mood = (morph.mood if morph else None) or ""
    pos = (morph.pos if morph else None) or ""
    prev = _prev_word(tokens, i)
    nxt = _next_word(tokens, i)

    if _is_aux(tok) and nxt and _form(nxt) == "part":
        hits.append("passato_prossimo")
    if form == "part" and _in_passato_prossimo(tokens, i, tok):
        hits.append("passato_prossimo")

    if tense == "impf":
        hits.append("imperfetto")
    if tense == "fut":
        hits.append("futuro")
    if mood == "cond":
        hits.append("condizionale")
    if mood == "subj":
        hits.append("congiuntivo")
    if form == "ger":
        hits.append("gerundio")

    if tense == "past" and form == "fin" and mood in {"indc", ""}:
        hits.append("passato_remoto")

    if form == "part" and not _in_passato_prossimo(tokens, i, tok):
        hits.append("participio")

    if lemma == "che" and pos in {"SCONJ", "PRON"} and prev and _pos(prev) in {
        "NOUN",
        "PROPN",
        "PRON",
    }:
        if not _is_sentence_initial(tokens, i):
            hits.append("relative_che")

    if _is_clitic(tok, prev):
        hits.append("clitic")
        if lemma in CLITIC_CLUSTERS:
            hits.append("clitic_cluster")
        elif nxt and _is_clitic(nxt, tok):
            hits.append("clitic_cluster")

    return hits


def validate_tokens_it(tokens: list[Token], level: str) -> ValidationResult:
    ruleset = grammar_rules("it")
    rules = ruleset[level]
    forbidden = set(rules.get("forbidden_constructions") or [])
    forbidden_conjunctions = set(rules.get("forbidden_conjunctions") or [])
    allowed_tenses = set(rules.get("allowed_tenses") or [])
    allowed_moods = set(rules.get("allowed_moods") or [])
    bands = vocab_bands("it")
    cap = level_rank(level)

    word_tokens = [t for t in tokens if t.is_word and t.morph]
    n = max(len(word_tokens), 1)

    tense_hits = 0
    pos_hits = 0
    sub_hits = 0
    conj_hits = 0
    overlevel = 0
    content_n = 0
    flags: list[str] = []
    seen: set[str] = set()

    def flag(msg: str) -> None:
        if msg not in seen:
            seen.add(msg)
            flags.append(msg)

    for i, tok in enumerate(tokens):
        if not tok.is_word or not tok.morph:
            continue
        m = tok.morph
        lemma = m.lemma
        form = m.form or ""

        for cons in _detect_constructions(tokens, i, tok):
            if cons in forbidden:
                conj_hits += 1
                flag(f"it:{cons} ({tok.text})")

        tense = _tense(tok)
        if form == "fin" and tense and tense not in allowed_tenses:
            tense_hits += 1
            flag(f"tense:{tense} ({tok.text})")

        mood = _mood(tokens, i, tok)
        if mood and mood not in allowed_moods:
            tense_hits += 1
            flag(f"mood:{mood} ({tok.text})")

        if lemma in SUBORDINATE_LEMMAS:
            if lemma == "quando" and _is_sentence_initial(tokens, i):
                pass
            else:
                sub_hits += 1

        if lemma in forbidden_conjunctions:
            if lemma == "quando" and _is_sentence_initial(tokens, i):
                pass
            else:
                conj_hits += 1
                flag(f"conj:{lemma}")

        if m.pos in CONTENT_POS:
            content_n += 1
            band = bands.get(lemma)
            if band is None or level_rank(band) > cap:
                if vocab_exempt(tok):
                    continue
                if tok.text[:1].isupper() and not _is_sentence_initial(tokens, i):
                    continue
                if m.pos == "PROPN":
                    continue
                overlevel += 1
                if band:
                    flag(f"lemma:{lemma}={band}")
                else:
                    flag(f"lemma:{lemma}=unknown")

    tense_rate = tense_hits / n
    pos_rate = pos_hits / n
    sub_rate = sub_hits / n
    over_rate = overlevel / max(content_n, 1)

    lemma_flags = [f for f in flags if f.startswith("lemma:")]
    other_flags = [f for f in flags if not f.startswith("lemma:")]
    flags = other_flags + lemma_flags[:12]

    passed = (
        tense_rate <= rules["max_forbidden_tense_rate"]
        and pos_rate <= rules["max_forbidden_pos_rate"]
        and sub_rate <= rules["max_subordinate_rate"]
        and over_rate <= rules["max_overlevel_lemma_rate"]
        and conj_hits == 0
    )

    return ValidationResult(
        passed=passed,
        overlevel_lemma_rate=round(over_rate, 4),
        subordinate_rate=round(sub_rate, 4),
        forbidden_case_rate=0.0,
        forbidden_tense_rate=round(tense_rate, 4),
        forbidden_pos_rate=round(pos_rate, 4),
        flags=flags,
    )
