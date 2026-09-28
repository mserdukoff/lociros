"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOut({ className = "t-quiet" }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          await createClient().auth.signOut();
          router.refresh();
        })
      }
    >
      Sign out
    </button>
  );
}

export function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="t-quiet" onClick={() => start(() => router.refresh())}>
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
