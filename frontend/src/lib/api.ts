import { isDemo } from "./demo";
import * as demoApi from "./demo-api";
import { deviceHeaders } from "./device";
import type {
  AdminOverview,
  CefrLevel,
  FeedbackRating,
  FeedbackResult,
  LangCode,
  LibraryResponse,
  MeResponse,
  Passage,
  PassageStats,
  ReviewCard,
  StarredWord,
  GenerateJobResponse,
  PlacementRead,
  PlacementResult,
} from "./types";

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(" ");
    }
    return JSON.stringify(data);
  } catch {
    return res.statusText;
  }
}

function opts(init: RequestInit = {}, json = false): RequestInit {
  return {
    credentials: "include",
    ...init,
    headers: {
      ...deviceHeaders(json),
      ...(init.headers ?? {}),
    },
  };
}

export async function fetchMe(): Promise<MeResponse> {
  if (isDemo()) return demoApi.fetchMe();
  const res = await fetch("/api/me", opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function requestMagicLink(email: string): Promise<{ ok: boolean; link?: string }> {
  if (isDemo()) return demoApi.requestMagicLink(email);
  const res = await fetch("/api/auth/magic", opts({
    method: "POST",
    body: JSON.stringify({ email }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

/** Move this browser's guest progress onto the signed-in account. */
export async function attachGuest(): Promise<void> {
  if (isDemo()) return;
  await fetch("/api/auth/session", opts({ method: "POST", body: "{}" }, true)).catch(() => undefined);
}

export async function logout(): Promise<void> {
  if (isDemo()) return demoApi.logout();
  await fetch("/api/auth/logout", opts({ method: "POST" }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollGenerateJob(jobId: string): Promise<Passage> {
  for (;;) {
    await sleep(1500);
    const res = await fetch(`/api/generate/${jobId}`, opts({ cache: "no-store" }));
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    const job: GenerateJobResponse = await res.json();
    if (job.status === "completed" && job.passage) {
      return job.passage;
    }
    if (job.status === "failed") {
      throw new Error(job.error ?? "Generation failed.");
    }
  }
}

export async function generatePassage(body: {
  level: CefrLevel;
  topic: string;
  genre?: string | null;
  language: LangCode;
}): Promise<Passage> {
  if (isDemo()) return demoApi.generatePassage(body);
  const res = await fetch("/api/generate", opts({
    method: "POST",
    body: JSON.stringify({
      level: body.level,
      topic: body.topic,
      genre: body.genre || null,
      language: body.language,
    }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  if (res.status === 202) {
    const job: GenerateJobResponse = await res.json();
    return pollGenerateJob(job.job_id);
  }
  return res.json();
}

export async function fetchShelfCounts(): Promise<Partial<Record<LangCode, number>>> {
  if (isDemo()) return demoApi.fetchShelfCounts();
  const res = await fetch("/api/shelf/counts", opts());
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const data = (await res.json()) as { counts: Partial<Record<LangCode, number>> };
  return data.counts;
}

export async function fetchLibrary(
  language: LangCode,
  signal?: AbortSignal,
): Promise<LibraryResponse> {
  if (isDemo()) return demoApi.fetchLibrary(language, signal);
  const res = await fetch(`/api/library?language=${language}`, opts({
    cache: "no-store",
    signal,
  }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function fetchPassage(id: string): Promise<Passage> {
  if (isDemo()) return demoApi.fetchPassage(id);
  const res = await fetch(`/api/passages/${id}`, opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function fetchTranslation(id: string): Promise<string> {
  if (isDemo()) return demoApi.fetchTranslation(id);
  const res = await fetch(`/api/passages/${id}/translation`, opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const data: { translation: string } = await res.json();
  return data.translation;
}

export async function fetchPassageStats(id: string): Promise<PassageStats> {
  if (isDemo()) return demoApi.fetchPassageStats(id);
  const res = await fetch(`/api/passages/${id}/stats`, opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function sendFeedback(
  passageId: string,
  rating: FeedbackRating,
): Promise<FeedbackResult> {
  if (isDemo()) return demoApi.sendFeedback(passageId, rating);
  const res = await fetch("/api/feedback", opts({
    method: "POST",
    body: JSON.stringify({ passage_id: passageId, rating }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function starWord(body: {
  lemma: string;
  gloss?: string | null;
  passage_id?: string | null;
  language?: LangCode;
}): Promise<StarredWord> {
  if (isDemo()) return demoApi.starWord(body);
  const res = await fetch("/api/words", opts({
    method: "POST",
    body: JSON.stringify(body),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function saveNews(body: {
  passage_id: string;
  language: LangCode;
  saved: boolean;
}): Promise<{ saved: boolean }> {
  if (isDemo()) return demoApi.saveNews(body);
  const res = await fetch("/api/news/save", opts({
    method: "POST",
    body: JSON.stringify(body),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function unstarWord(lemma: string, language: LangCode): Promise<void> {
  if (isDemo()) return demoApi.unstarWord(lemma, language);
  const res = await fetch("/api/words", opts({
    method: "DELETE",
    body: JSON.stringify({ lemma, language }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
}

export async function fetchReview(language: LangCode): Promise<{ due: number; cards: ReviewCard[] }> {
  if (isDemo()) return demoApi.fetchReview(language);
  const res = await fetch(`/api/review?language=${language}`, opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function submitReview(cardId: number, rating: "again" | "hard" | "good" | "easy") {
  if (isDemo()) return demoApi.submitReview(cardId, rating);
  const res = await fetch("/api/review", opts({
    method: "POST",
    body: JSON.stringify({ card_id: cardId, rating }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function fetchPlacement(language: LangCode): Promise<PlacementRead> {
  if (isDemo()) return demoApi.fetchPlacement(language);
  const res = await fetch(`/api/placement?language=${language}`, opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function submitPlacement(language: LangCode, answers: number[]): Promise<PlacementResult> {
  if (isDemo()) return demoApi.submitPlacement(language, answers);
  const res = await fetch("/api/placement", opts({
    method: "POST",
    body: JSON.stringify({ language, answers }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export function recordTap(lemma: string, language: LangCode, passageId?: string) {
  if (isDemo()) {
    demoApi.recordTap(lemma, language);
    return;
  }
  void fetch("/api/taps", opts({
    method: "POST",
    body: JSON.stringify({ lemma, language, passage_id: passageId ?? null }),
  }, true)).catch(() => undefined);
}

export async function submitComprehension(passageId: string, answers: number[]) {
  if (isDemo()) return demoApi.submitComprehension(passageId, answers);
  const res = await fetch("/api/comprehension", opts({
    method: "POST",
    body: JSON.stringify({ passage_id: passageId, answers }),
  }, true));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json() as Promise<{ ok: boolean; correct: number; total: number }>;
}

export type TrackKind =
  | "landing_view"
  | "demo_tap"
  | "start_click"
  | "placement_start"
  | "session_start";

/** Fire and forget. `keepalive` lets the request finish while a link navigates away. */
export function track(kind: TrackKind, payload?: Record<string, string | number | boolean>) {
  if (isDemo()) return;
  void fetch("/api/events", opts({
    method: "POST",
    keepalive: true,
    body: JSON.stringify({ kind, payload: payload ?? null }),
  }, true)).catch(() => undefined);
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  if (isDemo()) {
    throw new Error("Admin is not available in the demo.");
  }
  const res = await fetch("/api/admin/overview", opts({ cache: "no-store" }));
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}
