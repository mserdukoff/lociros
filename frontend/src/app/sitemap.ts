import type { MetadataRoute } from "next";
import { fetchCatalog, type CatalogItem } from "@/lib/catalog";
import { languageSlug, SITE_URL } from "@/lib/site";
import { LANGUAGES } from "@/lib/types";

export const revalidate = 3600;

const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

function newest(items: CatalogItem[]): Date | undefined {
  const dates = items.map((item) => item.created_at).filter((d): d is string => Boolean(d));
  return dates.length ? new Date(dates.reduce((a, b) => (a > b ? a : b))) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = PAGES.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  // A sitemap without passages beats a failed sitemap.
  const catalog = await fetchCatalog().catch(() => [] as CatalogItem[]);

  const languages: MetadataRoute.Sitemap = LANGUAGES.flatMap((l) => {
    const items = catalog.filter((item) => item.language === l.id);
    if (items.length === 0) return [];
    return [
      {
        url: `${SITE_URL}/readers/${languageSlug(l.id)}`,
        lastModified: newest(items),
        changeFrequency: "weekly" as const,
        priority: 0.9,
      },
    ];
  });

  const passages: MetadataRoute.Sitemap = catalog.map((item) => ({
    url: `${SITE_URL}/passage/${item.id}`,
    lastModified: item.created_at ? new Date(item.created_at) : undefined,
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  return [...pages, ...languages, ...passages];
}
