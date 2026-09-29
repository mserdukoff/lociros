import { NextResponse } from "next/server";
import { isSupabaseAuth } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Only same-origin paths: `//host` and `/\host` are protocol-relative redirects off-site. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/library";
  if (next.startsWith("//") || next.startsWith("/\\") || next.includes("://")) return "/library";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const dest = safeNext(searchParams.get("next"));

  if (code && isSupabaseAuth()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/library?auth=error`);
}
