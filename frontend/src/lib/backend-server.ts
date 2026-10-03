import { cookies } from "next/headers";
import { DEVICE_COOKIE } from "./device-cookie";
import { accessToken } from "./supabase/server";

/** Who is asking, for server components that call the API directly. */
export async function identityHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (device && /^[A-Za-z0-9_-]{8,64}$/.test(device)) {
    headers["X-Device-Id"] = device;
  }
  const token = await accessToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
