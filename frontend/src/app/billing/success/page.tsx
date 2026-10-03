import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingSuccess } from "@/components/billing-success";

export const metadata: Metadata = {
  title: "Subscribed",
  robots: { index: false },
};

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <BillingSuccess />
    </Suspense>
  );
}
