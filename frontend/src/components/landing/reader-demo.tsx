"use client";

import { useState } from "react";
import { BandStrip } from "@/components/band";
import { GlossCard } from "@/components/gloss-card";
import { GrammarLegend, PassageArticle } from "@/components/passage-article";
import { Segmented } from "@/components/segmented";
import { LANGUAGES, readingFont, type LangCode } from "@/lib/types";
import { DEMO } from "./demo-data";

function DemoToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`text-[13px] tracking-[0.02em] underline underline-offset-4 transition-colors hover:text-ink ${
        on ? "text-ink decoration-ink/50" : "text-ink/50 decoration-ink/15"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The hero: the real reader, on a hand-authored passage. Same article and
 * gloss components as /passage/[id]; nothing here is a mockup.
 * Mounted with key={lang} so switching language resets the selection.
 * From lg up the gloss floats off the sheet's lower edge instead of
 * pushing the passage around, unless `inlineGloss` keeps it in the flow
 * (the landing hero, where a floating gloss would cover the next section).
 */
export function ReaderDemo({
  lang,
  onLang,
  languages,
  showLanguages = true,
  inlineGloss = false,
  onFirstTap,
}: {
  lang: LangCode;
  onLang?: (next: LangCode) => void;
  languages?: LangCode[];
  showLanguages?: boolean;
  inlineGloss?: boolean;
  onFirstTap?: () => void;
}) {
  const demo = DEMO[lang];
  const [selected, setSelected] = useState<number | null>(demo.initial);
  const [grammar, setGrammar] = useState(false);
  const [furigana, setFurigana] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [tapped, setTapped] = useState(false);

  const token = selected != null ? demo.tokens[selected] : null;
  const open = Boolean(token && token.is_word);
  const ja = lang === "ja";
  const ar = lang === "ar";
  const options = LANGUAGES.filter((l) => !languages || languages.includes(l.id));

  function select(index: number | null) {
    setSelected(index);
    if (index != null && !tapped) {
      setTapped(true);
      onFirstTap?.();
    }
  }

  return (
    <div className="relative">
      <div className="sheet flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-rule/70 px-5 pb-4 pt-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BandStrip level={demo.level} />
            <span className="t-eyebrow">{demo.genre}</span>
          </div>
          {showLanguages && onLang && options.length > 1 ? (
            <div className="self-start">
              <Segmented
                ariaLabel="Demo language"
                size="sm"
                options={options.map((l) => ({ id: l.id, label: l.label }))}
                value={lang}
                onChange={onLang}
              />
            </div>
          ) : null}
        </div>

        <div className="px-5 pb-8 pt-6 sm:px-6">
          <p className="t-eyebrow">{demo.topic}</p>
          <h2
            dir={ar ? "rtl" : undefined}
            className={`mt-2 text-[1.45rem] leading-snug text-ink sm:text-[1.7rem] ${readingFont(lang)}`}
          >
            {demo.title}
          </h2>
          <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-y border-rule/70 py-2.5">
            <DemoToggle on={grammar} onClick={() => setGrammar((v) => !v)}>
              Grammar
            </DemoToggle>
            {ja ? (
              <DemoToggle on={furigana} onClick={() => setFurigana((v) => !v)}>
                Furigana
              </DemoToggle>
            ) : null}
            {ar ? (
              <DemoToggle on={furigana} onClick={() => setFurigana((v) => !v)}>
                Vowels
              </DemoToggle>
            ) : null}
            <span className="ml-auto text-[13px] text-ink/40">Tap any word</span>
          </div>
          {grammar ? <GrammarLegend language={lang} className="mt-3" /> : null}
          <PassageArticle
            tokens={demo.tokens}
            language={lang}
            selected={selected}
            onSelect={select}
            grammarColors={grammar}
            furigana={furigana}
            className="mt-6 text-[1.2rem] sm:text-[1.3rem]"
          />
        </div>
      </div>

      <div
        className={
          inlineGloss
            ? "sheet-float relative z-20 mx-3 -mt-5 px-5 py-4 sm:ml-auto sm:mr-[-1.5rem] sm:w-[22rem]"
            : `sheet-float z-20 mt-3 px-5 py-4 lg:absolute lg:-right-12 lg:top-[calc(100%-1.75rem)] lg:mt-0 lg:max-h-[19rem] lg:w-[21rem] lg:overflow-y-auto ${
                open ? "" : "lg:hidden"
              }`
        }
        role="region"
        aria-label="Word gloss"
        aria-live="polite"
      >
        {token && open ? (
          <div className="flex items-start justify-between gap-4">
            <GlossCard
              token={token}
              language={lang}
              saved={Boolean(token.lemma && saved.has(token.lemma))}
              saving={false}
              maxHeight={false}
              onToggleSave={() => {
                const lemma = token.lemma;
                if (!lemma) return;
                setSaved((prev) => {
                  const next = new Set(prev);
                  if (next.has(lemma)) next.delete(lemma);
                  else next.add(lemma);
                  return next;
                });
              }}
            />
            <button type="button" onClick={() => setSelected(null)} className="t-quiet shrink-0">
              Close
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink/45">
            Tap a word to see what it means, how it&apos;s used
            {ja ? ", and every kanji inside it" : ar ? ", and the root it comes from" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
