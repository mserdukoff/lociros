import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const isVercel = process.env.VERCEL === "1";
const isDemo = process.env.NEXT_PUBLIC_DEMO === "1";

if (isVercel && !isDemo && !process.env.NLP_BACKEND_URL) {
  console.warn(
    "NLP_BACKEND_URL is unset. Passage SSR and /api proxy will 502 until you set it to the public FastAPI origin.",
  );
}

const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Next injects inline bootstrap scripts and the layout registers the service
// worker inline, so script-src needs 'unsafe-inline' until we move to nonces.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  [
    "connect-src 'self'",
    supabaseOrigin,
    supabaseOrigin.replace(/^https:/, "wss:"),
    "https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
    isDev ? "ws: http://127.0.0.1:* http://localhost:*" : "",
  ]
    .filter(Boolean)
    .join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Docker uses standalone. Vercel’s Next.js builder does not.
  ...(isVercel ? {} : { output: "standalone" as const }),
  outputFileTracingRoot: frontendDir,
  env: {
    NEXT_PUBLIC_DEMO: process.env.NEXT_PUBLIC_DEMO ?? "",
  },
  turbopack: { root: frontendDir },
  // The dev server blocks JS-chunk requests whose Origin doesn't match an
  // allowed host, as a DNS-rebinding guard — "localhost" is allowed by
  // default but the numeric loopback address is not. Visiting the app at
  // http://127.0.0.1:3000 then silently loses all client-side JS (fetches,
  // clicks, state) while the initial HTML still looks fine, which reads
  // exactly like "I saved something and it didn't show up."
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
