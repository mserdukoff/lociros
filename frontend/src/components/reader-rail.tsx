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

export const NAV_LINKS = [
  { href: "/library", label: "Library", icon: "shelf" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/library#words", label: "Vocabulary", icon: "book" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

const LINKS = NAV_LINKS;

/** Left rail on wide screens: wordmark, the places a reader goes, and the language's branch. */
export function ReaderRail({ language, current }: { language: LangCode; current?: string }) {
  const stamp = STAMP[language];
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
        {LINKS.map((link) => {
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
    </aside>
  );
}
