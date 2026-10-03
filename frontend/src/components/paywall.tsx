"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { Art } from "@/components/landing/art";
import { fetchMe, pricingHref, track, type PaywallCode } from "@/lib/api";
import { TRIAL_DAYS } from "@/lib/plans";
import type { MeResponse } from "@/lib/types";

/** Shown in place of a passage the reader cannot open yet. */
export function Paywall({ code, next }: { code: PaywallCode; next: string }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);

  const refresh = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refresh();
    track("paywall_view", { code, where: "passage" });
  }, [refresh, code]);

  const signup = code === "signup_required" && !me?.authenticated;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[36rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <Link href="/library" className="t-quiet">
        ← Library
      </Link>
      <Art src="hills-strip" className="-mb-4 ml-auto mt-2 w-[16rem] opacity-80" />
      <p className="t-eyebrow mt-10">Lociros</p>
      {signup ? (
        <>
          <h1 className="t-heading mt-4 text-[2rem] text-ink">Keep reading, free for {TRIAL_DAYS} days.</h1>
          <p className="mt-3 max-w-[28rem] text-[1.0625rem] leading-relaxed text-ink/65">
            You&apos;ve finished your first passage. Create an account to open the rest of the
            shelf. No card needed for the free week. Your level and saved words come with you.
          </p>
          <div className="mt-8">
            <AuthPanel
              me={me}
              layout="dialog"
              onRefresh={() => {
                refresh();
                router.refresh();
              }}
            />
          </div>
        </>
      ) : (
        <>
          <h1 className="t-heading mt-4 text-[2rem] text-ink">Your free week is over.</h1>
          <p className="mt-3 max-w-[28rem] text-[1.0625rem] leading-relaxed text-ink/65">
            Subscribe to keep reading. Your level, saved words, and review cards are all still here.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={pricingHref(next)} className="btn-primary px-6">
              See plans
            </Link>
            <Link href="/settings" className="t-quiet">
              Account and exports
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
