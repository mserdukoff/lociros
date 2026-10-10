import type { Metadata } from "next";
import { Shelf } from "@/components/shelf";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Library",
  description:
    "Your shelf of graded readers in Japanese, Arabic, Italian, and Russian, chosen for your level and the words you already know.",
  path: "/library",
});

export default function LibraryPage() {
  return <Shelf />;
}
