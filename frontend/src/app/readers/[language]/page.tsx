import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BANDS } from "@/components/band";
import { Art } from "@/components/landing/art";
import { fetchCatalog, type CatalogItem } from "@/lib/catalog";
import {
  jsonLd,
  languageFromSlug,
  languageName,
  languageSlug,
  LEVEL_NAMES,
  pageMetadata,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import { LANGUAGES, readingFont, type LangCode } from "@/lib/types";

export const revalidate = 3600;

/** Rendered on first request and cached, so a build never waits on the API. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ language: string }> };

async function load(slug: string): Promise<{ code: LangCode; items: CatalogItem[]; offered: LangCode[] } | null> {
  const code = languageFromSlug(slug);
  if (!code) return null;
  const catalog = await fetchCatalog();
  const items = catalog.filter((item) => item.language === code);
  if (items.length === 0) return null;
  const offered = LANGUAGES.map((l) => l.id).filter((id) => catalog.some((item) => item.language === id));
  return { code, items, offered };
}

function describe(name: string, count: number): string {
  return `${count} short ${name} reading passages, from beginner (A1) to upper intermediate (B2). Every word is checked against its CEFR level. Tap any word for meaning and grammar.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language } = await params;
  const data = await load(language);
  if (!data) return { robots: { index: false } };
  const name = languageName(data.code);
  return pageMetadata({
    title: `${name} graded readers, A1 to B2`,
    description: describe(name, data.items.length),
    path: `/readers/${language}`,
  });
}

export default async function ReadersPage({ params }: Props) {
  const { language } = await params;
  const data = await load(language);
  if (!data) notFound();
  const { code, items, offered } = data;
  const name = languageName(code);
  const path = `/readers/${language}`;
  const byLevel = BANDS.map((level) => ({ level, items: items.filter((item) => item.level === level) })).filter(
    (group) => group.items.length > 0,
  );

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${name} graded readers`,
        url: `${SITE_URL}${path}`,
        description: describe(name, items.length),
        inLanguage: "en",
        about: { "@type": "Language", name },
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.slice(0, 100).map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/passage/${item.id}`,
            name: item.title,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
          { "@type": "ListItem", position: 2, name: `${name} graded readers`, item: `${SITE_URL}${path}` },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[44rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <nav aria-label="Breadcrumb">
        <Link href="/" className="t-quiet">
          ← Lociros
        </Link>
      </nav>
      <Art src={`vista-${code}`} className="-mb-4 ml-auto mt-2 w-[18rem] opacity-80" />
      <p className="t-eyebrow mt-10">Lociros · Graded readers</p>
      <h1 className="t-heading mt-4 text-[2rem] text-ink sm:text-[2.5rem]">{name} graded readers</h1>
      <p className="mt-3 max-w-[34rem] text-[1.0625rem] leading-relaxed text-ink/70">
        {items.length.toLocaleString("en-US")} short {name} passages from A1 to B2. A morphological
        analyzer checks every word against the level before a passage reaches the shelf. Tap any
        word for its meaning, its grammar, and the reading.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
        <Link href={`/placement?language=${code}`} className="btn-primary px-7">
          Find your level
        </Link>
        <Link href="/pricing" className="t-quiet">
          Plans and the free week
        </Link>
      </div>

      {byLevel.map((group) => (
        <section key={group.level} aria-labelledby={`level-${group.level}`} className="mt-14">
          <h2 id={`level-${group.level}`} className="flex items-baseline gap-3 font-display text-[1.35rem] text-ink">
            {group.level}
            <span className="text-[14px] text-ink/50">
              {LEVEL_NAMES[group.level]} · {group.items.length}
            </span>
          </h2>
          <ul className="sheet mt-4 flex flex-col divide-y divide-rule/70">
            {group.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/passage/${item.id}`}
                  className="flex items-baseline justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-paper-raised sm:px-6"
                >
                  <span className="min-w-0">
                    <span
                      lang={code}
                      dir={code === "ar" ? "rtl" : undefined}
                      className={`block truncate text-[1.0625rem] text-ink ${readingFont(code)}`}
                    >
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink/50">{item.topic}</span>
                  </span>
                  <span className="tnum shrink-0 text-[13px] text-ink/45">{item.word_count} words</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {offered.length > 1 ? (
        <nav aria-label="Other languages" className="mt-16 border-t border-rule pt-6">
          <p className="t-eyebrow">Other languages</p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {offered
              .filter((id) => id !== code)
              .map((id) => (
                <li key={id}>
                  <Link href={`/readers/${languageSlug(id)}`} className="t-quiet">
                    {languageName(id)} graded readers
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      ) : null}
    </main>
  );
}
