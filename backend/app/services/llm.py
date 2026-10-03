from __future__ import annotations

import json
import logging
import random
import re

from openai import OpenAI

from app.core.config import settings
from app.services.data import grammar_rules, lemmas_at_or_below
from app.services.llm_usage import record as record_usage

logger = logging.getLogger(__name__)

GENRE_HINTS = {
    "daily_life": "everyday life, a small scene at home or in the city",
    "travel": "travel, a trip, a station or a new city",
    "news": "a short news-style report, still narrative, not a headline dump",
    "folklore": "a folk-tale or fable tone, simple characters",
    "work": "work, a workplace, colleagues, a task",
}

LANG_META = {
    "ru": {
        "name": "Russian",
        "script_note": "Mark ё where it belongs (её, ещё, чёрный, etc.). Do not use Latin letters inside the Russian text.",
        "length": "Length: 400 to 700 Russian words (count words, not characters).",
        "gloss": "Give a short English gloss (1–5 words) for each Russian lemma.",
    },
    "ja": {
        "name": "Japanese",
        "script_note": "Use standard modern orthography. Furigana is not needed in the text. Do not insert spaces between Japanese words.",
        "length": "Length: 22 to 40 short sentences (a real reading session, not a paragraph stub).",
        "gloss": "Give a short English gloss (1–5 words) for each Japanese lemma (dictionary form).",
    },
    "it": {
        "name": "Italian",
        "script_note": "Use standard Italian orthography. Mark accents where they belong (è, perché, città, più). Do not mix in English words.",
        "length": "Length: 350 to 600 Italian words (count words, not characters).",
        "gloss": "Give a short English gloss (1–5 words) for each Italian lemma (dictionary form).",
    },
    "ar": {
        "name": "Arabic",
        "script_note": "Write Modern Standard Arabic (فصحى), unvowelled. Do not use dialect (عامية). Do not mix in English or Latin letters. Mark hamza where it belongs (إلى، إن، أكل). Do not insert tashkeel.",
        "length": "Length: 280 to 500 Arabic words (count words, not characters).",
        "gloss": "Give a short English gloss (1–5 words) for each Arabic lemma (dictionary form, undiacritized).",
    },
}


def _client() -> OpenAI:
    if not settings.openrouter_api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Add it to backend/.env to generate passages."
        )
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
        default_headers={
            "HTTP-Referer": settings.public_base_url,
            "X-Title": "Lociros",
        },
    )


def _lemma_sample(level: str, language: str, n: int = 48) -> list[str]:
    pool = lemmas_at_or_below(level, language)
    if len(pool) <= n:
        return pool
    rng = random.Random(language + level + str(len(pool)))
    return sorted(rng.sample(pool, n))


def _parse_json(content: str) -> dict:
    text = (content or "").strip()
    for fence in ("```json", "```"):
        if text.startswith(fence):
            text = text[len(fence) :]
        if text.endswith("```"):
            text = text[: -3]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            return json.loads(match.group(0))
        raise


def generate_passage_text(
    level: str,
    topic: str,
    genre: str | None = None,
    correction_flags: list[str] | None = None,
    language: str = "ru",
    known_lemmas: list[str] | None = None,
    reuse_lemmas: list[str] | None = None,
    news_brief: str | None = None,
) -> tuple[str, str, str | None]:
    """Return (title, text, english translation). Raises if the LLM is not configured."""
    meta = LANG_META.get(language, LANG_META["ru"])
    rules = grammar_rules(language)[level]
    sample = ", ".join(_lemma_sample(level, language))
    genre_line = ""
    if genre and genre in GENRE_HINTS:
        genre_line = f"Genre: {GENRE_HINTS[genre]}.\n"

    known_line = ""
    if known_lemmas:
        shown = ", ".join(known_lemmas[:80])
        known_line = (
            "\nThis learner already knows these lemmas. Recycle about 80–90% of "
            "content words from this set and introduce only a few new in-band lemmas "
            f"(target new-lemma rate around 10–20%):\n{shown}\n"
        )

    reuse_line = ""
    if reuse_lemmas:
        shown = ", ".join(reuse_lemmas[:8])
        reuse_line = (
            "\nThe learner looked these lemmas up. Use a handful of them in the "
            f"passage when they still fit the {level} rules:\n{shown}\n"
        )

    news_line = ""
    length_line = meta["length"]
    shown_topic = topic
    session_line = "Write enough for a real reading session."
    if news_brief:
        shown_topic = f"today's news, written for CEFR {level}"
        session_line = (
            f"The reader is at CEFR {level}. Stay at that level. "
            "A shorter passage is better than a harder word."
        )
        length_line = {
            "A1": "Length: 6 to 10 short sentences. Who, where, and what happened.",
            "A2": "Length: 8 to 14 short sentences. Who, where, and what happened. Keep the names and the date.",
            "B1": "Length: 12 to 18 sentences. Keep the names, the places, and the date.",
            "B2": "Length: 14 to 22 sentences. Keep the names, the places, and the date.",
        }.get(level, "Length: 8 to 14 short sentences. Keep the names and the date.")
        news_line = (
            f"\nThis is today's news for one learner at CEFR {level}. "
            "Rewrite the source into that level and no higher. "
            "Use only the grammar allowed above. "
            "Say each fact with words from the in-band sample. "
            "If a fact needs a harder word or a harder pattern, leave that fact out. "
            "Do not copy words from the source language into the title or the text. "
            "Do not invent events, names, places, or dates. "
            "If a Date line is in the source, that is the only date you may use. "
            "Keep the people, the places, and that date.\n"
            f"Source:\n{news_brief}\n"
        )

    correction = ""
    if correction_flags:
        listed = "; ".join(correction_flags[:20])
        correction = (
            "\nThe previous draft drifted out of level. Rewrite the whole passage. "
            f"Fix these issues: {listed}. "
            "Do not reuse the over-level constructions.\n"
        )

    lang_name = meta["name"]
    prompt = f"""You are a {lang_name} language educator writing a graded reader.

Write a coherent {lang_name} passage for CEFR {level} learners.
Topic: {shown_topic}
{genre_line}{length_line} {session_line}

GRAMMAR CONSTRAINTS FOR {level}:
{rules["prompt_constraints"]}

Prefer lemmas from this in-band sample (you may use other {level}-appropriate words too):
{sample}
{known_line}{reuse_line}{news_line}
RULES:
1. The title and "text" field are ONLY {lang_name}.
2. The passage must be a complete, readable story or article with a beginning and end.
3. {meta["script_note"]}
4. Put a full English translation in "translation". One English sentence per {lang_name} sentence, same order. Do not summarize. Do not add titles or notes.

Respond ONLY with valid JSON:
{{
  "title": "{lang_name} title",
  "text": "Full {lang_name} passage.",
  "translation": "English translation, one sentence per source sentence."
}}
{correction}"""

    client = _client()
    completion = client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7 if not correction_flags else 0.4,
        timeout=45.0,
    )
    record_usage(completion)
    content = completion.choices[0].message.content or ""
    data = _parse_json(content)
    title = str(data.get("title") or "").strip()
    text = str(data.get("text") or "").strip()
    translation = str(data.get("translation") or "").strip() or None
    if not text:
        raise RuntimeError("LLM returned an empty passage")
    if not title:
        title = topic
    return title, text, translation


def gloss_lemmas(lemmas: list[str], language: str = "ru") -> dict[str, str]:
    """One-shot English glosses for unknown lemmas. Empty dict on failure."""
    unique = sorted({l for l in lemmas if l})
    if language in {"ru", "it", "ar"}:
        unique = sorted({l.lower() if language != "ar" else l for l in unique})
    if not unique:
        return {}
    if not settings.openrouter_api_key:
        return {}
    meta = LANG_META.get(language, LANG_META["ru"])
    prompt = (
        f"{meta['gloss']} "
        "Respond ONLY with JSON object mapping lemma → gloss.\n\n"
        + json.dumps(unique, ensure_ascii=False)
    )
    try:
        client = _client()
        completion = client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            timeout=30.0,
        )
        record_usage(completion)
        data = _parse_json(completion.choices[0].message.content or "")
        out: dict[str, str] = {}
        for k, v in data.items():
            if isinstance(v, str) and v.strip():
                key = str(k).lower() if language in {"ru", "it"} else str(k)
                if language == "ar":
                    from app.services.roots import normalize_lemma

                    key = normalize_lemma(key)
                out[key] = v.strip()
        return out
    except Exception:
        logger.exception("gloss_lemmas failed")
        return {}


def translate_passage(text: str, language: str) -> str | None:
    """English translation of a full passage. None if the LLM is unavailable."""
    if not text.strip() or not settings.openrouter_api_key:
        return None
    from app.services.sentences import split_sentences

    meta = LANG_META.get(language, LANG_META["ru"])
    source = split_sentences(text, language)
    numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(source)) or text
    prompt = f"""Translate this {meta["name"]} graded-reader passage into natural English.

There are {len(source) or 1} source sentences. Write exactly that many English sentences, in the same order. Do not merge, skip, or add sentences. Do not add a title or commentary.
Respond ONLY with the English sentences, separated by spaces (not a numbered list).

{numbered}"""
    try:
        client = _client()
        completion = client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            timeout=45.0,
        )
        record_usage(completion)
        out = (completion.choices[0].message.content or "").strip()
        if out.startswith("```"):
            out = out.strip("`").strip()
        return out or None
    except Exception:
        logger.exception("translate_passage failed")
        return None
