from app.services.gloss import attach_glosses
from app.services.morph import analyze_text, analyze_word
from app.services.validator import validate_tokens


def it_tokens(text: str):
    return attach_glosses(analyze_text(text, "it"), use_llm=False, language="it")


def test_it_lemma_essere():
    morph = analyze_word("sono", "it")
    assert morph.lemma == "essere"
    assert morph.pos in {"AUX", "VERB"}
    assert morph.tense == "pres"


def test_it_a1_present_passes():
    text = "Anna è studentessa. Questa è una casa. La casa è nuova. La mamma è qui."
    result = validate_tokens(it_tokens(text), "A1", "it")
    assert result.passed, result.flags


def test_it_a1_rejects_passato_prossimo():
    text = "Anna è studentessa. Ieri ho mangiato pane. La casa è nuova."
    result = validate_tokens(it_tokens(text), "A1", "it")
    assert any("it:passato_prossimo" in f for f in result.flags)
    assert not result.passed


def test_it_a1_rejects_congiuntivo():
    text = "Voglio che Anna sia qui. La casa è nuova."
    result = validate_tokens(it_tokens(text), "A1", "it")
    assert any("it:congiuntivo" in f or "mood:subj" in f for f in result.flags)
    assert not result.passed


def test_it_a2_allows_passato_prossimo():
    text = "Ieri ho comprato il pane al mercato. Poi sono andato a casa."
    result = validate_tokens(it_tokens(text), "A2", "it")
    assert not any("it:passato_prossimo" in f for f in result.flags)


def test_it_mele_is_not_a_clitic_cluster():
    text = "Anna compra mele al mercato. Poi va a casa."
    result = validate_tokens(it_tokens(text), "A2", "it")
    assert not any("it:clitic_cluster" in f for f in result.flags)


def test_it_mele_is_not_a_clitic_cluster():
    text = "Anna compra mele al mercato. Poi va a casa."
    result = validate_tokens(it_tokens(text), "A2", "it")
    assert not any("it:clitic_cluster" in f for f in result.flags)


def test_it_a2_rejects_imperfetto():
    text = "Da bambino abitavo in una casa piccola. Ogni giorno mangiavo pane."
    result = validate_tokens(it_tokens(text), "A2", "it")
    assert any("it:imperfetto" in f for f in result.flags)
    assert not result.passed


def test_it_b1_allows_imperfetto():
    text = "Da bambino abitavo in una casa piccola. Ogni giorno mangiavo pane."
    result = validate_tokens(it_tokens(text), "B1", "it")
    assert not any("it:imperfetto" in f for f in result.flags)


def test_it_b1_rejects_congiuntivo():
    text = "Voglio che tu venga a casa. Poi mangiamo pane."
    result = validate_tokens(it_tokens(text), "B1", "it")
    assert any("it:congiuntivo" in f or "mood:subj" in f for f in result.flags)
    assert not result.passed


def test_it_b2_allows_congiuntivo():
    text = "Voglio che tu venga a casa. Poi mangiamo pane."
    result = validate_tokens(it_tokens(text), "B2", "it")
    assert not any("it:congiuntivo" in f for f in result.flags)
    assert not any("mood:subj" in f for f in result.flags)


def test_it_gloss_core_lemma():
    toks = it_tokens("Anna è studentessa.")
    essere = next(t for t in toks if t.lemma == "essere")
    assert essere.gloss == "to be"


def test_it_verb_after_subject_is_not_imperative():
    for text in ("Marco cammina veloce verso la stazione.", "Lui cammina nel parco."):
        result = validate_tokens(it_tokens(text), "A1", "it")
        assert not any(f.startswith("mood:impr") for f in result.flags), (text, result.flags)


def test_it_real_imperative_is_still_flagged():
    toks = it_tokens("Cammina piano!")
    if any(t.morph and t.morph.mood == "impr" for t in toks):
        result = validate_tokens(toks, "A1", "it")
        assert any(f.startswith("mood:impr") for f in result.flags)


def test_it_present_is_not_imperfetto_and_per_me_is_not_a_clitic():
    result = validate_tokens(it_tokens("I bambini tornano a casa. Il regalo è per me."), "A1", "it")
    assert not any(f.startswith(("it:imperfetto", "tense:impf", "it:clitic")) for f in result.flags), result.flags


def test_it_real_imperfetto_and_clitic_still_flagged():
    flags = validate_tokens(it_tokens("Marco tornava a casa. Anna lo guarda."), "A1", "it").flags
    assert any(f.startswith(("it:imperfetto", "tense:impf")) for f in flags), flags
    assert any(f.startswith("it:clitic") for f in flags), flags
