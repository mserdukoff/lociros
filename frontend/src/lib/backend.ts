export function backendUrl(): string {
  return (process.env.NLP_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
}

export const PROXY_HEADER = "x-lociros-proxy";
export const CLIENT_IP_HEADER = "x-client-ip";

/**
 * Every API call leaves from Vercel's shared addresses, so the API would rate
 * limit all visitors as one. Vercel sets x-real-ip / x-forwarded-for to the
 * visitor; PROXY_SECRET lets the API trust what we pass on.
 */
export function clientIpHeaders(incoming: Headers): Record<string, string> {
  const secret = process.env.PROXY_SECRET;
  if (!secret) return {};
  const ip =
    incoming.get("x-real-ip")?.trim() ||
    incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return {};
  return { [PROXY_HEADER]: secret, [CLIENT_IP_HEADER]: ip };
}
