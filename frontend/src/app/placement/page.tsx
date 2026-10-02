import type { Metadata } from "next";
import { Suspense } from "react";
import { PlacementReadView } from "@/components/placement";

export const metadata: Metadata = {
  title: "Placement",
};

export default function PlacementPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[42rem] px-5 pt-10 text-sm text-ink/45">Opening the passage…</main>}>
      <PlacementReadView />
    </Suspense>
  );
}
