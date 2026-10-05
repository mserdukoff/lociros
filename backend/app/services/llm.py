from __future__ import annotations

import json
import logging
import re
import threading
from functools import lru_cache
from types import SimpleNamespace

import httpx
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


_client_lock = threading.Lock()
_shared_client: OpenAI | None = None


def _client() -> OpenAI:
    global _shared_client
    if not settings.openrouter_api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Add it to backend/.env to generate passages."
        )
    with _client_lock:
        if _shared_client is None:
            _shared_client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.openrouter_api_key,
                default_headers={
                    "HTTP-Referer": settings.public_base_url,
                    "X-Title": "Lociros",
                },
                max_retries=2,
            )
        return _shared_client


def routing_body() -> dict:
    """OpenRouter routing: fastest provider first, then fallback models on errors."""
    body: dict = {}
    if settings.llm_provider_sort:
        body["provider"] = {"sort": settings.llm_provider_sort}
    fallbacks = [
        m.strip()
        for m in settings.llm_fallback_models.split(",")
        if m.strip() and m.strip() != settings.llm_model
    ]
    if fallbacks:
        body["models"] = [settings.llm_model, *fallbacks]
    if settings.llm_reasoning_effort:
        body["reasoning"] = {"effort": settings.llm_reasoning_effort}
    return body


def _complete(
    prompt: str,
    *,
    temperature: float,
    timeout: float,
    json_mode: bool = False,
) -> str:
    """One chat completion with a hard wall-clock deadline.

    The SDK timeout resets whenever bytes arrive, and OpenRouter sends keep-alive
    comments while a provider is busy, so only a watchdog bounds the total time.
    """
    kwargs: dict = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    stream = _client().chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        timeout=httpx.Timeout(timeout, connect=10.0),
        stream=True,
        stream_options={"include_usage": True},
        extra_body=routing_body() or None,
        **kwargs,
    )
    expired = threading.Event()

    def _expire() -> None:
        expired.set()
        stream.response.close()

    watchdog = threading.Timer(timeout, _expire)
    watchdog.daemon = True
    watchdog.start()
    parts: list[str] = []
    usage = None
    model = ""
    try:
        for chunk in stream:
            model = chunk.model or model
            if chunk.usage is not None:
                usage = chunk.usage
            if chunk.choices and chunk.choices[0].delta.content:
                parts.append(chunk.choices[0].delta.content)
    except Exception:
        if expired.is_set():
            raise TimeoutError(f"LLM call exceeded {timeout:.0f}s") from None
        raise
    finally:
        watchdog.cancel()
        stream.close()
    if expired.is_set():
        raise TimeoutError(f"LLM call exceeded {timeout:.0f}s")
    record_usage(SimpleNamespace(usage=usage, model=model))
    return "".join(parts)


@lru_cache(maxsize=32)
def allowed_words(level: str, language: str) -> str:
    """Every single-word lemma at or below the level, for the prompt (a few thousand tokens)."""
    return ", ".join(
        sorted(w for w in lemmas_at_or_below(level, language) if " " not in w and "(" not in w)
    )


def _correction_block(level: str, flags: list[str], previous_text: str | None) -> str:
    """Ask for an edit of the failed draft; rewriting from scratch drifts again."""
    words = [f.split(":", 1)[1].split("=")[0] for f in flags if f.startswith("lemma:")]
    grammar = [f for f in flags if not f.startswith("lemma:")]
    if not previous_text:
        return (
            "\nThe previous draft drifted out of level. Rewrite the whole passage. "
            f"Fix these issues: {'; '.join(flags[:20])}. "
            "Do not reuse the over-level constructions.\n"
        )
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
    return "\n".join(parts)


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
    previous_text: str | None = None,
) -> tuple[str, str, str | None]:
    """Return (title, text, english translation). Raises if the LLM is not configured."""
    prompt = build_passage_prompt(
        level,
        topic,
        genre,
        correction_flags=correction_flags,
        language=language,
        known_lemmas=known_lemmas,
        reuse_lemmas=reuse_lemmas,
        news_brief=news_brief,
        previous_text=previous_text,
    )
    for attempt in range(2):
        content = _complete(
            prompt,
            temperature=0.7 if not correction_flags else 0.4,
            timeout=60.0,
            json_mode=True,
        )
        try:
            data = _parse_json(content)
            break
        except json.JSONDecodeError:
            if attempt:
                raise
            logger.warning("Passage JSON did not parse; asking again")
    title = str(data.get("title") or "").strip()
    text = str(data.get("text") or "").strip()
    translation = str(data.get("translation") or "").strip() or None
    if not text:
        raise RuntimeError("LLM returned an empty passage")
    if not title:
        title = topic
    return title, text, translation


def build_passage_prompt(
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
) -> str:
    meta = LANG_META.get(language, LANG_META["ru"])
    rules = grammar_rules(language)[level]
    words = allowed_words(level, language)
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
            "Say each fact with the allowed words. "
            "If a fact needs a harder word or a harder pattern, leave that fact out. "
            "Do not copy words from the source language into the title or the text. "
            "Do not invent events, names, places, or dates. "
            "If a Date line is in the source, that is the only date you may use. "
            "Keep the people, the places, and that date.\n"
            f"Source:\n{news_brief}\n"
        )

    correction = ""
    if correction_flags:
        correction = _correction_block(level, correction_flags, previous_text)

    lang_name = meta["name"]
    sentence = "5 to 10 words" if level in {"A1", "A2"} else "8 to 15 words"
    spelling = {
        "ja": "- Spell every word exactly as it appears in the list (the same kanji or kana).\n",
        "ar": "- The list is written without hamza; write words with their normal spelling.\n",
    }.get(language, "")
    prompt = f"""You are a {lang_name} language educator writing a graded reader.

Write a coherent {lang_name} passage for CEFR {level} learners.
Topic: {shown_topic}
{genre_line}{length_line} {session_line}

GRAMMAR CONSTRAINTS FOR {level}:
{rules["prompt_constraints"]}

ALLOWED WORDS FOR {level} (dictionary forms; any inflected form is fine):
{words}

WORD CHOICE (this is checked automatically):
- Every noun, verb, adjective, and adverb must come from the allowed words. Names of people and places, and numbers, are exempt.
- If an idea needs a word that is not in the list, say it another way or leave it out.
- Repeat allowed words rather than reaching for synonyms. Repetition helps learners.
- Keep sentences short: one idea each, about {sentence}.
- Use only the grammar listed above. If a sentence needs a forbidden form, split it or say it more simply.
{spelling}{known_line}{reuse_line}{news_line}
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
    return prompt


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
        data = _parse_json(
            _complete(prompt, temperature=0, timeout=30.0, json_mode=True)
        )
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
        out = _complete(prompt, temperature=0.2, timeout=45.0).strip()
        if out.startswith("```"):
            out = out.strip("`").strip()
        return out or None
    except Exception:
        logger.exception("translate_passage failed")
        return None
