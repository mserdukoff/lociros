"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Segmented } from "@/components/segmented";
import { ADMIN_URL } from "@/lib/admin-url";
import { logout } from "@/lib/api";
import { saveAccountPrompt } from "@/lib/device";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuth } from "@/lib/supabase/env";
import type { MeResponse } from "@/lib/types";

export async function signOutAccount() {
  if (isSupabaseAuth()) {
    await createClient().auth.signOut();
  }
  await logout();
}

const MIN_PASSWORD = 8;

function authError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Something went wrong.";
  const text = raw.toLowerCase();
  if (text.includes("invalid login")) return "That email and password don't match.";
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "That email already has an account. Sign in instead.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirm your email first. The link is in your inbox.";
  }
  if (text.includes("password should") || text.includes("weak password")) {
    return `Use a longer password, at least ${MIN_PASSWORD} characters.`;
  }
  if (text.includes("invalid email") || text.includes("unable to validate email")) {
    return "That email address doesn't look right.";
  }
  if (text.includes("rate limit") || text.includes("security purposes") || text.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  if (text.includes("failed to fetch") || text.includes("network")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return raw;
}

type Mode = "signup" | "signin";

const MODES: { id: Mode; label: string }[] = [
  { id: "signin", label: "Sign in" },
  { id: "signup", label: "Create account" },
];

/**
 * `hero` is the landing page sheet, `shelf` a collapsed row on the library,
 * `inline` the offer under a reader's first rating, `dialog` the sign-in popup.
 */
export function AuthPanel({
  me,
  onRefresh,
  nextPath = "/library",
  layout = "shelf",
  redirectOnSuccess = false,
  initialMode = "signup",
  onSignedIn,
  onCancel,
}: {
  me: MeResponse | null;
  onRefresh: () => void;
  nextPath?: string;
  layout?: "shelf" | "hero" | "inline" | "dialog";
  redirectOnSuccess?: boolean;
  initialMode?: Mode;
  onSignedIn?: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [open, setOpen] = useState(layout !== "shelf");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
    setNotice(null);
  }

  async function signOut() {
    await signOutAccount();
    onRefresh();
  }

  if (me?.authenticated) {
    if (layout === "inline" || layout === "dialog") return null;
    if (layout === "hero") {
      return (
        <div id="account" className="mt-10 max-w-[22rem]">
          <p className="text-sm text-ink/55">
            Signed in as {me.display_name || me.email}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={nextPath} className="btn-primary">
              Start reading
            </Link>
            {me.admin ? (
              <a href={ADMIN_URL} className="t-quiet">
                Admin
              </a>
            ) : null}
            <button type="button" onClick={() => void signOut()} className="t-quiet">
              Sign out
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-baseline justify-between gap-3 border-y border-rule py-3 text-sm text-ink/60">
        <p className="min-w-0 truncate">{me.display_name || me.email}</p>
        <div className="flex shrink-0 items-baseline gap-4">
          {me.admin ? (
            <a href={ADMIN_URL} className="t-quiet underline decoration-ink/20 underline-offset-4">
              Admin
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            className="t-quiet underline decoration-ink/20 underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (layout === "shelf" && !open) {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-y border-rule py-3 text-sm text-ink/55">
        <p>This shelf is on this browser.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="t-quiet underline decoration-ink/20 underline-offset-4"
        >
          Sign in or create an account
        </button>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setMessage(null);
    setNotice(null);
    const address = email.trim();
    try {
      if (!isSupabaseAuth()) {
        throw new Error("Accounts aren't available here yet.");
      }
      if (password.length < MIN_PASSWORD) {
        throw new Error(`Use at least ${MIN_PASSWORD} characters for the password.`);
      }
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: address, password });
        if (error) throw error;
        if (!data.session) {
          setMode("signin");
          setNotice(`Check ${address} for a confirmation link, then sign in here.`);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
      }
      saveAccountPrompt("done");
      await onSignedIn?.();
      onRefresh();
      if (redirectOnSuccess) router.push(nextPath);
    } catch (err) {
      setMessage(authError(err));
    } finally {
      setBusy(false);
    }
  }

  const dialog = layout === "dialog";
  const heading =
    layout === "inline"
      ? mode === "signup"
        ? "Keep this shelf"
        : "Sign in"
      : dialog
        ? mode === "signup"
          ? "Create your account"
          : "Welcome back"
        : mode === "signup"
          ? "Create an account"
          : "Sign in";
  const action = mode === "signup" ? "Create account" : "Sign in";
  const lede =
    layout === "inline"
      ? "Email and a password. You stay on this passage."
      : dialog
        ? mode === "signup"
          ? "Your level, saved words, and reading history, on every device. What you've read in this browser comes with you."
          : "Pick up your shelf where you left it."
        : "An email and a password. Progress stays with the account.";
  const wrap =
    layout === "hero"
      ? "mt-10 max-w-[22rem] scroll-mt-10"
      : layout === "inline"
        ? "flex max-w-[22rem] flex-col"
        : layout === "dialog"
          ? "flex flex-col"
          : "flex flex-col gap-3 border-y border-rule py-5";

  return (
    <form
      id={layout === "inline" || layout === "dialog" ? undefined : "account"}
      className={wrap}
      onSubmit={async (e) => {
        e.preventDefault();
        await submit();
      }}
    >
      {layout === "shelf" ? (
        <p className="text-sm text-ink/55">
          {mode === "signup"
            ? "Create an account to keep progress across devices"
            : "Sign in to keep progress across devices"}
          {me?.require_auth ? " and to restock custom texts." : "."}
        </p>
      ) : (
        <>
          <h2 className={`font-display text-[1.35rem] text-ink ${dialog ? "pr-14" : ""}`}>{heading}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/55">{lede}</p>
        </>
      )}
      {dialog ? (
        <div className="mt-5">
          <Segmented
            ariaLabel="Account"
            size="sm"
            options={MODES}
            value={mode}
            onChange={switchMode}
          />
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 rounded-card bg-sage-wash px-3 py-2.5 text-[13px] leading-relaxed text-ink/75">
          {notice}
        </p>
      ) : null}
      <div className={layout === "shelf" ? "flex flex-col gap-3" : "mt-5 flex flex-col gap-3"}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          autoComplete="email"
          data-autofocus={dialog || undefined}
          required
          className="field-line text-sm!"
        />
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Choose a password" : "Password"}
            aria-label="Password"
            aria-describedby={mode === "signup" ? "password-hint" : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            className="field-line w-full pr-14 text-sm!"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-pressed={reveal}
            className="t-quiet absolute right-0 top-1/2 -translate-y-1/2 text-[12px]!"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        {mode === "signup" ? (
          <p id="password-hint" className="-mt-1 text-[12px] text-ink/45">
            At least {MIN_PASSWORD} characters.
          </p>
        ) : null}
        {layout === "inline" ? (
          <div className="mt-2 flex items-center gap-6">
            <button type="submit" disabled={busy} className="btn-primary h-11 px-6 text-[15px]">
              {busy ? "One moment…" : action}
            </button>
            {onCancel ? (
              <button type="button" disabled={busy} onClick={onCancel} className="t-quiet">
                Not now
              </button>
            ) : null}
          </div>
        ) : (
          <button type="submit" disabled={busy} className="btn-primary mt-1 h-11 w-full text-[15px]">
            {busy ? "One moment…" : action}
          </button>
        )}
      </div>
      {dialog ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          className="t-quiet mt-4 self-start text-sm"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      )}
      {message ? (
        <p role="alert" className="mt-3 text-[13px] leading-relaxed text-terracotta">
          {message}
        </p>
      ) : null}
      {dialog && mode === "signup" ? (
        <p className="mt-5 text-[12px] leading-relaxed text-ink/45">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline decoration-ink/25 underline-offset-2 hover:text-ink">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline decoration-ink/25 underline-offset-2 hover:text-ink">
            privacy notice
          </Link>
          .
        </p>
      ) : null}
    </form>
  );
}
