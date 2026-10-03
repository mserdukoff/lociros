"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Art } from "@/components/landing/art";
import { CONTACT_EMAIL } from "@/lib/contact";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-24">
      <Art src="ruins-landscape" className="mb-8 w-full" />
      <p className="t-eyebrow">Lociros</p>
      <h1 className="t-heading mt-4 text-[2rem] text-ink">Something broke</h1>
      <p className="mt-3 text-ink/60">
        This page hit an error. Your saved words and progress are fine. Try again, or go back to the
        library.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => retry()} className="btn-primary px-6">
          Try again
        </button>
        <Link href="/library" className="t-quiet underline decoration-ink/20 underline-offset-4">
          Back to the library
        </Link>
      </div>
      <p className="t-quiet mt-10 text-[0.8125rem]">
        Still broken? Write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
          {CONTACT_EMAIL}
        </a>
        {error.digest ? ` and mention ${error.digest}.` : "."}
      </p>
    </main>
  );
}
