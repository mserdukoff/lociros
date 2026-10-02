import type { LangCode, PlacementQuestion, Token } from "./types";

export type PlacementSpec = {
  title: string;
  tokens: Token[];
  questions: PlacementQuestion[];
  answers: number[];
};

const LEVELS = ["A1", "A2", "B1", "B2"] as const;

export function bandForScore(correct: number, total = 4): (typeof LEVELS)[number] {
  if (total === 4) {
    if (correct <= 1) return "A1";
    if (correct === 2) return "A2";
    if (correct === 3) return "B1";
    return "B2";
  }
  const ratio = total > 0 ? correct / total : 0;
  if (ratio <= 0.25) return "A1";
  if (ratio <= 0.5) return "A2";
  if (ratio <= 0.75) return "B1";
  return "B2";
}

function word(text: string, gloss: string, language: LangCode, pos = "NOUN"): Token {
  return {
    text,
    ws: language === "ja" ? "" : " ",
    is_word: true,
    lemma: text,
    morph: {
      lemma: text,
      pos,
      case: null,
      gender: null,
      number: null,
      tense: null,
      aspect: null,
      mood: null,
      reading: null,
      form: null,
    },
    gloss,
    level: "A2",
  };
}

function mark(text: string): Token {
  return { text, ws: languageSpace(text), is_word: false, lemma: null, morph: null, gloss: null, level: null };
}

function languageSpace(text: string): string {
  return /[。！？]/.test(text) ? "" : " ";
}

function line(language: LangCode, parts: Array<Token | string>): Token[] {
  return parts.map((part) => (typeof part === "string" ? mark(part) : { ...part, ws: language === "ja" ? "" : part.ws }));
}

export const PLACEMENT: Record<LangCode, PlacementSpec> = {
  ja: {
    title: "田中さんの朝",
    tokens: line("ja", [
      word("けさ", "this morning", "ja", "noun"),
      mark("、"),
      word("田中", "Tanaka", "ja", "noun"),
      word("さん", "Mr./Ms.", "ja", "noun"),
      word("は", "topic", "ja", "particle"),
      word("駅", "station", "ja", "noun"),
      word("で", "at", "ja", "particle"),
      word("新聞", "newspaper", "ja", "noun"),
      word("を", "object", "ja", "particle"),
      word("読みました", "read", "ja", "verb"),
      mark("。"),
      word("電車", "train", "ja", "noun"),
      word("は", "topic", "ja", "particle"),
      word("八時", "eight o'clock", "ja", "noun"),
      word("に", "at", "ja", "particle"),
      word("来ました", "came", "ja", "verb"),
      mark("。"),
      word("田中", "Tanaka", "ja", "noun"),
      word("さん", "Mr./Ms.", "ja", "noun"),
      word("は", "topic", "ja", "particle"),
      word("会社", "office", "ja", "noun"),
      word("へ", "to", "ja", "particle"),
      word("行きました", "went", "ja", "verb"),
      mark("。"),
      word("会社", "office", "ja", "noun"),
      word("で", "at", "ja", "particle"),
      word("水", "water", "ja", "noun"),
      word("を", "object", "ja", "particle"),
      word("飲みました", "drank", "ja", "verb"),
      mark("。"),
    ]),
    questions: [
      { id: "q1", prompt: "田中さんはどこで新聞を読みましたか。", choices: ["家", "駅", "学校"] },
      { id: "q2", prompt: "電車は何時に来ましたか。", choices: ["七時", "九時", "八時"] },
      { id: "q3", prompt: "田中さんは会社で___を飲みました。", choices: ["水", "牛乳", "お茶"] },
      { id: "q4", prompt: "新聞のあと、田中さんはどこへ行きましたか。", choices: ["市場", "家", "会社"] },
    ],
    answers: [1, 2, 0, 2],
  },
  ru: {
    title: "Утро Анны",
    tokens: line("ru", [
      word("Утром", "in the morning", "ru", "ADVB"),
      word("Анна", "Anna", "ru", "NOUN"),
      word("была", "was", "ru", "VERB"),
      word("на", "at", "ru", "PREP"),
      word("рынке", "market", "ru", "NOUN"),
      mark("."),
      word("Она", "she", "ru", "NPRO"),
      word("купила", "bought", "ru", "VERB"),
      word("хлеб", "bread", "ru", "NOUN"),
      word("и", "and", "ru", "CONJ"),
      word("воду", "water", "ru", "NOUN"),
      mark("."),
      word("Потом", "then", "ru", "ADVB"),
      word("Анна", "Anna", "ru", "NOUN"),
      word("пошла", "went", "ru", "VERB"),
      word("домой", "home", "ru", "ADVB"),
      mark("."),
      word("Дома", "at home", "ru", "ADVB"),
      word("она", "she", "ru", "NPRO"),
      word("пила", "drank", "ru", "VERB"),
      word("чай", "tea", "ru", "NOUN"),
      mark("."),
    ]),
    questions: [
      { id: "q1", prompt: "Where was Anna in the morning?", choices: ["at school", "at the station", "at the market"] },
      { id: "q2", prompt: "What did Anna buy?", choices: ["tea and milk", "bread and water", "a book"] },
      { id: "q3", prompt: "Anna bought bread and water, then she went ___.", choices: ["home", "to work", "to the park"] },
      { id: "q4", prompt: "What did Anna drink at home?", choices: ["water", "tea", "coffee"] },
    ],
    answers: [2, 1, 0, 1],
  },
  it: {
    title: "La mattina di Luca",
    tokens: line("it", [
      word("Stamattina", "this morning", "it", "ADV"),
      word("Luca", "Luca", "it", "PROPN"),
      word("è", "is", "it", "VERB"),
      word("andato", "gone", "it", "VERB"),
      word("al", "to the", "it", "PREP"),
      word("mercato", "market", "it", "NOUN"),
      mark("."),
      word("Ha", "has", "it", "VERB"),
      word("comprato", "bought", "it", "VERB"),
      word("pane", "bread", "it", "NOUN"),
      word("e", "and", "it", "CONJ"),
      word("acqua", "water", "it", "NOUN"),
      mark("."),
      word("Poi", "then", "it", "ADV"),
      word("Luca", "Luca", "it", "PROPN"),
      word("è", "is", "it", "VERB"),
      word("tornato", "returned", "it", "VERB"),
      word("a", "to", "it", "PREP"),
      word("casa", "home", "it", "NOUN"),
      mark("."),
      word("A", "at", "it", "PREP"),
      word("casa", "home", "it", "NOUN"),
      word("ha", "has", "it", "VERB"),
      word("bevuto", "drunk", "it", "VERB"),
      word("il", "the", "it", "DET"),
      word("tè", "tea", "it", "NOUN"),
      mark("."),
    ]),
    questions: [
      { id: "q1", prompt: "Where did Luca go this morning?", choices: ["to the office", "to the market", "to school"] },
      { id: "q2", prompt: "What did Luca buy?", choices: ["tea and milk", "a newspaper", "bread and water"] },
      { id: "q3", prompt: "After the market, Luca went ___.", choices: ["to the station", "home", "to work"] },
      { id: "q4", prompt: "What did Luca drink at home?", choices: ["tea", "water", "coffee"] },
    ],
    answers: [1, 2, 1, 0],
  },
  ar: {
    title: "صباح أحمد",
    tokens: line("ar", [
      word("في", "in", "ar", "ADP"),
      word("الصباح", "the morning", "ar", "NOUN"),
      word("ذهب", "went", "ar", "VERB"),
      word("أحمد", "Ahmad", "ar", "NOUN"),
      word("إلى", "to", "ar", "ADP"),
      word("السوق", "the market", "ar", "NOUN"),
      mark("."),
      word("اشترى", "bought", "ar", "VERB"),
      word("خبزاً", "bread", "ar", "NOUN"),
      word("وماء", "and water", "ar", "NOUN"),
      mark("."),
      word("ثم", "then", "ar", "ADV"),
      word("عاد", "returned", "ar", "VERB"),
      word("أحمد", "Ahmad", "ar", "NOUN"),
      word("إلى", "to", "ar", "ADP"),
      word("البيت", "the house", "ar", "NOUN"),
      mark("."),
      word("في", "in", "ar", "ADP"),
      word("البيت", "the house", "ar", "NOUN"),
      word("شرب", "drank", "ar", "VERB"),
      word("شاياً", "tea", "ar", "NOUN"),
      mark("."),
    ]),
    questions: [
      { id: "q1", prompt: "Where did Ahmad go in the morning?", choices: ["to school", "to the station", "to the market"] },
      { id: "q2", prompt: "What did Ahmad buy?", choices: ["bread and water", "tea and milk", "a book"] },
      { id: "q3", prompt: "After the market, Ahmad went ___.", choices: ["to work", "home", "to the park"] },
      { id: "q4", prompt: "What did Ahmad drink at home?", choices: ["water", "coffee", "tea"] },
    ],
    answers: [2, 0, 1, 2],
  },
};
