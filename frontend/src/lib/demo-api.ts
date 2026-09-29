import { DEMO_PASSAGES, getDemoPassage } from "./demo-catalog";
import {
  demoFeedback,
  demoLibrary,
  demoPassageStats,
  demoRecordTap,
  demoReview,
  demoSaveNews,
  demoStarWord,
  demoSubmitPlacement,
  demoSubmitReview,
  demoUnstarWord,
} from "./demo-store";
import { PLACEMENT } from "./placement";
import type {
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
} from "./types";

export async function fetchMe(): Promise<MeResponse> {
  return {
    authenticated: false,
    user_id: null,
    email: null,
    display_name: null,
    guest: true,
    show_russian: true,
    show_italian: true,
    show_arabic: true,
    generate_remaining: null,
    require_auth: false,
    admin: false,
  };
}

export async function logout(): Promise<void> {}

export async function generatePassage(_body: {
  level: CefrLevel;
  topic: string;
  genre?: string | null;
  language: LangCode;
}): Promise<Passage> {
  throw new Error("This static demo does not generate new passages. Open a title from the shelf.");
}

export async function fetchShelfCounts(): Promise<Partial<Record<LangCode, number>>> {
  const counts: Partial<Record<LangCode, number>> = {};
  for (const p of DEMO_PASSAGES) {
    if (p.genre === "news") continue;
    counts[p.language] = (counts[p.language] ?? 0) + 1;
  }
  return counts;
}

export async function fetchLibrary(language: LangCode, _signal?: AbortSignal): Promise<LibraryResponse> {
  return demoLibrary(language);
}

export async function fetchPassage(id: string): Promise<Passage> {
  const passage = getDemoPassage(id);
  if (!passage) throw new Error("Passage not found.");
  return passage;
}

export async function fetchTranslation(id: string): Promise<string> {
  const passage = getDemoPassage(id);
  if (!passage?.translation) throw new Error("No English for this passage yet.");
  return passage.translation;
}

export async function fetchPassageStats(id: string): Promise<PassageStats> {
  return demoPassageStats(id);
}

export async function sendFeedback(passageId: string, rating: FeedbackRating): Promise<FeedbackResult> {
  return demoFeedback(passageId, rating);
}

export async function starWord(body: {
  lemma: string;
  gloss?: string | null;
  passage_id?: string | null;
  language?: LangCode;
}): Promise<StarredWord> {
  return demoStarWord(body);
}

export async function saveNews(body: {
  passage_id: string;
  language: LangCode;
  saved: boolean;
}): Promise<{ saved: boolean }> {
  return { saved: demoSaveNews(body.passage_id, body.language, body.saved) };
}

export async function unstarWord(lemma: string, language: LangCode): Promise<void> {
  demoUnstarWord(lemma, language);
}

export async function fetchReview(language: LangCode): Promise<{ due: number; cards: ReviewCard[] }> {
  return demoReview(language);
}

export async function submitReview(cardId: number, rating: "again" | "hard" | "good" | "easy") {
  return demoSubmitReview(cardId, rating);
}

export async function submitComprehension(passageId: string, answers: number[]) {
  const passage = getDemoPassage(passageId);
  const questions = passage?.comprehension ?? [];
  const correct = answers.filter((answer, index) => questions[index] && answer === questions[index].answer_index).length;
  return { ok: true, correct, total: questions.length };
}

export async function fetchPlacement(language: LangCode) {
  const spec = PLACEMENT[language];
  return {
    language,
    title: spec.title,
    text: spec.tokens.map((tok) => tok.text + (tok.ws ?? "")).join(""),
    tokens: spec.tokens,
    questions: spec.questions,
  };
}

export async function submitPlacement(language: LangCode, answers: number[]) {
  return demoSubmitPlacement(language, answers);
}

export function recordTap(lemma: string, language: LangCode) {
  demoRecordTap(language, lemma);
}
