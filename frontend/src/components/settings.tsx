"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthPanel, signOutAccount } from "@/components/auth-panel";
import {
  deleteAccount,
  exportAccount,
  fetchMe,
  openBillingPortal,
  pricingHref,
  updateProfile,
} from "@/lib/api";
import {
  loadFadeKnown,
  loadFurigana,
  loadGrammarColors,
  saveFadeKnown,
  saveFurigana,
  saveGrammarColors,
} from "@/lib/device";
import { CONTACT_EMAIL } from "@/lib/contact";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuth } from "@/lib/supabase/env";
import type { Entitlement, MeResponse } from "@/lib/types";

const MIN_PASSWORD = 8;

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex scroll-mt-8 flex-col gap-3">
      <p className="t-eyebrow">{title}</p>
      <div className="sheet flex flex-col gap-4 px-6 py-5">{children}</div>
    </section>
  );
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function planLine(ent: Entitlement | null | undefined): string {
  if (!ent) return "";
  const plan = ent.plan === "annual" ? "Annual" : ent.plan === "monthly" ? "Monthly" : "Subscription";
  switch (ent.status) {
    case "trial":
      return `Free week. ${ent.trial_days_left ?? 0} ${ent.trial_days_left === 1 ? "day" : "days"} left, until ${formatDate(ent.trial_ends_at)}.`;
    case "active":
      if (!ent.has_customer) return "Full access.";
      return ent.cancel_at_period_end
        ? `${plan}. Cancelled; access ends ${formatDate(ent.current_period_end)}.`
        : `${plan}. Renews ${formatDate(ent.current_period_end)}.`;
    case "grace":
      return `${plan}. The last payment failed; Stripe will retry. Update your card to keep access.`;
    case "expired":
      return "The free week is over. Subscribe to keep reading.";
    default:
      return "";
  }
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6">
      <span>
        <span className="block text-[15px] text-ink">{label}</span>
        <span className="mt-0.5 block text-[13px] text-ink/50">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--ink)]"
      />
    </label>
  );
}

function Preferences() {
  const [grammar, setGrammar] = useState(false);
  const [furigana, setFurigana] = useState(false);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    // localStorage only exists after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrammar(loadGrammarColors());
    setFurigana(loadFurigana());
    setFade(loadFadeKnown());
  }, []);

  return (
    <Section title="Reading">
      <Toggle
        label="Grammar color"
        hint="Tint particles, verbs, and other roles in the passage."
        on={grammar}
        onChange={(v) => {
          setGrammar(v);
          saveGrammarColors(v);
        }}
      />
      <Toggle
        label="Furigana"
        hint="Show readings over kanji in Japanese passages."
        on={furigana}
        onChange={(v) => {
          setFurigana(v);
          saveFurigana(v);
        }}
      />
      <Toggle
        label="Fade known words"
        hint="Words you've met before are set lighter, so new ones stand out."
        on={fade}
        onChange={(v) => {
          setFade(v);
          saveFadeKnown(v);
        }}
      />
      <p className="text-[12px] text-ink/40">These are kept on this browser.</p>
    </Section>
  );
}

function Profile({ me, onSaved }: { me: MeResponse; onSaved: (me: MeResponse) => void }) {
  const [name, setName] = useState(me.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await updateProfile(name.trim()));
      setMessage("Saved.");
    } catch (err) {
      setMessage(errorText(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Account">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink/50">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            className="field-line text-[15px]!"
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={busy || !name.trim() || name.trim() === me.display_name}
            className="btn-primary h-10 px-5 text-sm"
          >
            {busy ? "Saving…" : "Save name"}
          </button>
          {message ? <span className="text-[13px] text-ink/55">{message}</span> : null}
        </div>
      </form>
      <div className="flex flex-col gap-1 border-t border-rule/70 pt-4">
        <span className="text-[13px] text-ink/50">Email</span>
        <span className="text-[15px] text-ink">{me.email}</span>
      </div>
      <PasswordForm />
    </Section>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!isSupabaseAuth()) return null;

  async function save() {
    if (password.length < MIN_PASSWORD) {
      setMessage(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setMessage("Password changed.");
    } catch (err) {
      setMessage(errorText(err, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-rule/70 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-ink/50">New password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="field-line text-[15px]!"
        />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy || !password} className="btn-primary h-10 px-5 text-sm">
          {busy ? "Saving…" : "Change password"}
        </button>
        {message ? <span className="text-[13px] text-ink/55">{message}</span> : null}
      </div>
    </form>
  );
}

function Billing({ me }: { me: MeResponse }) {
  const ent = me.entitlement;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ent?.paywall && !ent?.has_customer) return null;

  async function portal() {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await openBillingPortal());
    } catch (err) {
      setError(errorText(err, "Could not open billing."));
      setBusy(false);
    }
  }

  return (
    <Section title="Plan" id="plan">
      <p className="text-[15px] leading-relaxed text-ink/80">{planLine(ent)}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {ent?.has_customer ? (
          <button
            type="button"
            onClick={() => void portal()}
            disabled={busy}
            className="btn-primary h-10 px-5 text-sm"
          >
            {busy ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
        {ent?.status !== "active" || !ent?.has_customer ? (
          <Link href={pricingHref("/library")} className="t-quiet text-ink">
            See plans →
          </Link>
        ) : null}
      </div>
      {ent?.has_customer ? (
        <p className="text-[12px] text-ink/40">
          Change plan, update your card, download invoices, or cancel on Stripe.
        </p>
      ) : null}
      {error ? <p className="text-[13px] text-terracotta">{error}</p> : null}
    </Section>
  );
}

function DataSection({ me }: { me: MeResponse }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Your data">
      <p className="text-[15px] leading-relaxed text-ink/70">
        Download everything Lociros keeps about {me.authenticated ? "your account" : "this browser"}:
        levels, saved words, review cards, reading history, and ratings, as one JSON file. Saved
        words also export to CSV or Anki from the{" "}
        <Link href="/library#words" className="underline decoration-ink/25 underline-offset-2">
          library
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          setError(null);
          exportAccount().catch((err: unknown) => setError(errorText(err, "Export failed.")));
        }}
        className="t-quiet self-start text-ink underline decoration-ink/25 underline-offset-4"
      >
        Download my data
      </button>
      {error ? <p className="text-[13px] text-terracotta">{error}</p> : null}
    </Section>
  );
}

function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const confirmed = confirm.trim().toLowerCase() === "delete";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await signOutAccount().catch(() => undefined);
      router.push("/?deleted=1");
    } catch (err) {
      setError(errorText(err, "Could not delete the account."));
      setBusy(false);
    }
  }

  return (
    <Section title="Delete account">
      <p className="text-[15px] leading-relaxed text-ink/70">
        Removes your account, sign-in, level, saved words, review cards, and reading history. Any
        subscription is cancelled at once and not charged again. This cannot be undone.
      </p>
      {open ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmed) void remove();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-ink/50">Type “delete” to confirm</span>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="field-line text-[15px]!"
            />
          </label>
          <div className="flex items-center gap-5">
            <button
              type="submit"
              disabled={busy || !confirmed}
              className="h-10 rounded-full bg-terracotta px-5 text-sm text-paper transition-opacity disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="t-quiet">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="t-quiet self-start text-terracotta underline decoration-terracotta/30 underline-offset-4"
        >
          Delete account…
        </button>
      )}
      {error ? <p className="text-[13px] text-terracotta">{error}</p> : null}
    </Section>
  );
}

export function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-10">
      <header>
        <Link href="/library" className="t-quiet">
          ← Library
        </Link>
        <p className="t-eyebrow mt-10">Lociros</p>
        <h1 className="t-heading mt-4 text-[2rem] text-ink sm:text-[2.5rem]">Settings</h1>
      </header>

      {!loaded ? <p className="text-ink/45">One moment…</p> : null}

      {loaded && me && !me.authenticated ? (
        <Section title="Account">
          <AuthPanel me={me} layout="dialog" onRefresh={refresh} />
        </Section>
      ) : null}

      {me?.authenticated ? <Profile me={me} onSaved={setMe} /> : null}
      {me?.authenticated ? <Billing me={me} /> : null}
      {loaded ? <Preferences /> : null}
      {me ? <DataSection me={me} /> : null}

      {me?.authenticated ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              void signOutAccount().then(() => {
                refresh();
                router.refresh();
              });
            }}
            className="t-quiet self-start"
          >
            Sign out
          </button>
        </section>
      ) : null}

      {me?.authenticated ? <DangerZone /> : null}

      <p className="text-[13px] text-ink/45">
        Questions about your account or a charge? Write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-ink/25 underline-offset-2">
          {CONTACT_EMAIL}
        </a>
        . See also the <Link href="/privacy" className="underline decoration-ink/25 underline-offset-2">privacy notice</Link> and{" "}
        <Link href="/terms" className="underline decoration-ink/25 underline-offset-2">terms</Link>.
      </p>
    </div>
  );
}
