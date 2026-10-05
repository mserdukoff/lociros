from app.services.morph_ar import morph_from_analysis, tokenize_ar
from app.services.roots import bw_root_to_arabic, make_root_part, pattern_to_form, spaced_root


def test_bw_root_ktb():
    assert bw_root_to_arabic("k.t.b") == "كتب"
    assert spaced_root("k.t.b") == "ك ت ب"
    assert bw_root_to_arabic("كتب") == "كتب"


def test_form_mapping_i_to_x():
    assert pattern_to_form("faEal") == "I"
    assert pattern_to_form("yaCCuC") == "I"
    assert pattern_to_form("faE~al") == "II"
    assert pattern_to_form("fAEal") == "III"
    assert pattern_to_form(">afoEal") == "IV"
    assert pattern_to_form("tafaE~al") == "V"
    assert pattern_to_form("tafAEal") == "VI"
    assert pattern_to_form("{inoFaEal") == "VII"
    assert pattern_to_form("{ifotaEal") == "VIII"
    assert pattern_to_form("{isotafoEal") == "X"


def test_make_root_part_has_form_name():
    part = make_root_part("k.t.b", pattern="faE~al", form="II")
    assert part is not None
    assert part.letters == "ك ت ب"
    assert part.form == "II"
    assert part.form_name == "فَعَّلَ"
    assert "write" in part.meaning


def test_tokenize_preserves_spaces_and_question_mark():
    pieces = tokenize_ar("هل هذا بيت؟")
    words = [p[0] for p in pieces if p[2]]
    assert words == ["هل", "هذا", "بيت"]
    punct = [p[0] for p in pieces if not p[2]]
    assert "؟" in "".join(punct)


def test_morph_from_analysis_verb():
    analysis = {
        "lex": "كَتَبَ",
        "pos": "verb",
        "asp": "i",
        "mod": "i",
        "vox": "a",
        "per": "3",
        "gen": "m",
        "num": "s",
        "diac": "يَكْتُبُ",
        "pattern": "yaCCuC",
        "root": "k.t.b",
    }
    morph = morph_from_analysis(analysis, "يكتب")
    assert morph.lemma == "كتب"
    assert morph.pos == "VERB"
    assert morph.tense == "pres"
    assert morph.mood == "indc"
    assert morph.voice == "act"
    assert morph.person == "3"
    assert morph.form == "I"
    assert morph.reading == "يَكْتُبُ"


def test_morph_from_analysis_noun_case():
    analysis = {
        "lex": "كِتَاب",
        "pos": "noun",
        "cas": "a",
        "stt": "i",
        "gen": "m",
        "num": "s",
        "diac": "كِتَابًا",
        "pattern": "CiCAC",
        "root": "k.t.b",
    }
    morph = morph_from_analysis(analysis, "كتابا")
    assert morph.lemma == "كتاب"
    assert morph.pos == "NOUN"
    assert morph.case == "acc"
    assert morph.state == "indef"
    assert morph.form is None


def test_clitic_pieces_possessive_my():
    from app.services.morph_ar import clitic_pieces

    pieces = clitic_pieces("كتابي", "كتاب", "1s_poss")
    assert [(p.text, p.label) for p in pieces] == [("كتاب", "stem"), ("ي", "my")]


def test_clitic_pieces_taa_marbuta_his():
    from app.services.morph_ar import clitic_pieces

    pieces = clitic_pieces("مدرسته", "مدرسة", "3ms_poss")
    assert [(p.text, p.label) for p in pieces] == [("مدرست", "stem"), ("ه", "his")]


def test_clitic_pieces_fallback_from_lemma():
    from app.services.morph_ar import clitic_pieces

    pieces = clitic_pieces("بيتها", "بيت", None)
    assert [(p.text, p.label) for p in pieces] == [("بيت", "stem"), ("ها", "her")]


def test_clitic_pieces_plain_noun_has_none():
    from app.services.morph_ar import clitic_pieces

    assert clitic_pieces("كتاب", "كتاب", None) == []


def test_morph_from_analysis_stores_enclitic():
    analysis = {
        "lex": "كِتَاب",
        "pos": "noun",
        "cas": "g",
        "stt": "c",
        "enc0": "1s_poss",
        "diac": "كِتَابِي",
        "root": "k.t.b",
    }
    morph = morph_from_analysis(analysis, "كتابي")
    assert morph.enclitic == "1s_poss"
    assert morph.state == "const"


def test_hollow_verbs_are_form_i_not_iii():
    # CAMeL patterns: hollow verbs drop the middle radical, Form III keeps it.
    for hollow in ("1ا3َ", "1ا3َت", "1اءَ"):
        assert pattern_to_form(hollow) == "I", hollow
    assert pattern_to_form("أ1ا3َ") == "IV"
    for form_iii in ("1ا2َ3َ", "وا2َ3َ", "يُ1ا2ِ3"):
        assert pattern_to_form(form_iii) == "III", form_iii


def test_geminate_verbs_are_not_form_ii():
    for form_i in ("1َ2َّ", "يَ1ُ2ّ", "1َ2ِّ"):
        assert pattern_to_form(form_i) == "I", form_i
    for form_iv in ("أَ1َ2َّ", "أُ1ِ2ّ", "يُ1ِ2ّ", "تُ1ِ2ّ"):
        assert pattern_to_form(form_iv) == "IV", form_iv
    assert pattern_to_form("1َ2ّ3َ") == "II"
