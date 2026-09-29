"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { Segmented } from "@/components/segmented";
import { choosePlacement } from "@/lib/api";
import { saveLanguage } from "@/lib/device";
import type { CefrLevel, LangCode } from "@/lib/types";
import { LANGUAGES, LEVELS, readingFont } from "@/lib/types";

type Path = "place" | "known" | "new";

const PATHS: { id: Path; title: string; body: string }[] = [
  {
    id: "place",
    title: "Place me with a short read",
    body: "About two minutes. Read one passage, answer four questions, and Lociros sets your level.",
  },
  {
    id: "known",
    title: "I know my level",
    body: "Pick A1 to B2 and go straight to a passage.",
  },
  {
    id: "new",
    title: "I'm just starting",
    body: "Begin at A1 with the simplest texts.",
  },
];

function Choice({
  selected,
  onSelect,
  autofocus = false,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  autofocus?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-autofocus={autofocus || undefined}
      onClick={onSelect}
      className={`w-full rounded-card border px-4 py-3 text-left transition-colors ${
        selected ? "border-ink bg-paper text-ink" : "border-rule bg-paper-raised text-ink hover:border-ink/30"
      }`}
    >
      {children}
    </button>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3">
      <span className="t-eyebrow">Step {step} of 2</span>
      <span aria-hidden="true" className="flex gap-1">
        <span className="h-1 w-5 rounded-full bg-ink" />
        <span className={`h-1 w-5 rounded-full ${step === 2 ? "bg-ink" : "bg-rule"}`} />
      </span>
    </div>
  );
}

export function OnboardingDialog({
  open,
  onClose,
  initialLanguage,
  languages = LANGUAGES,
  onSignIn,
}: {
  open: boolean;
  onClose: () => void;
  initialLanguage: LangCode;
  languages?: typeof LANGUAGES;
  onSignIn?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} label="Get started" width="27rem">
      <Onboarding
        initialLanguage={languages.some((l) => l.id === initialLanguage) ? initialLanguage : languages[0].id}
        languages={languages}
        onSignIn={onSignIn}
      />
    </Modal>
  );
}

function Onboarding({
  initialLanguage,
  languages,
  onSignIn,
}: {
  initialLanguage: LangCode;
  languages: typeof LANGUAGES;
  onSignIn?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [language, setLanguage] = useState<LangCode>(initialLanguage);
  const [path, setPath] = useState<Path>("place");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = languages.find((l) => l.id === language)?.label ?? "the language";

  async function finish() {
    setError(null);
    saveLanguage(language);
    if (path === "place") {
      router.push(`/placement?language=${language}`);
      return;
    }
    setBusy(true);
    try {
      const result = await choosePlacement(language, path === "new" ? "A1" : level);
      router.push(result.next_id ? `/passage/${result.next_id}` : "/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your level. Try again.");
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <div className="flex flex-col">
        <Steps step={1} />
        <h2 className="mt-3 pr-14 font-display text-[1.35rem] text-ink">Which language will you read?</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/55">
          Each language keeps its own level. You can add another later.
        </p>
        <div role="radiogroup" aria-label="Language" className="mt-5 flex flex-col gap-2">
          {languages.map((l) => (
            <Choice
              key={l.id}
              selected={language === l.id}
              autofocus={l.id === initialLanguage}
              onSelect={() => setLanguage(l.id)}
            >
              <span className="flex items-baseline justify-between">
                <span className="text-[15px]">{l.label}</span>
                <span
                  dir={l.id === "ar" ? "rtl" : undefined}
                  className={`text-[15px] text-ink/50 ${readingFont(l.id)}`}
                >
                  {l.native}
                </span>
              </span>
            </Choice>
          ))}
        </div>
        <button type="button" onClick={() => setStep(2)} className="btn-primary mt-6 h-11 w-full text-[15px]">
          Continue
        </button>
        {onSignIn ? (
          <button type="button" onClick={onSignIn} className="t-quiet mt-4 self-start text-sm">
            Already have an account? Sign in
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Steps step={2} />
      <h2 className="mt-3 pr-14 font-display text-[1.35rem] text-ink">Where should your {name} start?</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/55">
        Your level moves as you read: three too-easy or too-hard ratings in a row shift it one step.
      </p>
      <div role="radiogroup" aria-label="Starting point" className="mt-5 flex flex-col gap-2">
        {PATHS.map((p) => (
          <Choice key={p.id} selected={path === p.id} onSelect={() => setPath(p.id)}>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[15px]">{p.title}</span>
              {p.id === "place" ? <span className="t-eyebrow shrink-0">Recommended</span> : null}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-ink/55">{p.body}</span>
          </Choice>
        ))}
      </div>
      {path === "known" ? (
        <div className="mt-4">
          <Segmented ariaLabel="Level" options={LEVELS} value={level} onChange={setLevel} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void finish()}
        disabled={busy}
        className="btn-primary mt-6 h-11 w-full text-[15px]"
      >
        {busy ? "One moment…" : path === "place" ? "Start the placement read" : "Start reading"}
      </button>
      <button
        type="button"
        onClick={() => setStep(1)}
        disabled={busy}
        className="t-quiet mt-4 self-start text-sm"
      >
        ← Back
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] leading-relaxed text-terracotta">
          {error}
        </p>
      ) : null}
    </div>
  );
}
