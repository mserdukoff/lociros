"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Seal } from "@/components/seal";
import { Segmented } from "@/components/segmented";
import { listDemoPassages } from "@/lib/demo-catalog";
import { LANGUAGES, readingFont, type LangCode, type Passage } from "@/lib/types";
import { InkArt, Stagger, StaggerItem } from "./motion-bits";

type Phase = "idle" | "writing" | "streaming" | "done";

function sentence(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function useCycleType(words: string[], enabled: boolean): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!enabled || words.length === 0) return;
    let w = 0;
    let i = 0;
    let dir = 1;
    let timer = 0;
    const tick = () => {
      const word = words[w];
      i += dir;
      setText(word.slice(0, i));
      let delay = dir > 0 ? 55 : 22;
      if (dir > 0 && i >= word.length) {
        dir = -1;
        delay = 1700;
      } else if (dir < 0 && i <= 0) {
        dir = 1;
        w = (w + 1) % words.length;
        delay = 350;
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, [words, enabled]);
  return text;
}

const CHECKS = ["Writing at", "Checking every word against", "Checking the grammar against"];

export function PromptHero({
  lang,
  onLang,
  languages = LANGUAGES,
}: {
  lang: LangCode;
  onLang: (next: LangCode) => void;
  languages?: typeof LANGUAGES;
}) {
  const passages = useMemo(() => listDemoPassages(lang).slice(0, 4), [lang]);
  const topics = useMemo(() => passages.map((p) => sentence(p.topic)), [passages]);
  const [picked, setPicked] = useState<Passage | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const ghost = useCycleType(topics, picked === null);
  const language = LANGUAGES.find((l) => l.id === lang)?.label ?? "Japanese";
  const ar = lang === "ar";

  function run(p: Passage | undefined) {
    if (!p) return;
    setPicked(p);
    setShown(0);
    setPhase("writing");
  }

  function switchLang(next: LangCode) {
    setPicked(null);
    setPhase("idle");
    onLang(next);
  }

  useEffect(() => {
    if (!picked) return;
    let timer = 0;
    if (phase === "writing") timer = window.setTimeout(() => setPhase("streaming"), 1500);
    if (phase === "streaming") {
      timer =
        shown >= picked.tokens.length
          ? window.setTimeout(() => setPhase("done"), 300)
          : window.setTimeout(() => setShown((n) => n + 1), 34);
    }
    return () => window.clearTimeout(timer);
  }, [picked, phase, shown]);

  return (
    <section className="relative pb-20 pt-8 sm:pt-12">
      <InkArt
        key={`wash-${lang}`}
        src={`wash-${lang}`}
        className="wash-fade pointer-events-none absolute left-1/2 top-[-4rem] w-[64rem] max-w-none -translate-x-1/2 opacity-60"
      />
      <Stagger className="relative mx-auto flex max-w-[44rem] flex-col items-center text-center">
        <StaggerItem>
          <p className="t-eyebrow">Graded readers, written to your level</p>
        </StaggerItem>
        <StaggerItem>
          <h1 className="t-display mt-5 text-[2.6rem] text-ink sm:text-[3.5rem]">
            What do you want to read about?
          </h1>
        </StaggerItem>
        <StaggerItem className="mt-7">
          <Segmented
            animated
            ariaLabel="Language"
            size="sm"
            options={languages.map((l) => ({ id: l.id, label: l.label }))}
            value={lang}
            onChange={switchLang}
          />
        </StaggerItem>
        <StaggerItem className="mt-6 w-full">
          <div className="sheet-float w-full px-5 pb-3.5 pt-4 text-left">
            <p className="min-h-[3.25rem] text-[1.125rem] leading-snug">
              {picked ? (
                <span className="text-ink">{sentence(picked.topic)}</span>
              ) : (
                <span className="text-ink/40">{ghost || "\u00a0"}</span>
              )}
              <motion.span
                aria-hidden="true"
                className="ml-0.5 inline-block h-[1.1em] w-[1.5px] translate-y-[3px] bg-ink/60"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12.5px] text-ink/50">
                {language} · {picked?.level ?? "A2"} · checked before you read it
              </span>
              <button
                type="button"
                aria-label="Write a passage"
                onClick={() => run(picked ?? passages[0])}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-105 active:scale-95"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
                </svg>
              </button>
            </div>
          </div>
        </StaggerItem>
        <StaggerItem className="mt-4">
          <div className="flex flex-wrap justify-center gap-2">
            {passages.map((p) => {
              const on = picked?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => run(p)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                    on
                      ? "border-ink bg-ink text-paper"
                      : "border-rule bg-paper-raised text-ink/75 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {sentence(p.topic)}
                </button>
              );
            })}
          </div>
        </StaggerItem>
      </Stagger>

      <div className="relative mx-auto mt-8 max-w-[44rem]">
        <AnimatePresence mode="wait">
          {picked ? (
            <motion.article
              key={picked.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="sheet relative px-6 pb-6 pt-5 sm:px-8"
            >
              <div className={`flex items-start justify-between gap-4 ${ar ? "flex-row-reverse" : ""}`}>
                <div className={ar ? "text-right" : ""}>
                  <p className="t-eyebrow">
                    {picked.level} · {picked.word_count} words
                  </p>
                  <h2 lang={lang} dir={ar ? "rtl" : undefined} className={`mt-2 text-[1.6rem] text-ink ${readingFont(lang)}`}>
                    {picked.title}
                  </h2>
                </div>
                {phase === "done" ? (
                  <Seal verdict="pass" language={lang} level={picked.level} size="corner" animate className="-my-2 shrink-0" />
                ) : null}
              </div>

              {phase === "writing" ? (
                <ul className="mt-5 flex flex-col gap-2 text-[13.5px] text-ink/55">
                  {CHECKS.map((c, i) => (
                    <motion.li
                      key={c}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.4 }}
                      className="flex items-center gap-2.5"
                    >
                      <motion.span
                        className="h-1.5 w-1.5 rounded-full bg-terracotta"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                      {c} {picked.level}
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <p
                  lang={lang}
                  dir={ar ? "rtl" : undefined}
                  className={`mt-4 text-[1.2rem] leading-[1.9] text-ink ${readingFont(lang)}`}
                >
                  {picked.tokens.slice(0, shown).map((t, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, filter: "blur(3px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      transition={{ duration: 0.35 }}
                    >
                      {t.text + t.ws}
                    </motion.span>
                  ))}
                </p>
              )}

              {phase === "done" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-5 flex items-center justify-between border-t border-rule pt-4 text-[13px]"
                >
                  <span className="text-ink/55">Every word checked against {picked.level}.</span>
                  <Link href={`/passage/${picked.id}`} className="t-quiet text-ink!">
                    Open in the reader →
                  </Link>
                </motion.div>
              ) : null}
            </motion.article>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
