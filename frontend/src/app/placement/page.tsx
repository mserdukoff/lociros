import type { Metadata } from "next";
import { Suspense } from "react";
import { PlacementReadView } from "@/components/placement";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Find your reading level",
  description:
    "One short passage places you on the CEFR scale, A1 to B2, in Japanese, Arabic, Italian, or Russian. No account needed.",
  path: "/placement",
});

export default function PlacementPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[42rem] px-5 pt-10 text-sm text-ink/45">Opening the passage…</main>}>
      <PlacementReadView />
    </Suspense>
  );
}
