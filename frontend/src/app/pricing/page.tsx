import type { Metadata } from "next";
import { Suspense } from "react";
import { Pricing } from "@/components/pricing";

export const metadata: Metadata = {
  title: "Plans",
  description:
    "Lociros graded readers: a free week, then monthly or annual. Cancel any time from Settings.",
};

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <Pricing />
    </Suspense>
  );
}
