import Link from "next/link";
import { Art, LineIcon } from "@/components/landing/art";
import { LogoMark } from "@/components/logo";
import type { LangCode } from "@/lib/types";

const STAMP: Record<LangCode, { text: string; vertical: boolean; font: string }> = {
  ja: { text: "学ぶ", vertical: true, font: "font-ja" },
  ar: { text: "تعلّم", vertical: false, font: "font-ar" },
  it: { text: "imparare", vertical: false, font: "font-display italic" },
  ru: { text: "учиться", vertical: false, font: "font-display italic" },
};

/** In reading order: read, keep words, review them. */
export const NAV_LINKS = [
  { href: "/library", label: "Library", icon: "shelf" },
  { href: "/words", label: "Words", icon: "book" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type AppSection = (typeof NAV_LINKS)[number]["href"];

/** Left rail on wide screens: wordmark, the four sections, and the language's branch. */
export function AppRail({ language, current }: { language?: LangCode; current?: AppSection }) {
  const stamp = language ? STAMP[language] : null;
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-[13.5rem] flex-col border-r border-rule/80 bg-paper-raised/40 px-4 pb-6 pt-8 lg:flex">
      <Link
        href="/"
        className="flex items-center gap-2 px-3 font-display text-[1.75rem] font-medium tracking-[-0.02em] text-ink"
      >
        <LogoMark className="h-[1.6em] w-auto shrink-0" />
        Lociros
      </Link>
      <nav aria-label="Sections" className="mt-10 flex flex-col gap-1">
        {NAV_LINKS.map((link) => {
          const on = current === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] transition-colors ${
                on ? "bg-ink/[0.06] text-ink" : "text-ink/60 hover:bg-ink/[0.04] hover:text-ink"
              }`}
            >
              <LineIcon name={link.icon} className="h-[1.15rem] w-[1.15rem]" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      {language && stamp ? (
        <div className="relative mt-auto">
          <Art
            key={language}
            src={`branch-${language}`}
            className="-ml-4 max-h-[22rem] w-[calc(100%+1rem)] object-contain object-left-bottom"
          />
          <span
            aria-hidden="true"
            lang={language}
            className={`art mt-3 ml-3 inline-block rounded-[5px] border border-terracotta/70 px-1.5 py-1 leading-none text-terracotta/85 ${stamp.font} ${
              stamp.vertical ? "text-[15px] [writing-mode:vertical-rl]" : "text-[13px]"
            }`}
          >
            {stamp.text}
          </span>
        </div>
      ) : null}
    </aside>
  );
}

/** Bottom bar below `lg`, where the rail is hidden. */
export function MobileNav({ current }: { current?: AppSection }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-paper-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-[40rem] grid-cols-4">
        {NAV_LINKS.map((link) => {
          const on = current === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  on ? "text-ink" : "text-ink/50 hover:text-ink"
                }`}
              >
                <LineIcon name={link.icon} className="h-5 w-5" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The frame every signed-in screen shares: rail on wide screens, wordmark and
 * bottom bar on narrow ones. `actions` sits top right on every width, which is
 * where the language switch lives.
 */
export function AppShell({
  current,
  language,
  actions,
  children,
}: {
  current: AppSection;
  language?: LangCode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-full overflow-x-clip lg:pl-[13.5rem]">
      <AppRail language={language} current={current} />
      <main className="mx-auto flex min-h-full w-full max-w-[40rem] flex-col px-5 pb-28 pt-6 sm:px-8 sm:pt-7 lg:pb-24 lg:pt-9">
        <header
          className={`mb-10 flex flex-col items-start gap-3 border-b border-rule/70 pb-5 sm:flex-row sm:items-center sm:justify-between ${
            actions ? "" : "lg:hidden"
          }`}
        >
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-display text-[1.375rem] font-medium tracking-[-0.02em] text-ink lg:invisible"
          >
            <LogoMark className="h-[2.05em] w-auto shrink-0" />
            Lociros
          </Link>
          {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
        </header>
        {children}
      </main>
      <MobileNav current={current} />
    </div>
  );
}

/** Eyebrow and heading, set the same way on every section. */
export function PageHeading({
  eyebrow,
  children,
  muted = false,
}: {
  eyebrow: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <>
      <p className="t-eyebrow">{eyebrow}</p>
      <h1 className={`t-heading mt-4 text-[2rem] sm:text-[2.5rem] ${muted ? "text-ink/40" : "text-ink"}`}>
        {children}
      </h1>
    </>
  );
}
