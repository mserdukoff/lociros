"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { BandStrip } from "@/components/band";
import { ContinueCard, datedSource, metaLine, sourceLine } from "@/components/continue-card";
import { GenerateForm } from "@/components/generate-form";
import { LanguageSwitch, useAppLanguage, useMe } from "@/components/language-switch";
import { Seal } from "@/components/seal";
import { DemoBanner } from "@/components/demo-banner";
import { AuthPanel } from "@/components/auth-panel";
import { Art } from "@/components/landing/art";
import { fetchLibrary, fetchReview, pricingHref, saveNews } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { hasStoredLanguage, loadLanguage } from "@/lib/device";
import {
  isRtl,
  readingFont,
  type LangCode,
  type LibraryItem,
  type LibraryResponse,
  type MeResponse,
  type NewsNotice,
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

/** A quiet line about the free week or a failed payment. Nothing when subscribed. */
function PlanNotice({ me }: { me: MeResponse | null }) {
  const ent = me?.entitlement;
  if (!ent?.paywall) return null;
  let text: string | null = null;
  if (ent.status === "trial" && ent.trial_days_left !== null) {
    text =
      ent.trial_days_left <= 1
        ? "Your free week ends today."
        : `${ent.trial_days_left} days left in your free week.`;
  } else if (ent.status === "grace") {
    text = "Your last payment didn't go through. Update your card to keep the shelf open.";
  } else if (ent.status === "expired") {
    text = "Your free week is over.";
  }
  if (!text) return null;
  const href = ent.status === "grace" ? "/settings" : pricingHref("/library");
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-card bg-sage-wash px-4 py-3 text-sm text-ink/70">
      <p>{text}</p>
      <Link href={href} className="t-quiet text-ink underline decoration-ink/25 underline-offset-4">
        {ent.status === "grace" ? "Update card" : "See plans"}
      </Link>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="t-eyebrow">{children}</p>;
}

/** Saved words and what is due, as two rows that open their own sections. */
function WordsSummary({ count, due }: { count: number; due: number }) {
  const row =
    "group flex items-baseline justify-between gap-4 px-5 py-4 transition-colors hover:bg-paper";
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Words</SectionLabel>
      {count === 0 && due === 0 ? (
        <p className="text-[15px] leading-relaxed text-ink/55">
          No saved words yet. Tap a word while you read, then choose Save. It shows up in Words
          and in Review.
        </p>
      ) : (
        <ul className="sheet flex flex-col divide-y divide-rule/70 overflow-hidden">
          <li>
            <Link href="/words" className={row}>
              <span className="tnum text-[1.0625rem] text-ink">
                {count === 1 ? "1 saved word" : `${count} saved words`}
              </span>
              <span className="t-quiet group-hover:text-ink">Words →</span>
            </Link>
          </li>
          {due > 0 ? (
            <li>
              <Link href="/review" className={`${row} bg-sage-wash`}>
                <span className="tnum text-[1.0625rem] text-ink">{due} due for review</span>
                <span className="t-quiet group-hover:text-ink">Review →</span>
              </Link>
            </li>
          ) : null}
        </ul>
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
  const { me, loaded, refresh: refreshMe } = useMe();
  const { language, languages, choose } = useAppLanguage(me);
  const [data, setData] = useState<{ library: LibraryResponse; due: number } | null>(null);
  const [failed, setFailed] = useState<{ language: LangCode; message: string } | null>(null);
  const [restockOpen, setRestockOpen] = useState(false);
  const [savingNews, setSavingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const library = data?.library.language === language ? data.library : null;
  const due = library ? (data?.due ?? 0) : 0;
  const error = failed?.language === language ? failed.message : newsError;
  const loading = !library && !error;

  useEffect(() => {
    if (!loaded) return;
    const ac = new AbortController();
    Promise.all([
      fetchLibrary(language, ac.signal),
      fetchReview(language).catch(() => ({ due: 0 })),
    ])
      .then(([next, review]) => setData({ library: next, due: review.due }))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setFailed({ language, message: err instanceof Error ? err.message : "Could not load the shelf." });
      });
    return () => ac.abort();
  }, [language, loaded]);

  useEffect(() => {
    if (library?.placed !== false) return;
    if (!hasStoredLanguage()) {
      router.replace("/placement");
      return;
    }
    if (library.language !== loadLanguage()) return;
    router.replace(`/placement?language=${library.language}`);
  }, [library, router]);

  async function onSaveNews() {
    const notice = library?.news_notice;
    if (!notice || savingNews) return;
    setSavingNews(true);
    setNewsError(null);
    try {
      const result = await saveNews({
        passage_id: notice.passage_id,
        language,
        saved: !notice.saved,
      });
      setData((prev) =>
        prev?.library.news_notice
          ? {
              ...prev,
              library: { ...prev.library, news_notice: { ...prev.library.news_notice, saved: result.saved } },
            }
          : prev,
      );
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "Could not save today's passage.");
    } finally {
      setSavingNews(false);
    }
  }

  const nextItem = library?.items.find((item) => item.id === library.next_id) ?? null;
  const rest = (library?.items ?? []).filter((item) => item.id !== library?.next_id);
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
    <AppShell
      current="/library"
      language={language}
      actions={<LanguageSwitch value={language} languages={languages} onChange={choose} />}
    >
    <div className="flex flex-col gap-12">
      <DemoBanner />

      <section>
        <Art
          key={language}
          src={`vista-${language}`}
          className="vista-fade -mt-6 mb-3 ml-auto h-[8.5rem] w-full object-cover object-[right_62%] sm:h-[10.5rem]"
        />
        {library && library.placed !== false ? (
          <>
            <PageHeading eyebrow={`${langName} · Library`}>
              Your {langName} is at {library.placement}.
            </PageHeading>
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
        ) : (
          <PageHeading eyebrow={`${langName} · Library`} muted>
            {library
              ? "Opening a short passage…"
              : loading
                ? "Opening the shelf…"
                : `Your ${langName} shelf.`}
          </PageHeading>
        )}
      </section>

      {!isDemo() && !me?.authenticated ? <AuthPanel me={me} onRefresh={refreshMe} /> : null}

      {!isDemo() ? <PlanNotice me={me} /> : null}

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

      {library && library.placed !== false ? (
        <WordsSummary count={library.words?.length ?? 0} due={due} />
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
          <p className="max-w-[26rem] text-[15px] leading-relaxed text-ink/60">
            This shelf is a fixed starter set. Rate a passage to move your placement in this
            browser. Custom generation needs the full app.
          </p>
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
          <button type="button" onClick={openRestock} className="t-quiet self-start text-ink">
            Restock the shelf →
          </button>
        )}
      </section>
    </div>
    </AppShell>
  );
}
