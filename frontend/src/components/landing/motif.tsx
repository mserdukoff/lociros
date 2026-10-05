"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { readingFont, type LangCode } from "@/lib/types";
import { Art } from "./art";
import { THEMES } from "./themes";

/** The verb "read", set huge and faint at the foot of the hero. */
function Watermark({ lang, className = "" }: { lang: LangCode; className?: string }) {
  return (
    <span
      lang={lang}
      dir={lang === "ar" ? "rtl" : undefined}
      className={`absolute select-none whitespace-nowrap leading-none ${readingFont(lang)} ${className}`}
    >
      {THEMES[lang].read}
    </span>
  );
}

/** Seigaiha: rows of overlapping waves, each scale painted over the one behind it. */
function Seigaiha({ className = "" }: { className?: string }) {
  const id = useId();
  const scale = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      {[19.5, 14, 8.5, 3].map((r) => (
        <circle key={r} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
  return (
    <svg aria-hidden="true" className={className}>
      <defs>
        <pattern id={id} width="40" height="20" patternUnits="userSpaceOnUse">
          <g style={{ fill: "var(--paper)" }} stroke="currentColor" strokeWidth="0.9">
            {[
              [0, 0],
              [40, 0],
              [20, 10],
              [0, 20],
              [40, 20],
            ].map(([x, y]) => scale(x, y))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Khatam: an eight-pointed star from two squares, tiled into a lattice. */
function StarLattice({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg aria-hidden="true" className={className}>
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="16" y="16" width="24" height="24" />
            <rect x="16" y="16" width="24" height="24" transform="rotate(45 28 28)" />
            <path d="M28 0v11M28 45v11M0 28h11M45 28h11" />
            <path d="M0 0l7 7M56 0l-7 7M0 56l7-7M56 56l-7-7" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** A loggia: a frieze of round arches on slim columns. */
function Arcade({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg aria-hidden="true" className={className}>
      <defs>
        <pattern id={id} width="56" height="64" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M6 64V30a22 22 0 0 1 44 0v34" />
            <path d="M0 18h56M0 22h56" />
            <circle cx="28" cy="10" r="2.5" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

function PointedArch({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 320"
      preserveAspectRatio="xMidYMin meet"
      className={className}
      fill="none"
      stroke="currentColor"
    >
      <path strokeWidth="1.4" d="M8 320V138C8 78 52 40 100 6c48 34 92 72 92 132v182" />
      <path strokeWidth="0.8" d="M22 320V142C22 92 60 58 100 28c40 30 78 64 78 114v178" />
      <path strokeWidth="0.8" d="M100 6v22" />
    </svg>
  );
}

function JapaneseMotif() {
  return (
    <>
      <span className="absolute right-4 top-3 h-14 w-14 rounded-full bg-terracotta/90 lg:hidden" />
      <Seigaiha className="absolute inset-x-0 bottom-0 h-40 w-full text-ink/15 [mask-image:linear-gradient(to_top,black,transparent)]" />
      <span
        lang="ja"
        className="font-ja absolute right-5 top-[21rem] hidden text-[15px] tracking-[0.5em] text-ink/35 [writing-mode:vertical-rl] lg:block"
      >
        日本語を読む
      </span>
      <Watermark lang="ja" className="-bottom-10 left-4 text-[8rem] text-ink/[0.05] lg:text-[13rem]" />
    </>
  );
}

function ArabicMotif() {
  return (
    <>
      <StarLattice className="absolute inset-0 h-full w-full text-terracotta/30 [mask-image:radial-gradient(ellipse_70%_80%_at_85%_30%,black,transparent_75%)]" />
      <PointedArch className="absolute right-[4%] top-4 hidden h-[44rem] w-[28rem] text-terracotta/70 lg:block" />
      <Watermark lang="ar" className="-bottom-12 left-6 text-[8rem] text-ink/[0.06] lg:text-[13rem]" />
    </>
  );
}

function ItalianMotif() {
  return (
    <>
      <span className="absolute inset-0 bg-[radial-gradient(60%_70%_at_8%_0%,rgb(233_169_74/0.24),transparent_70%)]" />
      <Arcade className="absolute inset-x-0 top-0 h-16 w-full text-ink/[0.13] [mask-image:linear-gradient(to_right,transparent,black_30%,black_70%,transparent)]" />
      <Art
        src="branch-it"
        sizes="224px"
        className="absolute -right-6 bottom-10 hidden w-56 opacity-80 lg:block"
      />
      <Watermark lang="it" className="-bottom-10 left-4 text-[8rem] text-ink/[0.06] lg:text-[14rem]" />
    </>
  );
}

function RussianMotif() {
  return (
    <>
      <span className="absolute right-0 top-3 h-14 w-24 bg-terracotta [clip-path:polygon(0_50%,100%_0,100%_100%)] lg:-right-12 lg:top-16 lg:h-[30rem] lg:w-[40rem]" />
      <span className="absolute right-[3%] top-5 hidden h-20 w-20 rounded-full bg-ink lg:block" />
      <span className="absolute bottom-24 right-[6%] hidden h-[7px] w-[20rem] -rotate-[18deg] bg-ink lg:block" />
      <span className="absolute bottom-[4.6rem] right-[9%] hidden h-[2px] w-[14rem] -rotate-[18deg] bg-ink lg:block" />
      <Watermark
        lang="ru"
        className="-bottom-6 left-2 -rotate-[5deg] text-[7rem] uppercase text-terracotta/[0.09] lg:text-[12rem]"
      />
    </>
  );
}

const MOTIFS: Record<LangCode, () => React.ReactNode> = {
  ja: JapaneseMotif,
  ar: ArabicMotif,
  it: ItalianMotif,
  ru: RussianMotif,
};

/** Gestures too big for the hero frame, anchored to the top corner of the page. */
const PAGE_MOTIFS: Partial<Record<LangCode, () => React.ReactNode>> = {
  ja: () => (
    <span className="absolute -right-24 top-[8.5rem] hidden h-[26rem] w-[26rem] rounded-full bg-terracotta/90 lg:block" />
  ),
};

function Crossfade({ lang, shapes: Shapes, className }: { lang: LangCode; shapes?: () => React.ReactNode; className: string }) {
  return (
    <div aria-hidden="true" className={`art pointer-events-none absolute overflow-hidden ${className}`}>
      <AnimatePresence initial={false}>
        {Shapes ? (
          <motion.div
            key={lang}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          >
            <Shapes />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function PageMotif({ lang }: { lang: LangCode }) {
  return <Crossfade lang={lang} shapes={PAGE_MOTIFS[lang]} className="inset-x-0 top-0 h-[60rem]" />;
}

/** Decoration behind the hero, crossfading when the language changes. */
export function Motif({ lang }: { lang: LangCode }) {
  return <Crossfade lang={lang} shapes={MOTIFS[lang]} className="inset-0" />;
}
