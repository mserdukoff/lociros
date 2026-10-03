import type { Metadata } from "next";
import { MobileNav } from "@/components/mobile-nav";
import { Shelf } from "@/components/shelf";

export const metadata: Metadata = {
  title: "Library",
};

export default function LibraryPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-[40rem] flex-col px-5 pb-28 pt-6 sm:px-8 sm:pt-7 lg:pb-24">
      <Shelf />
      <MobileNav current="/library" />
    </main>
  );
}
