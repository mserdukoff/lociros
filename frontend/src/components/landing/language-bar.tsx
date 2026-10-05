"use client";

import { motion } from "motion/react";
import { readingFont, type LangCode } from "@/lib/types";
import { THEMES } from "./themes";

/** The page-wide language picker; each dot is that theme's accent. */
export function LanguageBar({
  value,
  options,
  onChange,
}: {
  value: LangCode;
  options: { id: LangCode; label: string; native: string }[];
  onChange: (id: LangCode) => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-card border border-ink/15">
      <span className="hidden shrink-0 items-center border-r border-ink/15 px-5 text-[12.5px] tracking-[0.01em] text-ink/55 md:flex">
        Read in
      </span>
      <div
        role="radiogroup"
        aria-label="Language"
        className="grid flex-1 divide-x divide-ink/15"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((l) => {
          const active = l.id === value;
          const theme = THEMES[l.id];
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(l.id)}
              className={`group relative flex min-w-0 flex-col items-start gap-1 px-3 py-3 text-left transition-colors duration-300 sm:px-5 sm:py-3.5 ${
                active ? "bg-paper-raised/70" : "hover:bg-paper-raised/40"
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="language-bar-mark"
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[3px] bg-terracotta"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              ) : null}
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full transition-transform duration-300 group-hover:scale-125"
                  style={{ background: theme.vars["--terracotta"] }}
                />
                <span
                  lang={l.id}
                  dir={l.id === "ar" ? "rtl" : undefined}
                  className={`truncate text-[1.05rem] leading-none transition-colors sm:text-[1.2rem] ${readingFont(l.id)} ${
                    active ? "text-ink" : "text-ink/55 group-hover:text-ink"
                  }`}
                >
                  {l.native}
                </span>
              </span>
              <span
                className={`pl-4 text-[11.5px] leading-tight transition-colors ${
                  active ? "text-ink/65" : "text-ink/40"
                }`}
              >
                {l.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
