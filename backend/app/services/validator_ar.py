from __future__ import annotations

from app.models.schemas import Token
from app.services.data import grammar_rules, level_rank, vocab_bands
from app.services.validator import ValidationResult, vocab_exempt

CONTENT_POS = {"NOUN", "VERB", "ADJ", "ADV", "PROPN"}

INNA_LEMMAS = {"ان", "إن", "أن", "انّ", "إنّ", "أنّ", "كأن", "لكن", "ليت", "لعل"}
RELATIVE_LEMMAS = {
    "الذي",
    "التي",
    "الذين",
    "اللذان",
    "اللتان",
    "اللاتي",
    "اللواتي",
    "اللائي",
}
KANA_LEMMAS = {"كان", "يكون", "كن", "صار", "ليس", "أصبح"}
SUBORDINATE_LEMMAS = {
    "لان",
    "لأن",
    "اذا",
    "إذا",
    "عندما",
    "بينما",
    "رغم",
    "لو",
    "حتى",
    "حيث",
    "كي",
    "لكي",
}
FORM_FLAGS = {
    "II": "form_ii",
    "III": "form_iii",
    "IV": "form_iv",
    "V": "form_v",
    "VI": "form_vi",
    "VII": "form_vii",
    "VIII": "form_viii",
    "IX": "form_ix",
    "X": "form_x",
}


# Perfect in form, present in meaning ("is not").
NEGATIVE_COPULA = "ليس"
# Passive in form, but the ordinary way to say "there is".
EXISTENTIAL = {"يوجد", "توجد"}


def _norm(lemma: str) -> str:
    from app.services.roots import normalize_lemma

    return normalize_lemma(lemma)


def _rule_lemma(tok: Token) -> str:
    """CAMeL lemmatizes لأن ("because") as أن; the rules treat it as its own conjunction."""
    lemma = _norm(tok.lemma or (tok.morph.lemma if tok.morph else "") or "")
    if lemma == "ان" and _norm(tok.text).startswith("ل"):
        return "لان"
    return lemma


def _tense(tokens: list[Token], index: int, tok: Token) -> str:
    m = tok.morph
    if m is None:
        return ""
    if _norm(m.lemma or "") == NEGATIVE_COPULA:
        return "pres"
    # Unvowelled أحب after أنا is "I love" (present), not "he loved"; the past
    # with أنا ends in ت (أحببت).
    if m.tense == "past":
        prev = _prev_word(tokens, index)
        surface = _norm(tok.text)
        if prev and _norm(prev.text) == "انا" and surface.startswith("ا") and not surface.endswith("ت"):
            return "pres"
    return m.tense or ""


def _band(bands: dict[str, str], tok: Token, lemma: str) -> str | None:
    """The list keys some adverbs by their written form (الآن، أيضاً، شكراً، جداً)
    while CAMeL reduces them to a base (أن، أيض، شكر، جد). Use the easier match."""
    candidates = [
        bands.get(key)
        for key in (lemma, tok.morph.lemma if tok.morph else None, _norm(tok.text))
        if key
    ]
    found = [b for b in candidates if b]
    return min(found, key=level_rank) if found else None


def _prev_word(tokens: list[Token], index: int) -> Token | None:
    for j in range(index - 1, -1, -1):
        if tokens[j].is_word:
            return tokens[j]
    return None


def _next_word(tokens: list[Token], index: int) -> Token | None:
    for t in tokens[index + 1 :]:
        if t.is_word:
            return t
    return None


def _is_sentence_initial(tokens: list[Token], index: int) -> bool:
    for t in reversed(tokens[:index]):
        if not t.is_word:
            if any(ch in t.text for ch in ".!?…؟"):
                return True
            continue
        return False
    return True


def _pos(tok: Token) -> str:
    return (tok.morph.pos if tok.morph else None) or ""


def _detect_constructions(tokens: list[Token], i: int, tok: Token) -> list[str]:
    hits: list[str] = []
    morph = tok.morph
    lemma = _rule_lemma(tok)
    tense = _tense(tokens, i, tok)
    mood = (morph.mood if morph else None) or ""
    voice = (morph.voice if morph else None) or ""
    if _norm(tok.text) in EXISTENTIAL:
        voice = ""
    number = (morph.number if morph else None) or ""
    form = (morph.form if morph else None) or ""
    nxt = _next_word(tokens, i)

    if tense == "past":
        hits.append("perfect")
    if tense == "pres":
        hits.append("imperfect")
    if tense == "fut":
        hits.append("future")
    if number == "du":
        hits.append("dual")
    if mood == "juss":
        hits.append("jussive")
    if mood == "subj":
        hits.append("subjunctive")
    if voice == "pass":
        hits.append("passive")
    if form in FORM_FLAGS:
        hits.append(FORM_FLAGS[form])
        hits.append("derived_form")

    # الآن ("now") normalizes to the same lemma as أن.
    if lemma in INNA_LEMMAS and _pos(tok) != "NOUN":
        hits.append("inna")
    if lemma in RELATIVE_LEMMAS:
        hits.append("relative")
    if lemma in KANA_LEMMAS and _pos(tok) == "VERB":
        hits.append("kana")
        if nxt and _pos(nxt) == "VERB":
            hits.append("kana_compound")

    return hits


def validate_tokens_ar(tokens: list[Token], level: str) -> ValidationResult:
    ruleset = grammar_rules("ar")
    rules = ruleset[level]
    forbidden = set(rules.get("forbidden_constructions") or [])
    forbidden_conjunctions = set(_norm(c) for c in (rules.get("forbidden_conjunctions") or []))
    allowed_tenses = set(rules.get("allowed_tenses") or [])
    allowed_moods = set(rules.get("allowed_moods") or [])
    bands = vocab_bands("ar")
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
        lemma = _rule_lemma(tok)
        tense = _tense(tokens, i, tok)

        for cons in _detect_constructions(tokens, i, tok):
            if cons in forbidden:
                conj_hits += 1
                flag(f"ar:{cons} ({tok.text})")

        if tense and allowed_tenses and tense not in allowed_tenses:
            tense_hits += 1
            flag(f"tense:{tense} ({tok.text})")

        if m.mood and allowed_moods and m.mood not in allowed_moods:
            tense_hits += 1
            flag(f"mood:{m.mood} ({tok.text})")

        if lemma in SUBORDINATE_LEMMAS:
            sub_hits += 1

        if lemma in forbidden_conjunctions:
            conj_hits += 1
            flag(f"conj:{lemma}")

        if m.pos in CONTENT_POS:
            content_n += 1
            band = _band(bands, tok, lemma)
            if band is None or level_rank(band) > cap:
                if vocab_exempt(tok) or m.pos == "PROPN" or m.pos_detail == "proper-noun":
                    continue
                if tok.text[:1].isupper() and not _is_sentence_initial(tokens, i):
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
