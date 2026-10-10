import { backendUrl } from "@/lib/backend";
import { isDemo } from "@/lib/demo";
import { listDemoPassages } from "@/lib/demo-catalog";
import { LANGUAGES, type CefrLevel, type LangCode } from "@/lib/types";

export type CatalogItem = {
  id: string;
  language: LangCode;
  level: CefrLevel;
  title: string;
  topic: string;
  genre: string | null;
  word_count: number;
  series_id?: string | null;
  chapter_index?: number | null;
  created_at: string | null;
};

/** How long the sitemap and language pages keep a catalog before asking again. */
export const CATALOG_REVALIDATE = 3600;

/** The public shelf, newest first. Throws when the API can't be reached. */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  if (isDemo()) {
    return LANGUAGES.flatMap((l) =>
      listDemoPassages(l.id).map((p) => ({
        id: p.id,
        language: p.language,
        level: p.level,
        title: p.title,
        topic: p.topic,
        genre: p.genre,
        word_count: p.word_count,
        series_id: p.series_id,
        chapter_index: p.chapter_index,
        created_at: p.created_at,
      })),
    );
  }
  const res = await fetch(`${backendUrl()}/api/catalog`, {
    next: { revalidate: CATALOG_REVALIDATE },
  });
  if (!res.ok) throw new Error(`Could not load the catalog (${res.status})`);
  const data: { items: CatalogItem[] } = await res.json();
  return data.items;
}
