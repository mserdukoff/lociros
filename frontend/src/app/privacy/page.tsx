import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/landing/art";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-[42rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <Link href="/" className="t-quiet">
        ← Lociros
      </Link>
      <Art src="hills-strip" className="-mb-4 ml-auto mt-2 w-[18rem] opacity-80" />
      <h1 className="t-heading mt-10 text-[2rem] text-ink">Privacy</h1>
      <div className="mt-8 flex max-w-[34rem] flex-col gap-5 text-[1.0625rem] leading-[1.65] text-ink/80">
        <p>
          This browser keeps a random device id, the language you last chose, and whether grammar
          color, furigana, and fading known words are on.
        </p>
        <p>
          You can read without an account. Lociros stores your progress on its server under that
          device id: your level, the passages you have read and rated, the words you tap and save,
          your review cards, and simple usage events such as opening the landing page or finishing
          a placement read.
        </p>
        <p>
          If you create an account, your email and password are handled by Supabase, our sign-in
          provider. When you first sign in, the progress kept under this browser&apos;s device id
          moves onto the account so it follows you to other browsers.
        </p>
        <p>
          When you ask for a custom passage, the topic you type is sent to a language model through
          OpenRouter to write it. Spoken audio is made with Azure Speech. Neither receives your
          email.
        </p>
        <p>
          Signing out leaves your account data in place. When an account is deleted, the account
          and the reading progress stored with it are removed.
        </p>
      </div>
    </main>
  );
}
