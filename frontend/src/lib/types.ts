export type CefrLevel = "A1" | "A2" | "B1" | "B2";
export type LangCode = "ru" | "ja" | "it" | "ar";
export type FeedbackRating = "too_easy" | "too_hard" | "just_right";

export type MorphInfo = {
  lemma: string;
  pos: string | null;
  case: string | null;
  gender: string | null;
  number: string | null;
  tense: string | null;
  aspect: string | null;
  mood: string | null;
  reading: string | null;
  form: string | null;
  pos_detail?: string | null;
  conj_type?: string | null;
  voice?: string | null;
  person?: string | null;
  state?: string | null;
  enclitic?: string | null;
};

export type ConjPiece = {
  text: string;
  label: string;
};

export type KanjiPart = {
  char: string;
  reading: string | null;
  on: string[];
  kun: string[];
  meaning: string;
  strokes?: number | null;
  jlpt?: number | null;
  grade?: number | null;
  freq?: number | null;
  radical?: string | null;
  radical_name?: string | null;
  parts?: string[];
  nanori?: string[];
};

export type RootPart = {
  letters: string;
  pattern: string | null;
  form: string | null;
  form_name: string | null;
  meaning: string;
};

export type Token = {
  text: string;
  ws: string;
  is_word: boolean;
  lemma: string | null;
  morph: MorphInfo | null;
  gloss: string | null;
  level: string | null;
  kanji?: KanjiPart[];
  root?: RootPart | null;
  role?: string | null;
  conj?: ConjPiece[];
  conj_id?: number | null;
};

export type Calibration = {
  passed: boolean;
  attempts: number;
  overlevel_lemma_rate: number;
  subordinate_rate: number;
  forbidden_case_rate: number;
  forbidden_tense_rate: number;
  forbidden_pos_rate: number;
  flags: string[];
  warnings: string[];
  allowed_constructions?: string[];
  forbidden_used?: string[];
  banned_constructions?: string[];
  sample_lemmas?: string[];
};

export type AudioCue = {
  index: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type ComprehensionQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answer_index: number;
};

export type Passage = {
  id: string;
  language: LangCode;
  level: CefrLevel;
  topic: string;
  genre: string | null;
  title: string;
  text: string;
  tokens: Token[];
  calibration: Calibration;
  word_count: number;
  created_at: string;
  translation?: string | null;
  audio_url?: string | null;
  audio_cues?: AudioCue[];
  series_id?: string | null;
  chapter_index?: number | null;
  comprehension?: ComprehensionQuestion[];
  shelf_status?: string;
  source_name?: string | null;
  source_url?: string | null;
  source_date?: string | null;
};

export type LibraryItem = {
  id: string;
  language: LangCode;
  level: CefrLevel;
  topic: string;
  genre: string | null;
  title: string;
  word_count: number;
  created_at: string;
  passed: boolean;
  read: boolean;
  recommended: boolean;
  new_lemmas: number;
  recycled_lemmas: number;
  series_id?: string | null;
  chapter_index?: number | null;
  has_audio?: boolean;
  new_lemma_pct?: number;
  source_name?: string | null;
  source_url?: string | null;
  source_date?: string | null;
};

export type NewsNotice = {
  passage_id: string;
  title: string;
  language: LangCode;
  level: CefrLevel;
  source_name?: string | null;
  source_date?: string | null;
  saved?: boolean;
  read?: boolean;
};

export type PlacementQuestion = {
  id: string;
  prompt: string;
  choices: string[];
};

export type PlacementRead = {
  language: LangCode;
  title: string;
  text: string;
  tokens: Token[];
  questions: PlacementQuestion[];
};

export type PlacementResult = {
  language: LangCode;
  level: CefrLevel;
  correct: number;
  total: number;
  placed: boolean;
  next_id?: string | null;
};

export type LibraryResponse = {
  language: LangCode;
  placement: CefrLevel;
  placed?: boolean;
  next_id: string | null;
  seen_lemmas: number;
  items: LibraryItem[];
  words?: StarredWord[];
  news_notice?: NewsNotice | null;
};

export type StarredWord = {
  lemma: string;
  gloss: string | null;
  passage_id: string | null;
  title: string | null;
  language: LangCode;
};

export type PassageStats = {
  passage_id: string;
  language: LangCode;
  placement: CefrLevel;
  read: boolean;
  new_lemmas: number;
  recycled_lemmas: number;
  next_id: string | null;
  known_lemmas?: string[];
  starred_lemmas?: string[];
};

export type FeedbackResult = {
  ok: boolean;
  passage_id: string;
  rating: FeedbackRating;
  placement: CefrLevel | null;
  next_id: string | null;
  new_lemmas: number;
  recycled_lemmas: number;
};

export type GenerateJobStatus = "pending" | "running" | "completed" | "failed";

export type GenerateJobResponse = {
  job_id: string;
  status: GenerateJobStatus;
  passage: Passage | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type MeResponse = {
  authenticated: boolean;
  user_id: number | null;
  email: string | null;
  display_name: string | null;
  guest: boolean;
  show_russian: boolean;
  show_italian: boolean;
  show_arabic: boolean;
  generate_remaining: number | null;
  require_auth: boolean;
  entitlement?: Entitlement | null;
  created_at?: string | null;
};

export type EntitlementStatus = "guest" | "trial" | "active" | "grace" | "expired";

export type Entitlement = {
  status: EntitlementStatus;
  entitled: boolean;
  paywall: boolean;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  plan: "monthly" | "annual" | "other" | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  billing_ready: boolean;
};

export type ReviewCard = {
  id: number;
  lemma: string;
  gloss: string | null;
  reading: string | null;
  context: string | null;
  language: LangCode;
  due_at: string;
};

export const LANGUAGES: { id: LangCode; label: string; native: string }[] = [
  { id: "ja", label: "Japanese", native: "日本語" },
  { id: "ar", label: "Arabic", native: "العربية" },
  { id: "it", label: "Italian", native: "Italiano" },
  { id: "ru", label: "Russian", native: "Русский" },
];

/** Japanese is always public; the others follow the server's flags. */
export function enabledLanguages(me: MeResponse | null): typeof LANGUAGES {
  return LANGUAGES.filter(
    (l) =>
      l.id === "ja" ||
      (l.id === "ru" && me?.show_russian === true) ||
      (l.id === "it" && me?.show_italian === true) ||
      (l.id === "ar" && me?.show_arabic === true),
  );
}

export const LEVELS: { id: CefrLevel; label: string; hint: string }[] = [
  { id: "A1", label: "A1", hint: "Beginner" },
  { id: "A2", label: "A2", hint: "Elementary" },
  { id: "B1", label: "B1", hint: "Intermediate" },
  { id: "B2", label: "B2", hint: "Upper-int." },
];

export const GENRES: { id: string; label: string }[] = [
  { id: "daily_life", label: "Daily life" },
  { id: "travel", label: "Travel" },
  { id: "news", label: "News" },
  { id: "folklore", label: "Folklore" },
  { id: "work", label: "Work" },
];

const POS_NAME: Record<string, string> = {
  NOUN: "noun",
  PROPN: "proper noun",
  VERB: "verb",
  AUX: "auxiliary",
  INFN: "infinitive",
  ADJ: "adjective",
  ADJF: "adjective",
  ADJS: "short adjective",
  ADV: "adverb",
  ADVB: "adverb",
  ADP: "preposition",
  PREP: "preposition",
  CCONJ: "conjunction",
  SCONJ: "conjunction",
  CONJ: "conjunction",
  DET: "determiner",
  PRON: "pronoun",
  NPRO: "pronoun",
  PART: "particle",
  PRCL: "particle",
  NUM: "numeral",
  NUMR: "numeral",
  INTJ: "interjection",
  PRED: "predicative",
  PRTF: "participle",
  PRTS: "short participle",
  GRND: "gerund",
  COMP: "comparative",
};

function posName(pos: string): string {
  return POS_NAME[pos] ?? pos.toLowerCase();
}

export function morphLine(morph: MorphInfo): string {
  const mood =
    morph.mood === "impr"
      ? "imperative"
      : morph.mood === "subj"
        ? "subjunctive"
        : morph.mood === "cond"
          ? "conditional"
          : morph.mood;
  const parts = [
    morph.aspect,
    morph.tense,
    mood,
    morph.voice === "act" ? "active" : morph.voice === "pass" ? "passive" : morph.voice,
    morph.person ? `${morph.person}` : null,
    morph.form && morph.form !== "fin" ? (morph.form.length <= 3 && /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(morph.form) ? `form ${morph.form}` : morph.form) : null,
    morph.case,
    morph.state,
    morph.gender,
    morph.number,
    morph.pos && !morph.case ? posName(morph.pos) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function jaGrammarLine(token: Token): string {
  switch (token.role) {
    case "topic":
      return "topic marker";
    case "subject":
      return "subject marker";
    case "object":
      return "object marker";
    case "particle": {
      const detail = token.morph?.pos_detail;
      if (detail === "case") return "case particle";
      if (detail === "binding") return "binding particle";
      if (detail === "conjunctive") return "conjunctive particle";
      if (detail === "final") return "sentence particle";
      if (detail === "adverbial") return "adverbial particle";
      return "particle";
    }
    case "verb":
      return "verb";
    case "aux":
      return "auxiliary";
    case "adj":
      if (token.morph?.pos === "i-adj") return "i-adjective";
      if (token.morph?.pos === "na-adj") return "na-adjective";
      return "adjective";
    case "adverb":
      return "adverb";
    default:
      return "";
  }
}

const JA_CONTENT = new Set(["noun", "verb", "i-adj", "na-adj", "adverb"]);
const RU_CONTENT = new Set([
  "NOUN",
  "ADJF",
  "ADJS",
  "VERB",
  "INFN",
  "ADVB",
  "PRED",
  "NUMR",
]);
const IT_CONTENT = new Set(["NOUN", "VERB", "ADJ", "ADV", "PROPN"]);

const AR_CONTENT = new Set(["NOUN", "VERB", "ADJ", "ADV", "PROPN"]);

const CONTENT_BY_LANG: Record<LangCode, Set<string>> = {
  ja: JA_CONTENT,
  ru: RU_CONTENT,
  it: IT_CONTENT,
  ar: AR_CONTENT,
};

export function isContentWord(token: Token, language: LangCode): boolean {
  const pos = token.morph?.pos;
  if (!pos) return false;
  return CONTENT_BY_LANG[language].has(pos);
}

export function readingFont(language: LangCode): string {
  if (language === "ja") return "font-ja";
  if (language === "ar") return "font-ar";
  return "font-reading";
}

export function isRtl(language: LangCode): boolean {
  return language === "ar";
}

const KANJI = /[\u4e00-\u9faf]/;

export function kanjiChars(text: string): string[] {
  return [...text].filter((ch) => KANJI.test(ch));
}

export function furiganaReading(token: Token): string | null {
  const reading = token.morph?.reading;
  if (!reading) return null;
  if (KANJI.test(token.text)) return reading;
  // Arabic: show tashkeel when the analyzer restored vowels.
  if (reading !== token.text && /[\u064B-\u0652]/.test(reading)) return reading;
  return null;
}
