import type { Metadata } from "next";
import { Pricing } from "@/components/pricing";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { pageMetadata } from "@/lib/site";

const [monthly, annual] = PLANS;

export const metadata: Metadata = pageMetadata({
  title: "Plans and pricing",
  description: `Lociros graded readers: ${TRIAL_DAYS} days free, no card needed. Then ${monthly.price} ${monthly.per} or ${annual.price} ${annual.per}. Cancel any time from Settings.`,
  path: "/pricing",
});

export default function PricingPage() {
  return <Pricing />;
}
