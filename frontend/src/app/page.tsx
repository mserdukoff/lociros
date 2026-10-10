import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { jsonLd, pageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { LANGUAGES } from "@/lib/types";

const base = pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" });

export const metadata: Metadata = { ...base, title: { absolute: SITE_TITLE } };

/** "$9.99" → 9.99 USD. Anything else is left out of the markup rather than guessed. */
function offer(price: string, name: string) {
  const match = /^\$(\d+(?:\.\d+)?)$/.exec(price.trim());
  if (!match) return null;
  return {
    "@type": "Offer",
    name,
    price: match[1],
    priceCurrency: "USD",
    url: `${SITE_URL}/pricing`,
  };
}

const organization = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    organization,
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "en",
      publisher: { "@id": organization["@id"] },
    },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      inLanguage: "en",
      educationalLevel: ["A1", "A2", "B1", "B2"],
      about: LANGUAGES.map((l) => ({ "@type": "Language", name: l.label })),
      publisher: { "@id": organization["@id"] },
      offers: [
        { "@type": "Offer", name: `${TRIAL_DAYS}-day free trial`, price: "0", priceCurrency: "USD" },
        ...PLANS.map((p) => offer(p.price, p.label)).filter(Boolean),
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <Landing variant="shader" />
    </>
  );
}
