"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Art } from "@/components/landing/art";
import { fetchMe } from "@/lib/api";
import { safeNext } from "@/lib/plans";

const POLL_MS = 1500;
const GIVE_UP_MS = 30_000;

/** Stripe redirects here before its webhook may have landed, so wait for it. */
export function BillingSuccess() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [state, setState] = useState<"waiting" | "done" | "slow">("waiting");

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    async function tick() {
      while (!stopped) {
        try {
          const me = await fetchMe();
          if (me.entitlement?.status === "active" && me.entitlement.has_customer) {
            setState("done");
            return;
          }
        } catch {
          /* keep waiting */
        }
        if (Date.now() - started > GIVE_UP_MS) {
          setState("slow");
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }
    void tick();
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-24">
      <Art src="ruins-landscape" className="mb-8 w-full" />
      <p className="t-eyebrow">Lociros</p>
      <h1 className="t-heading mt-4 text-[2rem] text-ink" aria-live="polite">
        {state === "done"
          ? "You're subscribed."
          : state === "slow"
            ? "Payment received."
            : "Confirming your payment…"}
      </h1>
      <p className="mt-3 text-ink/60">
        {state === "done"
          ? "The whole shelf is open. A receipt is on its way from Stripe."
          : state === "slow"
            ? "Stripe is still confirming. It usually takes a few seconds; your shelf opens as soon as it does."
            : "This takes a few seconds."}
      </p>
      {state !== "waiting" ? (
        <Link href={next} className="btn-primary mt-8 self-start px-6">
          Keep reading
        </Link>
      ) : null}
    </main>
  );
}
