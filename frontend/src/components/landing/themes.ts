import type { CSSProperties } from "react";
import type { LangCode } from "@/lib/types";

/**
 * The landing page re-inks itself in the language you pick. Each theme
 * overrides the same tokens globals.css defines on :root, so every
 * component on the page follows without knowing about themes.
 */
export type LandingTheme = {
  /** The verb "read" in the language, shown as a stamp in the hero. */
  read: string;
  /** Background wash for the three.js shader: paper, then two tints. */
  wash: [string, string, string];
  vars: Record<`--${string}`, string>;
};

export const THEMES: Record<LangCode, LandingTheme> = {
  // Washi paper, sumi ink, a vermilion seal.
  ja: {
    read: "読む",
    wash: ["#f6f2ea", "#efe8dd", "#f2ddd5"],
    vars: {
      "--paper": "#f6f2ea",
      "--paper-raised": "#fdfbf7",
      "--paper-deep": "#ece6da",
      "--blush": "#f6e1dc",
      "--blush-deep": "#ecc3b9",
      "--sage-wash": "#ecebe2",
      "--sage": "#4a5e4f",
      "--ink": "#22201c",
      "--rule": "#e2dbce",
      "--terracotta": "#d0412a",
      "--r-card": "3px",
      "--r-sheet": "6px",
      "--elev-card": "0 1px 0 rgb(34 32 28 / 0.04), 0 10px 26px -18px rgb(34 32 28 / 0.3)",
      "--elev-float": "0 1px 0 rgb(34 32 28 / 0.05), 0 22px 44px -22px rgb(34 32 28 / 0.38)",
    },
  },
  // Sand, lapis, and saffron gold.
  ar: {
    read: "اقرأ",
    wash: ["#f3e9d6", "#ecdcbd", "#dbe3d6"],
    vars: {
      "--paper": "#f3e9d6",
      "--paper-raised": "#fbf6ec",
      "--paper-deep": "#e9dcc2",
      "--blush": "#f1e0c8",
      "--blush-deep": "#e2c49a",
      "--sage-wash": "#e4e5d2",
      "--sage": "#2b6b66",
      "--ink": "#123349",
      "--rule": "#decdb0",
      "--terracotta": "#b97a22",
      "--r-card": "12px",
      "--r-sheet": "22px",
      "--elev-card": "0 1px 2px rgb(18 51 73 / 0.06), 0 14px 34px -16px rgb(18 51 73 / 0.28)",
      "--elev-float": "0 2px 4px rgb(18 51 73 / 0.07), 0 26px 52px -20px rgb(18 51 73 / 0.36)",
    },
  },
  // Fresco plaster, umber, Pompeian red.
  it: {
    read: "Leggi",
    wash: ["#f5ebdc", "#f1dcbe", "#ecd6c6"],
    vars: {
      "--paper": "#f5ebdc",
      "--paper-raised": "#fdf8f0",
      "--paper-deep": "#ecdfca",
      "--blush": "#f4dccb",
      "--blush-deep": "#e7bda3",
      "--sage-wash": "#ebe6cf",
      "--sage": "#66763a",
      "--ink": "#3a2418",
      "--rule": "#e3d2b9",
      "--terracotta": "#a8322a",
      "--r-card": "8px",
      "--r-sheet": "14px",
      "--elev-card": "0 1px 2px rgb(58 36 24 / 0.06), 0 12px 32px -14px rgb(58 36 24 / 0.26)",
      "--elev-float": "0 2px 4px rgb(58 36 24 / 0.07), 0 24px 48px -18px rgb(58 36 24 / 0.36)",
    },
  },
  // Gzhel porcelain: cobalt on blue-white, square corners, hard shadows.
  ru: {
    read: "Читай",
    wash: ["#e8eef7", "#dbe5f3", "#e9e6f1"],
    vars: {
      "--paper": "#e8eef7",
      "--paper-raised": "#f7f9fd",
      "--paper-deep": "#d9e2f0",
      "--blush": "#dfe6f6",
      "--blush-deep": "#b9c8ea",
      "--sage-wash": "#e1e8ef",
      "--sage": "#2f5d6e",
      "--ink": "#111d3a",
      "--rule": "#c9d4e6",
      "--terracotta": "#2343b0",
      "--btn": "#2343b0",
      "--r-card": "0px",
      "--r-sheet": "0px",
      "--elev-card": "3px 3px 0 rgb(17 29 58)",
      "--elev-float": "6px 6px 0 rgb(17 29 58)",
    },
  },
};

export function themeStyle(lang: LangCode): CSSProperties {
  return THEMES[lang].vars as CSSProperties;
}
