"""Compare passage-prompt variants on the real pipeline (draft, validate, rewrite).

Uses the same throwaway SQLite harness as bench_generation.py, so nothing is
written to the database in backend/.env.

    cd backend && .venv/bin/python ../scripts/tune_prompts.py --variants legacy,shipped --per 2

October 2026 results (Gemini 3.1 Flash Lite, 32 passages per variant): legacy passed
42% after rewrite; full allowed-word list + word-choice rules + edit-the-draft rewrite
(vocab_style_edit, now shipped) passed 62–75% across three runs. Sentence-count targets,
per-level tips, and a final length check did not beat it.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bench_generation as bench  # noqa: E402  (sets up the scratch database)

from app.core.config import settings  # noqa: E402
from app.models.db import init_db  # noqa: E402
from app.services import llm  # noqa: E402
from app.services import validator, validator_ar, validator_it, validator_ja  # noqa: E402
from app.services.data import grammar_rules, lemmas_at_or_below, vocab_bands  # noqa: E402

_shipped = llm.build_passage_prompt


TIPS = {
    ("ru", "A1"): (
        "- Every noun, adjective, and pronoun must be in the nominative. That rules out direct "
        "objects (no 'читает книгу') and prepositions (no 'в доме', 'на столе').\n"
        "- Build the story from sentences like 'Это Анна.', 'Анна дома.', 'Тут парк.', "
        "'Парк большой и зелёный.', 'Кот спит.', 'Погода хорошая.', 'Вот магазин.'\n"
        "- Use verbs without objects: идёт, спит, живёт, работает, гуляет, стоит, сидит.\n"
        "- Tell it in the present tense, like a description of a scene."
    ),
    ("ru", "A2"): (
        "- No instrumental: say 'Анна и Иван' instead of 'с Иваном', 'на автобусе' instead of "
        "'автобусом', and avoid 'стать/быть + instrumental'.\n"
        "- No 'который': split into two sentences."
    ),
    ("it", "A1"): (
        "- Present tense only, even for a story: 'Oggi Marco va al mercato.'\n"
        "- No object pronouns (lo, la, gli, ne, mi, ti, ci): repeat the noun instead.\n"
        "- No 'perché', 'quando', 'se': write two short sentences."
    ),
    ("it", "A2"): (
        "- Tell the story with passato prossimo for events ('ha comprato', 'è andata'); never the "
        "imperfetto (no 'era', 'aveva', 'faceva', 'c'era').\n"
        "- No relative 'che': split into two sentences."
    ),
    ("ja", "A1"): (
        "- Every sentence ends in a polite form: です, ます, ません, or ました.\n"
        "- No て-form at all: write separate sentences instead of joining verbs.\n"
        "- Use the kanji or kana spelling shown in the word list."
    ),
    ("ja", "A2"): (
        "- No ている: use the plain ます form ('読みます', not '読んでいます').\n"
        "- No verb directly before a noun (relative clause): split into two sentences."
    ),
    ("ar", "A1"): (
        "- Tell the whole story in the present tense (يذهب، يأكل، يقرأ) or with nominal "
        "sentences (البيت كبير). Never the past.\n"
        "- Use simple Form I verbs only.\n"
        "- Use singular or plural, never the dual."
    ),
    ("ar", "A2"): (
        "- Past and present Form I verbs are fine; avoid Forms III and V–X (no سافر، تكلم، استيقظ).\n"
        "- Use singular or plural, never the dual. No إنّ/أنّ, no الذي/التي: split sentences."
    ),
    ("ar", "*"): "- Prefer Form I verbs. Use singular or plural, never the dual.",
}


def _legacy_sample(level: str, language: str, n: int = 48) -> list[str]:
    """The pre-tuning prompt showed the same 48 seeded words every time."""
    pool = lemmas_at_or_below(level, language)
    if len(pool) <= n:
        return pool
    rng = random.Random(language + level + str(len(pool)))
    return sorted(rng.sample(pool, n))


def _allowed_words(level: str, language: str) -> list[str]:
    return sorted(w for w in lemmas_at_or_below(level, language) if " " not in w and "(" not in w)


def compose(
    level: str,
    topic: str,
    genre: str | None = None,
    *,
    correction_flags: list[str] | None = None,
    language: str = "ru",
    known_lemmas: list[str] | None = None,
    reuse_lemmas: list[str] | None = None,
    news_brief: str | None = None,
    previous_text: str | None = None,
    vocab: str = "sample",
    style: bool = False,
    edit: bool = False,
    sentences: bool = False,
    tips: bool = False,
    length_check: bool = False,
) -> str:
    meta = llm.LANG_META[language]
    lang_name = meta["name"]
    rules = grammar_rules(language)[level]
    genre_line = f"Genre: {llm.GENRE_HINTS[genre]}.\n" if genre in llm.GENRE_HINTS else ""

    if vocab == "full":
        words = ", ".join(_allowed_words(level, language))
        vocab_block = (
            f"ALLOWED WORDS FOR {level} (dictionary forms; any inflected form is fine):\n{words}\n"
        )
    else:
        sample = ", ".join(_legacy_sample(level, language))
        vocab_block = (
            f"Prefer lemmas from this in-band sample (you may use other {level}-appropriate "
            f"words too):\n{sample}\n"
        )

    style_block = ""
    if style:
        sentence = "5 to 10 words" if level in {"A1", "A2"} else "8 to 15 words"
        extra = {
            "ja": "- Spell every word exactly as it appears in the list (the same kanji or kana).\n",
            "ar": "- The list is written without hamza; write words with their normal spelling.\n",
        }.get(language, "")
        style_block = (
            "\nWORD CHOICE (this is checked automatically):\n"
            "- Every noun, verb, adjective, and adverb must come from the allowed words. "
            "Names of people and places, and numbers, are exempt.\n"
            "- If an idea needs a word that is not in the list, say it another way or leave it out.\n"
            "- Repeat allowed words rather than reaching for synonyms. Repetition helps learners.\n"
            f"- Keep sentences short: one idea each, about {sentence}.\n"
            "- Use only the grammar listed above. If a sentence needs a forbidden form, split it "
            "or say it more simply.\n"
            f"{extra}"
        )

    length_line = meta["length"]
    lo, hi = {"A1": (18, 24), "A2": (20, 28), "B1": (20, 28), "B2": (22, 30)}[level]
    text_hint = f"Full {lang_name} passage."
    final_check = ""
    if length_check:
        text_hint = f"Full {lang_name} passage, {lo} to {hi} sentences."
        final_check = (
            f"\nBefore you answer, count the sentences in \"text\". If there are fewer than {lo}, "
            "continue the story until there are.\n"
        )
    if sentences or length_check:
        length_line = (
            f"Length: {lo} to {hi} sentences. Short sentences are fine, but do not stop early: "
            "a learner should get several minutes of reading."
        )

    tips_block = ""
    if tips:
        tip = TIPS.get((language, level)) or TIPS.get((language, "*"))
        if tip:
            tips_block = f"\nHOW TO STAY IN LEVEL:\n{tip}\n"

    known_line = ""
    if known_lemmas:
        known_line = (
            "\nThis learner already knows these lemmas. Recycle about 80–90% of content words "
            f"from this set:\n{', '.join(known_lemmas[:80])}\n"
        )
    reuse_line = ""
    if reuse_lemmas:
        reuse_line = (
            "\nThe learner looked these lemmas up. Use a handful of them when they fit the "
            f"{level} rules:\n{', '.join(reuse_lemmas[:8])}\n"
        )

    correction = ""
    if correction_flags:
        if edit and previous_text:
            words = [f.split(":", 1)[1].split("=")[0] for f in correction_flags if f.startswith("lemma:")]
            grammar = [f for f in correction_flags if not f.startswith("lemma:")]
            parts = [
                "\nYOUR PREVIOUS DRAFT FAILED THE LEVEL CHECK. Edit it: keep the story and every "
                "sentence that is fine, and change only what is listed below."
            ]
            if words:
                parts.append(
                    f"Words above {level}: replace each with an allowed word, or rephrase: "
                    + ", ".join(words[:20])
                )
            if grammar:
                parts.append(
                    f"Grammar above {level}: rewrite those sentences with allowed grammar: "
                    + "; ".join(grammar[:12])
                )
            parts.append(f"Previous draft:\n{previous_text}\n")
            correction = "\n".join(parts)
        else:
            correction = (
                "\nThe previous draft drifted out of level. Rewrite the whole passage. "
                f"Fix these issues: {'; '.join(correction_flags[:20])}. "
                "Do not reuse the over-level constructions.\n"
            )

    return f"""You are a {lang_name} language educator writing a graded reader.

Write a coherent {lang_name} passage for CEFR {level} learners.
Topic: {topic}
{genre_line}{length_line} Write enough for a real reading session.

GRAMMAR CONSTRAINTS FOR {level}:
{rules["prompt_constraints"]}
{tips_block}
{vocab_block}{style_block}{known_line}{reuse_line}
RULES:
1. The title and "text" field are ONLY {lang_name}.
2. The passage must be a complete, readable story or article with a beginning and end.
3. {meta["script_note"]}
4. Put a full English translation in "translation". One English sentence per {lang_name} sentence, same order. Do not summarize. Do not add titles or notes.

Respond ONLY with valid JSON:
{{
  "title": "{lang_name} title",
  "text": "{text_hint}",
  "translation": "English translation, one sentence per source sentence."
}}
{correction}{final_check}"""


def _with(**opts):
    return lambda *a, **k: compose(*a, **k, **opts)


VARIANTS = {
    "legacy": _with(),
    "vocab": _with(vocab="full"),
    "vocab_style": _with(vocab="full", style=True),
    "vocab_style_edit": _with(vocab="full", style=True, edit=True),
    "edit": _with(edit=True),
    "v3_long": _with(vocab="full", style=True, edit=True, sentences=True),
    "v3_tips": _with(vocab="full", style=True, edit=True, tips=True),
    "v3_long_tips": _with(vocab="full", style=True, edit=True, sentences=True, tips=True),
    "v3_len": _with(vocab="full", style=True, edit=True, length_check=True),
    "shipped": _shipped,
}


def _install(name: str) -> None:
    llm.build_passage_prompt = VARIANTS[name]


class _AllKnown(dict):
    def get(self, key, default=None):
        return super().get(key, "A1")


def _passes_with_full_vocab(passage) -> bool:
    """Would this passage pass if every unknown word were in the vocabulary list?"""
    lang = passage.language
    bands = _AllKnown(vocab_bands(lang))
    module = {"ja": validator_ja, "it": validator_it, "ar": validator_ar}.get(lang, validator)
    original = module.vocab_bands
    module.vocab_bands = lambda *_a, **_k: bands
    try:
        return validator.validate_tokens(passage.tokens, passage.level, lang).passed
    finally:
        module.vocab_bands = original


def report(name: str, results: list[dict], wall: float) -> dict:
    ok = [r for r in results if not r["error"]]
    n = max(len(ok), 1)
    first = sum(r["passed"] and r["attempts"] == 1 for r in ok)
    final = sum(r["passed"] for r in ok)
    failed = [r for r in ok if not r["passed"]]
    vocab_only = sum(_passes_with_full_vocab(r["passage"]) for r in failed)
    over = [r["passage"].calibration.overlevel_lemma_rate for r in ok]
    totals = [r["seconds"] for r in ok]
    calls = [len(r["calls"]) for r in ok]
    print(f"\n== {name}  ({len(ok)}/{len(results)} ok, wall {wall:.0f}s)")
    print(
        f"   first draft passed {first}/{len(ok)} ({first / n:.0%})   "
        f"final passed {final}/{len(ok)} ({final / n:.0%})   "
        f"failures only from vocabulary-list gaps {vocab_only}/{len(failed)}"
    )
    print(
        f"   mean over-level word rate {statistics.mean(over):.1%}   "
        f"words {statistics.mean(r['words'] for r in ok):.0f}   "
        f"calls {statistics.mean(calls):.1f}   per passage {statistics.mean(totals):.1f}s"
    )
    by: dict[str, list[dict]] = {}
    for r in ok:
        by.setdefault(r["language"], []).append(r)
    print(
        "   final pass by language: "
        + "  ".join(f"{k} {sum(x['passed'] for x in v)}/{len(v)}" for k, v in sorted(by.items()))
    )
    lv: dict[str, list[dict]] = {}
    for r in ok:
        lv.setdefault(r["level"], []).append(r)
    print(
        "   final pass by level:    "
        + "  ".join(f"{k} {sum(x['passed'] for x in v)}/{len(v)}" for k, v in sorted(lv.items()))
    )
    flags: dict[str, int] = {}
    for r in failed:
        for f in r["passage"].calibration.flags:
            kind = f.split(":", 1)[0] if not f.startswith("lemma:") else (
                "lemma:unknown" if f.endswith("=unknown") else "lemma:over-band"
            )
            if f.startswith(("ja:", "it:", "ar:", "mood:", "tense:", "case:", "pos:", "conj:")):
                kind = f.split(" (")[0]
            flags[kind] = flags.get(kind, 0) + 1
    top = sorted(flags.items(), key=lambda kv: -kv[1])[:10]
    print("   flags on failed passages: " + ", ".join(f"{k}×{v}" for k, v in top))
    for r in results:
        if r["error"]:
            print("   error:", r["language"], r["level"], r["error"])
    return {"first": first, "final": final, "n": len(ok)}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--variants", default="legacy,vocab,vocab_style,vocab_style_edit")
    p.add_argument("--langs", default="ru,it,ja,ar")
    p.add_argument("--levels", default="A1,A2,B1,B2")
    p.add_argument("--per", type=int, default=2)
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--model", default=None)
    p.add_argument("--dump", default=None, help="append one JSON line per passage to this file")
    args = p.parse_args()
    if args.model:
        settings.llm_model = args.model
    init_db()
    langs = args.langs.split(",")
    levels = args.levels.split(",")
    print(f"model={settings.llm_model}  per cell={args.per}")
    for name in args.variants.split(","):
        _install(name)
        jobs = []
        n = 0
        for lang in langs:
            for level in levels:
                for _ in range(args.per):
                    jobs.append((lang, level, bench.TOPICS[n % len(bench.TOPICS)]))
                    n += 1
        results, wall = bench.run_jobs(jobs, args.concurrency)
        report(name, results, wall)
        if args.dump:
            rows = [
                {
                    "variant": name,
                    "language": r["language"],
                    "level": r["level"],
                    "passed": r["passed"],
                    "attempts": r["attempts"],
                    "words": r["words"],
                    "flags": r["passage"].calibration.flags if r["passage"] else [],
                    "rates": r["passage"].calibration.model_dump(
                        include={
                            "overlevel_lemma_rate",
                            "subordinate_rate",
                            "forbidden_case_rate",
                            "forbidden_tense_rate",
                            "forbidden_pos_rate",
                        }
                    )
                    if r["passage"]
                    else {},
                    "text": r["passage"].text if r["passage"] else r["error"],
                }
                for r in results
            ]
            with open(args.dump, "a", encoding="utf-8") as fh:
                for row in rows:
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    llm.build_passage_prompt = _shipped


if __name__ == "__main__":
    main()
