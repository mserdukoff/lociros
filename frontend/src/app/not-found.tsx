import Link from "next/link";
import { Art } from "@/components/landing/art";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-24">
      <Art src="ruins-landscape" className="mb-8 w-full" />
      <p className="t-eyebrow">Lociros</p>
      <h1 className="t-heading mt-4 text-[2rem] text-ink">Nothing here</h1>
      <p className="mt-3 text-ink/60">
        That page or passage was not found. Pick another passage from the shelf.
      </p>
      <Link href="/library" className="btn-primary mt-8 self-start px-6">
        Back to the library
      </Link>
    </main>
  );
}
