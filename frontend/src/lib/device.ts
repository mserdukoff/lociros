import { useSyncExternalStore } from "react";
import { DEVICE_COOKIE } from "./device-cookie";
import type { LangCode } from "./types";

export { DEVICE_COOKIE };

const DEVICE_KEY = "lociros.device_id";
const LANG_KEY = "lociros.language";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr-device";
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id || id.length < 8) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  if (!document.cookie.includes(`${DEVICE_COOKIE}=${id}`)) {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${DEVICE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax${secure}`;
  }
  return id;
}

export function loadLanguage(): LangCode {
  if (typeof window === "undefined") return "ja";
  const value = window.localStorage.getItem(LANG_KEY);
  return value === "ru" || value === "ja" || value === "it" || value === "ar" ? value : "ja";
}

/** False until a language has been chosen on this browser, on the landing page or the placement read. */
export function hasStoredLanguage(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LANG_KEY) !== null;
}

export function saveLanguage(language: LangCode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANG_KEY, language);
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The saved language, rendered as "ja" during hydration so server and client markup match. */
export function useStoredLanguage(): LangCode {
  return useSyncExternalStore(subscribeStorage, loadLanguage, () => "ja");
}

const GRAMMAR_KEY = "lociros.grammar";

export function loadGrammarColors(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GRAMMAR_KEY) === "1";
}

export function saveGrammarColors(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GRAMMAR_KEY, on ? "1" : "0");
}

const FURIGANA_KEY = "lociros.furigana";

export function loadFurigana(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FURIGANA_KEY) === "1";
}

export function saveFurigana(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FURIGANA_KEY, on ? "1" : "0");
}

const FADE_KEY = "lociros.fade";

export function loadFadeKnown(): boolean {
  if (typeof window === "undefined") return true;
  const value = window.localStorage.getItem(FADE_KEY);
  if (value === null) return true;
  return value === "1";
}

export function saveFadeKnown(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FADE_KEY, on ? "1" : "0");
}

const TAP_HINT_KEY = "lociros.tap_hint";
const RATING_HINT_KEY = "lociros.rating_hint";
const ACCOUNT_PROMPT_KEY = "lociros.account_prompt";

/** Shown above the placement passage until the first word is tapped on this browser. */
export function tapHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(TAP_HINT_KEY) === "1";
}

export function markTapHintSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TAP_HINT_KEY, "1");
}

/** Rendered as seen during hydration, so the hint only appears on the client. */
export function useTapHintSeen(): boolean {
  return useSyncExternalStore(subscribeStorage, tapHintSeen, () => true);
}

/** Shown under the rating pills until the reader rates a passage for the first time. */
export function ratingHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(RATING_HINT_KEY) === "1";
}

export function markRatingHintSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RATING_HINT_KEY, "1");
}

export function useRatingHintSeen(): boolean {
  return useSyncExternalStore(subscribeStorage, ratingHintSeen, () => true);
}

/**
 * `pending` until the first offer is dismissed, then `once` (offered again
 * after the third finished passage), then `done`. An account also sets `done`.
 */
export type AccountPrompt = "pending" | "once" | "done";

export function loadAccountPrompt(): AccountPrompt {
  if (typeof window === "undefined") return "done";
  const value = window.localStorage.getItem(ACCOUNT_PROMPT_KEY);
  return value === "once" || value === "done" ? value : "pending";
}

export function saveAccountPrompt(value: AccountPrompt): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNT_PROMPT_KEY, value);
}

const SESSION_DAY_KEY = "lociros.session_day";

/** True the first time it is called on a UTC day, then false until the next day. */
export function claimSessionDay(): boolean {
  if (typeof window === "undefined") return false;
  const today = new Date().toISOString().slice(0, 10);
  if (window.localStorage.getItem(SESSION_DAY_KEY) === today) return false;
  window.localStorage.setItem(SESSION_DAY_KEY, today);
  return true;
}

export function deviceHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {
    "X-Device-Id": getDeviceId(),
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}
