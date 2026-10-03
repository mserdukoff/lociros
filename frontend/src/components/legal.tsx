import Link from "next/link";
import { Art } from "@/components/landing/art";
import { LEGAL_UPDATED } from "@/lib/contact";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-[42rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <Link href="/" className="t-quiet">
        ← Lociros
      </Link>
      <Art src="hills-strip" className="-mb-4 ml-auto mt-2 w-[18rem] opacity-80" />
      <h1 className="t-heading mt-10 text-[2rem] text-ink">{title}</h1>
      <p className="mt-2 text-[13px] text-ink/45">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-8 flex max-w-[34rem] flex-col gap-5 text-[1.0625rem] leading-[1.65] text-ink/80">
        {children}
      </div>
    </main>
  );
}

export function LegalHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-6 scroll-mt-8 font-display text-[1.25rem] text-ink">
      {children}
    </h2>
  );
}

export function Mail({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="underline decoration-ink/25 underline-offset-2">
      {address}
    </a>
  );
}
