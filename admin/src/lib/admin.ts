import { connection } from "next/server";
import { cache } from "react";
import { isSupabaseAuth } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || "m.serdukoff@gmail.com").trim().toLowerCase();
}

export type Viewer =
  | { state: "unconfigured" }
  | { state: "signed-out" }
  | { state: "denied"; email: string }
  | { state: "admin"; email: string; token: string };

/**
 * Who is looking at the dashboard. `getUser()` asks Supabase Auth to verify
 * the session, so a forged or stale cookie cannot pass as the admin.
 */
export const viewer = cache(async (): Promise<Viewer> => {
  await connection();
  if (!isSupabaseAuth()) return { state: "unconfigured" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase();
  if (error || !data.user || !email) return { state: "signed-out" };
  if (email !== adminEmail()) return { state: "denied", email };
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { state: "signed-out" };
  return { state: "admin", email, token };
});
