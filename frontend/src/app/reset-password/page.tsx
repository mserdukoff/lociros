import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-[36rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <Link href="/" className="t-quiet">
        ← Lociros
      </Link>
      <h1 className="t-heading mt-12 text-[2rem] text-ink">Choose a new password</h1>
      <ResetPasswordForm />
    </main>
  );
}
