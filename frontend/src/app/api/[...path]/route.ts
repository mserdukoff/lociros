import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { accessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "authorization",
]);

/** Backend routes the public app never calls. Operator routes are served only to admin.lociros.com; legacy auth is Supabase now. */
const BLOCKED = [/^admin(\/|$)/, /^trial(\/|$)/, /^auth\/google/, /^auth\/magic/];

async function proxy(req: NextRequest, path: string[]) {
  const route = path.join("/");
  if (BLOCKED.some((pattern) => pattern.test(route))) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  const dest = `${backendUrl()}/api/${route}${new URL(req.url).search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  const token = await accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = req.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(dest, {
      method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP.has(lower) || lower === "set-cookie") return;
    outHeaders.append(key, value);
  });

  const out = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
  const cookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  for (const cookie of cookies) {
    out.headers.append("set-cookie", cookie);
  }
  return out;
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
