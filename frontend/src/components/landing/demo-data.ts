import type { CefrLevel, ConjPiece, KanjiPart, LangCode, MorphInfo, RootPart, Token } from "@/lib/types";

/*
  Hand-authored sample passages for the landing page, in the same Token shape
  the API returns, so the hero renders through the real reader components.
  Morph values follow the backend's mapping (case nom/gen/dat/acc/ins/prep,
  tense pres/past/fut, number sg/pl, aspect impf/perf; Japanese POS labels
  noun/verb/i-adj/na-adj/particle/aux/adverb/pronoun).
*/

const EMPTY_MORPH: MorphInfo = {
  lemma: "",
  pos: null,
  case: null,
  gender: null,
  number: null,
  tense: null,
  aspect: null,
  mood: null,
  reading: null,
  form: null,
};

const KANJI: Record<string, Omit<KanjiPart, "reading">> = {
  朝: { char: "朝", on: ["チョウ"], kun: ["あさ"], meaning: "morning; dynasty; regime", strokes: 12, jlpt: 4, grade: 2, freq: 244, radical: "月", radical_name: "moon", parts: ["十", "日", "月"], nanori: ["あした", "あす"] },
  駅: { char: "駅", on: ["エキ"], kun: [], meaning: "station", strokes: 14, jlpt: 4, grade: 3, freq: 724, radical: "馬", radical_name: "horse", parts: ["馬", "尺"], nanori: [] },
  近: { char: "近", on: ["キン", "コン"], kun: ["ちか.い"], meaning: "near; early; akin; tantamount", strokes: 7, jlpt: 4, grade: 2, freq: 194, radical: "辶", radical_name: "walk", parts: ["斤", "辶"], nanori: ["おう", "ちか"] },
  屋: { char: "屋", on: ["オク"], kun: ["や"], meaning: "roof; house; shop; dealer; seller", strokes: 9, jlpt: 4, grade: 3, freq: 662, radical: "尸", radical_name: "corpse", parts: ["尸", "至"], nanori: [] },
  行: { char: "行", on: ["コウ", "ギョウ", "アン"], kun: ["い.く", "ゆ.く", "おこな.う"], meaning: "going; journey; carry out; line", strokes: 6, jlpt: 5, grade: 2, freq: 20, radical: "行", radical_name: "go", parts: ["行"], nanori: ["いき", "なみ"] },
  店: { char: "店", on: ["テン"], kun: ["みせ", "たな"], meaning: "store; shop", strokes: 8, jlpt: 4, grade: 2, freq: 585, radical: "广", radical_name: "dotted cliff", parts: ["广", "占"], nanori: [] },
  人: { char: "人", on: ["ジン", "ニン"], kun: ["ひと", "-り", "-と"], meaning: "person", strokes: 2, jlpt: 5, grade: 1, freq: 5, radical: "人", radical_name: "man", parts: ["人"], nanori: ["じ", "と", "ね"] },
  元: { char: "元", on: ["ゲン", "ガン"], kun: ["もと"], meaning: "beginning; former time; origin", strokes: 4, jlpt: 4, grade: 2, freq: 192, radical: "儿", radical_name: "legs", parts: ["二", "儿"], nanori: ["ちか", "はじめ"] },
  気: { char: "気", on: ["キ", "ケ"], kun: ["いき"], meaning: "spirit; mind; air; atmosphere; mood", strokes: 6, jlpt: 5, grade: 1, freq: 113, radical: "气", radical_name: "steam", parts: ["气", "メ"], nanori: [] },
  買: { char: "買", on: ["バイ"], kun: ["か.う"], meaning: "buy", strokes: 12, jlpt: 5, grade: 2, freq: 520, radical: "貝", radical_name: "shell", parts: ["罒", "貝"], nanori: [] },
  公: { char: "公", on: ["コウ", "ク"], kun: ["おおやけ"], meaning: "public; prince; official; governmental", strokes: 4, jlpt: 4, grade: 2, freq: 99, radical: "八", radical_name: "eight", parts: ["八", "厶"], nanori: ["いさお", "きみ", "たか"] },
  園: { char: "園", on: ["エン"], kun: ["その"], meaning: "park; garden; yard; farm", strokes: 13, jlpt: 3, grade: 2, freq: 1015, radical: "囗", radical_name: "enclosure", parts: ["囗", "土", "口", "衣"], nanori: ["おん"] },
  食: { char: "食", on: ["ショク", "ジキ"], kun: ["く.う", "く.らう", "た.べる", "は.む"], meaning: "eat; food", strokes: 9, jlpt: 5, grade: 2, freq: 328, radical: "食", radical_name: "eat", parts: ["人", "良"], nanori: ["ぐい"] },
  天: { char: "天", on: ["テン"], kun: ["あまつ", "あめ", "あま-"], meaning: "heavens; sky; imperial", strokes: 4, jlpt: 4, grade: 1, freq: 512, radical: "大", radical_name: "big", parts: ["一", "大"], nanori: ["あき", "たか"] },
  持: { char: "持", on: ["ジ"], kun: ["も.つ", "-も.ち", "も.てる"], meaning: "hold; have", strokes: 9, jlpt: 4, grade: 3, freq: 76, radical: "扌", radical_name: "hand", parts: ["土", "寸", "扌"], nanori: ["もち"] },
  私: { char: "私", on: ["シ"], kun: ["わたし", "わたくし"], meaning: "private; I; me", strokes: 7, jlpt: 4, grade: 6, freq: 242, radical: "禾", radical_name: "grain", parts: ["禾", "厶"], nanori: [] },
  学: { char: "学", on: ["ガク"], kun: ["まな.ぶ"], meaning: "study; learning; science", strokes: 8, jlpt: 5, grade: 1, freq: 63, radical: "子", radical_name: "child", parts: ["子", "⺌", "冖"], nanori: ["たか", "のり"] },
  生: { char: "生", on: ["セイ", "ショウ"], kun: ["い.きる", "う.まれる", "なま"], meaning: "life; genuine; birth", strokes: 5, jlpt: 5, grade: 1, freq: 29, radical: "生", radical_name: "life", parts: [], nanori: [] },
  今: { char: "今", on: ["コン", "キン"], kun: ["いま"], meaning: "now", strokes: 4, jlpt: 5, grade: 2, freq: 49, radical: "人", radical_name: "person", parts: ["𠆢", "一"], nanori: ["な"] },
  日: { char: "日", on: ["ニチ", "ジツ"], kun: ["ひ", "-び", "-か"], meaning: "day; sun; Japan", strokes: 4, jlpt: 5, grade: 1, freq: 1, radical: "日", radical_name: "sun", parts: [], nanori: [] },
  休: { char: "休", on: ["キュウ"], kun: ["やす.む"], meaning: "rest; day off; retire; sleep", strokes: 6, jlpt: 5, grade: 1, freq: 642, radical: "人", radical_name: "person", parts: ["⺅", "木"], nanori: [] },
  水: { char: "水", on: ["スイ"], kun: ["みず"], meaning: "water", strokes: 4, jlpt: 5, grade: 1, freq: 223, radical: "水", radical_name: "water", parts: [], nanori: [] },
  飲: { char: "飲", on: ["イン"], kun: ["の.む"], meaning: "drink; smoke; take", strokes: 12, jlpt: 4, grade: 3, freq: 969, radical: "食", radical_name: "eat", parts: ["欠", "食"], nanori: [] },
  美: { char: "美", on: ["ビ", "ミ"], kun: ["うつく.しい"], meaning: "beauty; beautiful", strokes: 9, jlpt: 3, grade: 3, freq: 462, radical: "羊", radical_name: "sheep", parts: ["王", "大", "并", "羊"], nanori: [] },
  味: { char: "味", on: ["ミ"], kun: ["あじ", "あじ.わう"], meaning: "flavor; taste", strokes: 8, jlpt: 4, grade: 3, freq: 442, radical: "口", radical_name: "mouth", parts: ["口", "未"], nanori: [] },
  母: { char: "母", on: ["ボ"], kun: ["はは", "も"], meaning: "mother", strokes: 5, jlpt: 5, grade: 2, freq: 570, radical: "毋", radical_name: "do not", parts: ["毋"], nanori: [] },
  家: { char: "家", on: ["カ", "ケ"], kun: ["いえ", "や", "うち"], meaning: "house; home; family", strokes: 10, jlpt: 4, grade: 2, freq: 133, radical: "宀", radical_name: "roof", parts: ["宀", "豕"], nanori: [] },
  茶: { char: "茶", on: ["チャ", "サ"], kun: [], meaning: "tea", strokes: 9, jlpt: 4, grade: 2, freq: 1116, radical: "艸", radical_name: "grass", parts: ["𠆢", "⺾", "木"], nanori: [] },
  本: { char: "本", on: ["ホン"], kun: ["もと"], meaning: "book; present; main; origin", strokes: 5, jlpt: 5, grade: 1, freq: 10, radical: "木", radical_name: "tree", parts: ["一", "木"], nanori: [] },
  読: { char: "読", on: ["ドク", "トク", "トウ"], kun: ["よ.む"], meaning: "read", strokes: 14, jlpt: 5, grade: 2, freq: 618, radical: "言", radical_name: "speech", parts: ["言", "売"], nanori: ["よみ"] },
  新: { char: "新", on: ["シン"], kun: ["あたら.しい", "あら.た"], meaning: "new", strokes: 13, jlpt: 4, grade: 2, freq: 51, radical: "斤", radical_name: "axe", parts: ["斤", "亲"], nanori: [] },
  金: { char: "金", on: ["キン", "コン"], kun: ["かね", "かな-"], meaning: "gold; money", strokes: 8, jlpt: 5, grade: 1, freq: 53, radical: "金", radical_name: "gold", parts: [], nanori: [] },
  曜: { char: "曜", on: ["ヨウ"], kun: [], meaning: "weekday", strokes: 18, jlpt: 4, grade: 2, freq: 940, radical: "日", radical_name: "sun", parts: ["ヨ", "日", "隹"], nanori: [] },
  緒: { char: "緒", on: ["ショ", "チョ"], kun: ["お"], meaning: "thong; beginning; together", strokes: 14, jlpt: 3, grade: 8, freq: 952, radical: "糸", radical_name: "silk", parts: ["糸", "者"], nanori: [] },
  市: { char: "市", on: ["シ"], kun: ["いち"], meaning: "market; city; town", strokes: 5, jlpt: 3, grade: 2, freq: 42, radical: "巾", radical_name: "turban", parts: ["巾", "亠"], nanori: ["い", "ち"] },
  場: { char: "場", on: ["ジョウ", "チョウ"], kun: ["ば"], meaning: "location; place", strokes: 12, jlpt: 4, grade: 2, freq: 52, radical: "土", radical_name: "earth", parts: ["土", "日", "勿"], nanori: [] },
  早: { char: "早", on: ["ソウ", "サッ"], kun: ["はや.い", "はや"], meaning: "early; fast", strokes: 6, jlpt: 4, grade: 1, freq: 402, radical: "日", radical_name: "sun", parts: ["十", "日"], nanori: [] },
  起: { char: "起", on: ["キ"], kun: ["お.きる", "お.こる"], meaning: "rouse; wake up; get up", strokes: 10, jlpt: 4, grade: 3, freq: 374, radical: "走", radical_name: "run", parts: ["走", "已"], nanori: [] },
  帰: { char: "帰", on: ["キ"], kun: ["かえ.る", "かえ.す"], meaning: "homecoming; return", strokes: 10, jlpt: 4, grade: 2, freq: 504, radical: "巾", radical_name: "turban", parts: ["ヨ", "刂", "巾", "冖"], nanori: [] },
  電: { char: "電", on: ["デン"], kun: [], meaning: "electricity", strokes: 13, jlpt: 5, grade: 2, freq: 268, radical: "雨", radical_name: "rain", parts: ["雨", "田", "乙"], nanori: [] },
  車: { char: "車", on: ["シャ"], kun: ["くるま"], meaning: "car", strokes: 7, jlpt: 5, grade: 1, freq: 333, radical: "車", radical_name: "cart", parts: [], nanori: [] },
  中: { char: "中", on: ["チュウ"], kun: ["なか", "うち"], meaning: "in; inside; middle", strokes: 4, jlpt: 5, grade: 1, freq: 11, radical: "丨", radical_name: "line", parts: ["｜", "口"], nanori: [] },
  隣: { char: "隣", on: ["リン"], kun: ["となり"], meaning: "neighboring", strokes: 16, jlpt: 1, grade: 8, freq: 1083, radical: "阜", radical_name: "mound", parts: ["舛", "米", "⻖"], nanori: [] },
  窓: { char: "窓", on: ["ソウ"], kun: ["まど"], meaning: "window; pane", strokes: 11, jlpt: 3, grade: 6, freq: 1186, radical: "穴", radical_name: "cave", parts: ["穴", "心", "厶"], nanori: [] },
  見: { char: "見", on: ["ケン"], kun: ["み.る", "み.える"], meaning: "see; hopes; chances; idea", strokes: 7, jlpt: 5, grade: 1, freq: 22, radical: "見", radical_name: "see", parts: ["目", "儿"], nanori: [] },
  着: { char: "着", on: ["チャク"], kun: ["き.る", "つ.く"], meaning: "don; arrive; wear", strokes: 12, jlpt: 4, grade: 3, freq: 376, radical: "目", radical_name: "eye", parts: ["羊", "目"], nanori: [] },
  友: { char: "友", on: ["ユウ"], kun: ["とも"], meaning: "friend", strokes: 4, jlpt: 5, grade: 2, freq: 622, radical: "又", radical_name: "again", parts: ["ノ", "一", "又"], nanori: [] },
  達: { char: "達", on: ["タツ"], kun: ["-たち"], meaning: "accomplished; reach; arrive", strokes: 12, jlpt: 3, grade: 4, freq: 500, radical: "辵", radical_name: "walk", parts: ["王", "辶", "羊"], nanori: [] },
  会: { char: "会", on: ["カイ", "エ"], kun: ["あ.う"], meaning: "meeting; meet; party; association", strokes: 6, jlpt: 4, grade: 2, freq: 4, radical: "人", radical_name: "person", parts: ["二", "𠆢", "厶"], nanori: ["あい"] },
  京: { char: "京", on: ["キョウ", "ケイ"], kun: ["みやこ"], meaning: "capital", strokes: 8, jlpt: 4, grade: 2, freq: 74, radical: "亠", radical_name: "lid", parts: ["口", "小", "亠"], nanori: [] },
  都: { char: "都", on: ["ト", "ツ"], kun: ["みやこ"], meaning: "metropolis; capital", strokes: 11, jlpt: 3, grade: 3, freq: 123, radical: "邑", radical_name: "city", parts: ["日", "⻏", "⺹"], nanori: [] },
  働: { char: "働", on: ["ドウ"], kun: ["はたら.く"], meaning: "work", strokes: 13, jlpt: 3, grade: 4, freq: 417, radical: "人", radical_name: "person", parts: ["⺅", "動"], nanori: [] },
  雨: { char: "雨", on: ["ウ"], kun: ["あめ", "あま-"], meaning: "rain", strokes: 8, jlpt: 5, grade: 1, freq: 950, radical: "雨", radical_name: "rain", parts: [], nanori: [] },
  待: { char: "待", on: ["タイ"], kun: ["ま.つ"], meaning: "wait; depend on", strokes: 9, jlpt: 4, grade: 3, freq: 391, radical: "彳", radical_name: "step", parts: ["寸", "土", "彳"], nanori: [] },
  面: { char: "面", on: ["メン"], kun: ["おも", "おもて"], meaning: "mask; face; features; surface", strokes: 9, jlpt: 3, grade: 3, freq: 186, radical: "面", radical_name: "face", parts: [], nanori: [] },
  白: { char: "白", on: ["ハク"], kun: ["しろ", "しろ.い"], meaning: "white", strokes: 5, jlpt: 5, grade: 1, freq: 483, radical: "白", radical_name: "white", parts: [], nanori: [] },
  社: { char: "社", on: ["シャ"], kun: ["やしろ"], meaning: "company; firm; office", strokes: 7, jlpt: 4, grade: 2, freq: 21, radical: "示", radical_name: "spirit", parts: ["土", "礻"], nanori: [] },
  忙: { char: "忙", on: ["ボウ"], kun: ["いそが.しい"], meaning: "busy; occupied; restless", strokes: 6, jlpt: 3, grade: 8, freq: 1475, radical: "心", radical_name: "heart", parts: ["亡", "忄"], nanori: [] },
  一: { char: "一", on: ["イチ", "イツ"], kun: ["ひと.つ", "ひと-"], meaning: "one", strokes: 1, jlpt: 5, grade: 1, freq: 2, radical: "一", radical_name: "one", parts: [], nanori: [] },
  二: { char: "二", on: ["ニ", "ジ"], kun: ["ふた", "ふた.つ"], meaning: "two", strokes: 2, jlpt: 5, grade: 1, freq: 9, radical: "二", radical_name: "two", parts: [], nanori: [] },
  言: { char: "言", on: ["ゲン", "ゴン"], kun: ["い.う", "こと"], meaning: "say; word", strokes: 7, jlpt: 4, grade: 2, freq: 83, radical: "言", radical_name: "speech", parts: [], nanori: [] },
  多: { char: "多", on: ["タ"], kun: ["おお.い"], meaning: "many; frequent; much", strokes: 6, jlpt: 4, grade: 2, freq: 139, radical: "夕", radical_name: "evening", parts: ["夕"], nanori: [] },
};

function kanji(spec: [string, string | null][]): KanjiPart[] {
  return spec.map(([char, reading]) => ({ ...KANJI[char], reading }));
}

export function punct(text: string, ws = ""): Token {
  return { text, ws, is_word: false, lemma: null, morph: null, gloss: null, level: null };
}

type JaSpec = {
  lemma?: string;
  pos: string;
  reading?: string;
  level?: CefrLevel | null;
  gloss?: string;
  role?: string;
  detail?: string;
  form?: string;
  conj?: ConjPiece[];
  cid?: number;
  kanji?: [string, string | null][];
};

export function ja(text: string, s: JaSpec): Token {
  const lemma = s.lemma ?? text;
  return {
    text,
    ws: "",
    is_word: true,
    lemma,
    morph: {
      ...EMPTY_MORPH,
      lemma,
      pos: s.pos,
      reading: s.reading ?? null,
      pos_detail: s.detail ?? null,
      form: s.form ?? null,
    },
    gloss: s.gloss ?? null,
    level: s.level === undefined ? "A1" : s.level,
    role: s.role ?? null,
    conj: s.conj,
    conj_id: s.cid ?? null,
    kanji: s.kanji ? kanji(s.kanji) : undefined,
  };
}

type RuSpec = {
  lemma?: string;
  pos: string;
  case?: string;
  gender?: string;
  number?: string;
  tense?: string;
  aspect?: string;
  level?: CefrLevel | null;
  gloss?: string;
  role?: string;
  ws?: string;
};

export function ru(text: string, s: RuSpec): Token {
  const lemma = s.lemma ?? text.toLowerCase();
  return {
    text,
    ws: s.ws ?? " ",
    is_word: true,
    lemma,
    morph: {
      ...EMPTY_MORPH,
      lemma,
      pos: s.pos,
      case: s.case ?? null,
      gender: s.gender ?? null,
      number: s.number ?? null,
      tense: s.tense ?? null,
      aspect: s.aspect ?? null,
    },
    gloss: s.gloss ?? null,
    level: s.level === undefined ? "A1" : s.level,
    role: s.role ?? null,
  };
}

type ItSpec = {
  lemma?: string;
  pos: string;
  gender?: string;
  number?: string;
  tense?: string;
  mood?: string;
  form?: string;
  level?: CefrLevel | null;
  gloss?: string;
  role?: string;
  ws?: string;
};

export function it(text: string, s: ItSpec): Token {
  const lemma = s.lemma ?? text.toLowerCase();
  return {
    text,
    ws: s.ws ?? " ",
    is_word: true,
    lemma,
    morph: {
      ...EMPTY_MORPH,
      lemma,
      pos: s.pos,
      gender: s.gender ?? null,
      number: s.number ?? null,
      tense: s.tense ?? null,
      mood: s.mood ?? null,
      form: s.form ?? null,
    },
    gloss: s.gloss ?? null,
    level: s.level === undefined ? "A1" : s.level,
    role: s.role ?? null,
  };
}

type ArSpec = {
  lemma?: string;
  pos: string;
  case?: string;
  gender?: string;
  number?: string;
  tense?: string;
  mood?: string;
  voice?: string;
  person?: string;
  state?: string;
  form?: string;
  pattern?: string;
  reading?: string;
  level?: CefrLevel | null;
  gloss?: string;
  role?: string;
  ws?: string;
  root?: RootPart;
  conj?: ConjPiece[];
  enclitic?: string;
};

export function ar(text: string, s: ArSpec): Token {
  const lemma = s.lemma ?? text;
  return {
    text,
    ws: s.ws ?? " ",
    is_word: true,
    lemma,
    morph: {
      ...EMPTY_MORPH,
      lemma,
      pos: s.pos,
      case: s.case ?? null,
      gender: s.gender ?? null,
      number: s.number ?? null,
      tense: s.tense ?? null,
      mood: s.mood ?? null,
      voice: s.voice ?? null,
      person: s.person ?? null,
      state: s.state ?? null,
      form: s.form ?? null,
      conj_type: s.pattern ?? null,
      reading: s.reading ?? null,
      enclitic: s.enclitic ?? null,
    },
    gloss: s.gloss ?? null,
    level: s.level === undefined ? "A1" : s.level,
    role: s.role ?? null,
    root: s.root,
    conj: s.conj,
  };
}

export const POLITE_PAST = (stem: string): ConjPiece[] => [
  { text: stem, label: "stem" },
  { text: "まし", label: "polite" },
  { text: "た", label: "past" },
];

export const POLITE_PRES = (stem: string): ConjPiece[] => [
  { text: stem, label: "stem" },
  { text: "ます", label: "polite" },
];

export const TE_IRU = (te: string): ConjPiece[] => [
  { text: te, label: "te-form" },
  { text: "い", label: "progressive" },
  { text: "ます", label: "polite" },
];

export type DemoPassage = {
  language: LangCode;
  level: CefrLevel;
  topic: string;
  genre: string;
  title: string;
  tokens: Token[];
  /** token index preselected on first paint */
  initial: number;
};

const JA_TOKENS: Token[] = [
  ja("朝", { pos: "noun", reading: "あさ", gloss: "morning", kanji: [["朝", "あさ"]] }),
  punct("、"),
  ja("駅", { pos: "noun", reading: "えき", gloss: "station", kanji: [["駅", "えき"]] }),
  ja("の", { pos: "particle", role: "particle", detail: "case", gloss: "of; ’s" }),
  ja("近く", { pos: "noun", reading: "ちかく", level: "A2", gloss: "near; the vicinity", kanji: [["近", "ちか"]] }),
  ja("の", { pos: "particle", role: "particle", detail: "case", gloss: "of; ’s" }),
  ja("パン屋", { pos: "noun", reading: "ぱんや", level: "A2", gloss: "bakery", kanji: [["屋", "や"]] }),
  ja("に", { pos: "particle", role: "particle", detail: "case", gloss: "to; at" }),
  ja("行き", { lemma: "行く", pos: "verb", reading: "いき", gloss: "to go", role: "verb", cid: 1, conj: POLITE_PAST("行き"), kanji: [["行", "い"]] }),
  ja("まし", { lemma: "ます", pos: "aux", role: "aux", gloss: "polite marker", cid: 1, conj: POLITE_PAST("行き") }),
  ja("た", { pos: "aux", role: "aux", gloss: "past tense", cid: 1, conj: POLITE_PAST("行き") }),
  punct("。"),
  ja("店", { pos: "noun", reading: "みせ", gloss: "shop; store", kanji: [["店", "みせ"]] }),
  ja("の", { pos: "particle", role: "particle", detail: "case", gloss: "of; ’s" }),
  ja("人", { pos: "noun", reading: "ひと", gloss: "person", kanji: [["人", "ひと"]] }),
  ja("は", { pos: "particle", role: "topic", detail: "binding", gloss: "topic marker" }),
  ja("いつも", { pos: "adverb", role: "adverb", gloss: "always" }),
  ja("元気", { pos: "na-adj", reading: "げんき", role: "adj", gloss: "cheerful; healthy", cid: 2, conj: [{ text: "元気", label: "stem" }, { text: "です", label: "copula" }], kanji: [["元", "げん"], ["気", "き"]] }),
  ja("です", { pos: "aux", role: "aux", gloss: "is (polite)", cid: 2, conj: [{ text: "元気", label: "stem" }, { text: "です", label: "copula" }] }),
  punct("。"),
  ja("私", { pos: "pronoun", reading: "わたし", gloss: "I; me" }),
  ja("は", { pos: "particle", role: "topic", detail: "binding", gloss: "topic marker" }),
  ja("メロンパン", { pos: "noun", level: "A2", gloss: "melon bread" }),
  ja("と", { pos: "particle", role: "particle", detail: "case", gloss: "and; with" }),
  ja("コーヒー", { pos: "noun", gloss: "coffee" }),
  ja("を", { pos: "particle", role: "object", detail: "case", gloss: "object marker" }),
  ja("買い", { lemma: "買う", pos: "verb", reading: "かい", gloss: "to buy", role: "verb", cid: 3, conj: POLITE_PAST("買い"), kanji: [["買", "か"]] }),
  ja("まし", { lemma: "ます", pos: "aux", role: "aux", gloss: "polite marker", cid: 3, conj: POLITE_PAST("買い") }),
  ja("た", { pos: "aux", role: "aux", gloss: "past tense", cid: 3, conj: POLITE_PAST("買い") }),
  punct("。"),
  ja("公園", { pos: "noun", reading: "こうえん", gloss: "park", kanji: [["公", "こう"], ["園", "えん"]] }),
  ja("で", { pos: "particle", role: "particle", detail: "case", gloss: "at; in (place of action)" }),
  ja("パン", { pos: "noun", gloss: "bread" }),
  ja("を", { pos: "particle", role: "object", detail: "case", gloss: "object marker" }),
  ja("食べ", { lemma: "食べる", pos: "verb", reading: "たべ", gloss: "to eat", role: "verb", cid: 4, conj: POLITE_PAST("食べ"), kanji: [["食", "た"]] }),
  ja("まし", { lemma: "ます", pos: "aux", role: "aux", gloss: "polite marker", cid: 4, conj: POLITE_PAST("食べ") }),
  ja("た", { pos: "aux", role: "aux", gloss: "past tense", cid: 4, conj: POLITE_PAST("食べ") }),
  punct("。"),
  ja("天気", { pos: "noun", reading: "てんき", gloss: "weather", kanji: [["天", "てん"], ["気", "き"]] }),
  ja("が", { pos: "particle", role: "subject", detail: "case", gloss: "subject marker" }),
  ja("よく", { lemma: "良い", pos: "i-adj", role: "adj", gloss: "good", cid: 5, conj: [{ text: "よく", label: "stem" }, { text: "て", label: "te-form" }] }),
  ja("て", { pos: "particle", role: "aux", detail: "conjunctive", gloss: "and (linking)", cid: 5, conj: [{ text: "よく", label: "stem" }, { text: "て", label: "te-form" }] }),
  punct("、"),
  ja("気持ち", { pos: "noun", reading: "きもち", level: "A2", gloss: "feeling; mood", kanji: [["気", "き"], ["持", "も"]] }),
  ja("が", { pos: "particle", role: "subject", detail: "case", gloss: "subject marker" }),
  ja("よかっ", { lemma: "良い", pos: "i-adj", role: "adj", gloss: "good", cid: 6, conj: [{ text: "よかっ", label: "stem" }, { text: "た", label: "past" }, { text: "です", label: "copula" }] }),
  ja("た", { pos: "aux", role: "aux", gloss: "past tense", cid: 6, conj: [{ text: "よかっ", label: "stem" }, { text: "た", label: "past" }, { text: "です", label: "copula" }] }),
  ja("です", { pos: "aux", role: "aux", gloss: "is (polite)", cid: 6, conj: [{ text: "よかっ", label: "stem" }, { text: "た", label: "past" }, { text: "です", label: "copula" }] }),
  punct("。"),
];

const RU_TOKENS: Token[] = [
  ru("Каждое", { lemma: "каждый", pos: "ADJF", case: "acc", gender: "neut", number: "sg", gloss: "each; every", role: "adj" }),
  ru("утро", { pos: "NOUN", case: "acc", gender: "neut", number: "sg", gloss: "morning" }),
  ru("я", { pos: "NPRO", case: "nom", number: "sg", gloss: "I" }),
  ru("иду", { lemma: "идти", pos: "VERB", aspect: "impf", tense: "pres", number: "sg", gloss: "to go (on foot)", role: "verb" }),
  ru("на", { pos: "PREP", gloss: "on; to", role: "particle" }),
  ru("рынок", { pos: "NOUN", case: "acc", gender: "masc", number: "sg", level: "A2", gloss: "market", ws: "" }),
  punct(".", " "),
  ru("Там", { pos: "ADVB", gloss: "there", role: "adverb" }),
  ru("продают", { lemma: "продавать", pos: "VERB", aspect: "impf", tense: "pres", number: "pl", level: "A2", gloss: "to sell", role: "verb" }),
  ru("свежий", { pos: "ADJF", case: "acc", gender: "masc", number: "sg", level: "A2", gloss: "fresh", role: "adj" }),
  ru("хлеб", { pos: "NOUN", case: "acc", gender: "masc", number: "sg", gloss: "bread" }),
  ru("и", { pos: "CONJ", gloss: "and", role: "particle" }),
  ru("сыр", { pos: "NOUN", case: "acc", gender: "masc", number: "sg", gloss: "cheese", ws: "" }),
  punct(".", " "),
  ru("Я", { lemma: "я", pos: "NPRO", case: "nom", number: "sg", gloss: "I" }),
  ru("покупаю", { lemma: "покупать", pos: "VERB", aspect: "impf", tense: "pres", number: "sg", gloss: "to buy", role: "verb" }),
  ru("яблоки", { lemma: "яблоко", pos: "NOUN", case: "acc", gender: "neut", number: "pl", gloss: "apple" }),
  ru("и", { pos: "CONJ", gloss: "and", role: "particle" }),
  ru("говорю", { lemma: "говорить", pos: "VERB", aspect: "impf", tense: "pres", number: "sg", gloss: "to say; to speak", role: "verb" }),
  ru("продавцу", { lemma: "продавец", pos: "NOUN", case: "dat", gender: "masc", number: "sg", level: "A2", gloss: "seller; shop assistant", ws: "" }),
  punct(":", " "),
  punct("«"),
  ru("Доброе", { lemma: "добрый", pos: "ADJF", case: "nom", gender: "neut", number: "sg", gloss: "kind; good", role: "adj" }),
  ru("утро", { pos: "NOUN", case: "nom", gender: "neut", number: "sg", gloss: "morning", ws: "" }),
  punct("!"),
  punct("»", " "),
  ru("Потом", { pos: "ADVB", gloss: "then; afterwards", role: "adverb" }),
  ru("я", { pos: "NPRO", case: "nom", number: "sg", gloss: "I" }),
  ru("иду", { lemma: "идти", pos: "VERB", aspect: "impf", tense: "pres", number: "sg", gloss: "to go (on foot)", role: "verb" }),
  ru("домой", { pos: "ADVB", gloss: "home (direction)", role: "adverb" }),
  ru("и", { pos: "CONJ", gloss: "and", role: "particle" }),
  ru("пью", { lemma: "пить", pos: "VERB", aspect: "impf", tense: "pres", number: "sg", gloss: "to drink", role: "verb" }),
  ru("чай", { pos: "NOUN", case: "acc", gender: "masc", number: "sg", gloss: "tea", ws: "" }),
  punct("."),
];

const IT_TOKENS: Token[] = [
  it("Ogni", { lemma: "ogni", pos: "DET", gloss: "each / every", level: "A2" }),
  it("mattina", { pos: "NOUN", gender: "fem", number: "sg", gloss: "morning" }),
  it("Anna", { pos: "PROPN", gloss: "Anna", level: null }),
  it("va", { lemma: "andare", pos: "VERB", tense: "pres", mood: "indc", form: "fin", number: "sg", gloss: "to go", role: "verb" }),
  it("al", { lemma: "a", pos: "ADP", gloss: "to / at", role: "particle" }),
  it("mercato", { pos: "NOUN", gender: "masc", number: "sg", level: "A1", gloss: "market", ws: "" }),
  punct(".", " "),
  it("Là", { lemma: "là", pos: "ADV", gloss: "there", role: "adverb" }),
  it("vendono", { lemma: "vendere", pos: "VERB", tense: "pres", mood: "indc", form: "fin", number: "pl", level: "A2", gloss: "to sell", role: "verb" }),
  it("pane", { pos: "NOUN", gender: "masc", number: "sg", gloss: "bread" }),
  it("fresco", { pos: "ADJ", gender: "masc", number: "sg", level: "A2", gloss: "fresh", role: "adj" }),
  it("e", { pos: "CCONJ", gloss: "and", role: "particle" }),
  it("formaggio", { pos: "NOUN", gender: "masc", number: "sg", gloss: "cheese", ws: "" }),
  punct(".", " "),
  it("Anna", { pos: "PROPN", gloss: "Anna", level: null }),
  it("compra", { lemma: "comprare", pos: "VERB", tense: "pres", mood: "indc", form: "fin", number: "sg", gloss: "to buy", role: "verb" }),
  it("mele", { lemma: "mela", pos: "NOUN", gender: "fem", number: "pl", gloss: "apple" }),
  it("e", { pos: "CCONJ", gloss: "and", role: "particle" }),
  it("dice", { lemma: "dire", pos: "VERB", tense: "pres", mood: "indc", form: "fin", number: "sg", gloss: "to say", role: "verb" }),
  it("al", { lemma: "a", pos: "ADP", gloss: "to / at", role: "particle" }),
  it("venditore", { pos: "NOUN", gender: "masc", number: "sg", level: "A2", gloss: "seller", ws: "" }),
  punct(":", " "),
  punct("«"),
  it("Buongiorno", { pos: "INTJ", gloss: "good morning", ws: "" }),
  punct("!"),
  punct("»", " "),
  it("Poi", { pos: "ADV", gloss: "then", role: "adverb" }),
  it("va", { lemma: "andare", pos: "VERB", tense: "pres", mood: "indc", form: "fin", number: "sg", gloss: "to go", role: "verb" }),
  it("a", { pos: "ADP", gloss: "to / at", role: "particle" }),
  it("casa", { pos: "NOUN", gender: "fem", number: "sg", gloss: "house / home" }),
  it("e", { pos: "CCONJ", gloss: "and", role: "particle" }),
  it("beve", { lemma: "bere", pos: "VERB", tense: "pres", mood: "indc", form: "fin", number: "sg", gloss: "to drink", role: "verb" }),
  it("tè", { pos: "NOUN", gender: "masc", number: "sg", gloss: "tea", ws: "" }),
  punct("."),
];

export const KTB: RootPart = {
  letters: "ك ت ب",
  pattern: "فَعَلَ",
  form: "I",
  form_name: "فَعَلَ",
  meaning: "write",
};
export const DHB: RootPart = {
  letters: "ذ ه ب",
  pattern: "فَعَلَ",
  form: "I",
  form_name: "فَعَلَ",
  meaning: "go",
};
export const SHR: RootPart = {
  letters: "ش ر ي",
  pattern: "افْتَعَلَ",
  form: "VIII",
  form_name: "اِفْتَعَلَ",
  meaning: "buy",
};
export const QR: RootPart = {
  letters: "ق ر أ",
  pattern: "فَعَلَ",
  form: "I",
  form_name: "فَعَلَ",
  meaning: "read",
};

const AR_TOKENS: Token[] = [
  ar("كل", { lemma: "كل", pos: "DET", gloss: "every", level: "A1", ws: " " }),
  ar("صباح", { pos: "NOUN", case: "gen", gender: "masc", number: "sg", state: "indef", gloss: "morning", reading: "صَبَاحٍ" }),
  ar("أذهب", { lemma: "ذهب", pos: "VERB", tense: "pres", mood: "indc", voice: "act", person: "1", number: "sg", form: "I", pattern: "yaCCaC", gloss: "to go", role: "verb", reading: "أَذْهَبُ", root: DHB }),
  ar("إلى", { pos: "ADP", gloss: "to", role: "particle" }),
  ar("السوق", { lemma: "سوق", pos: "NOUN", case: "gen", gender: "masc", number: "sg", state: "def", gloss: "market", reading: "السُّوقِ", ws: "" }),
  punct(".", " "),
  ar("هناك", { pos: "ADV", gloss: "there", role: "adverb" }),
  ar("أشتري", { lemma: "اشترى", pos: "VERB", tense: "pres", mood: "indc", voice: "act", person: "1", number: "sg", form: "VIII", pattern: "{ifotaEal", gloss: "to buy", role: "verb", reading: "أَشْتَرِي", root: SHR, level: "A2" }),
  ar("خبزا", { lemma: "خبز", pos: "NOUN", case: "acc", gender: "masc", number: "sg", state: "indef", gloss: "bread", reading: "خُبْزًا" }),
  ar("و", { pos: "CCONJ", gloss: "and", role: "particle" }),
  ar("ماء", { pos: "NOUN", case: "acc", gender: "masc", number: "sg", state: "indef", gloss: "water", ws: "" }),
  punct(".", " "),
  ar("أحمد", { pos: "PROPN", gloss: "Ahmad", level: null }),
  ar("يشتري", { lemma: "اشترى", pos: "VERB", tense: "pres", mood: "indc", voice: "act", person: "3", number: "sg", gender: "masc", form: "VIII", gloss: "to buy", role: "verb", reading: "يَشْتَرِي", root: SHR, level: "A2" }),
  ar("تفاحا", { lemma: "تفاح", pos: "NOUN", case: "acc", gender: "masc", number: "sg", state: "indef", gloss: "apple" }),
  ar("و", { pos: "CCONJ", gloss: "and", role: "particle" }),
  ar("يقول", { lemma: "قال", pos: "VERB", tense: "pres", mood: "indc", voice: "act", person: "3", number: "sg", form: "I", gloss: "to say", role: "verb", reading: "يَقُولُ" }),
  ar("للبائع", { lemma: "بائع", pos: "NOUN", case: "gen", gender: "masc", number: "sg", state: "def", gloss: "seller", level: "A2", ws: "" }),
  punct(":", " "),
  punct("«"),
  ar("صباح", { pos: "NOUN", case: "nom", gender: "masc", number: "sg", state: "const", gloss: "morning" }),
  ar("الخير", { lemma: "خير", pos: "NOUN", case: "gen", gender: "masc", number: "sg", state: "def", gloss: "goodness", ws: "" }),
  punct("!"),
  punct("»", " "),
  ar("ثم", { pos: "ADV", gloss: "then", role: "adverb" }),
  ar("أقرأ", { lemma: "قرأ", pos: "VERB", tense: "pres", mood: "indc", voice: "act", person: "1", number: "sg", form: "I", gloss: "to read", role: "verb", reading: "أَقْرَأُ", root: QR }),
  ar("كتابي", {
    lemma: "كتاب",
    pos: "NOUN",
    case: "acc",
    gender: "masc",
    number: "sg",
    state: "const",
    gloss: "book",
    reading: "كِتَابِي",
    root: KTB,
    enclitic: "1s_poss",
    conj: [
      { text: "كتاب", label: "stem" },
      { text: "ي", label: "my" },
    ],
    ws: "",
  }),
  punct("."),
];

export const DEMO: Record<LangCode, DemoPassage> = {
  ja: {
    language: "ja",
    level: "A2",
    topic: "A bakery near the station",
    genre: "Daily life",
    title: "朝のパン屋",
    tokens: JA_TOKENS,
    initial: JA_TOKENS.findIndex((t) => t.text === "食べ"),
  },
  ru: {
    language: "ru",
    level: "A2",
    topic: "A morning at the market",
    genre: "Daily life",
    title: "Утро на рынке",
    tokens: RU_TOKENS,
    initial: RU_TOKENS.findIndex((t) => t.text === "продавцу"),
  },
  it: {
    language: "it",
    level: "A2",
    topic: "A morning at the market",
    genre: "Daily life",
    title: "Mattina al mercato",
    tokens: IT_TOKENS,
    initial: IT_TOKENS.findIndex((t) => t.text === "venditore"),
  },
  ar: {
    language: "ar",
    level: "A2",
    topic: "A morning at the market",
    genre: "Daily life",
    title: "صباح في السوق",
    tokens: AR_TOKENS,
    initial: AR_TOKENS.findIndex((t) => t.text === "كتابي"),
  },
};

/* ---------- prompted-vs-checked comparison ---------- */

export type DriftSegment = { text: string; flag?: string };

export type DriftSample = {
  prompt: string;
  drifted: DriftSegment[];
  driftedSummary: string;
  checked: string;
  checkedReport: { k: string; v: string }[];
  checkedSummary: string;
};

export const DRIFT: Record<LangCode, DriftSample> = {
  ja: {
    prompt: "“Write something easy for a beginner learning Japanese.”",
    drifted: [
      { text: "駅前のパン屋で働いている", flag: "ている, relative clause" },
      { text: "田中さんは、毎朝五時に起きます。" },
      { text: "焼きたてのパンを買いに来る", flag: "relative clause" },
      { text: "お客様が" },
      { text: "いらっしゃる", flag: "keigo" },
      { text: "と、「おはようございます」と言います。もし雨が" },
      { text: "降ったら", flag: "conditional" },
      { text: "、お客様は少なくなります。" },
    ],
    driftedSummary: "Above A2 in 4 places, across three sentences",
    checked:
      "田中さんは駅の前のパン屋で働きます。毎朝五時に起きて、パンを焼きます。八時に店を開けます。お客さんはパンを買って、「おはようございます」と言います。雨の日はお客さんが少ないです。",
    checkedReport: [
      { k: "New words", v: "13%, under the A2 limit of 20%" },
      { k: "Grammar kept out", v: "no ている, relative clauses, keigo, or conditionals" },
      { k: "What slipped through", v: "nothing" },
    ],
    checkedSummary: "Reads exactly like it says it does",
  },
  ru: {
    prompt: "“Write something easy for a beginner learning Russian.”",
    drifted: [
      { text: "Каждое утро Анна, " },
      { text: "живущая", flag: "participle" },
      { text: " у рынка, покупает свежий хлеб. " },
      { text: "Возвращаясь", flag: "verbal adverb" },
      { text: " домой, она говорит «Доброе утро!» соседу, " },
      { text: "который", flag: "который" },
      { text: " работает " },
      { text: "пекарем", flag: "instrumental" },
      { text: ". Если " },
      { text: "бы", flag: "бы" },
      { text: " у неё было время, она " },
      { text: "пекла бы", flag: "бы" },
      { text: " хлеб сама." },
    ],
    driftedSummary: "Above A2 in 6 places, across three sentences",
    checked:
      "Каждое утро Анна идёт на рынок. Там она покупает свежий хлеб и сыр. Потом она идёт домой и говорит соседу: «Доброе утро!». Сосед работает в пекарне. Анна любит хлеб из пекарни, но у неё мало времени.",
    checkedReport: [
      { k: "New words", v: "12%, under the A2 limit of 18%" },
      { k: "Grammar kept out", v: "no participles, verbal adverbs, который, instrumental, or бы" },
      { k: "What slipped through", v: "nothing" },
    ],
    checkedSummary: "Reads exactly like it says it does",
  },
  it: {
    prompt: "“Write something easy for a beginner learning Italian.”",
    drifted: [
      { text: "Ogni mattina Anna, " },
      { text: "camminando", flag: "gerund" },
      { text: " verso il mercato, compra pane fresco. " },
      { text: "Benché abbia", flag: "benché, subjunctive" },
      { text: " poco tempo, parla con il vicino " },
      { text: "che", flag: "relative che" },
      { text: " lavora nel negozio. Se " },
      { text: "avesse", flag: "subjunctive" },
      { text: " più tempo, " },
      { text: "farebbe", flag: "conditional" },
      { text: " il pane a casa." },
    ],
    driftedSummary: "Above A2 in 5 places, across three sentences",
    checked:
      "Ogni mattina Anna va al mercato. Là compra pane fresco e formaggio. Poi va a casa e dice al vicino: «Buongiorno!». Il vicino lavora nel negozio. Anna ama il pane del negozio, ma ha poco tempo.",
    checkedReport: [
      { k: "New words", v: "none above A2" },
      { k: "Grammar kept out", v: "no gerunds, subjunctives, conditionals, or relative che" },
      { k: "What slipped through", v: "nothing" },
    ],
    checkedSummary: "Reads exactly like it says it does",
  },
  ar: {
    prompt: "“Write something easy for a beginner learning Arabic.”",
    drifted: [
      { text: "كل صباح يذهب أحمد إلى السوق " },
      { text: "الذي", flag: "relative الذي" },
      { text: " يقع قرب البيت. " },
      { text: "كان يشتري", flag: "كان + verb" },
      { text: " الخبز هناك كل يوم. " },
      { text: "إنّ", flag: "إنّ" },
      { text: " البائع رجل طيب، و" },
      { text: "ابناه يعملان", flag: "dual" },
      { text: " معه." },
    ],
    driftedSummary: "Above A2 in 4 places, across three sentences",
    checked:
      "كل صباح يذهب أحمد إلى السوق. السوق قريب من البيت. هناك يبيع رجل الخبز. يعمل معه ابنه. يقول أحمد للرجل: «صباح الخير!». ثم يأخذ أحمد الخبز ويدفع. بعد ذلك يذهب إلى البيت.",
    checkedReport: [
      { k: "New words", v: "7%, under the A2 limit of 18%" },
      { k: "Grammar kept out", v: "no الذي, كان + verb, إنّ, or the dual" },
      { k: "What slipped through", v: "nothing" },
    ],
    checkedSummary: "Reads exactly like it says it does",
  },
};
