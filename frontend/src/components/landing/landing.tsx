"use client";

import { MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AuthPanel, signOutAccount } from "@/components/auth-panel";
import { DemoBanner } from "@/components/demo-banner";
import { LogoMark } from "@/components/logo";
import { Segmented } from "@/components/segmented";
import { fetchMe } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { saveLanguage } from "@/lib/device";
import { LANGUAGES, readingFont, type LangCode, type MeResponse } from "@/lib/types";
import { Art, HandArrow, HandNote, LineIcon } from "./art";
import { DEMO } from "./demo-data";
import { Drift } from "./drift";
import { DrawnArrow, Float, InkArt, Parallax, Reveal, Stagger, StaggerItem } from "./motion-bits";
import { PromptHero } from "./prompt-hero";
import { ReaderDemo } from "./reader-demo";
import { SCENES } from "./scenes";
import { Story, type StoryStep } from "./story";

const ShaderWash = dynamic(() => import("./shader-wash"), { ssr: false });

export type LandingVariant = "classic" | "motion" | "prompt" | "story" | "shader";

function Plain({ children }: { children: React.ReactNode; className?: string }) {
  return <>{children}</>;
}

const KEPT_OUT: Record<LangCode, string> = {
  ja: "At A2, て-form and plain past are allowed. The check keeps out ている, conditionals, potential, causative, passive, relative clauses, and keigo.",
  ru: "At A2, nominative, accusative, genitive, prepositional, and dative are allowed, in present, past, and future. Instrumental, participles, and который are kept out.",
  it: "At A2, the present, passato prossimo, and the simple future are allowed. Imperfetto, the conditional, the subjunctive, the gerund, and the remote past are kept out.",
  ar: "At A2, present, past, and future are allowed, including common Form II and Form IV verbs. The dual, إنّ, the relative الذي, and the passive are kept out.",
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
          <Art src={`thumb-${lang}-2`} className="aspect-[4/3] w-full rounded-[6px] object-cover" />
          <span className="mt-2 block h-1 w-12 rounded-full bg-ink/10" />
          <span className="mt-1 block h-1 w-8 rounded-full bg-ink/10" />
        </div>
        <div className="sheet absolute bottom-3 right-2 w-[9rem] rotate-[7deg] p-2.5 sm:right-0">
          <Art
            src={`vista-${lang}`}
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
          <Art src={`thumb-${lang}-1`} className="mt-2 aspect-[4/3] w-full rounded-[6px] object-cover" />
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

export function Landing({ variant = "classic" }: { variant?: LandingVariant }) {
  const anim = variant !== "classic";
  const Col = anim ? Stagger : "div";
  const Item = anim ? StaggerItem : Plain;
  const Arrow = anim ? DrawnArrow : HandArrow;
  const Section = anim ? Reveal : Fragment;
  const [lang, setLang] = useState<LangCode>("ja");
  const [me, setMe] = useState<MeResponse | null>(null);
  const language = LANGUAGES.find((item) => item.id === lang)?.label ?? "Japanese";
  const level = DEMO[lang].level;
  const article = /^[aeiou]/i.test(language) ? "An" : "A";
  const scene = SCENES[lang];
  const demo = isDemo();
  const signedIn = Boolean(me?.authenticated);
  const startHref = demo || signedIn ? "/library" : "#account";

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
          <ReaderDemo key={lang} lang={lang} onLang={chooseLang} />
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
          <InkArt key={lang} src={`stone-${lang}`} className="w-full" />
        </div>
      ),
    },
    {
      id: "rate",
      eyebrow: "Rate and move forward",
      title: "Rate, and move forward.",
      body: (
        <p>
          Levels run from A1 through B2. You begin at A2. The shelf remembers the lemmas you have
          seen, and the next passage is chosen from that.
        </p>
      ),
      visual: <RateDemo key={lang} lang={lang} />,
    },
  ];

  function chooseLang(next: LangCode) {
    setLang(next);
    saveLanguage(next);
  }

  const refreshMe = useCallback(() => {
    if (isDemo()) return;
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  return (
    <MotionConfig reducedMotion="user">
    <main className="relative overflow-x-clip">
      {variant === "shader" ? (
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
            <a href="#tap" className="t-quiet hidden underline-offset-[6px] hover:underline md:inline">
              A tap
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
              <a href="#account" className="t-quiet text-ink!">
                Sign in
              </a>
            ) : null}
            <Link href={startHref} className="btn-primary h-10! px-5! text-[14px]!">
              {signedIn ? "Your shelf" : "Get started"}
            </Link>
          </nav>
        </header>

        <DemoBanner />

        {variant === "prompt" ? (
          <PromptHero lang={lang} onLang={chooseLang} />
        ) : (
          <section className="relative grid items-center gap-10 pb-14 pt-8 lg:grid-cols-12 lg:gap-6 lg:pb-16 lg:pt-6">
            <Col className="relative z-10 lg:col-span-5 lg:pb-10">
              <Item>
                <p className="t-eyebrow max-w-[16rem] leading-[1.6]!">
                  Real language progress, one story at a time.
                </p>
              </Item>
              <Item>
                <h1 className="t-display mt-5 text-[3rem] text-ink sm:text-[3.75rem] lg:text-[4.25rem]">
                  Every word has depth.
                </h1>
              </Item>
              <Item>
                <p className="mt-6 min-h-[5.3rem] max-w-[27rem] text-[1.0625rem] leading-[1.65] text-ink/70">
                  {scene.lede}
                </p>
              </Item>
              <Item>
                <div className="mt-7">
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
                <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <Link href="/library" className="btn-primary px-7">
                    Start reading
                  </Link>
                  <a href="#read" className="t-quiet text-[14px]">
                    See how it works ↓
                  </a>
                </div>
              </Item>
              {!demo && me?.admin ? (
                <Link href="/admin" className="t-quiet mt-4 inline-block">
                  Admin
                </Link>
              ) : null}
            </Col>

            <figure className="relative lg:col-span-7 lg:-mr-10 xl:-mr-20 2xl:-ml-6 2xl:-mr-36">
              {anim ? (
                <Parallax distance={50}>
                  <InkArt key={lang} src={`cliff-${lang}`} className="cliff-fade aspect-[4/3] w-full" delay={0.2} />
                </Parallax>
              ) : (
                <Art key={lang} src={`cliff-${lang}`} className="cliff-fade aspect-[4/3] w-full" />
              )}
              <div aria-hidden="true" className="absolute inset-0 hidden lg:block">
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
                    <Float key={`${lang}-${s.level}`} className={cls} style={style} delay={0.7 + i * 0.15}>
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
                A cliff of carved {language} words, from everyday greetings at the top to older
                writing at the base.
              </figcaption>
            </figure>
          </section>
        )}
      </Wrap>

      {variant === "story" ? <Story steps={storySteps} /> : null}
      {variant !== "story" ? (
      <>
      {/* ---------- read ---------- */}
      <section id="read" className="relative scroll-mt-4 border-t border-rule/70 pb-16 pt-16 sm:pt-20 lg:pb-44">
        <Section>
        <Wrap className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="relative lg:col-span-4">
            <Eyebrow>Read</Eyebrow>
            <h2 className="t-heading mt-4 text-[2.1rem] text-ink sm:text-[2.5rem]">
              Graded readers where A2 is actually A2.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
              Short passages from beginner through upper-intermediate. Every one is checked against
              the level before it is shown. Tap any word for the meaning, the grammar, and the
              reading.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link href="/library" className="btn-primary px-7">
                Start reading
              </Link>
              <Link href="/library" className="t-quiet text-[14px]">
                See a sample →
              </Link>
            </div>
            <p className="mt-8 text-[12.5px] leading-relaxed text-ink/45">
              This passage is {level} {language}. The library has the rest of the shelf.
            </p>
            <Art
              src="hills-strip"
              className="mt-8 hidden w-[30rem] max-w-none -translate-x-20 lg:block"
            />
          </div>

          <div className="relative isolate z-10 lg:col-span-5">
            <ReaderDemo key={lang} lang={lang} onLang={chooseLang} />
          </div>

          <div className="relative hidden lg:col-span-3 lg:block">
            <div className="ml-10 w-[10rem]">
              <HandNote rotate={-8}>A2 vocabulary, real context, deeper understanding.</HandNote>
              <Arrow kind="curlDown" className="ml-2 mt-1 w-10" />
            </div>
            <Art
              key={lang}
              src={`pillar-${lang}`}
              className="mt-2 aspect-[3/4] w-[19rem] max-w-none -translate-x-4 object-contain"
            />
          </div>
        </Wrap>
        </Section>
      </section>

      {/* ---------- the check ---------- */}
      <section id="check" className="relative scroll-mt-4 border-t border-rule/70 py-16 sm:py-20">
        <Art
          src="sprig-tall"
          className="absolute -right-6 bottom-0 hidden w-[9rem] opacity-80 xl:block 2xl:right-[3vw]"
        />
        <Section>
        <Wrap className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <Eyebrow accent>The check</Eyebrow>
            <h2 className="t-heading mt-4 text-[1.9rem] text-ink sm:text-[2.2rem]">
              {article} {language} passage that failed the check.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
              A morphological analyzer reads every word and checks it against the level. If
              something is above the level, the passage is rewritten. In the reader, Why this is{" "}
              {level} shows what was kept out.
            </p>
            <p className="mt-5 text-[13px] leading-relaxed text-ink/50">{KEPT_OUT[lang]}</p>
          </div>
          <div className="lg:col-span-8">
            <Drift key={lang} lang={lang} />
          </div>
        </Wrap>
        </Section>
      </section>

      {/* ---------- a tap ---------- */}
      <section id="tap" className="relative scroll-mt-4 border-t border-rule/70 py-16 sm:py-20">
        <Section>
        <Wrap className="grid gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <Eyebrow>A tap</Eyebrow>
            <h2 className="t-heading mt-4 text-[1.9rem] text-ink sm:text-[2.2rem]">
              A tap stays in the sentence.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
              Tap a word in the passage. The gloss tells you what it is, then you keep reading.
              Everything you need, right there.
            </p>
          </div>
          <dl className="border-t border-rule lg:col-span-5">
            {TAP[lang].map((item) => (
              <div
                key={item.k}
                className="grid grid-cols-[1.75rem_1fr] items-baseline gap-x-3 gap-y-1 border-b border-rule py-3.5 sm:grid-cols-[1.75rem_8rem_1fr]"
              >
                <LineIcon name={item.icon} className="translate-y-[3px] text-ink/60" />
                <dt className="text-[14px] font-medium text-ink">{item.k}</dt>
                <dd className="col-start-2 text-[14px] leading-relaxed text-ink/65 sm:col-start-3">
                  {item.v}
                </dd>
              </div>
            ))}
          </dl>
          <figure className="relative hidden lg:col-span-3 lg:block">
            <div className="ml-auto w-[8.5rem]">
              <HandNote rotate={-8}>Look up, learn, keep reading.</HandNote>
              <Arrow kind="curlDown" className="mt-1 w-9" />
            </div>
            <Art key={lang} src={`stone-${lang}`} className="-mt-2 w-[18rem] max-w-none" />
            <figcaption className="t-hand ml-auto mt-1 w-[9rem] text-[1.05rem]! -rotate-3">
              Fig. 3. A tap reveals every layer.
            </figcaption>
          </figure>
        </Wrap>
        </Section>
      </section>

      </>
      ) : null}
      {/* ---------- the shelf ---------- */}
      <section id="shelf" className="relative scroll-mt-4 border-t border-rule/70 py-16 sm:py-20">
        <Section>
        <Wrap className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <Eyebrow accent>The shelf</Eyebrow>
            <h2 className="t-heading mt-4 text-[1.9rem] text-ink sm:text-[2.2rem]">
              Keep your shelf.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
              An account keeps your level, your saved words, and what you have read, on every
              device.
            </p>
            <Art
              key={lang}
              src={`study-${lang}`}
              className="mt-6 hidden aspect-[4/3] w-[22rem] max-w-none -translate-x-8 object-contain lg:block"
            />
          </div>

          <div id="account" className="scroll-mt-8 lg:col-span-4 lg:pt-4">
            {!demo && !signedIn ? (
              <div className="sheet px-6 pb-7 pt-1 sm:px-7">
                <AuthPanel me={me} onRefresh={refreshMe} layout="hero" nextPath="/library" redirectOnSuccess />
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
                <Link href="/library" className="btn-primary mt-6 w-full">
                  Open the library
                </Link>
              </div>
            )}
          </div>

          <div className="relative hidden lg:col-span-4 lg:block">
            <Art src="card-catalog" className="w-[25rem] max-w-none" />
          </div>
        </Wrap>
        </Section>
      </section>

      {variant !== "story" ? (
      <>
      {/* ---------- rate ---------- */}
      <section id="rate" className="relative scroll-mt-4 border-t border-rule/70 py-16 sm:py-20">
        <Section>
        <Wrap className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <Eyebrow accent>Rate and move forward</Eyebrow>
            <h2 className="t-heading mt-4 text-[1.9rem] text-ink sm:text-[2.2rem]">
              Rate, and move forward.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">
              Levels run from A1 through B2. You begin at A2. The shelf remembers the lemmas you
              have seen, and the next passage is chosen from that.
            </p>
            <p className="mt-5 text-[13px] leading-relaxed text-ink/50">
              You can also ask for a passage on a topic you choose. Writing and checking take 20 to
              40 seconds, and only a passage that passes is added.
            </p>
          </div>
          <div className="lg:col-span-5">
            <RateDemo key={lang} lang={lang} />
          </div>
          <figure className="relative hidden lg:col-span-3 lg:block">
            <div className="relative z-10 ml-8 w-[9.5rem]">
              <HandNote rotate={-7}>Three ratings move your level one step.</HandNote>
              <Arrow kind="longLeft" className="mt-1 w-12" />
            </div>
            <Art src="ruins-landscape" className="-mt-6 w-[26rem] max-w-none -translate-x-6" />
          </figure>
        </Wrap>
        </Section>
      </section>

      </>
      ) : null}
      {/* ---------- explore ---------- */}
      <section id="explore" className="relative scroll-mt-4 overflow-hidden border-t border-rule/70">
        <Section>
        <Wrap className="grid items-end gap-8 pt-16 sm:pt-20 lg:grid-cols-12 lg:gap-10">
          <div className="relative z-10 pb-4 lg:col-span-4 lg:pb-20">
            <Eyebrow accent>Explore</Eyebrow>
            <h2 className="t-heading mt-4 text-[1.9rem] text-ink sm:text-[2.2rem]">
              Language opens a wider world.
            </h2>
            <p className="mt-5 text-[1rem] leading-[1.65] text-ink/70">{scene.explore}</p>
            <HandNote rotate={-4} className="mt-7 hidden lg:block">
              {scene.vistaCaption}
            </HandNote>
          </div>
          <figure className="relative lg:col-span-8 lg:-mr-12 xl:-mr-24">
            <Art
              key={lang}
              src={`vista-${lang}`}
              className="vista-fade ml-auto aspect-[16/9] w-full max-w-[52rem] object-contain object-right-bottom"
            />
          </figure>
        </Wrap>
        </Section>
      </section>

      {/* ---------- close ---------- */}
      <section className="border-t border-rule/70">
        <Section>
        <Wrap className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="t-heading text-[1.6rem] text-ink sm:text-[1.75rem]">
              A calmer, more certain way to read.
            </h2>
            <p className="mt-1.5 text-[13px] text-ink/55">
              Graded readers for real progress, in Japanese, Arabic, Italian, and Russian.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/library" className="btn-primary px-7">
              Start reading
            </Link>
            <Link href="/library" className="t-quiet hidden sm:inline">
              Explore the library →
            </Link>
          </div>
        </Wrap>
        </Section>
      </section>

      <footer className="border-t border-rule/70">
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
    </main>
    </MotionConfig>
  );
}
