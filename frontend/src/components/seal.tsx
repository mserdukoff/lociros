"use client";

import { useId, useMemo, useState, useEffect } from "react";
import { sealCopyFor, sealInscription } from "@/lib/seal-copy";

export type SealSize = "hero" | "corner" | "mark";
export type SealVerdict = "pass" | "fail";

const SIZE_CLASS: Record<SealSize, string> = {
  hero: "h-[7.5rem] w-[7.5rem] sm:h-[8.5rem] sm:w-[8.5rem]",
  corner: "h-[5.75rem] w-[5.75rem] sm:h-[6.25rem] sm:w-[6.25rem]",
  mark: "h-10 w-10",
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One exam seal for every language. Inscription comes from `SEAL_COPY`;
 * missing languages render Pass / Fail. Never a creature, never in the gloss.
 */
export function Seal({
  verdict,
  language,
  level,
  size = "corner",
  animate = false,
  inverted = false,
  className = "",
}: {
  verdict: SealVerdict;
  language: string;
  level: string;
  size?: SealSize;
  animate?: boolean;
  inverted?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const copy = sealCopyFor(language);
  const word = verdict === "pass" ? copy.pass : copy.fail;
  const { lines, fontSize } = sealInscription(word, copy.script);
  const [motionOk, setMotionOk] = useState(false);

  useEffect(() => {
    setMotionOk(!prefersReducedMotion());
  }, []);

  const fontFamily =
    copy.script === "cjk"
      ? "var(--gothic)"
      : copy.script === "arabic"
        ? "var(--naskh)"
        : "var(--serif)";
  const filterId = `seal-bleed-${uid}`;
  const press = animate && motionOk;

  const lineStarts = useMemo(() => {
    if (lines.length === 1) return [54];
    const gap = fontSize * 1.05;
    const mid = 54;
    return lines.map((_, i) => mid - ((lines.length - 1) * gap) / 2 + i * gap);
  }, [lines, fontSize]);

  return (
    <span
      className={`seal inline-block shrink-0 ${verdict === "pass" ? "seal-pass" : ""} ${inverted ? "seal-inverted" : ""} ${press ? "seal-animate" : ""} ${SIZE_CLASS[size]} ${className}`}
      role="img"
      aria-label={`${word} · ${level}`}
      dir={copy.rtl ? "rtl" : "ltr"}
    >
      <svg viewBox="0 0 100 100" className="block h-full w-full" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="1"
              result="n"
            />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="0.7" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`} fill="none" stroke="currentColor">
          <circle cx="50" cy="50" r="46.5" strokeWidth="2.4" opacity="0.92" />
          <circle cx="50" cy="50" r="40" strokeWidth="1.15" opacity="0.88" />
        </g>
        {size !== "mark" ? (
          <text
            x="50"
            y="24"
            textAnchor="middle"
            fill="currentColor"
            fontFamily="var(--serif)"
            fontSize="7.2"
            letterSpacing="0.28em"
            opacity="0.9"
          >
            {level}
          </text>
        ) : null}
        {lines.map((line, i) => (
          <text
            key={`${i}-${line}`}
            x="50"
            y={lineStarts[i]}
            textAnchor="middle"
            fill="currentColor"
            fontFamily={fontFamily}
            fontSize={size === "mark" ? Math.min(fontSize, 16) : fontSize}
            fontWeight={copy.script === "cjk" ? 600 : 500}
            opacity="0.92"
          >
            {line}
          </text>
        ))}
      </svg>
    </span>
  );
}
