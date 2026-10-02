"use client";

import { MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { signOutAccount } from "@/components/auth-panel";
import { ContinueCard } from "@/components/continue-card";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { SignInDialog, type AuthMode } from "@/components/sign-in-dialog";
import { ADMIN_URL } from "@/lib/admin-url";
import { DemoBanner } from "@/components/demo-banner";
import { LogoMark } from "@/components/logo";
import { Segmented } from "@/components/segmented";
import { fetchLibrary, fetchMe, fetchShelfCounts, track } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import {
  getDeviceId,
  hasStoredLanguage,
  loadLanguage,
  saveLanguage,
  useStoredLanguage,
} from "@/lib/device";
import {
  enabledLanguages,
  LANGUAGES,
  readingFont,
  type CefrLevel,
  type LangCode,
  type LibraryItem,
  type MeResponse,
} from "@/lib/types";
import { Art, HandArrow, HandNote, LineIcon } from "./art";
import { DEMO } from "./demo-data";
import { Drift } from "./drift";
import { DrawnArrow, Float, InkArt, Parallax, Reveal, Stagger, StaggerItem } from "./motion-bits";
import { PromptHero } from "./prompt-hero";
import { ReaderDemo } from "./reader-demo";
import { SCENES } from "./scenes";
import { STICKY_TEST, StickyStart, stickyArm } from "./sticky-start";
import { Story, type StoryStep } from "./story";

const ShaderWash = dynamic(() => import("./shader-wash"), { ssr: false });

export type LandingVariant = "classic" | "motion" | "prompt" | "story" | "shader";

type StartFrom = "nav" | "hero" | "rate" | "close" | "sticky";

function Plain({ children }: { children: React.ReactNode; className?: string }) {
  return <>{children}</>;
}

const KEPT_OUT: Record<LangCode, string> = {
  ja: "At A2, て-form and plain past are allowed. The check keeps out ている, conditionals, potential, causative, passive, relative clauses, and keigo.",
  ru: "At A2, nominative, accusative, genitive, prepositional, and dative are allowed, in present, past, and future. Instrumental, participles, verbal adverbs, который, and бы are kept out.",
  it: "At A2, the present, passato prossimo, and the simple future are allowed. Imperfetto, the conditional, the subjunctive, the gerund, the remote past, relative che, and benché are kept out.",
  ar: "At A2, present, past, and future are allowed, with Form I verbs and common Form II and Form IV verbs. The dual, إنّ, the relative الذي, كان + verb, the passive, and Forms III and V to X are kept out.",
};

const ANALYZER: Record<LangCode, string> = {
  ja: "Sudachi",
  ru: "pymorphy3",
  it: "spaCy",
  ar: "CAMeL Tools",
};

type Row = { k: string; v: string; icon: string };

const SAVE: Row = {
  k: "Save",
  v: "A saved word stays in a list on the shelf, with the passage it came from.",
  icon: "bookmark",
};
const ENGLISH: Row = {
  k: "English",
  v: "The gloss for that word, this sentence only, or the whole passage.",
  icon: "letter",
};

// Only the story variant still has a tap step; the default page shows the tap in the hero.
const TAP: Record<LangCode, Row[]> = {
  ja: [
    { k: "Reading", v: "Hiragana beside the word you tapped.", icon: "book" },
    { k: "Endings", v: "A verb splits into stem, polite, and past, each one named.", icon: "list" },
    {
      k: "Kanji",
      v: "Stroke order plays as the gloss opens. On and kun readings, the radical, and the school grade sit beside it.",
      icon: "brush",
    },
    ENGLISH,
    SAVE,
  ],
  ar: [
    { k: "Root", v: "The root and the verb form, from I through X.", icon: "root" },
    { k: "Vowels", v: "Restored over the letters when you ask for them. Off until then.", icon: "vowels" },
    { k: "Grammar", v: "Tense, mood, voice, person, gender, and number.", icon: "list" },
    ENGLISH,
    SAVE,
  ],
  it: [
    { k: "The verb", v: "Tense, mood, gender, number, and the form.", icon: "list" },
    { k: "Grammar color", v: "Off until you turn it on. It stays on for the next passage.", icon: "swatch" },
    ENGLISH,
    SAVE,
  ],
  ru: [
    { k: "The word", v: "Case, gender, number, tense, aspect, and mood.", icon: "list" },
    { k: "Grammar color", v: "Off until you turn it on. It stays on for the next passage.", icon: "swatch" },
    ENGLISH,
    SAVE,
  ],
};

type Rating = "easy" | "right" | "hard";

const RATINGS: { id: Rating; label: string; result: string }[] = [
  {
    id: "easy",
    label: "Too easy",
    result: "Three of these in a row and the next passage comes from one level up.",
  },
  {
    id: "right",
    label: "Just right",
    result: "Your level holds. The next passage uses the words you just met.",
  },
  {
    id: "hard",
    label: "Too hard",
    result: "Three of these in a row and the shelf steps down one level.",
  },
];

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[76rem] px-5 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </div>
  );
}

function Eyebrow({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <p className={`t-eyebrow ${accent ? "text-terracotta!" : ""}`}>{children}</p>;
}

/** One brush stroke under the claim, drawn once in the accent. */
function InkUnderline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 14"
      preserveAspectRatio="none"
      className="art absolute -bottom-2 left-0 h-[0.32em] w-full text-terracotta/85"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path
        className="ink-draw"
        pathLength={1}
        d="M3 9 C 60 4, 130 3, 190 6 S 270 11, 297 5"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const LINE = "border-ink/15";

/** A printer's registration mark, centered on the corner it sits at. */
function Cross({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 15 15"
      className={`art absolute z-10 h-[15px] w-[15px] text-ink/45 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M7.5 0v15M0 7.5h15" />
      <circle cx="7.5" cy="7.5" r="3.5" />
    </svg>
  );
}

/**
 * One section of the printed page. The side rules of every section line up,
 * so together they read as a single frame from the masthead to the footer.
 */
function Folio({
  id,
  masthead = false,
  last = false,
  children,
}: {
  id?: string;
  masthead?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Wrap>
      <section
        id={id}
        className={`relative grid scroll-mt-4 border-x ${LINE} lg:grid-cols-[3.5rem_minmax(0,1fr)] ${
          masthead ? "border-t-2 border-t-ink/80" : "border-t"
        } ${last ? "border-b" : ""}`}
      >
        <Cross className="-left-2 -top-2" />
        <Cross className="-right-2 -top-2" />
        {last ? (
          <>
            <Cross className="-bottom-2 -left-2" />
            <Cross className="-bottom-2 -right-2" />
          </>
        ) : null}
        {masthead ? <div aria-hidden="true" className="col-span-full h-[3px] border-b border-ink/30" /> : null}
        {children}
      </section>
    </Wrap>
  );
}

/** The ruled heading band: number, name, and a note on the right. */
function Strip({ no, title, meta }: { no: string; title: string; meta?: React.ReactNode }) {
  return (
    <div
      className={`col-span-full flex h-11 items-stretch border-b ${LINE} text-[11px] uppercase tracking-[0.18em] text-ink/55`}
    >
      <span
        className={`tnum flex w-14 shrink-0 items-center justify-center border-r ${LINE} font-display text-[14px] tracking-normal text-terracotta`}
      >
        {no}
      </span>
      <span className="flex items-center px-4 sm:px-5">{title}</span>
      {meta ? (
        <span className={`ml-auto hidden items-center border-l ${LINE} px-5 normal-case tracking-[0.04em] sm:flex`}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/** The margin column under a strip's number, with a line set sideways. */
function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={`hidden border-r ${LINE} lg:flex lg:flex-col lg:items-center lg:justify-end lg:py-8`}>
      <span className="rotate-180 text-[10.5px] uppercase tracking-[0.24em] whitespace-nowrap text-ink/40 [writing-mode:vertical-rl]">
        {children}
      </span>
    </div>
  );
}

function RatingMark({ id, on }: { id: Rating; on: boolean }) {
  const ring =
    id === "easy"
      ? on
        ? "border-terracotta bg-terracotta text-paper"
        : "border-terracotta/60 bg-paper-raised text-terracotta"
      : id === "hard"
        ? on
          ? "border-sage bg-sage text-paper"
          : "border-sage/60 bg-paper-raised text-sage"
        : on
          ? "border-ink bg-ink text-paper"
          : "border-ink/35 bg-paper-raised text-ink/55";
  return (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] shadow-card transition-colors ${ring}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {id === "easy" ? <path d="M6 6l8 8M14 6l-8 8" /> : null}
        {id === "right" ? <circle cx="10" cy="10" r="4.5" /> : null}
        {id === "hard" ? <path d="M5 10.5l3.2 3.2L15 7" /> : null}
      </svg>
    </span>
  );
}

function RateDemo({ lang }: { lang: LangCode }) {
  const [rating, setRating] = useState<Rating>("right");
  const demo = DEMO[lang];
  const result = RATINGS.find((r) => r.id === rating)?.result;
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[11rem] w-full max-w-[24rem] items-end justify-center">
        <div className="sheet absolute bottom-3 left-2 w-[9rem] -rotate-[7deg] p-2.5 sm:left-0">
          <Art src={`thumb-${lang}-2`} sizes="144px" className="aspect-[4/3] w-full rounded-[6px] object-cover" />
          <span className="mt-2 block h-1 w-12 rounded-full bg-ink/10" />
          <span className="mt-1 block h-1 w-8 rounded-full bg-ink/10" />
        </div>
        <div className="sheet absolute bottom-3 right-2 w-[9rem] rotate-[7deg] p-2.5 sm:right-0">
          <Art
            src={`vista-${lang}`}
            sizes="144px"
            className="aspect-[4/3] w-full rounded-[6px] bg-paper object-cover object-right"
          />
          <span className="mt-2 block h-1 w-12 rounded-full bg-ink/10" />
          <span className="mt-1 block h-1 w-8 rounded-full bg-ink/10" />
        </div>
        <div className="sheet-float relative z-10 w-[10rem] p-3">
          <p
            dir={lang === "ar" ? "rtl" : undefined}
            className={`truncate text-[15px] leading-tight text-ink ${readingFont(lang)}`}
          >
            {demo.title}
          </p>
          <Art src={`thumb-${lang}-1`} sizes="160px" className="mt-2 aspect-[4/3] w-full rounded-[6px] object-cover" />
          <p className="mt-2 font-display text-[11px] tracking-[0.12em] text-ink/45">{demo.level}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Rate the passage" className="mt-6 flex gap-7 sm:gap-10">
        {RATINGS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={rating === r.id}
            onClick={() => setRating(r.id)}
            className="group flex flex-col items-center gap-2"
          >
            <RatingMark id={r.id} on={rating === r.id} />
            <span
              className={`text-[12.5px] transition-colors ${
                rating === r.id ? "text-ink" : "text-ink/50 group-hover:text-ink"
              }`}
            >
              {r.label}
            </span>
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-4 min-h-[2.5rem] max-w-[20rem] text-center text-[13px] leading-relaxed text-ink/55">
        {result}
      </p>
    </div>
  );
}

/** The cliff, with the four levels carved into it. */
function Cliff({ lang, language, anim }: { lang: LangCode; language: string; anim: boolean }) {
  const scene = SCENES[lang];
  return (
    <figure className="relative">
      {anim ? (
        <Parallax distance={40}>
          <InkArt
            key={lang}
            src={`cliff-${lang}`}
            sizes="(min-width: 1024px) 45vw, 95vw"
            className="cliff-fade aspect-[4/3] w-full"
            delay={0.1}
          />
        </Parallax>
      ) : (
        <Art
          key={lang}
          src={`cliff-${lang}`}
          sizes="(min-width: 1024px) 45vw, 95vw"
          className="cliff-fade aspect-[4/3] w-full"
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 hidden sm:block">
        {scene.strata.map((s, i) => {
          const label = (
            <>
              <span className="rounded-[4px] bg-paper/85 px-1.5 py-0.5 leading-tight">
                <span className="block font-display text-[13px] text-ink">{s.level}</span>
                <span className="block whitespace-nowrap text-[10.5px] tracking-[0.02em] text-ink/50">
                  {s.label}
                </span>
              </span>
              <span className="h-px w-5 bg-ink/35" />
            </>
          );
          const style = { top: s.top, right: `calc(100% - ${scene.face} + 0.75rem)` };
          const cls = "absolute flex -translate-y-1/2 items-center gap-2.5 text-right";
          return anim ? (
            <Float key={`${lang}-${s.level}`} className={cls} style={style} delay={0.5 + i * 0.15}>
              {label}
            </Float>
          ) : (
            <div key={s.level} style={style} className={cls}>
              {label}
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">
        A cliff of carved {language} words, from everyday greetings at the top to older writing at
        the base.
      </figcaption>
    </figure>
  );
}

type Returning = { item: LibraryItem; level: CefrLevel; language: LangCode };

/**
 * The three.js wash is decoration, so it waits until the page is idle and is
 * skipped on small screens, for reduced motion, and when the browser asks to
 * save data. The flat paper background stands in for it.
 */
function useIdleWash(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (!wide || still || saveData) return;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if ("requestIdleCallback" in window) {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 4000 });
      } else {
        timer = setTimeout(() => setReady(true), 1500);
      }
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled]);
  return ready;
}

export function Landing({ variant = "classic" }: { variant?: LandingVariant }) {
  const anim = variant !== "classic";
  // The staggered entrance server-renders the headline at opacity 0 until
  // hydration, which made it the late LCP element. `/` paints it at once.
  const heroEntrance = anim && variant !== "shader";
  const Col = heroEntrance ? Stagger : "div";
  const Item = heroEntrance ? StaggerItem : Plain;
  const Arrow = anim ? DrawnArrow : HandArrow;
  const Section = anim ? Reveal : Fragment;
  const stored = useStoredLanguage();
  const [picked, setLang] = useState<LangCode | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<LangCode, number>>>({});
  const [returning, setReturning] = useState<Returning | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  // Every language has a hand-authored demo, so the landing page features all
  // of them; the shelf falls back to Japanese if one is not public yet.
  const langs = LANGUAGES.map((l) => l.id);
  const lang = picked ?? stored;
  const language = LANGUAGES.find((item) => item.id === lang)?.label ?? "Japanese";
  const level = DEMO[lang].level;
  const article = /^[aeiou]/i.test(language) ? "An" : "A";
  const scene = SCENES[lang];
  const demo = isDemo();
  const signedIn = Boolean(me?.authenticated);
  const wash = useIdleWash(variant === "shader");
  const count = counts[lang] ?? 0;
  const languageList = LANGUAGES.filter((l) => langs.includes(l.id)).map((l) => l.label);
  const languagesText =
    languageList.length > 1
      ? `${languageList.slice(0, -1).join(", ")}${languageList.length > 2 ? "," : ""} and ${languageList.at(-1)}`
      : languageList[0];

  const storySteps: StoryStep[] = [
    {
      id: "read",
      eyebrow: "Read",
      title: "Graded readers where A2 is actually A2.",
      body: (
        <p>
          Short passages from beginner through upper-intermediate. Every one is checked against the
          level before it is shown. Tap any word for the meaning, the grammar, and the reading.
        </p>
      ),
      visual: (
        <div className="relative isolate mx-auto max-w-[34rem]">
          <ReaderDemo key={lang} lang={lang} onLang={chooseLang} languages={langs} />
        </div>
      ),
    },
    {
      id: "check",
      eyebrow: "The check",
      title: `${article} ${language} passage that failed the check.`,
      body: (
        <>
          <p>
            A morphological analyzer reads every word and checks it against the level. If something
            is above the level, the passage is rewritten.
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-ink/50">{KEPT_OUT[lang]}</p>
        </>
      ),
      visual: <Drift key={lang} lang={lang} />,
    },
    {
      id: "tap",
      eyebrow: "A tap",
      title: "A tap stays in the sentence.",
      body: (
        <p>
          Tap a word in the passage. The gloss tells you what it is, then you keep reading.
          Everything you need, right there.
        </p>
      ),
      visual: (
        <div className="grid grid-cols-[1fr_16rem] items-center gap-8">
          <dl className="border-t border-rule">
            {TAP[lang].map((item) => (
              <div
                key={item.k}
                className="grid grid-cols-[1.75rem_7rem_1fr] items-baseline gap-x-3 border-b border-rule py-3"
              >
                <LineIcon name={item.icon} className="translate-y-[3px] text-ink/60" />
                <dt className="text-[14px] font-medium text-ink">{item.k}</dt>
                <dd className="text-[14px] leading-relaxed text-ink/65">{item.v}</dd>
              </div>
            ))}
          </dl>
          <InkArt key={lang} src={`stone-${lang}`} sizes="256px" className="w-full" />
        </div>
      ),
    },
    {
      id: "rate",
      eyebrow: "Rate and move forward",
      title: "Rate, and move forward.",
      body: (
        <p>
          Levels run from A1 through B2. One short read sets where you start. The shelf remembers
          the lemmas you have seen, and the next passage is chosen from that.
        </p>
      ),
      visual: <RateDemo key={lang} lang={lang} />,
    },
  ];

  function chooseLang(next: LangCode) {
    setLang(next);
    saveLanguage(next);
  }

  function start(from: StartFrom) {
    saveLanguage(lang);
    track("start_click", { from, language: lang, returning: Boolean(returning) });
  }

  /** New readers get the onboarding dialog; placed readers and accounts go straight to the shelf. */
  function begin(from: StartFrom, event: React.MouseEvent) {
    start(from);
    if (!authReady || signedIn || returning) return;
    event.preventDefault();
    setOnboarding(true);
  }

  const refreshMe = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    track("landing_view", {
      variant,
      ...(STICKY_TEST ? { sticky_arm: stickyArm(getDeviceId()) } : {}),
    });
  }, [variant]);

  useEffect(() => {
    let cancelled = false;
    void fetchShelfCounts()
      .then((next) => {
        if (!cancelled) setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A reader with a band on this browser, or an account, gets their next
  // passage in the hero. `/` itself never redirects.
  useEffect(() => {
    if (!hasStoredLanguage() && !signedIn) return;
    const saved = loadLanguage();
    let cancelled = false;
    void fetchLibrary(saved)
      .then((library) => {
        if (cancelled || !library.placed) return;
        const item = library.items.find((it) => it.id === library.next_id);
        if (item) setReturning({ item, level: library.placement, language: saved });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const returningName = returning
    ? LANGUAGES.find((l) => l.id === returning.language)?.label
    : null;

  return (
    <MotionConfig reducedMotion="user">
    <main className="relative overflow-x-clip">
      {variant === "shader" && wash ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0">
          <ShaderWash lang={lang} className="h-full w-full" />
        </div>
      ) : null}
      <div className="relative">
      {/* ---------- hero ---------- */}
      <Wrap>
        <header className="flex items-center justify-between py-5 sm:py-6">
          <span className="flex items-center gap-2 font-display text-[1.375rem] font-medium tracking-[-0.02em] text-ink">
            <LogoMark className="h-[2.05em] w-auto shrink-0" />
            Lociros
            {demo ? <span className="t-eyebrow">Demo</span> : null}
          </span>
          <nav className="flex items-center gap-5 sm:gap-7">
            <a href="#check" className="t-quiet hidden underline-offset-[6px] hover:underline md:inline">
              The check
            </a>
            <a href="#shelf" className="t-quiet hidden underline-offset-[6px] hover:underline md:inline">
              The shelf
            </a>
            {!demo && signedIn ? (
              <button
                type="button"
                onClick={() => void signOutAccount().then(refreshMe)}
                className="t-quiet hidden text-ink! sm:inline"
              >
                Sign out
              </button>
            ) : !demo ? (
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                aria-haspopup="dialog"
                aria-hidden={!authReady}
                tabIndex={authReady ? undefined : -1}
                className={`t-quiet text-ink! transition-opacity ${authReady ? "" : "invisible opacity-0"}`}
              >
                Sign in
              </button>
            ) : null}
            <Link
              href="/library"
              data-start
              onClick={(e) => begin("nav", e)}
              className="btn-primary h-10! px-5! text-[14px]!"
            >
              {signedIn || returning ? "Your shelf" : "Start reading"}
            </Link>
          </nav>
        </header>

        {!demo ? (
          <SignInDialog
            open={authMode !== null}
            mode={authMode ?? "signin"}
            onClose={() => setAuthMode(null)}
            me={me}
            onRefresh={refreshMe}
          />
        ) : null}
        <OnboardingDialog
          open={onboarding}
          onClose={() => setOnboarding(false)}
          initialLanguage={lang}
          languages={me ? enabledLanguages(me) : LANGUAGES}
          onSignIn={
            demo
              ? undefined
              : () => {
                  setOnboarding(false);
                  setAuthMode("signin");
                }
          }
        />

        <div className="pb-3 empty:hidden">
          <DemoBanner />
        </div>
      </Wrap>

      <Folio masthead>
        <Rail>Graded readers · A1 to B2</Rail>
        <div className="min-w-0">
        {variant === "prompt" ? (
          <div className="px-5 sm:px-10">
            <PromptHero lang={lang} onLang={chooseLang} />
          </div>
        ) : (
          <div className="relative grid items-start gap-10 px-5 pb-6 pt-10 sm:px-10 lg:grid-cols-12 lg:gap-8 lg:pt-12">
            <Col className="relative z-10 lg:col-span-5 lg:pt-6">
              <Item>
                <p className="t-eyebrow flex items-center gap-3">
                  <span aria-hidden="true" className="h-px w-8 bg-terracotta/70" />
                  Every word has depth.
                </p>
              </Item>
              <Item>
                <h1 className="t-display mt-5 text-[2.6rem] text-ink sm:text-[3.25rem] lg:text-[3.6rem]">
                  Graded readers where A2 is{" "}
                  <span className="relative whitespace-nowrap">
                    actually A2.
                    <InkUnderline />
                  </span>
                </h1>
              </Item>
              <Item>
                <p className="mt-6 max-w-[27rem] text-[1.0625rem] leading-[1.65] text-ink/70">
                  Short passages from A1 to B2. A morphological analyzer checks every word against
                  the level before you see it. Tap any word for its meaning and grammar.
                </p>
              </Item>
              <Item>
                <div className="mt-7 flex min-h-[2.25rem] items-center">
                  <Segmented
                    animated={anim}
                    ariaLabel="Language"
                    size="sm"
                    options={LANGUAGES.map((l) => ({ id: l.id, label: l.label }))}
                    value={lang}
                    onChange={chooseLang}
                  />
                </div>
              </Item>
              <Item>
                <div className="mt-7 flex min-h-12 flex-wrap items-center gap-x-7 gap-y-4">
                  {returning ? null : (
                    <Link href="/library" data-start onClick={(e) => begin("hero", e)} className="btn-primary px-7">
                      Start reading
                    </Link>
                  )}
                  <a href="#check" className="t-quiet text-[14px]">
                    How the check works ↓
                  </a>
                </div>
              </Item>
              {!demo && me?.admin ? (
                <a href={ADMIN_URL} className="t-quiet mt-4 inline-block">
                  Admin
                </a>
              ) : null}
            </Col>

            <div className="relative isolate lg:col-span-7 lg:pl-6 xl:pl-10">
              {returning ? (
                <div data-start className="flex max-w-[34rem] flex-col gap-3">
                  <Eyebrow>Continue</Eyebrow>
                  <ContinueCard item={returning.item} />
                  <p className="text-[13px] text-ink/50">
                    Your {returningName} is at {returning.level}.{" "}
                    <Link href="/library" className="underline decoration-ink/25 underline-offset-4 hover:text-ink">
                      Open the shelf
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="relative max-w-[36rem]">
                  <div aria-hidden="true" className="absolute bottom-[14rem] left-5 hidden w-[11rem] lg:block">
                    <HandArrow kind="hookUp" className="ml-16 h-10 w-12 -scale-x-100" />
                    <HandNote rotate={-4} className="text-[1.35rem] leading-tight text-ink/60">
                      tap any word to open it
                    </HandNote>
                  </div>
                  <ReaderDemo
                    key={lang}
                    lang={lang}
                    showLanguages={false}
                    inlineGloss
                    onFirstTap={() => track("demo_tap", { language: lang })}
                  />
                </div>
              )}
            </div>
            <Art
              key={`wash-${lang}`}
              src={`wash-${lang}`}
              sizes="768px"
              className="band-fade mx-auto -mt-6 hidden h-[12rem] w-[48rem] max-w-full object-cover object-[50%_30%] opacity-70 lg:col-span-12 lg:block"
            />
          </div>
        )}
        <ul
          className={`grid border-t ${LINE} divide-y divide-ink/15 text-[13.5px] text-ink/65 sm:grid-cols-3 sm:divide-x sm:divide-y-0`}
        >
          {[
            { icon: "list", text: `Every word checked by ${ANALYZER[lang]}` },
            { icon: "book", text: "Four levels, A1 to B2, one short read to place you" },
            { icon: "bookmark", text: "No account to start. Keep your shelf later." },
          ].map((fact, i) => (
            <li key={fact.icon} className="flex items-start gap-3 px-5 py-4 sm:px-6">
              <span className="tnum pt-px font-display text-[12px] text-ink/35">{["i", "ii", "iii"][i]}</span>
              <LineIcon name={fact.icon} className="h-[18px] w-[18px] text-terracotta/80" />
              <span className="leading-snug">{fact.text}</span>
            </li>
          ))}
        </ul>
        </div>
      </Folio>

      {variant === "story" ? (
        <Story steps={storySteps} />
      ) : (
        /* ---------- the check ---------- */
        <Folio id="check">
          <Strip no="01" title="The check" meta={`${ANALYZER[lang]} · ${level}`} />
          <Rail>Checked before you see it</Rail>
          <Section>
          <div className="grid lg:grid-cols-12">
            <div className={`px-5 pb-6 pt-10 sm:px-10 lg:col-span-4 lg:border-r ${LINE} lg:py-12 lg:pl-10 lg:pr-8`}>
              <h2 className="t-heading text-[1.9rem] text-ink sm:text-[2.2rem]">
                {article} {language} passage that failed the check.
              </h2>
              <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
                A morphological analyzer reads every word and checks it against the level. If
                something is above the level, the passage is rewritten. In the reader, Why this is{" "}
                {level} shows what was kept out.
              </p>
              <p className="mt-5 text-[13px] leading-relaxed text-ink/50">{KEPT_OUT[lang]}</p>
              {count > 0 ? (
                <div className={`mt-8 border-t ${LINE} pt-5`}>
                  <p className="tnum font-display text-[2.6rem] leading-none text-ink">
                    {count.toLocaleString()}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
                    {language} passages on the shelf, each checked by {ANALYZER[lang]}.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="px-5 pb-12 pt-4 sm:px-10 lg:col-span-8 lg:py-12">
              <Drift key={lang} lang={lang} />
            </div>
          </div>
          </Section>
        </Folio>
      )}

      {/* ---------- rate, levels, and the shelf ---------- */}
      <Folio id="rate">
        <Strip no="02" title="Rate and move forward" meta="A1 · A2 · B1 · B2" />
        <Rail>Read · rate · move forward</Rail>
        <Section>
        <div className="grid items-center overflow-hidden lg:grid-cols-12">
          <div className="px-5 pt-10 sm:px-10 lg:col-span-5 lg:py-12">
            <h2 className="t-heading text-[1.9rem] text-ink sm:text-[2.2rem]">
              Rate, and move forward.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
              Levels run from A1 through B2. One short read sets where you start. After each
              passage, say whether it was too easy, just right, or too hard. Three in a row move your
              level one step.
            </p>
            <p className="mt-4 text-[1rem] leading-[1.65] text-ink/70">
              The shelf remembers the lemmas you have seen, and the next passage is chosen from that.
              Once a day, one news passage from a real wire story is added at your level, checked
              like the rest.
            </p>
          </div>
          <div className="lg:col-span-7">
            <Cliff lang={lang} language={language} anim={anim} />
          </div>
        </div>

        <div className={`grid border-t ${LINE} lg:grid-cols-2`}>
          {variant !== "story" ? (
            <div className={`flex flex-col justify-center border-b ${LINE} px-5 py-10 sm:px-10 lg:border-b-0 lg:border-r`}>
              <RateDemo key={lang} lang={lang} />
            </div>
          ) : null}

          <div
            id="shelf"
            className={`scroll-mt-8 px-5 py-10 sm:px-10 ${variant === "story" ? "lg:col-span-2 lg:mx-auto lg:max-w-[36rem]" : ""}`}
          >
            <h3 className="t-heading text-[1.4rem] text-ink">Keep your shelf.</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-ink/60">
              Read first. After your first rating, Lociros offers an account that keeps your level,
              your saved words, and what you have read, on every device.
            </p>
            <div id="account" className="mt-5 scroll-mt-8">
              {!demo && !signedIn ? (
                <div className="sheet px-6 py-7 sm:px-7">
                  <p className="font-display text-[1.2rem] text-ink">Keep it on every device</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink/60">
                    An email and a password. What you&apos;ve read in this browser comes with you.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    aria-haspopup="dialog"
                    className="btn-primary mt-6 w-full"
                  >
                    Create an account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signin")}
                    aria-haspopup="dialog"
                    className="t-quiet mt-4 text-sm"
                  >
                    Already have one? Sign in
                  </button>
                </div>
              ) : (
                <div className="sheet px-6 py-7 sm:px-7">
                  <p className="font-display text-[1.2rem] text-ink">
                    {demo ? "Your shelf, in this browser" : "Your shelf is waiting"}
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink/60">
                    {demo
                      ? "The demo keeps your level, saved words, and ratings on this device. Nothing leaves it."
                      : `Signed in${me?.email ? ` as ${me.email}` : ""}. Your level and saved words follow you.`}
                  </p>
                  <Link href="/library" data-start onClick={(e) => begin("rate", e)} className="btn-primary mt-6 w-full">
                    Open the library
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
        </Section>
      </Folio>

      {/* ---------- close ---------- */}
      <Folio last>
        <Strip no="03" title="Begin" meta={languageList.join(" · ")} />
        <Rail>Lociros</Rail>
        <Section>
        <div className="grid items-end gap-8 overflow-hidden pt-10 lg:grid-cols-12 lg:gap-10 lg:pt-0">
          <div className="relative z-10 px-5 sm:px-10 lg:col-span-5 lg:py-16">
            <h2 className="t-heading text-[1.6rem] text-ink sm:text-[1.9rem]">
              A calmer, more certain way to read.
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink/55">
              Graded readers for real progress, in {languagesText}.
            </p>
            <div className="mt-6 flex items-center gap-6">
              <Link href="/library" data-start onClick={(e) => begin("close", e)} className="btn-primary px-7">
                Start reading
              </Link>
              <Link href="/library" className="t-quiet hidden sm:inline">
                Explore the library →
              </Link>
            </div>
          </div>
          <figure className="relative lg:col-span-7">
            <Art
              key={lang}
              src={`vista-${lang}`}
              sizes="(min-width: 1024px) 50vw, 95vw"
              className="vista-fade ml-auto aspect-[16/9] w-full max-w-[46rem] object-contain object-right-bottom"
            />
            <HandNote rotate={-4} className="absolute bottom-6 left-2 hidden lg:block">
              {scene.vistaCaption}
            </HandNote>
            <Arrow kind="swoopRight" className="absolute bottom-2 left-24 hidden w-10 lg:block" />
          </figure>
        </div>
        </Section>
      </Folio>

      <footer>
        <Section>
        <Wrap className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 py-7 text-[12.5px] text-ink/45">
          <span className="inline-flex items-center gap-1.5 font-display text-[15px] text-ink/70">
            <LogoMark className="h-[1.35em] w-auto" />
            Lociros
          </span>
          <span>
            Every passage checked before you see it.{" "}
            {demo ? "A single-user demo." : "An account keeps your shelf."}
          </span>
          <span className="flex gap-4">
            <Link href="/privacy" className="t-quiet">
              Privacy
            </Link>
            <Link href="/terms" className="t-quiet">
              Terms
            </Link>
          </span>
        </Wrap>
        </Section>
      </footer>
      </div>
      <StickyStart onStart={(e) => begin("sticky", e)} />
    </main>
    </MotionConfig>
  );
}
