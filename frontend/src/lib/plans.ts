import type { Plan } from "./api";

/**
 * Display copy only. Stripe Checkout charges whatever the configured Price IDs
 * say, so keep NEXT_PUBLIC_PRICE_* in step with the Stripe dashboard.
 */
export const PLANS: { id: Plan; label: string; price: string; per: string; note: string }[] = [
  {
    id: "monthly",
    label: "Monthly",
    price: process.env.NEXT_PUBLIC_PRICE_MONTHLY || "$9.99",
    per: "a month",
    note: "Cancel any time.",
  },
  {
    id: "annual",
    label: "Annual",
    price: process.env.NEXT_PUBLIC_PRICE_ANNUAL || "$79.99",
    per: "a year",
    note: process.env.NEXT_PUBLIC_PRICE_ANNUAL_NOTE || "Two-thirds the monthly price.",
  },
];

export const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 7);

export const INCLUDED = [
  "Every graded passage on the shelf, in every language, at your band",
  "Tap any word for its lemma, grammar, and a gloss",
  "Saved words and spaced review",
  "A news passage at your level each day",
  "Custom passages on topics you choose",
  "Export your words to CSV or Anki at any time",
];

export function safeNext(value: string | null | undefined, fallback = "/library"): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return fallback;
}
