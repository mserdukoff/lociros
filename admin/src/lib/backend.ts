import type { AdminOverview } from "@/lib/types";

export function backendUrl(): string {
  return (process.env.NLP_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
}

export type OverviewResult =
  | { ok: true; data: AdminOverview }
  | { ok: false; status: number; message: string };

/** Server only: the access token never reaches the browser. */
export async function fetchOverview(token: string): Promise<OverviewResult> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, message: `The API at ${backendUrl()} did not answer.` };
  }
  if (res.ok) return { ok: true, data: (await res.json()) as AdminOverview };
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: res.status,
      message: "The API refused this account. Add it to ADMIN_EMAILS on the FastAPI host.",
    };
  }
  return { ok: false, status: res.status, message: `The API answered ${res.status}.` };
}
