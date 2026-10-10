"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { DemoBanner } from "@/components/demo-banner";
import { Art } from "@/components/landing/art";
import { LanguageSwitch, useAppLanguage, useMe } from "@/components/language-switch";
import { exportWords, fetchLibrary, fetchReview, unstarWord } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { isRtl, LANGUAGES, readingFont, type LangCode, type StarredWord } from "@/lib/types";

function WordsExport({ language }: { language: LangCode }) {
  const [error, setError] = useState<string | null>(null);
  const download = (format: "csv" | "apkg") => {
    setError(null);
    exportWords(language, format).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Export failed.");
    });
  };
  const linkClass = "underline decoration-ink/20 underline-offset-4 hover:text-ink";
  return (
    <p className="t-quiet">
      Export{" "}
      <button type="button" onClick={() => download("csv")} className={linkClass}>
        CSV
      </button>
      {" · "}
      <button type="button" onClick={() => download("apkg")} className={linkClass}>
        Anki pack
      </button>
      {error ? <span className="ml-2 text-terracotta">{error}</span> : null}
    </p>
  );
}

export function Words() {
  const { me, loaded } = useMe();
  const { language, languages, choose } = useAppLanguage(me);
  const [data, setData] = useState<{ language: LangCode; words: StarredWord[]; due: number } | null>(null);
  const [failed, setFailed] = useState<{ language: LangCode; message: string } | null>(null);
  const name = LANGUAGES.find((l) => l.id === language)?.label ?? "Japanese";
  const font = readingFont(language);
  const rtl = isRtl(language);
  const words = data?.language === language ? data.words : null;
  const due = data?.language === language ? data.due : 0;
  const error = failed?.language === language ? failed.message : null;

  useEffect(() => {
    if (!loaded) return;
    const ac = new AbortController();
    Promise.all([
      fetchLibrary(language, ac.signal),
      fetchReview(language).catch(() => ({ due: 0 })),
    ])
      .then(([lib, review]) => setData({ language, words: lib.words ?? [], due: review.due }))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setFailed({ language, message: err instanceof Error ? err.message : "Could not load your words." });
      });
    return () => ac.abort();
  }, [language, loaded]);

  async function remove(lemma: string) {
    try {
      await unstarWord(lemma, language);
      setData((prev) => (prev ? { ...prev, words: prev.words.filter((w) => w.lemma !== lemma) } : prev));
    } catch {
      /* keep the list */
    }
  }

  const count = words?.length ?? 0;

  return (
    <AppShell
      current="/words"
      language={language}
      actions={<LanguageSwitch value={language} languages={languages} onChange={choose} />}
    >
      <div className="flex flex-col gap-12">
        <DemoBanner />
        <section className="flex items-end justify-between gap-6">
          <div>
            <PageHeading eyebrow={`${name} · Words`} muted={words === null}>
              {words === null ? (error ? "Your words" : "Opening your words…") : count === 1 ? "1 saved word" : `${count} saved words`}
            </PageHeading>
            <p className="mt-3 max-w-[26rem] text-[15px] leading-relaxed text-ink/60">
              Tap a word while you read, then choose Save. It lands here with the passage it came
              from, and in review.
            </p>
          </div>
          <Art src="card-catalog" className="-mb-4 -mt-10 hidden w-[11rem] shrink-0 sm:block" />
        </section>

        {error ? <p className="text-sm text-terracotta">{error}</p> : null}

        {due > 0 ? (
          <Link
            href="/review"
            className="group sheet flex items-baseline justify-between gap-4 bg-sage-wash px-5 py-4 transition-colors hover:bg-paper-raised"
          >
            <span className="tnum text-[1.0625rem] text-ink">{due} due for review</span>
            <span className="t-quiet group-hover:text-ink">Review →</span>
          </Link>
        ) : null}

        {words && count > 0 ? (
          <section className="flex flex-col gap-3">
            <ul className="sheet flex flex-col divide-y divide-rule/70 overflow-hidden">
              {words.map((word) => (
                <li key={word.lemma} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2.5">
                      <span dir={rtl ? "rtl" : undefined} lang={language} className={`text-[1.0625rem] text-ink ${font}`}>
                        {word.lemma}
                      </span>
                      {word.gloss ? <span className="text-sm text-ink/55">{word.gloss}</span> : null}
                    </p>
                    {word.passage_id && word.title ? (
                      <Link
                        href={`/passage/${word.passage_id}`}
                        dir={rtl ? "rtl" : undefined}
                        className={`mt-0.5 block text-[13px] text-ink/40 transition-colors hover:text-ink ${font}`}
                      >
                        {word.title}
                      </Link>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(word.lemma)}
                    className="t-quiet shrink-0 underline decoration-ink/15 underline-offset-4"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            {isDemo() ? null : <WordsExport language={language} />}
          </section>
        ) : null}

        {words && count === 0 ? (
          <Link href="/library" className="t-quiet self-start text-ink">
            Open the library →
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
