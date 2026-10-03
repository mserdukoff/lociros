"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { Art } from "@/components/landing/art";
import { fetchMe, startCheckout, track, type Plan } from "@/lib/api";
import { INCLUDED, PLANS, TRIAL_DAYS, safeNext } from "@/lib/plans";
import type { MeResponse } from "@/lib/types";

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Do I need a card for the free week?",
    a: `No. Create an account and the whole shelf is open for ${TRIAL_DAYS} days. If you subscribe during the free week, the first charge waits until the week is over.`,
  },
  {
    q: "How do I cancel?",
    a: "From Settings, choose Manage billing. You keep access until the end of the period you paid for, and you are not charged again.",
  },
  {
    q: "What happens to my words if I stop?",
    a: "They stay on your account. You can export them to CSV or Anki from Settings at any time, subscribed or not.",
  },
  {
    q: "Refunds?",
    a: (
      <>
        Write to us within 14 days of a charge and we refund it in full. The details are in the{" "}
        <Link href="/terms#refunds" className="underline decoration-ink/25 underline-offset-2">
          terms
        </Link>
        .
      </>
    ),
  },
  {
    q: "Taxes",
    a: "Prices exclude sales tax or VAT where it applies. Checkout shows the final amount before you pay.",
  },
];

export function Pricing() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const canceled = params.get("canceled") === "1";
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    track("paywall_view", { where: "pricing" });
  }, [refresh]);

  const ent = me?.entitlement ?? null;
  const status = ent?.status ?? (me?.authenticated ? "trial" : "guest");
  const subscribed = status === "active" && ent?.has_customer;
  const billingReady = ent?.billing_ready !== false;

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await startCheckout(plan, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open checkout.");
      setBusy(false);
    }
  }

  let heading = `Read for ${TRIAL_DAYS} days, free.`;
  let lede =
    "Every passage is written to one band and checked word by word before it reaches the shelf. Create an account to open all of it.";
  if (status === "trial") {
    const days = ent?.trial_days_left ?? TRIAL_DAYS;
    heading = days === 1 ? "One day left in your free week." : `${days} days left in your free week.`;
    lede = `Subscribe now and the first charge waits until ${formatDate(ent?.trial_ends_at) ?? "the week ends"}.`;
  } else if (status === "expired") {
    heading = "Your free week is over.";
    lede = "Subscribe to keep reading. Your level, saved words, and review cards are still here.";
  } else if (status === "grace") {
    heading = "Your last payment didn't go through.";
    lede = "The shelf stays open while Stripe retries. Update your card from Settings to keep it that way.";
  } else if (subscribed) {
    heading = "You're subscribed.";
    lede = ent?.current_period_end
      ? `${ent.cancel_at_period_end ? "Access ends" : "Next renewal"} ${formatDate(ent.current_period_end)}.`
      : "Thanks for reading with Lociros.";
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[44rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <Link href={next} className="t-quiet">
        ← Back
      </Link>
      <Art src="hills-strip" className="-mb-4 ml-auto mt-2 w-[18rem] opacity-80" />
      <p className="t-eyebrow mt-10">Lociros · Plans</p>
      <h1 className="t-heading mt-4 text-[2rem] text-ink sm:text-[2.5rem]">
        {loaded ? heading : "One moment…"}
      </h1>
      <p className="mt-3 max-w-[32rem] text-[1.0625rem] leading-relaxed text-ink/65">{lede}</p>

      {canceled ? (
        <p role="status" className="mt-6 rounded-card bg-sage-wash px-4 py-3 text-sm text-ink/75">
          Checkout was closed. Nothing was charged.
        </p>
      ) : null}

      {loaded && status === "guest" ? (
        <div className="sheet mt-10 max-w-[26rem] px-6 py-6">
          <AuthPanel
            me={me}
            layout="dialog"
            onRefresh={refresh}
            onSignedIn={() => router.push(next)}
          />
        </div>
      ) : null}

      {loaded && status !== "guest" && !subscribed ? (
        <section className="mt-10 flex flex-col gap-5" aria-label="Plans">
          <div role="radiogroup" aria-label="Plan" className="grid gap-4 sm:grid-cols-2">
            {PLANS.map((p) => {
              const active = p.id === plan;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPlan(p.id)}
                  className={`sheet flex flex-col items-start px-6 py-5 text-left transition-colors ${
                    active ? "ring-2 ring-ink" : "hover:bg-paper-raised"
                  }`}
                >
                  <span className="t-eyebrow">{p.label}</span>
                  <span className="tnum mt-3 font-display text-[2rem] leading-none text-ink">
                    {p.price}
                  </span>
                  <span className="mt-1 text-sm text-ink/55">{p.per}</span>
                  <span className="mt-3 text-[13px] text-ink/50">{p.note}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={() => void checkout()}
              disabled={busy || !billingReady}
              className="btn-primary h-11 px-6 text-[15px]"
            >
              {busy ? "Opening checkout…" : "Continue to checkout"}
            </button>
            <p className="text-[13px] text-ink/45">
              {billingReady ? "Secure payment by Stripe." : "Subscriptions open shortly."}
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-terracotta">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {subscribed ? (
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href={next} className="btn-primary px-6">
            Keep reading
          </Link>
          <Link href="/settings" className="t-quiet">
            Manage billing
          </Link>
        </div>
      ) : null}

      <section className="mt-14 flex flex-col gap-3">
        <p className="t-eyebrow">What you get</p>
        <ul className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink/75">
          {INCLUDED.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden="true" className="text-sage">
                ·
              </span>
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 flex flex-col gap-3">
        <p className="t-eyebrow">Questions</p>
        <dl className="sheet flex flex-col divide-y divide-rule/70">
          {FAQ.map((item) => (
            <div key={item.q} className="px-6 py-4">
              <dt className="font-display text-[1.0625rem] text-ink">{item.q}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-ink/65">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
