"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Art } from "@/components/landing/art";
import { LanguageSwitch, useAppLanguage, useMe } from "@/components/language-switch";
import { StrokeOrderButton } from "@/components/stroke-order";
import { fetchReview, submitReview } from "@/lib/api";
import { kanjiChars, LANGUAGES, readingFont, type LangCode, type ReviewCard } from "@/lib/types";

const RATINGS = ["again", "hard", "good", "easy"] as const;
type Rating = (typeof RATINGS)[number];

function ReviewRow({
  card,
  font,
  rated,
  error,
  language,
  onRate,
}: {
  card: ReviewCard;
  font: string;
  rated: Rating | null;
  error: string | null;
  language: LangCode;
  onRate: (rating: Rating) => void;
}) {
  const [show, setShow] = useState(false);
  const done = rated !== null;
  const kanji = language === "ja" ? kanjiChars(card.lemma) : [];
  return (
    <li className={`flex flex-col gap-3 py-6 transition-opacity ${done ? "opacity-45" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p dir={language === "ar" ? "rtl" : undefined} className={`${font} text-2xl leading-tight text-ink`}>{card.lemma}</p>
        {card.reading ? <p className="font-ja text-[15px] text-ink/50">{card.reading}</p> : null}
        {done ? (
          <span className="ml-auto text-[13px] capitalize text-ink/40">Rated {rated}</span>
        ) : null}
      </div>
      {done ? null : show ? (
        <>
          {kanji.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {kanji.map((ch, i) => (
                <StrokeOrderButton key={`${ch}-${i}`} char={ch} />
              ))}
            </div>
          ) : null}
          <p className="text-base leading-relaxed text-ink/85">{card.gloss ?? "No gloss"}</p>
          {card.context ? (
            <p className={`${font} text-sm leading-relaxed text-ink/55`}>{card.context}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRate(r)}
                className="rounded-full border border-rule bg-paper-raised px-3.5 py-1.5 text-sm capitalize transition-colors hover:border-ink/30"
              >
                {r}
              </button>
            ))}
          </div>
          {error ? <p className="text-xs text-terracotta">{error}</p> : null}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShow(true)}
          className="t-quiet self-start underline decoration-ink/20 underline-offset-4"
        >
          Show
        </button>
      )}
    </li>
  );
}

export default function ReviewPage() {
  const { me, loaded } = useMe();
  const { language, languages, choose } = useAppLanguage(me);
  const [data, setData] = useState<{ language: LangCode; cards: ReviewCard[] } | null>(null);
  const [failed, setFailed] = useState<{ language: LangCode; message: string } | null>(null);
  const [rated, setRated] = useState<Record<number, Rating>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const font = readingFont(language);
  const name = LANGUAGES.find((l) => l.id === language)?.label ?? "Japanese";
  const cards = data?.language === language ? data.cards : [];
  const error = failed?.language === language ? failed.message : null;
  const loading = data?.language !== language && !error;

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void fetchReview(language)
      .then((next) => {
        if (cancelled) return;
        setData({ language, cards: next.cards });
        setRated({});
        setRowErrors({});
      })
      .catch((err) => {
        if (!cancelled) setFailed({ language, message: err instanceof Error ? err.message : "Could not load review." });
      });
    return () => {
      cancelled = true;
    };
  }, [language, loaded]);

  const total = cards.length;
  const remaining = total - Object.keys(rated).length;
  const allDone = total > 0 && remaining === 0;

  async function rate(cardId: number, rating: Rating) {
    // Optimistic: the rating pill takes effect immediately, and rolls back
    // with an inline error on this one row if the save actually fails.
    setRated((prev) => ({ ...prev, [cardId]: rating }));
    setRowErrors((prev) => {
      if (!(cardId in prev)) return prev;
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    try {
      await submitReview(cardId, rating);
    } catch (err) {
      setRated((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setRowErrors((prev) => ({
        ...prev,
        [cardId]: err instanceof Error ? err.message : "Could not save that rating.",
      }));
    }
  }

  const heading = loading
    ? "Opening review…"
    : total === 0
      ? "Nothing due"
      : allDone
        ? "All caught up"
        : `${remaining} of ${total} due`;

  return (
    <AppShell
      current="/review"
      language={language}
      actions={<LanguageSwitch value={language} languages={languages} onChange={choose} />}
    >
      <section className="flex items-end justify-between gap-6">
        <div>
          <PageHeading eyebrow={`${name} · Review`} muted={loading}>
            {heading}
          </PageHeading>
        </div>
        <Art src="card-catalog" className="-mb-4 -mt-10 hidden w-[11rem] shrink-0 sm:block" />
      </section>

      {error ? <p className="mt-8 text-sm text-terracotta">{error}</p> : null}

      {!loading && total === 0 && !error ? (
        <p className="mt-6 max-w-[26rem] text-[1.0625rem] leading-relaxed text-ink/60">
          Read a passage and save a word from its gloss. It comes up here when it is due.{" "}
          <Link href="/words" className="underline decoration-ink/25 underline-offset-4 hover:text-ink">
            See your saved words
          </Link>
          .
        </p>
      ) : null}

      {allDone ? (
        <p className="mt-6 max-w-[26rem] text-[15px] leading-relaxed text-ink/50">
          That is everything due for now. Come back later, or{" "}
          <Link href="/library" className="underline decoration-ink/25 underline-offset-4 hover:text-ink">
            read another passage
          </Link>
          .
        </p>
      ) : null}

      {total > 0 ? (
        <ul className="mt-12 flex flex-col divide-y divide-rule border-y border-rule">
          {cards.map((card) => (
            <ReviewRow
              key={card.id}
              card={card}
              font={font}
              rated={rated[card.id] ?? null}
              error={rowErrors[card.id] ?? null}
              language={language}
              onRate={(r) => void rate(card.id, r)}
            />
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
