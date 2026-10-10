import type { Metadata } from "next";
import { LANGUAGES, type CefrLevel, type LangCode } from "@/lib/types";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://lociros.com").replace(/\/$/, "");

export const SITE_NAME = "Lociros";

export const SITE_TITLE = "Lociros — Graded readers in Japanese, Arabic, Italian, and Russian";

export const SITE_DESCRIPTION =
  "Short graded readers in Japanese, Arabic, Italian, and Russian, A1 to B2. Every word is checked against its CEFR level. Tap any word for meaning and grammar.";

export const LEVEL_NAMES: Record<CefrLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper intermediate",
};

/** `/readers/japanese` and so on. */
export function languageSlug(code: LangCode): string {
  return (LANGUAGES.find((l) => l.id === code)?.label ?? code).toLowerCase();
}

export function languageFromSlug(slug: string): LangCode | null {
  return LANGUAGES.find((l) => l.label.toLowerCase() === slug)?.id ?? null;
}

export function languageName(code: LangCode): string {
  return LANGUAGES.find((l) => l.id === code)?.label ?? code;
}

/** `app/opengraph-image.tsx`. A page's own `openGraph` drops the file-based image, so it is named here. */
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Lociros — graded readers in Japanese, Arabic, Italian, and Russian",
};

/**
 * Title, description, canonical, and a matching Open Graph block. Child
 * `openGraph` replaces the root one wholesale, so the shared fields are
 * repeated here.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: "en_US",
      title,
      description,
      url: path,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE] },
  };
}

/** `<` is escaped so a passage title can never close the script tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
