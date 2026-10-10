"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppRail, MobileNav } from "@/components/app-shell";
import { BandStrip } from "@/components/band";
import { Art } from "@/components/landing/art";
import { LogoMark } from "@/components/logo";
import { fetchMe, fetchPlacement, submitPlacement, track } from "@/lib/api";
import { hasStoredLanguage, loadLanguage, saveLanguage } from "@/lib/device";
import type { CefrLevel, LangCode, PlacementRead, PlacementResult, PlacementStage } from "@/lib/types";
import { enabledLanguages, readingFont } from "@/lib/types";

const NAMES = { ja: "Japanese", ru: "Russian", it: "Italian", ar: "Arabic" } as const;

function isLang(value: string | null): value is LangCode {
  return value === "ja" || value === "ru" || value === "it" || value === "ar";
}

function isPlacementLevel(value: string | null): value is CefrLevel {
  return value === "A1" || value === "A2" || value === "B1" || value === "B2";
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
        Start reading
      </button>
    </section>
  );
}

export function PlacementReadView() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("language");
  const from = params.get("from");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [language, setLanguage] = useState<LangCode | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [read, setRead] = useState<PlacementRead | null>(null);
  const [stages, setStages] = useState<PlacementStage[]>([]);
  const [picks, setPicks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlacementResult | null>(null);

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

  const recheck = isPlacementLevel(from) && language !== null && language === requested ? from : null;
  const start: CefrLevel = recheck ?? "A1";

  useEffect(() => {
    if (!language || choosing) return;
    let cancelled = false;
    setRead(null);
    setStages([]);
    setResult(null);
    setError(null);
    fetchPlacement(language, start)
      .then((data) => {
        if (cancelled) return;
        setRead(data);
        setPicks(data.questions.map(() => -1));
        track("placement_start", { language, start });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open the placement read.");
      });
    return () => {
      cancelled = true;
    };
  }, [language, choosing, start]);

  function onChoose(next: LangCode) {
    saveLanguage(next);
    setLanguage(next);
    setChoosing(false);
  }

  async function onSubmit() {
    if (!read || !language || picks.some((pick) => pick < 0)) {
      setError("Answer each question.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const sofar = [...stages, { level: read.level, answers: picks }];
      const scored = await submitPlacement(language, start, sofar);
      if (scored.done === false && scored.next_level) {
        const next = await fetchPlacement(language, scored.next_level);
        setStages(sofar);
        setRead(next);
        setPicks(next.questions.map(() => -1));
      } else {
        saveLanguage(language);
        setResult(scored);
      }
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

  return (
    <div className="relative min-h-full overflow-x-clip lg:pl-[13.5rem]">
      <AppRail language={language ?? undefined} current="/library" />
    <div className="mx-auto flex min-h-full w-full max-w-[42rem] flex-col px-5 pb-28 pt-7 sm:px-8 sm:pt-9 lg:pb-24">
      <MobileNav current="/library" />
      <header className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-[1.125rem] font-medium tracking-[-0.02em] text-ink lg:invisible"
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
            className="cliff-fade mb-8 ml-auto mt-4 hidden aspect-[4/3] w-[22rem] sm:block"
          />

          {result?.level ? (
            <section aria-live="polite" className="mt-10 sm:mt-0">
              <h1 className="t-heading text-[2rem] text-ink sm:text-[2.4rem]">
                Your {name} {recheck ? "is at" : "starts at"} {result.level}.
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
          ) : stages.length > 0 ? (
            <p className="t-eyebrow mt-10 sm:mt-0">Passage {stages.length + 1}</p>
          ) : recheck ? (
            <>
              <h1 className="t-heading mt-10 text-[2rem] text-ink sm:mt-0 sm:text-[2.4rem]">
                Welcome back.
              </h1>
              <p className="mt-3 max-w-[36rem] text-[15px] leading-relaxed text-ink/70">
                It has been a while, so we start at {recheck}, your last {name} level, and move up or down from
                there. Four questions after each passage.
              </p>
            </>
          ) : (
            <>
              <h1 className="t-heading mt-10 text-[2rem] text-ink sm:mt-0 sm:text-[2.4rem]">
                A few short passages.
              </h1>
              <p className="mt-3 max-w-[36rem] text-[15px] leading-relaxed text-ink/70">
                Each one is a little harder. Answer four questions after each, and we stop when the reading gets
                too hard. That sets your {name} level.
              </p>
            </>
          )}

          {error ? <p className="mt-6 text-sm text-terracotta">{error}</p> : null}

          {read && !result ? (
            <>
              <h2
                lang={language}
                dir={language === "ar" ? "rtl" : undefined}
                className={`mt-10 text-[1.8rem] leading-snug text-ink ${font}`}
              >
                {read.title}
              </h2>
              {/* Plain text on purpose: no glosses or grammar, so the read measures the reader alone. */}
              <article
                lang={language}
                dir={language === "ar" ? "rtl" : "ltr"}
                className={`mt-6 whitespace-pre-wrap text-[1.45rem] leading-[1.85] text-ink sm:text-[1.7rem] ${font}`}
              >
                {read.text}
              </article>
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
    </div>
    </div>
  );
}
