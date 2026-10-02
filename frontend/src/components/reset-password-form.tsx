"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseAuth } from "@/lib/supabase/env";

const MIN_PASSWORD = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const [session, setSession] = useState<"checking" | "ok" | "missing">(() =>
    isSupabaseAuth() ? "checking" : "missing",
  );
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseAuth()) return;
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        setEmail(data.user?.email ?? null);
        setSession(data.user ? "ok" : "missing");
      })
      .catch(() => setSession("missing"));
  }, []);

  async function submit() {
    setMessage(null);
    if (password.length < MIN_PASSWORD) {
      setMessage(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      router.push("/library");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not update the password.";
      setMessage(
        text.toLowerCase().includes("different from the old")
          ? "Pick a password you haven't used here before."
          : text,
      );
      setBusy(false);
    }
  }

  if (session === "checking") {
    return <p className="mt-8 text-sm text-ink/45">One moment…</p>;
  }

  if (session === "missing") {
    return (
      <div className="mt-8 flex max-w-[24rem] flex-col gap-4 text-[15px] leading-relaxed text-ink/65">
        <p>This reset link has expired or was already used.</p>
        <p>
          Go back to Lociros, choose <span className="text-ink">Sign in</span>, then{" "}
          <span className="text-ink">Forgot password?</span> to get a new one.
        </p>
        <Link href="/" className="btn-primary mt-2 h-11 self-start px-6 text-[15px]">
          Back to Lociros
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mt-8 flex max-w-[22rem] flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {email ? <p className="text-sm text-ink/55">For {email}</p> : null}
      <div className="relative mt-2">
        <input
          type={reveal ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
          aria-describedby="new-password-hint"
          autoComplete="new-password"
          autoFocus
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
      <p id="new-password-hint" className="-mt-1 text-[12px] text-ink/45">
        At least {MIN_PASSWORD} characters.
      </p>
      <button type="submit" disabled={busy} className="btn-primary mt-1 h-11 w-full text-[15px]">
        {busy ? "One moment…" : "Save password"}
      </button>
      {message ? (
        <p role="alert" className="mt-1 text-[13px] leading-relaxed text-terracotta">
          {message}
        </p>
      ) : null}
    </form>
  );
}
