"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BandStrip } from "@/components/band";
import { GlossCard } from "@/components/gloss-card";
import { Art } from "@/components/landing/art";
import { GrammarLegend, PassageArticle } from "@/components/passage-article";
import { ReaderRail } from "@/components/reader-rail";
import { Seal } from "@/components/seal";
import { AuthPanel } from "@/components/auth-panel";
import {
  attachGuest,
  fetchLibrary,
  fetchMe,
  fetchPassageStats,
  fetchTranslation,
  recordTap,
  sendFeedback,
  starWord,
  submitComprehension,
  unstarWord,
} from "@/lib/api";
import { isDemo } from "@/lib/demo";
import {
  loadAccountPrompt,
  loadFadeKnown,
  loadFurigana,
  loadGrammarColors,
  markRatingHintSeen,
  saveAccountPrompt,
  saveFadeKnown,
  saveFurigana,
  saveGrammarColors,
  useRatingHintSeen,
} from "@/lib/device";
import { sentenceEnglish, tokenSentenceIndex } from "@/lib/sentences";
import { isSupabaseAuth } from "@/lib/supabase/env";
import type { FeedbackRating, MeResponse, Passage, PassageStats } from "@/lib/types";
import { readingFont } from "@/lib/types";

const LANG_NAME = { ja: "Japanese", ru: "Russian", it: "Italian", ar: "Arabic" } as const;

/** The account offer returns once, after this many finished passages. */
const SECOND_OFFER_AT = 3;

function AccountOffer({
  me,
  onRefresh,
  onSignedIn,
}: {
  me: MeResponse | null;
  onRefresh: () => void;
  onSignedIn: () => Promise<string>;
}) {
  const [form, setForm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (done) return <p className="mt-4 text-[13px] text-ink/70">{done}</p>;
  if (dismissed || me?.authenticated) return null;
  if (!form) {
    return (
      <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-ink/55">
        <span>This stays on this browser.</span>
        <button
          type="button"
          onClick={() => setForm(true)}
          className="text-ink underline decoration-ink/30 underline-offset-4"
        >
          Create an account to keep it
        </button>
      </p>
    );
  }
  return (
    <div className="mt-6 border-t border-rule pt-6">
      <AuthPanel
        me={me}
        layout="inline"
        onRefresh={onRefresh}
        onCancel={() => setDismissed(true)}
        onSignedIn={async () => {
          setDone(await onSignedIn());
        }}
      />
    </div>
  );
}

function Toggle({
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
      className={`relative whitespace-nowrap py-4 font-display text-[15px] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:transition-colors hover:text-ink ${
        on ? "text-ink after:bg-ink" : "text-ink/55 after:bg-transparent"
      }`}
    >
      {children}
    </button>
  );
}

const MAX_DOTS = 10;

function Pager({
  index,
  total,
  prevId,
  nextId,
}: {
  index: number | null;
  total: number;
  prevId: string | null;
  nextId: string | null;
}) {
  const dots = Math.min(total, MAX_DOTS);
  const activeDot = index != null && total > 0 ? Math.floor((index * dots) / total) : -1;
  const edge =
    "inline-flex h-11 items-center gap-2.5 rounded-card px-5 text-[14px] transition-colors";
  return (
    <nav aria-label="Shelf" className="mt-12 flex items-center justify-between gap-4">
      {prevId ? (
        <Link
          href={`/passage/${prevId}`}
          className={`${edge} border border-ink/70 text-ink hover:bg-ink/[0.04]`}
        >
          <span aria-hidden="true">←</span> Previous
        </Link>
      ) : (
        <span className={`${edge} border border-rule text-ink/30`} aria-disabled="true">
          <span aria-hidden="true">←</span> Previous
        </span>
      )}
      {index != null && total > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <span className="tnum text-[12px] tracking-[0.08em] text-ink/55">
            {index + 1} / {total}
          </span>
          <span aria-hidden="true" className="flex gap-2">
            {Array.from({ length: dots }, (_, i) => (
              <span
                key={i}
                className={`h-[5px] w-[5px] rounded-full ${i === activeDot ? "bg-ink" : "bg-ink/20"}`}
              />
            ))}
          </span>
        </div>
      ) : null}
      {nextId ? (
        <Link href={`/passage/${nextId}`} className={`${edge} bg-ink text-paper hover:bg-ink/90`}>
          Next <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span className={`${edge} bg-ink/15 text-paper`} aria-disabled="true">
          Next <span aria-hidden="true">→</span>
        </span>
      )}
    </nav>
  );
}

function GrammarPassport({ passage, open }: { passage: Passage; open: boolean }) {
  if (!open) return null;
  const cal = passage.calibration;
  const allowed = cal.allowed_constructions ?? [];
  const banned = cal.banned_constructions ?? [];
  const used = cal.forbidden_used ?? [];
  const rows: { k: string; v: string }[] = [
    {
      k: "Over-level lemmas",
      v: `${Math.round(cal.overlevel_lemma_rate * 100)}%${
        cal.sample_lemmas && cal.sample_lemmas.length > 0
          ? ` · sample: ${cal.sample_lemmas.join(" · ")}`
          : ""
      }`,
    },
  ];
  if (allowed.length > 0) rows.push({ k: `Allowed at ${passage.level}`, v: allowed.join(", ") });
  if (banned.length > 0) rows.push({ k: `Banned at ${passage.level}`, v: banned.join(", ") });
  rows.push({
    k: "Flags caught",
    v: used.length > 0 ? used.join(", ") : "none",
  });
  return (
    <div className="not-first:mt-4 not-first:border-t not-first:border-rule not-first:pt-4">
     <div className="relative">
      <div className="pointer-events-none absolute right-0 top-0">
        <Seal
          verdict={cal.passed ? "pass" : "fail"}
          language={passage.language}
          level={passage.level}
          size="mark"
        />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 pr-12 text-sm">
        {rows.map((row) => (
          <div key={row.k} className="contents">
            <dt className="t-eyebrow pt-[3px]">{row.k}</dt>
            <dd className="tnum leading-relaxed text-ink/70">{row.v}</dd>
          </div>
        ))}
      </dl>
     </div>
    </div>
  );
}

function AudioBar({
  passage,
  activeSentence,
  onSentence,
}: {
  passage: Passage;
  activeSentence: number | null;
  onSentence: (index: number | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cues = passage.audio_cues ?? [];
  if (!passage.audio_url) return null;

  function onTime() {
    const audio = audioRef.current;
    if (!audio || cues.length === 0) return;
    const ms = audio.currentTime * 1000;
    const hit = cues.find((c) => ms >= c.start_ms && ms < c.end_ms);
    onSentence(hit ? hit.index : null);
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <audio
        ref={audioRef}
        src={passage.audio_url}
        controls
        preload="none"
        className="w-full"
        onTimeUpdate={onTime}
        onPause={() => onSentence(null)}
        onEnded={() => onSentence(null)}
      />
      {activeSentence != null ? (
        <p className="tnum text-[13px] text-ink/45">Line {activeSentence + 1}</p>
      ) : null}
    </div>
  );
}

const FEEDBACK: { id: FeedbackRating; label: string }[] = [
  { id: "too_easy", label: "Too easy" },
  { id: "just_right", label: "Just right" },
  { id: "too_hard", label: "Too hard" },
];

export function Reader({ passage }: { passage: Passage }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRating | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<PassageStats | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<string | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  const [english, setEnglish] = useState<string | null>(passage.translation ?? null);
  const [englishLoading, setEnglishLoading] = useState(false);
  const [englishError, setEnglishError] = useState<string | null>(null);
  const [grammarColors, setGrammarColors] = useState(false);
  const [furigana, setFurigana] = useState(false);
  const [fadeKnown, setFadeKnown] = useState(true);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [savingWord, setSavingWord] = useState(false);
  const [audioSentence, setAudioSentence] = useState<number | null>(null);
  const [passportOpen, setPassportOpen] = useState(false);
  const [shelfIds, setShelfIds] = useState<string[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<MeResponse | null>(null);
  const ratingHintDone = useRatingHintSeen();
  const [offerAccount, setOfferAccount] = useState(false);
  const questions = passage.comprehension ?? [];
  const [picks, setPicks] = useState<number[]>(() => questions.map(() => -1));
  const [compDone, setCompDone] = useState(questions.length === 0);
  const [compScore, setCompScore] = useState<{ correct: number; total: number } | null>(null);
  const [compError, setCompError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const tapped = useRef(new Set<string>());
  const sentenceIds = useMemo(
    () => tokenSentenceIndex(passage.tokens, passage.language),
    [passage.tokens, passage.language],
  );

  const ja = passage.language === "ja";
  const ar = passage.language === "ar";
  const font = readingFont(passage.language);
  const selectedToken = selected != null ? passage.tokens[selected] : null;

  useEffect(() => {
    setGrammarColors(loadGrammarColors());
    setFurigana(loadFurigana());
    setFadeKnown(loadFadeKnown());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPassageStats(passage.id)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setNextId(data.next_id);
        setPlacement(data.placement);
        setStarred(new Set(data.starred_lemmas ?? []));
      })
      .catch(() => {
        /* shelf stats are optional on a direct URL */
      });
    return () => {
      cancelled = true;
    };
  }, [passage.id]);

  useEffect(() => {
    const ac = new AbortController();
    fetchLibrary(passage.language, ac.signal)
      .then((lib) => {
        setShelfIds(lib.items.map((item) => item.id));
        setReadIds(new Set(lib.items.filter((item) => item.read).map((item) => item.id)));
      })
      .catch(() => {
        /* the pager falls back to the recommended next passage */
      });
    return () => ac.abort();
  }, [passage.language]);

  const refreshMe = useCallback(() => {
    if (isDemo()) return;
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    setShowEnglish(false);
    setShowSentence(false);
    setEnglish(passage.translation ?? null);
    setEnglishLoading(false);
    setEnglishError(null);
    setAudioSentence(null);
    setSelected(null);
    setFeedback(null);
    setPassportOpen(false);
    setOfferAccount(false);
  }, [passage.id, passage.translation]);

  async function onFeedback(rating: FeedbackRating) {
    setSending(true);
    setFeedbackError(null);
    try {
      const result = await sendFeedback(passage.id, rating);
      setFeedback(rating);
      markRatingHintSeen();
      maybeOfferAccount(new Set(readIds).add(passage.id).size);
      if (result.next_id) setNextId(result.next_id);
      if (result.placement) setPlacement(result.placement);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              new_lemmas: result.new_lemmas,
              recycled_lemmas: result.recycled_lemmas,
              next_id: result.next_id,
              placement: result.placement ?? prev.placement,
              read: true,
              known_lemmas: prev.known_lemmas,
            }
          : prev,
      );
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Could not save feedback.");
    } finally {
      setSending(false);
    }
  }

  /** Showing the offer spends it; creating an account also sets it to done. */
  function maybeOfferAccount(finished: number) {
    if (isDemo() || !isSupabaseAuth() || me?.authenticated) return;
    const prompt = loadAccountPrompt();
    if (prompt === "pending") {
      saveAccountPrompt("once");
    } else if (prompt === "once" && finished >= SECOND_OFFER_AT) {
      saveAccountPrompt("done");
    } else {
      return;
    }
    setOfferAccount(true);
  }

  async function afterSignIn(): Promise<string> {
    const before = placement;
    await attachGuest();
    const name = LANG_NAME[passage.language];
    try {
      const data = await fetchPassageStats(passage.id);
      setStats(data);
      setPlacement(data.placement);
      setStarred(new Set(data.starred_lemmas ?? []));
      if (before && data.placement !== before) {
        return `This account's ${name} is at ${data.placement}.`;
      }
    } catch {
      /* the account still has this browser's rows */
    }
    return `This browser's ${name} is on the account.`;
  }

  async function onCheck() {
    if (picks.some((pick) => pick < 0)) {
      setCompError("Answer each question.");
      return;
    }
    setChecking(true);
    setCompError(null);
    try {
      const result = await submitComprehension(passage.id, picks);
      setCompScore({ correct: result.correct, total: result.total });
      setCompDone(true);
    } catch (err) {
      setCompError(err instanceof Error ? err.message : "Could not check those answers.");
    } finally {
      setChecking(false);
    }
  }

  function onToggleGrammar() {
    setGrammarColors((prev) => {
      const next = !prev;
      saveGrammarColors(next);
      return next;
    });
  }

  function onToggleFurigana() {
    setFurigana((prev) => {
      const next = !prev;
      saveFurigana(next);
      return next;
    });
  }

  function onToggleFade() {
    setFadeKnown((prev) => {
      const next = !prev;
      saveFadeKnown(next);
      return next;
    });
  }

  async function ensureEnglish(): Promise<string | null> {
    if (english) return english;
    setEnglishLoading(true);
    setEnglishError(null);
    try {
      const text = await fetchTranslation(passage.id);
      setEnglish(text);
      return text;
    } catch (err) {
      setEnglishError(err instanceof Error ? err.message : "Could not load the translation.");
      return null;
    } finally {
      setEnglishLoading(false);
    }
  }

  async function onToggleEnglish() {
    if (showEnglish) {
      setShowEnglish(false);
      return;
    }
    setShowSentence(false);
    setShowEnglish(true);
    await ensureEnglish();
  }

  async function onToggleSentence() {
    if (showSentence) {
      setShowSentence(false);
      return;
    }
    setShowEnglish(false);
    setShowSentence(true);
    await ensureEnglish();
  }

  async function onToggleSave() {
    const lemma = selectedToken?.lemma;
    if (!lemma) return;
    setSavingWord(true);
    try {
      if (starred.has(lemma)) {
        await unstarWord(lemma, passage.language);
        setStarred((prev) => {
          const next = new Set(prev);
          next.delete(lemma);
          return next;
        });
      } else {
        await starWord({
          lemma,
          gloss: selectedToken.gloss,
          passage_id: passage.id,
          language: passage.language,
        });
        setStarred((prev) => new Set(prev).add(lemma));
      }
    } catch {
      /* keep current saved state */
    } finally {
      setSavingWord(false);
    }
  }

  const lemmaTotal = stats ? stats.new_lemmas + stats.recycled_lemmas : 0;
  const newPct = lemmaTotal > 0 ? Math.round(((stats?.new_lemmas ?? 0) / lemmaTotal) * 100) : null;
  const glossOpen = Boolean(selectedToken?.is_word && !showSentence);
  const focusSentence =
    showSentence && selected != null ? (sentenceIds[selected] ?? null) : null;
  const sentenceCaption =
    showSentence && selected != null
      ? englishLoading
        ? "Loading English…"
        : englishError
          ? englishError
          : (sentenceEnglish(passage.tokens, passage.language, selected, english) ??
            "No English for this sentence yet.")
      : null;

  const shelfIndex = shelfIds.indexOf(passage.id);
  const prevId = shelfIndex > 0 ? shelfIds[shelfIndex - 1] : null;
  const pagerNext =
    shelfIndex >= 0 && shelfIndex < shelfIds.length - 1 ? shelfIds[shelfIndex + 1] : nextId;

  return (
    <div className="relative min-h-full overflow-x-clip lg:pl-[13.5rem]">
      <ReaderRail language={passage.language} current="/library" />
    <div
      className={`relative mx-auto flex w-full max-w-[47rem] flex-col px-5 pt-7 sm:px-8 sm:pt-9 ${
        glossOpen ? "pb-[min(40rem,80vh)]" : "pb-16"
      }`}
    >
      <Art
        key={passage.language}
        src={`wash-${passage.language}`}
        className={`wash-fade absolute top-2 w-[34rem] sm:w-[46rem] ${
          ar ? "-left-[12rem] -scale-x-100 sm:-left-[16rem]" : "-right-[12rem] sm:-right-[16rem]"
        }`}
      />
      <header className="relative flex items-center justify-between gap-4">
        <Link href="/library" className="t-quiet">
          ← Library
        </Link>
        <div className="flex items-center gap-3">
          <span className="tnum hidden text-[13px] text-ink/50 sm:inline">
            {passage.word_count} words
            {lemmaTotal > 0 ? ` · ${stats?.new_lemmas} new · ${stats?.recycled_lemmas} known` : ""}
          </span>
          <BandStrip level={passage.level} />
        </div>
      </header>

      <div className={`relative mt-12 sm:mt-14 ${ar ? "pl-[6.5rem] sm:pl-[7.5rem]" : "pr-[6.5rem] sm:pr-[7.5rem]"}`}>
        <p className={`t-eyebrow ${ar ? "text-right" : ""}`}>
          {passage.source_name
            ? `${passage.source_name}${passage.source_date ? ` · ${passage.source_date}` : ""} · `
            : ""}
          {passage.topic}
          {newPct != null ? ` · ${newPct}% new` : ""}
        </p>
        <h1
          dir={ar ? "rtl" : undefined}
          className={`mt-4 text-[2.3rem] leading-[1.15] tracking-[-0.01em] text-ink sm:text-[3.1rem] ${font}`}
        >
          {passage.title}
        </h1>
        <span aria-hidden="true" className={`mt-5 block h-px w-14 bg-ink/25 ${ar ? "ml-auto" : ""}`} />
        <div
          className={`pointer-events-none absolute top-0 ${ar ? "-left-1 sm:left-0" : "-right-1 sm:right-0"}`}
        >
          <Seal
            verdict={passage.calibration.passed ? "pass" : "fail"}
            language={passage.language}
            level={passage.level}
            size="corner"
            animate
          />
        </div>
      </div>

      <AudioBar passage={passage} activeSentence={audioSentence} onSentence={setAudioSentence} />

      <div className="sheet relative mt-9 px-5 pb-10 sm:px-9">
        <div className="-mx-5 border-b border-rule/70 px-5 sm:-mx-9 sm:px-9">
          <div className="flex items-center justify-between gap-x-5 overflow-x-auto [scrollbar-width:none] sm:gap-x-7">
            <div className="flex shrink-0 items-center gap-x-5 sm:gap-x-7">
              <Toggle on={showEnglish} onClick={onToggleEnglish}>
                English
              </Toggle>
              <Toggle on={showSentence} onClick={onToggleSentence}>
                Sentence
              </Toggle>
              <Toggle on={grammarColors} onClick={onToggleGrammar}>
                Grammar
              </Toggle>
              {ja ? (
                <Toggle on={furigana} onClick={onToggleFurigana}>
                  Furigana
                </Toggle>
              ) : null}
              {ar ? (
                <Toggle on={furigana} onClick={onToggleFurigana}>
                  Vowels
                </Toggle>
              ) : null}
              <Toggle on={fadeKnown} onClick={onToggleFade}>
                Known
              </Toggle>
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <span aria-hidden="true" className="h-5 w-px bg-rule" />
              <Toggle on={passportOpen} onClick={() => setPassportOpen((v) => !v)}>
                Why this is {passage.level}
              </Toggle>
            </div>
          </div>
        </div>
        {grammarColors || passportOpen ? (
          <div className="-mx-5 border-b border-rule/70 px-5 py-4 sm:-mx-9 sm:px-9">
            {grammarColors ? <GrammarLegend language={passage.language} /> : null}
            <GrammarPassport passage={passage} open={passportOpen} />
          </div>
        ) : null}

        <PassageArticle
          tokens={passage.tokens}
          language={passage.language}
          selected={selected}
          onSelect={(index) => {
            setSelected(index);
            if (index == null) return;
            const tok = passage.tokens[index];
            if (!tok?.is_word || !tok.lemma || tapped.current.has(tok.lemma)) return;
            tapped.current.add(tok.lemma);
            recordTap(tok.lemma, passage.language, passage.id);
          }}
          grammarColors={grammarColors}
          furigana={furigana}
          fadeKnown={fadeKnown}
          knownLemmas={stats?.known_lemmas ?? []}
          sentenceIds={sentenceIds}
          audioSentence={audioSentence}
          focusSentence={focusSentence}
          sentenceMode={showSentence}
          className="mt-8 text-[1.45rem] sm:text-[1.7rem]"
        />
      </div>

      {showEnglish || (showSentence && sentenceCaption) ? (
        <div className="mt-12 border-t border-rule pt-8">
          <p className="t-eyebrow mb-4">English</p>
          {englishLoading ? (
            <p className="text-sm text-ink/45">Loading English…</p>
          ) : englishError ? (
            <p className="text-sm text-terracotta">{englishError}</p>
          ) : showEnglish && english ? (
            <p className="whitespace-pre-wrap font-reading text-[1.15rem] leading-[1.7] text-ink/80">
              {english}
            </p>
          ) : (
            <p className="whitespace-pre-wrap font-reading text-[1.15rem] leading-[1.7] text-ink/80">
              {sentenceCaption}
            </p>
          )}
        </div>
      ) : null}

      {questions.length > 0 ? (
        <section className="mt-12 border-t border-rule pt-8">
          <p className="t-eyebrow">Did you follow it?</p>
          <ol className="mt-5 flex flex-col gap-6">
            {questions.map((question, qIndex) => (
              <li key={question.id}>
                <p className="text-[15px] leading-relaxed text-ink">{question.prompt}</p>
                <div className="mt-3 flex flex-col gap-2">
                  {question.choices.map((choice, cIndex) => {
                    const selectedChoice = picks[qIndex] === cIndex;
                    const revealed = compDone && compScore != null;
                    const right = revealed && cIndex === question.answer_index;
                    const wrong = revealed && selectedChoice && cIndex !== question.answer_index;
                    return (
                      <button
                        key={choice}
                        type="button"
                        disabled={compDone || checking}
                        onClick={() =>
                          setPicks((prev) => prev.map((value, index) => (index === qIndex ? cIndex : value)))
                        }
                        className={`rounded-card border px-3 py-2 text-left text-sm leading-relaxed ${
                          right
                            ? "border-ink bg-ink text-paper"
                            : wrong
                              ? "border-terracotta text-terracotta"
                              : selectedChoice
                                ? "border-ink bg-paper-raised text-ink"
                                : "border-rule bg-paper text-ink hover:border-ink/30"
                        }`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          {compScore ? (
            <p className="mt-4 text-sm text-ink/60">
              {compScore.correct} of {compScore.total}. Then say how the passage felt.
            </p>
          ) : null}
          {compError ? <p className="mt-3 text-sm text-terracotta">{compError}</p> : null}
          {!compDone ? (
            <button
              type="button"
              disabled={checking || picks.some((pick) => pick < 0)}
              onClick={() => void onCheck()}
              className="btn-primary mt-6 disabled:opacity-40"
            >
              {checking ? "Checking…" : "Check answers"}
            </button>
          ) : null}
        </section>
      ) : null}

      {compDone ? (
        <section className="mt-12 border-t border-rule pt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] text-ink/60">Was this {passage.level} passage…</p>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={sending || Boolean(feedback)}
                  onClick={() => onFeedback(item.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors disabled:cursor-default ${
                    feedback === item.id
                      ? "border-ink bg-ink text-paper"
                      : "border-rule bg-paper-raised text-ink hover:border-ink/30"
                  } ${feedback && feedback !== item.id ? "opacity-50" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {!ratingHintDone && !feedback ? (
            <p className="mt-3 text-[13px] leading-relaxed text-ink/70">
              Too easy and too hard move the band after three in a row. Just right keeps it.
            </p>
          ) : null}
          {feedbackError ? <p className="mt-3 text-xs text-terracotta">{feedbackError}</p> : null}
          {feedback && !feedbackError ? (
            <p className="mt-3 flex items-baseline justify-between gap-3 text-[13px] text-ink/55">
              <span>
                {placement
                  ? `Saved. Your ${LANG_NAME[passage.language]} is at ${placement}.`
                  : "Saved."}
              </span>
              {nextId && nextId !== pagerNext ? (
                <Link
                  href={`/passage/${nextId}`}
                  className="text-ink underline decoration-ink/30 underline-offset-4"
                >
                  Read the suggested next →
                </Link>
              ) : null}
            </p>
          ) : null}
          {feedback && !feedbackError && offerAccount ? (
            <AccountOffer me={me} onRefresh={refreshMe} onSignedIn={afterSignIn} />
          ) : null}
        </section>
      ) : null}

      {passage.calibration.warnings.length > 0 ? (
        <p className="mt-10 border-l-2 border-terracotta/40 pl-3 text-xs leading-relaxed text-ink/50">
          {passage.calibration.warnings.join(" ")}
        </p>
      ) : null}

      <Pager
        index={shelfIndex >= 0 ? shelfIndex : null}
        total={shelfIds.length}
        prevId={prevId}
        nextId={pagerNext}
      />
    </div>

      {glossOpen && selectedToken?.is_word ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper-raised px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[min(38rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:rounded-[12px] sm:border sm:border-ink/8 sm:px-8 sm:pb-7 sm:pt-6 sm:shadow-float lg:left-[calc(50%+6.75rem)]"
          role="dialog"
          aria-label="Word gloss"
        >
          <div className="mx-auto flex max-w-[42rem] items-start justify-between gap-4 sm:max-w-none">
            <GlossCard
              token={selectedToken}
              language={passage.language}
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
