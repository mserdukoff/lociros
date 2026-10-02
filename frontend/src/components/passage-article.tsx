"use client";

import { useState } from "react";
import { furiganaReading, isContentWord, readingFont, type LangCode, type Token } from "@/lib/types";

export const ROLE_TEXT: Record<string, string> = {
  topic: "text-g-topic",
  subject: "text-g-subject",
  object: "text-g-object",
  particle: "text-g-particle",
  verb: "text-g-verb",
  aux: "text-g-aux",
  adj: "text-g-adj",
  adverb: "text-g-adverb",
};

const JA_LEGEND: { swatch?: string; label: string; role: string }[] = [
  { swatch: "は", label: "Topic", role: "topic" },
  { swatch: "が", label: "Subject", role: "subject" },
  { swatch: "を", label: "Object", role: "object" },
  { label: "Particle", role: "particle" },
  { label: "Verb", role: "verb" },
  { label: "Ending", role: "aux" },
  { label: "Adjective", role: "adj" },
];

const LATIN_LEGEND: { label: string; role: string }[] = [
  { label: "Verb", role: "verb" },
  { label: "Adjective", role: "adj" },
  { label: "Preposition", role: "particle" },
  { label: "Adverb", role: "adverb" },
];

export function GrammarLegend({ language, className = "" }: { language: LangCode; className?: string }) {
  const items = language === "ja" ? JA_LEGEND : LATIN_LEGEND;
  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-ink/40 ${className}`}
    >
      {items.map((item) => (
        <span key={item.role + item.label} className={ROLE_TEXT[item.role]}>
          {"swatch" in item && typeof item.swatch === "string" ? (
            <span className="font-ja">{item.swatch} </span>
          ) : null}
          {item.label}
        </span>
      ))}
    </p>
  );
}

function TokenFace({ token, reading }: { token: Token; reading: string | null }) {
  if (reading) {
    return (
      <ruby>
        {token.text}
        <rt>{reading}</rt>
      </ruby>
    );
  }
  return token.text;
}

function tokenLook({
  token,
  language,
  grammarColors,
  fadeKnown,
  knownLemmas,
  furigana,
}: {
  token: Token;
  language: LangCode;
  grammarColors: boolean;
  fadeKnown: boolean;
  knownLemmas: string[];
  furigana: boolean;
}) {
  const roleCls = grammarColors && token.role ? ROLE_TEXT[token.role] : "";
  const faded =
    fadeKnown &&
    knownLemmas.length > 0 &&
    isContentWord(token, language) &&
    Boolean(token.lemma && knownLemmas.includes(token.lemma));
  const reading = furigana ? furiganaReading(token) : null;
  const colorCls = roleCls || (faded && !grammarColors ? "text-ink/40" : "text-ink");
  const fadeCls = faded && grammarColors ? "opacity-40" : "";
  return { reading, colorCls, fadeCls };
}

/** Marks that may not begin a line (kinsoku), in every script the reader shows. */
const CLOSING = /^[。、，．・！？!?,.;:…）」』】》〉»)\]،؛؟]+$/u;

/** Index of each non-word token that rides on the word before it, so a line never starts with it. */
function attachedPunct(tokens: Token[]): boolean[] {
  const out = new Array<boolean>(tokens.length).fill(false);
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.is_word || !CLOSING.test(tok.text)) continue;
    const prev = tokens[i - 1];
    if (prev.ws) continue;
    if (prev.is_word || out[i - 1]) out[i] = true;
  }
  return out;
}

function firstWordIndex(tokens: Token[], ids: number[], sid: number): number | null {
  for (let i = 0; i < tokens.length; i++) {
    if (ids[i] === sid && tokens[i].is_word) return i;
  }
  return null;
}

/**
 * The passage itself: every word is a button. Shared by the reader and the
 * landing-page demo so the hero shows the real thing. Sentence mode selects
 * whole sentences instead.
 */
export function PassageArticle({
  tokens,
  language,
  selected,
  onSelect,
  grammarColors = false,
  furigana = false,
  fadeKnown = false,
  knownLemmas = [],
  sentenceIds,
  audioSentence = null,
  focusSentence = null,
  sentenceMode = false,
  className = "",
}: {
  tokens: Token[];
  language: LangCode;
  selected: number | null;
  onSelect: (index: number | null) => void;
  grammarColors?: boolean;
  furigana?: boolean;
  fadeKnown?: boolean;
  knownLemmas?: string[];
  sentenceIds?: number[];
  audioSentence?: number | null;
  focusSentence?: number | null;
  sentenceMode?: boolean;
  className?: string;
}) {
  const ja = language === "ja";
  const ar = language === "ar";
  const selectedToken = selected != null ? tokens[selected] : null;
  const selectedConjId = selectedToken?.conj_id != null ? selectedToken.conj_id : null;
  const rubyOn = furigana && (ja || ar);
  const [hoverSid, setHoverSid] = useState<number | null>(null);
  const ids = sentenceIds != null && sentenceIds.length === tokens.length ? sentenceIds : null;
  const bySentence = sentenceMode && ids != null;
  const attached = attachedPunct(tokens);

  function punctSpan(i: number) {
    const token = tokens[i];
    const sid = ids?.[i] ?? null;
    const sentenceOn = bySentence && sid != null && sid === focusSentence;
    const sentenceHover = bySentence && sid != null && hoverSid === sid && !sentenceOn;
    return (
      <span
        key={i}
        className={sentenceOn ? "sentence-on" : sentenceHover ? "sentence-hot" : ""}
        onMouseEnter={() => {
          if (bySentence && sid != null) setHoverSid(sid);
        }}
        onClick={() => {
          if (!bySentence || sid == null) return;
          const first = firstWordIndex(tokens, ids, sid);
          if (first == null) return;
          onSelect(sentenceOn ? null : first);
        }}
      >
        {token.text}
        {token.ws}
      </span>
    );
  }

  return (
    <article
      lang={language}
      dir={ar ? "rtl" : "ltr"}
      className={`shrink-0 text-ink ${rubyOn ? "leading-[2.35]" : "leading-[1.85]"} ${
        readingFont(language)
      } ${className}`}
      onMouseLeave={() => setHoverSid(null)}
    >
      {tokens.map((token, i) => {
        const sid = ids?.[i] ?? null;
        const sentenceOn = bySentence && sid != null && sid === focusSentence;
        const sentenceHover =
          bySentence && sid != null && hoverSid === sid && !sentenceOn;
        const liveLine =
          !bySentence &&
          audioSentence != null &&
          ids != null &&
          ids[i] === audioSentence;

        if (!token.is_word) {
          return attached[i] ? null : punctSpan(i);
        }
        const trailing: number[] = [];
        for (let j = i + 1; j < tokens.length && attached[j]; j++) trailing.push(j);

        const isOn = !bySentence && selected === i;
        const inChain =
          !bySentence &&
          selectedConjId != null &&
          token.conj_id != null &&
          token.conj_id === selectedConjId;
        const look = tokenLook({
          token,
          language,
          grammarColors,
          fadeKnown,
          knownLemmas,
          furigana,
        });
        return (
          <span key={i} className={trailing.length > 0 ? "whitespace-nowrap" : undefined}>
            <button
              type="button"
              onMouseEnter={() => {
                if (bySentence && sid != null) setHoverSid(sid);
              }}
              onClick={() => {
                if (bySentence && sid != null) {
                  const first = firstWordIndex(tokens, ids, sid);
                  if (first == null) return;
                  onSelect(sentenceOn ? null : first);
                  return;
                }
                onSelect(isOn ? null : i);
              }}
              aria-pressed={bySentence ? sentenceOn : isOn}
              className={`${bySentence ? "word-plain" : "word"} ${look.colorCls} ${look.fadeCls} ${
                liveLine ? "bg-terracotta/12" : ""
              } ${isOn ? "word-on" : inChain ? "word-chain" : ""} ${
                sentenceOn ? "sentence-on" : sentenceHover ? "sentence-hot" : ""
              }`}
            >
              <TokenFace token={token} reading={look.reading} />
            </button>
            {token.ws}
            {trailing.map(punctSpan)}
          </span>
        );
      })}
    </article>
  );
}
