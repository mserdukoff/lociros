from __future__ import annotations

import json
import re
from functools import lru_cache

from app.core.config import settings
from app.models.schemas import RootPart, Token

# Buckwalter-ish placeholders used in CAMeL patterns.
_C = "C"
_FORM_NAMES: dict[str, str] = {
    "I": "فَعَلَ",
    "II": "فَعَّلَ",
    "III": "فَاعَلَ",
    "IV": "أَفْعَلَ",
    "V": "تَفَعَّلَ",
    "VI": "تَفَاعَلَ",
    "VII": "اِنْفَعَلَ",
    "VIII": "اِفْتَعَلَ",
    "IX": "اِفْعَلَّ",
    "X": "اِسْتَفْعَلَ",
}

_DIAC = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
_SENSE = re.compile(r"[_\-][A-Za-z0-9]+$")
_BW_ROOT = {
    "A": "ا",
    "b": "ب",
    "p": "ة",
    "t": "ت",
    "v": "ث",
    "j": "ج",
    "H": "ح",
    "x": "خ",
    "d": "د",
    "*": "ذ",
    "r": "ر",
    "z": "ز",
    "s": "س",
    "$": "ش",
    "S": "ص",
    "D": "ض",
    "T": "ط",
    "Z": "ظ",
    "E": "ع",
    "g": "غ",
    "f": "ف",
    "q": "ق",
    "k": "ك",
    "l": "ل",
    "m": "م",
    "n": "ن",
    "h": "ه",
    "w": "و",
    "y": "ي",
    "'": "ء",
    ">": "أ",
    "<": "إ",
    "|": "آ",
    "&": "ؤ",
    "}": "ئ",
    "Y": "ى",
}


def dediac(text: str) -> str:
    return _DIAC.sub("", text or "").replace("ـ", "")


def normalize_lemma(text: str) -> str:
    s = dediac(text).strip()
    s = _SENSE.sub("", s)
    trans = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي"})
    return s.translate(trans)


def bw_root_to_arabic(root: str) -> str:
    """Turn CAMeL `k.t.b` / `ktb` / already-Arabic `كتب` into `كتب`."""
    raw = (root or "").strip()
    if not raw:
        return ""
    if any("\u0600" <= ch <= "\u06FF" for ch in raw):
        return dediac(raw).replace(".", "").replace(" ", "")
    letters: list[str] = []
    for ch in raw:
        if ch in ".-_ ":
            continue
        letters.append(_BW_ROOT.get(ch, ch))
    return "".join(letters)


def spaced_root(root: str) -> str:
    joined = bw_root_to_arabic(root)
    return " ".join(joined) if joined else ""


def pattern_to_form(pattern: str | None) -> str | None:
    """Map a CAMeL / وزن pattern onto the traditional verb Form I–X."""
    if not pattern:
        return None
    p = pattern.strip()
    if not p:
        return None
    low = p.replace("{", "").replace(">", "").replace("<", "")
    compact = re.sub(r"[^A-Za-z~']", "", low)

    checks = (
        (r"isota|ista|staf|stC", "X"),
        (r"ifota|ifta|CtaC", "VIII"),
        (r"inoFa|inC|nFaE|nCaC", "VII"),
        (r"ifoEal~|iCCaC~|CCaCC", "IX"),
        (r"tafaE~|tafa33|taCaCC|taC~", "V"),
        (r"tafAE|tafaa|taCaC", "VI"),
        (r"afoEal|>afo|aCCaC|ufoEil", "IV"),
        (r"fAE|CaaC|CACa", "III"),
        (r"faE~|fa33|CaCC|CuC~", "II"),
    )
    for rx, form in checks:
        if re.search(rx, compact):
            # Form VI `taCaaCaC` also matches the V prefix `ta`. Prefer
            # length: istifʿal and iftaʿal already returned. ta + gemination
            # is V; ta + long a is VI.
            if form == "VI" and re.search(r"tafaE~|taCaCC|taC~", compact):
                return "V"
            if form == "VI" and not re.search(r"tafAE|tafaa|taCaa|taCA", compact):
                continue
            return form

    arabic = dediac(p)
    if "ست" in arabic and arabic.startswith(("ا", "ي", "ت", "ن")):
        return "X"
    if "فت" in arabic[1:3] or (len(arabic) >= 4 and arabic[2] == "ت"):
        if arabic.startswith(("ا", "ي", "ت", "ن")):
            return "VIII"
    if arabic.startswith(("ان", "ين")):
        return "VII"
    if arabic.startswith(("تفعّ", "تفع", "يتفع")):
        return "V"
    if arabic.startswith(("تفا", "يتفا")):
        return "VI"
    if arabic.startswith(("أف", "يف", "تف")) and "ست" not in arabic:
        # يَفْعَل is Form I imperfect; أَفْعَل is IV.
        if arabic.startswith("أ"):
            return "IV"
    # Hollow verbs (قال 1ا3, كان, عاد, جاء 1اء) have no middle radical in the
    # pattern; their long ā is the weak root letter, not Form III's فاعَل.
    if "1" in arabic and "2" not in arabic and "ا" in arabic:
        return "IV" if arabic.startswith("أ") else "I"
    if "ا" in arabic[1:3] and not arabic.startswith("ا"):
        return "III"
    # Geminate roots (مرّ 1َ2ّ, أحبّ أَ1َ2ّ, يُحبّ يُ1ِ2ّ) double the second
    # radical in place of the third; Form II doubles it and keeps the third.
    if ("ّ" in p or "~" in p) and "1" in arabic and "2" in arabic and "3" not in arabic:
        return "IV" if arabic.startswith("أ") or p.startswith(("يُ", "تُ", "نُ", "أُ")) else "I"
    if "ّ" in p or "~" in p:
        return "II"
    if re.search(r"faE|CaC|yaC|yuC|yiC|taC|tuC|naC", compact, re.I):
        return "I"
    return "I" if compact else None


def form_name(form: str | None) -> str | None:
    if not form:
        return None
    return _FORM_NAMES.get(form)


@lru_cache(maxsize=1)
def root_lexicon() -> dict[str, dict]:
    path = settings.data_dir / "roots" / "ar.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def root_meaning(root: str) -> str:
    joined = bw_root_to_arabic(root)
    info = root_lexicon().get(joined) or {}
    return str(info.get("meaning") or "")


def make_root_part(
    root: str | None,
    pattern: str | None = None,
    form: str | None = None,
    meaning: str | None = None,
) -> RootPart | None:
    if not root:
        return None
    letters = spaced_root(root)
    if not letters:
        return None
    resolved_form = form or pattern_to_form(pattern)
    gloss = meaning or root_meaning(root)
    return RootPart(
        letters=letters,
        pattern=pattern,
        form=resolved_form,
        form_name=form_name(resolved_form),
        meaning=gloss,
    )


def attach_roots(tokens: list[Token]) -> list[Token]:
    """Refresh Token.root from the lexicon. Safe to run again on stored passages."""
    for tok in tokens:
        if not tok.is_word:
            tok.root = None
            continue
        part = tok.root
        if not part or not part.letters:
            continue
        morph = tok.morph
        tok.root = make_root_part(
            part.letters,
            pattern=part.pattern or (morph.conj_type if morph else None),
            form=part.form or (morph.form if morph else None),
            meaning=part.meaning or None,
        )
    return tokens
