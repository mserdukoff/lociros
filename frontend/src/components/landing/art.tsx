/* eslint-disable @next/next/no-img-element */

/** Widths written by scripts/art-sizes.mjs, plus the original (about 1200 px). */
export function artSrcSet(src: string): string {
  return `/art/320/${src}.webp 320w, /art/640/${src}.webp 640w, /art/${src}.webp 1200w`;
}

export type ArtProps = {
  src: string;
  className?: string;
  width?: number;
  /** Rendered width, so a phone does not fetch the 1200 px file. */
  sizes?: string;
  /** Above the fold: fetch now at high priority instead of lazily. */
  priority?: boolean;
};

export function Art({ src, className = "", width, sizes = "(min-width: 1024px) 40vw, 90vw", priority = false }: ArtProps) {
  return (
    <img
      src={`/art/${src}.webp`}
      srcSet={artSrcSet(src)}
      sizes={sizes}
      alt=""
      aria-hidden="true"
      width={width}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={`art ${className}`}
    />
  );
}

export function HandNote({
  children,
  className = "",
  rotate = -6,
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <p
      aria-hidden="true"
      className={`t-hand art ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </p>
  );
}

export const ARROWS = {
  // a short swoop down and to the right
  swoopRight: "M4 6 C 10 22, 22 30, 42 30 M34 23 L43 30 L35 37",
  // curls down from a note, ends pointing left
  curlDown: "M34 4 C 12 8, 4 24, 12 42 M5 35 L12 43 L18 35",
  // long loose line pointing left
  longLeft: "M58 8 C 44 22, 26 26, 6 24 M14 17 L5 24 L14 30",
  // a small hook up and to the left
  hookUp: "M36 38 C 34 22, 22 10, 6 8 M13 3 L5 8 L12 14",
};

export function HandArrow({
  kind,
  className = "",
}: {
  kind: keyof typeof ARROWS;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      className={`art text-ink/55 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ARROWS[kind]} />
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  book: (
    <>
      <path d="M3 5.5C5.5 4.3 8.5 4.3 11 5.8v13c-2.5-1.5-5.5-1.5-8-.3z" />
      <path d="M21 5.5c-2.5-1.2-5.5-1.2-8 .3v13c2.5-1.5 5.5-1.5 8-.3z" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  brush: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M8 16.5l7.5-8.5M13 8h3v3" />
    </>
  ),
  letter: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M8.5 16.5l3.5-9 3.5 9M9.8 13.2h4.4" />
    </>
  ),
  bookmark: <path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  shelf: (
    <>
      <path d="M4.5 4.5v15M8.5 4.5v15" />
      <path d="M12.5 5.5l3.8-1 3.9 14.6-3.8 1z" />
    </>
  ),
  review: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 4v3.5h3.5" />
      <path d="M12 8v4.2l2.8 1.8" />
    </>
  ),
  root: (
    <>
      <path d="M12 3v9M12 12c0 4-3 5-6 8M12 12c0 4 3 5 6 8M12 14v7" />
    </>
  ),
  vowels: (
    <>
      <path d="M4 15c3 3 13 3 16 0" />
      <path d="M8 8l3-1M13 6l3-1" />
    </>
  ),
  swatch: (
    <>
      <circle cx="8.5" cy="9" r="4" />
      <circle cx="15.5" cy="9" r="4" />
      <circle cx="12" cy="15" r="4" />
    </>
  ),
};

export function LineIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name] ?? ICONS.list}
    </svg>
  );
}
