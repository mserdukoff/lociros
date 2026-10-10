import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Paywall } from "@/components/paywall";
import { Reader } from "@/components/reader";
import { backendUrl } from "@/lib/backend";
import { identityHeaders } from "@/lib/backend-server";
import { isDemo } from "@/lib/demo";
import { demoPassageIds, getDemoPassage } from "@/lib/demo-catalog";
import {
  jsonLd,
  languageName,
  languageSlug,
  LEVEL_NAMES,
  pageMetadata,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import type { Passage } from "@/lib/types";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  if (!isDemo()) return [];
  return demoPassageIds().map((id) => ({ id }));
}

type Loaded =
  | { kind: "passage"; passage: Passage }
  | { kind: "paywall"; code: "signup_required" | "subscription_required" }
  | { kind: "missing" };

/** Shared by the metadata and the page, so one request makes one API call. */
const loadPassage = cache(async (id: string): Promise<Loaded> => {
  if (isDemo()) {
    const passage = getDemoPassage(id);
    return passage ? { kind: "passage", passage } : { kind: "missing" };
  }
  const res = await fetch(`${backendUrl()}/api/passages/${id}`, {
    cache: "no-store",
    headers: await identityHeaders(),
  });
  if (res.status === 404) return { kind: "missing" };
  if (res.status === 402) {
    const data = await res.json().catch(() => null);
    const code = data?.detail?.code === "subscription_required" ? "subscription_required" : "signup_required";
    return { kind: "paywall", code };
  }
  if (!res.ok) {
    throw new Error(`Could not load passage (${res.status})`);
  }
  return { kind: "passage", passage: await res.json() };
});

function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

function describe(passage: Passage): string {
  const name = languageName(passage.language);
  // Kanji and kana set about twice as wide as Latin in a results snippet.
  const max = passage.language === "ja" ? 50 : 100;
  return `A ${passage.word_count}-word ${name} graded reader at CEFR ${passage.level} (${LEVEL_NAMES[passage.level].toLowerCase()}), checked word by word: “${excerpt(passage.text, max)}”`;
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadPassage(id);
  if (loaded.kind !== "passage") return { robots: { index: false } };
  const { passage } = loaded;
  const name = languageName(passage.language);
  const meta = pageMetadata({
    title: `${passage.title} — ${name} ${passage.level} reader`,
    description: describe(passage),
    path: `/passage/${passage.id}`,
    type: "article",
  });
  // News passages retell a wire story, and their shelf life is a day.
  return passage.genre === "news" ? { ...meta, robots: { index: false, follow: true } } : meta;
}

export default async function PassagePage({ params }: Props) {
  const { id } = await params;
  const loaded = await loadPassage(id);
  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "paywall") return <Paywall code={loaded.code} next={`/passage/${id}`} />;
  const { passage } = loaded;
  const name = languageName(passage.language);
  const url = `${SITE_URL}/passage/${passage.id}`;
  const readersUrl = `${SITE_URL}/readers/${languageSlug(passage.language)}`;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["LearningResource", "Article"],
        headline: passage.title,
        name: passage.title,
        description: describe(passage),
        url,
        inLanguage: passage.language,
        educationalLevel: `CEFR ${passage.level}`,
        learningResourceType: "Graded reader",
        teaches: `${name} reading`,
        wordCount: passage.word_count,
        ...(passage.created_at ? { datePublished: passage.created_at } : {}),
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@id": `${SITE_URL}/#organization` },
        isPartOf: { "@type": "CollectionPage", url: readersUrl },
        // Guests read a few passages free, then need an account.
        isAccessibleForFree: false,
        hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".passage-body" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
          { "@type": "ListItem", position: 2, name: `${name} graded readers`, item: readersUrl },
          { "@type": "ListItem", position: 3, name: passage.title, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <Reader passage={passage} />
    </>
  );
}
