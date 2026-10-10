import type { Metadata } from "next";
import { Words } from "@/components/words";

export const metadata: Metadata = {
  title: "Words",
  robots: { index: false },
};

export default function WordsPage() {
  return <Words />;
}
