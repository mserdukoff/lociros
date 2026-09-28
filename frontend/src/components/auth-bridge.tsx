"use client";

import { useEffect } from "react";
import { track } from "@/lib/api";
import { isDemo } from "@/lib/demo";
import { claimSessionDay, deviceHeaders } from "@/lib/device";
import { isSupabaseAuth } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

/**
 * Mounted once in the root layout. Records one session per UTC day for the
 * return metrics, and after Supabase sign-in attaches this browser's guest
 * progress to the account.
 */
export function AuthBridge() {
  useEffect(() => {
    if (!isDemo() && claimSessionDay()) track("session_start");
  }, []);

  useEffect(() => {
    if (isDemo() || !isSupabaseAuth()) return;
    const supabase = createClient();

    async function attach() {
      await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        headers: deviceHeaders(true),
        body: "{}",
      }).catch(() => undefined);
    }

    void supabase.auth.getClaims().then(({ data }) => {
      if (data?.claims) void attach();
    });

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void attach();
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
