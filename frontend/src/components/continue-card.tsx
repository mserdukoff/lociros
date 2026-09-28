import Link from "next/link";
import { BandStrip } from "@/components/band";
import { Seal } from "@/components/seal";
import { readingFont, type LangCode, type LibraryItem } from "@/lib/types";

function lemmaLine(item: LibraryItem): string | null {
  const total = item.new_lemmas + item.recycled_lemmas;
  if (total === 0) return null;
  return item.new_lemma_pct != null
    ? `${Math.round(item.new_lemma_pct * 100)}% new`
    : `${item.new_lemmas} new · ${item.recycled_lemmas} known`;
}

export function datedSource(name?: string | null, sourceDate?: string | null): string | null {
  if (!name) return null;
  if (!sourceDate) return name;
  const parsed = Date.parse(`${sourceDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return `${name} · ${sourceDate}`;
  const date = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(parsed));
  return `${name} · ${date}`;
}

export function sourceLine(item: LibraryItem): string | null {
  return datedSource(item.source_name, item.source_date);
}

export function metaLine(item: LibraryItem): string {
  const bits = [`${item.word_count} words`];
  const lemmas = lemmaLine(item);
  if (lemmas) bits.push(lemmas);
  if (item.has_audio) bits.push("audio");
  if (item.read) bits.push("read");
  return bits.join(" · ");
}

function thumbFor(id: string, language: LangCode): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `thumb-${language}-${(h % 2) + 1}`;
}

/** The recommended passage: the one sheet lifted off the shelf. Also the landing hero for a returning reader. */
export function ContinueCard({ item }: { item: LibraryItem }) {
  const font = readingFont(item.language);
  return (
    <Link
      href={`/passage/${item.id}`}
      className="group sheet-float relative block overflow-hidden px-6 py-6 transition-transform duration-200 hover:-translate-y-0.5 sm:px-7 sm:py-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BandStrip level={item.level} />
          <Seal
            verdict={item.passed ? "pass" : "fail"}
            language={item.language}
            level={item.level}
            size="mark"
          />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/art/320/${thumbFor(item.id, item.language)}.webp`}
          alt=""
          aria-hidden="true"
          className="art -mr-1 -mt-1 hidden aspect-[4/3] h-16 w-auto rotate-2 rounded-[4px] object-cover opacity-90 shadow-card sm:block"
        />
      </div>
      <p className="mt-4 text-[13px] text-ink/50">
        {sourceLine(item) ? `${sourceLine(item)} · ` : ""}
        {item.topic}
      </p>
      <h3
        dir={item.language === "ar" ? "rtl" : undefined}
        className={`mt-2 text-[1.6rem] leading-[1.2] text-ink sm:text-[1.9rem] ${font}`}
      >
        {item.title}
      </h3>
      <div className="tnum mt-7 flex items-center justify-between gap-3 border-t border-rule/70 pt-4 text-[13px]">
        <span className="text-ink/50">{metaLine(item)}</span>
        <span className="inline-flex h-9 items-center rounded-card bg-ink px-4 text-paper transition-colors group-hover:bg-ink/88">
          Read →
        </span>
      </div>
    </Link>
  );
}
