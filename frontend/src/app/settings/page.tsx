import type { Metadata } from "next";
import { MobileNav } from "@/components/mobile-nav";
import { Settings } from "@/components/settings";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

export default function SettingsPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-[36rem] flex-col px-5 pb-28 pt-8 sm:px-8 sm:pt-10 lg:pb-24">
      <Settings />
      <MobileNav current="/settings" />
    </main>
  );
}
