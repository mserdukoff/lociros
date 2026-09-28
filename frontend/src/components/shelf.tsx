"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BandStrip } from "@/components/band";
import { ContinueCard, datedSource, metaLine, sourceLine } from "@/components/continue-card";
import { GenerateForm } from "@/components/generate-form";
import { Segmented } from "@/components/segmented";
import { Seal } from "@/components/seal";
import { DemoBanner } from "@/components/demo-banner";
import { AuthPanel } from "@/components/auth-panel";
import { Art } from "@/components/landing/art";
import { LogoMark } from "@/components/logo";
import { fetchLibrary, fetchMe, fetchReview, saveNews, unstarWord } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { hasStoredLanguage, loadLanguage, saveLanguage } from "@/lib/device";
import {
  enabledLanguages,
  isRtl,
  readingFont,
  type LangCode,
  type LibraryItem,
  type LibraryResponse,
  type MeResponse,
  type NewsNotice,
  type StarredWord,
} from "@/lib/types";

const LANG_NAME: Record<LangCode, string> = {
  ja: "Japanese",
  ru: "Russian",
  it: "Italian",
  ar: "Arabic",
};

function TodayNews({
  notice,
  saving,
  onSave,
}: {
  notice: NewsNotice;
  saving: boolean;
  onSave: () => void;
}) {
  const font = readingFont(notice.language);
  const source = datedSource(notice.source_name, notice.source_date);
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Today</SectionLabel>
      <div className="sheet px-6 py-6">
        <p className="text-[13px] text-ink/50">
          {source ? `${source} · ` : ""}
          {notice.level}
          {notice.read ? " · read" : ""}
        </p>
        <h2
          dir={isRtl(notice.language) ? "rtl" : undefined}
          className={`mt-3 text-[1.6rem] leading-[1.25] text-ink sm:text-[1.9rem] ${font}`}
        >
          {notice.title}
        </h2>
        <div className="mt-5 flex items-baseline gap-6">
          <Link
            href={`/passage/${notice.passage_id}`}
            className="text-sm text-ink underline decoration-ink/30 underline-offset-4"
          >
            Read
          </Link>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`text-[13px] underline underline-offset-4 transition-colors hover:text-ink disabled:opacity-50 ${
              notice.saved ? "text-ink decoration-ink/40" : "text-ink/50 decoration-ink/20"
            }`}
          >
            {notice.saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="t-eyebrow">{children}</p>;
}

function WordsList({
  words,
  language,
  onRemove,
}: {
  words: StarredWord[];
  language: LangCode;
  onRemove: (lemma: string) => void;
}) {
  if (words.length === 0) return null;
  const font = readingFont(language);
  const rtl = isRtl(language);
  return (
    <section id="words" className="scroll-mt-8 flex flex-col gap-3">
      <SectionLabel>Words</SectionLabel>
      <ul className="sheet flex flex-col divide-y divide-rule/70 overflow-hidden">
        {words.map((word) => (
          <li key={word.lemma} className="flex items-start justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2.5">
                <span dir={rtl ? "rtl" : undefined} className={`text-[1.0625rem] text-ink ${font}`}>{word.lemma}</span>
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
              onClick={() => onRemove(word.lemma)}
              className="t-quiet shrink-0 underline decoration-ink/15 underline-offset-4"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {isDemo() ? null : (
        <p className="t-quiet">
          Export{" "}
          <a
            href="/api/words/export.csv"
            className="underline decoration-ink/20 underline-offset-4 hover:text-ink"
          >
            CSV
          </a>
          {" · "}
          <a
            href="/api/words/export.apkg"
            className="underline decoration-ink/20 underline-offset-4 hover:text-ink"
          >
            Anki pack
          </a>
        </p>
      )}
    </section>
  );
}

/** Every other passage: a hairline row, not a card. */
function ShelfRow({ item }: { item: LibraryItem }) {
  const font = readingFont(item.language);
  return (
    <li>
      <Link
        href={`/passage/${item.id}`}
        className="group grid grid-cols-[1fr_auto] items-baseline gap-x-4 px-5 py-4 transition-colors hover:bg-paper"
      >
        <h3 dir={item.language === "ar" ? "rtl" : undefined} className={`text-[1.125rem] leading-snug text-ink ${font}`}>{item.title}</h3>
        <span className="tnum flex items-center gap-2 font-display text-[11px] tracking-[0.12em] text-ink/45">
          {!item.passed ? (
            <Seal
              verdict="fail"
              language={item.language}
              level={item.level}
              size="mark"
            />
          ) : null}
          {item.level}
          {item.chapter_index ? ` · ch ${item.chapter_index}` : ""}
        </span>
        <p className="tnum col-span-2 mt-1 text-[13px] text-ink/45">
          {sourceLine(item) ? `${sourceLine(item)} · ` : ""}
          {item.topic} · {metaLine(item)}
        </p>
      </Link>
    </li>
  );
}

export function Shelf() {
  const router = useRouter();
  const [language, setLanguage] = useState<LangCode>("ja");
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restockOpen, setRestockOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [due, setDue] = useState(0);
  const [savingNews, setSavingNews] = useState(false);
  const showRussian = me?.show_russian === true;
  const showItalian = me?.show_italian === true;
  const showArabic = me?.show_arabic === true;

  useEffect(() => {
    if (!me) return;
    const saved = loadLanguage();
    if (saved === "ru" && showRussian) {
      setLanguage("ru");
      return;
    }
    if (saved === "it" && showItalian) {
      setLanguage("it");
      return;
    }
    if (saved === "ar" && showArabic) {
      setLanguage("ar");
      return;
    }
    if (
      (language === "ru" && !showRussian) ||
      (language === "it" && !showItalian) ||
      (language === "ar" && !showArabic)
    ) {
      setLanguage("ja");
      saveLanguage("ja");
    }
  }, [me, showRussian, showItalian, showArabic, language]);

  const refreshMe = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const load = useCallback(
    async (lang: LangCode, signal?: AbortSignal) => {
      const requested =
        (!showRussian && lang === "ru") ||
        (!showItalian && lang === "it") ||
        (!showArabic && lang === "ar")
          ? "ja"
          : lang;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchLibrary(requested, signal);
        if (signal?.aborted) return;
        setLibrary(data);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load the shelf.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [showRussian, showItalian, showArabic],
  );

  useEffect(() => {
    if (library?.placed !== false) return;
    if (!hasStoredLanguage()) {
      router.replace("/placement");
      return;
    }
    if (library.language !== loadLanguage()) return;
    router.replace(`/placement?language=${library.language}`);
  }, [library, router]);

  useEffect(() => {
    const ac = new AbortController();
    void load(language, ac.signal);
    void fetchReview(language)
      .then((data) => setDue(data.due))
      .catch(() => setDue(0));
    return () => ac.abort();
  }, [language, load]);

  function onLanguage(next: LangCode) {
    setLanguage(next);
    saveLanguage(next);
  }

  async function onSaveNews() {
    const notice = library?.news_notice;
    if (!notice || savingNews) return;
    setSavingNews(true);
    try {
      const result = await saveNews({
        passage_id: notice.passage_id,
        language,
        saved: !notice.saved,
      });
      setLibrary((prev) =>
        prev?.news_notice
          ? { ...prev, news_notice: { ...prev.news_notice, saved: result.saved } }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save today's passage.");
    } finally {
      setSavingNews(false);
    }
  }

  async function onRemoveWord(lemma: string) {
    try {
      await unstarWord(lemma, language);
      setLibrary((prev) =>
        prev ? { ...prev, words: (prev.words ?? []).filter((w) => w.lemma !== lemma) } : prev,
      );
    } catch {
      /* keep the list */
    }
  }

  const nextItem = library?.items.find((item) => item.id === library.next_id) ?? null;
  const rest = (library?.items ?? []).filter((item) => item.id !== library?.next_id);
  const langs = enabledLanguages(me);
  const langName = LANG_NAME[language];

  function openRestock() {
    setRestockOpen(true);
    document.getElementById("restock")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const restockForm =
    me?.require_auth && !me.authenticated ? (
      <p className="text-sm text-ink/55">
        Sign in to generate a custom-topic passage. The catalog below is free to read.
      </p>
    ) : (
      <GenerateForm language={language} restock remaining={me?.generate_remaining} />
    );

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col items-start gap-3 border-b border-rule/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-[1.375rem] font-medium tracking-[-0.02em] text-ink"
        >
          <LogoMark className="h-[2.05em] w-auto shrink-0" />
          Lociros
        </Link>
        {langs.length > 1 ? (
          <div className="w-full sm:w-auto">
            <Segmented
              ariaLabel="Language"
              size="sm"
              options={langs.map((l) => ({ id: l.id, label: l.label, hint: l.native }))}
              value={language}
              onChange={onLanguage}
            />
          </div>
        ) : null}
      </header>

      <DemoBanner />

      <section>
        <Art
          key={language}
          src={`vista-${language}`}
          className="vista-fade -mt-6 mb-3 ml-auto h-[8.5rem] w-full object-cover object-[right_62%] sm:h-[10.5rem]"
        />
        <p className="t-eyebrow">{langName} · Library</p>
        {library ? (
          library.placed === false ? (
            <h1 className="t-heading mt-4 text-[2rem] text-ink/40 sm:text-[2.5rem]">
              Opening a short passage…
            </h1>
          ) : (
            <>
              <h1 className="t-heading mt-4 text-[2rem] text-ink sm:text-[2.5rem]">
                Your {langName} is at {library.placement}.
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                <BandStrip level={library.placement} />
                <p className="tnum text-[13px] text-ink/50">
                  {library.seen_lemmas > 0
                    ? `${library.seen_lemmas} lemmas seen.`
                    : "Rate a passage to move it."}{" "}
                  Three ratings in a row move the band.
                </p>
              </div>
            </>
          )
        ) : (
          <h1 className="t-heading mt-4 text-[2rem] text-ink/40 sm:text-[2.5rem]">
            {loading ? "Opening the shelf…" : `Your ${langName} shelf.`}
          </h1>
        )}
      </section>

      {!isDemo() ? <AuthPanel me={me} onRefresh={refreshMe} /> : null}

      {error ? (
        <p className="rounded-card border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
          {error}
        </p>
      ) : null}

      {library?.placed !== false && library?.news_notice ? (
        <TodayNews notice={library.news_notice} saving={savingNews} onSave={onSaveNews} />
      ) : null}

      {nextItem ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Continue</SectionLabel>
          <ContinueCard item={nextItem} />
        </section>
      ) : null}

      {due > 0 ? (
        <Link
          href="/review"
          className="group sheet flex items-baseline justify-between gap-4 bg-sage-wash px-5 py-4 transition-colors hover:bg-paper-raised"
        >
          <span className="tnum text-[1.0625rem] text-ink">{due} saved words due for review</span>
          <span className="t-quiet group-hover:text-ink">Review →</span>
        </Link>
      ) : null}

      {library?.words && library.words.length > 0 ? (
        <WordsList words={library.words} language={language} onRemove={onRemoveWord} />
      ) : null}

      {rest.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>The shelf</SectionLabel>
          <ul className="sheet flex flex-col divide-y divide-rule/70 overflow-hidden">
            {rest.map((item) => (
              <ShelfRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      <section id="restock" className="scroll-mt-8 flex flex-col gap-3">
        <SectionLabel>{isDemo() ? "This demo" : "Restock"}</SectionLabel>
        {isDemo() ? (
          <div className="flex flex-col gap-3">
            <p className="max-w-[26rem] text-[15px] leading-relaxed text-ink/60">
              This shelf is a fixed starter set. Rate a passage to move your placement in this
              browser. Custom generation needs the full app.
            </p>
            <Link href="/review" className="t-quiet self-start">
              Review saved words
            </Link>
          </div>
        ) : restockOpen ? (
          <>
            <p className="max-w-[26rem] text-[15px] leading-relaxed text-ink/60">
              A new {langName} passage, written to a band and checked before it lands on the
              shelf.
            </p>
            <div className="mt-4">{restockForm}</div>
            <button
              type="button"
              onClick={() => setRestockOpen(false)}
              className="t-quiet mt-2 self-start"
            >
              Hide restock
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <button type="button" onClick={openRestock} className="t-quiet text-ink">
              Restock the shelf →
            </button>
            {due === 0 ? (
              <Link href="/review" className="t-quiet">
                Review saved words
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
