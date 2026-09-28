"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BandStrip } from "@/components/band";
import { GlossCard } from "@/components/gloss-card";
import { Art } from "@/components/landing/art";
import { LogoMark } from "@/components/logo";
import { PassageArticle } from "@/components/passage-article";
import {
  fetchMe,
  fetchPlacement,
  recordTap,
  starWord,
  submitPlacement,
  track,
  unstarWord,
} from "@/lib/api";
import {
  hasStoredLanguage,
  loadLanguage,
  markTapHintSeen,
  saveLanguage,
  useTapHintSeen,
} from "@/lib/device";
import type { LangCode, PlacementRead, PlacementResult } from "@/lib/types";
import { enabledLanguages, readingFont } from "@/lib/types";

const NAMES = { ja: "Japanese", ru: "Russian", it: "Italian", ar: "Arabic" } as const;

function isLang(value: string | null): value is LangCode {
  return value === "ja" || value === "ru" || value === "it" || value === "ar";
}

type Choices = ReturnType<typeof enabledLanguages>;

function LanguageStep({
  choices,
  initial,
  onChoose,
}: {
  choices: Choices;
  initial: LangCode;
  onChoose: (language: LangCode) => void;
}) {
  const [pick, setPick] = useState<LangCode>(
    choices.some((l) => l.id === initial) ? initial : choices[0].id,
  );
  return (
    <section className="mt-12">
      <h1 className="t-heading text-[2rem] text-ink sm:text-[2.4rem]">Which language will you read?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink/70">Each language has its own band.</p>
      <div role="radiogroup" aria-label="Language" className="mt-8 flex flex-col gap-2">
        {choices.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={pick === l.id}
            onClick={() => setPick(l.id)}
            className={`flex items-baseline justify-between rounded-card border px-4 py-3 text-left transition-colors ${
              pick === l.id
                ? "border-ink bg-paper-raised text-ink"
                : "border-rule bg-paper text-ink hover:border-ink/30"
            }`}
          >
            <span className="text-[15px]">{l.label}</span>
            <span dir={l.id === "ar" ? "rtl" : undefined} className={`text-[15px] text-ink/50 ${readingFont(l.id)}`}>
              {l.native}
            </span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onChoose(pick)} className="btn-primary mt-8">
        Read a short passage
      </button>
    </section>
  );
}

export function PlacementReadView() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("language");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [language, setLanguage] = useState<LangCode | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [read, setRead] = useState<PlacementRead | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const hint = !useTapHintSeen();
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [savingWord, setSavingWord] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .catch(() => null)
      .then((me) => {
        if (cancelled) return;
        const langs = enabledLanguages(me);
        setChoices(langs);
        const allowed = (code: LangCode) => langs.some((l) => l.id === code);
        if (isLang(requested) && allowed(requested)) {
          setLanguage(requested);
        } else if (hasStoredLanguage() && allowed(loadLanguage())) {
          setLanguage(loadLanguage());
        } else if (langs.length > 1) {
          setChoosing(true);
        } else {
          setLanguage(langs[0].id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requested]);

  useEffect(() => {
    if (!language || choosing) return;
    let cancelled = false;
    setRead(null);
    setResult(null);
    setError(null);
    setSelected(null);
    fetchPlacement(language)
      .then((data) => {
        if (cancelled) return;
        setRead(data);
        setPicks(data.questions.map(() => -1));
        track("placement_start", { language });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open the placement read.");
      });
    return () => {
      cancelled = true;
    };
  }, [language, choosing]);

  function onChoose(next: LangCode) {
    saveLanguage(next);
    setLanguage(next);
    setChoosing(false);
  }

  function onSelect(index: number | null) {
    setSelected(index);
    if (index == null || !read || !language) return;
    const tok = read.tokens[index];
    if (!tok?.is_word) return;
    if (hint) markTapHintSeen();
    if (tok.lemma) recordTap(tok.lemma, language);
  }

  async function onToggleSave() {
    const tok = selected != null ? read?.tokens[selected] : null;
    const lemma = tok?.lemma;
    if (!lemma || !language) return;
    setSavingWord(true);
    try {
      if (starred.has(lemma)) {
        await unstarWord(lemma, language);
        setStarred((prev) => {
          const next = new Set(prev);
          next.delete(lemma);
          return next;
        });
      } else {
        await starWord({ lemma, gloss: tok.gloss, passage_id: null, language });
        setStarred((prev) => new Set(prev).add(lemma));
      }
    } catch {
      /* keep current saved state */
    } finally {
      setSavingWord(false);
    }
  }

  async function onSubmit() {
    if (!read || !language || picks.some((pick) => pick < 0)) {
      setError("Answer each question.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const scored = await submitPlacement(language, picks);
      saveLanguage(language);
      setSelected(null);
      setResult(scored);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that level.");
    } finally {
      setSending(false);
    }
  }

  const multi = (choices?.length ?? 0) > 1;
  const name = language ? NAMES[language] : null;
  const font = language ? readingFont(language) : "";
  const selectedToken = selected != null ? read?.tokens[selected] : null;
  const glossOpen = Boolean(selectedToken?.is_word && !result);

  return (
    <div
      className={`mx-auto flex min-h-full w-full max-w-[42rem] flex-col px-5 pt-7 sm:px-8 sm:pt-9 ${
        glossOpen ? "pb-[min(40rem,80vh)]" : "pb-24"
      }`}
    >
      <header className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-[1.125rem] font-medium tracking-[-0.02em] text-ink"
        >
          <LogoMark className="h-[1.8em] w-auto shrink-0" />
          Lociros
        </Link>
        {result ? (
          <Link href="/library" className="t-quiet">
            Library
          </Link>
        ) : multi && language && !choosing ? (
          <button type="button" onClick={() => setChoosing(true)} className="t-quiet">
            Change language
          </button>
        ) : name && !choosing ? (
          <p className="t-eyebrow">{name}</p>
        ) : null}
      </header>

      {choosing && choices ? (
        <LanguageStep choices={choices} initial={language ?? loadLanguage()} onChoose={onChoose} />
      ) : language && name ? (
        <>
          <Art
            key={language}
            src={`cliff-${language}`}
            className="cliff-fade -mb-10 ml-auto mt-4 hidden aspect-[4/3] w-[22rem] sm:block"
          />

          {result ? (
            <section aria-live="polite" className="mt-10 sm:mt-0">
              <h1 className="t-heading text-[2rem] text-ink sm:text-[2.4rem]">
                Your {name} starts at {result.level}.
              </h1>
              <div className="mt-5">
                <BandStrip level={result.level} />
              </div>
              <p className="mt-4 max-w-[36rem] text-[15px] leading-relaxed text-ink/70">
                Three ratings in a row move it.
              </p>
              <button
                type="button"
                className="btn-primary mt-8"
                onClick={() =>
                  router.push(result.next_id ? `/passage/${result.next_id}` : "/library")
                }
              >
                Read the next one
              </button>
            </section>
          ) : (
            <>
              <h1 className="t-heading mt-10 text-[2rem] text-ink sm:mt-0 sm:text-[2.4rem]">
                One short passage.
              </h1>
              <p className="mt-3 max-w-[36rem] text-[15px] leading-relaxed text-ink/70">
                Read it, then answer four questions. That sets your {name} level.
              </p>
            </>
          )}

          {error ? <p className="mt-6 text-sm text-terracotta">{error}</p> : null}

          {read && !result ? (
            <>
              {hint ? <p className="mt-10 text-[14px] text-ink">Tap any word.</p> : null}
              <h2
                dir={language === "ar" ? "rtl" : undefined}
                className={`${hint ? "mt-3" : "mt-10"} text-[1.8rem] leading-snug text-ink ${font}`}
              >
                {read.title}
              </h2>
              <PassageArticle
                tokens={read.tokens}
                language={language}
                selected={selected}
                onSelect={onSelect}
                className="mt-6 text-[1.45rem] sm:text-[1.7rem]"
              />
              <section className="mt-12 border-t border-rule pt-8">
                <ol className="flex flex-col gap-6">
                  {read.questions.map((question, qIndex) => (
                    <li key={question.id}>
                      <p className="text-[15px] leading-relaxed text-ink">{question.prompt}</p>
                      <div className="mt-3 flex flex-col gap-2">
                        {question.choices.map((choice, cIndex) => (
                          <button
                            key={choice}
                            type="button"
                            aria-pressed={picks[qIndex] === cIndex}
                            onClick={() =>
                              setPicks((prev) => prev.map((value, index) => (index === qIndex ? cIndex : value)))
                            }
                            className={`rounded-card border px-3 py-2 text-left text-sm ${
                              picks[qIndex] === cIndex
                                ? "border-ink bg-paper-raised text-ink"
                                : "border-rule bg-paper text-ink hover:border-ink/30"
                            }`}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  disabled={sending || picks.some((pick) => pick < 0)}
                  onClick={() => void onSubmit()}
                  className="btn-primary mt-8 disabled:opacity-40"
                >
                  {sending ? "Saving…" : "Continue"}
                </button>
              </section>
            </>
          ) : !read && !error && !result ? (
            <p className="mt-10 text-sm text-ink/45">Opening the passage…</p>
          ) : null}
        </>
      ) : (
        <p className="mt-10 text-sm text-ink/45">Opening the passage…</p>
      )}

      {glossOpen && selectedToken && language ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper-raised px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[min(38rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:rounded-[12px] sm:border sm:border-ink/8 sm:px-8 sm:pb-7 sm:pt-6 sm:shadow-float"
          role="dialog"
          aria-label="Word gloss"
        >
          <div className="mx-auto flex max-w-[42rem] items-start justify-between gap-4 sm:max-w-none">
            <GlossCard
              token={selectedToken}
              language={language}
              saved={Boolean(selectedToken.lemma && starred.has(selectedToken.lemma))}
              saving={savingWord}
              onToggleSave={onToggleSave}
            />
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="t-quiet shrink-0"
              aria-label="Close gloss"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
