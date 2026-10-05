import { cookies, headers } from "next/headers";
import { clientIpHeaders } from "./backend";
import { DEVICE_COOKIE } from "./device-cookie";
import { accessToken } from "./supabase/server";

/** Who is asking, for server components that call the API directly. */
export async function identityHeaders(): Promise<Record<string, string>> {
  const out: Record<string, string> = clientIpHeaders(await headers());
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (device && /^[A-Za-z0-9_-]{8,64}$/.test(device)) {
    out["X-Device-Id"] = device;
  }
  const token = await accessToken().catch(() => null);
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}
