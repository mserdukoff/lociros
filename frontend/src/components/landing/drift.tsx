"use client";

import { useEffect, useRef, useState } from "react";
import { Seal } from "@/components/seal";
import type { LangCode } from "@/lib/types";
import { readingFont } from "@/lib/types";
import { DRIFT } from "./demo-data";

function useOnceInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, on };
}

/**
 * Two proof sheets: what a plain "make it easy" request produces (with the
 * trouble spots marked on the text) and what the same request produces once
 * it's actually held to the level.
 */
export function Drift({ lang }: { lang: LangCode }) {
  const sample = DRIFT[lang];
  const font = readingFont(lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const { ref, on } = useOnceInView<HTMLDivElement>();
  return (
    <div ref={ref} className="grid gap-10 md:grid-cols-2 md:gap-6">
      <figure className="flex flex-col">
        <div className="relative flex-1">
          <div className="sheet h-full bg-[#fbf3ee] px-5 py-6 sm:px-6">
            <span aria-hidden="true" className="float-right h-16 w-20" />
            <p className="mb-3 text-[12.5px] italic text-ink/45">Asked for {sample.prompt}</p>
            <p lang={lang} dir={dir} className={`text-[1.08rem] leading-[1.95] text-ink ${font}`}>
              {sample.drifted.map((seg, i) =>
                seg.flag ? (
                  <span key={i}>
                    <span className="border-b-[1.5px] border-terracotta">{seg.text}</span>
                    <sup
                      dir="ltr"
                      className="mx-1 whitespace-nowrap font-sans text-[11px] font-medium text-terracotta"
                    >
                      {seg.flag}
                    </sup>
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
          </div>
          <div className="pointer-events-none absolute -right-2 -top-4">
            <Seal verdict="fail" language={lang} level="A2" size="corner" animate={on} />
          </div>
        </div>
        <figcaption className="tnum mt-3 px-1 text-[12px] text-terracotta">
          {sample.driftedSummary}
        </figcaption>
      </figure>

      <figure className="flex flex-col">
        <div className="relative flex flex-1 flex-col">
          <div className="sheet flex-1 px-5 py-6 sm:px-6">
            <span aria-hidden="true" className="float-right h-16 w-20" />
            <p lang={lang} dir={dir} className={`text-[1.08rem] leading-[1.95] text-ink ${font}`}>
              {sample.checked}
            </p>
            <dl className="clear-both mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-rule/70 pt-4 text-[12.5px]">
              {sample.checkedReport.map((row) => (
                <div key={row.k} className="contents">
                  <dt className="t-eyebrow pt-[3px] text-[10px]!">{row.k}</dt>
                  <dd className="tnum leading-relaxed text-ink/70">{row.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="pointer-events-none absolute -right-2 -top-4">
            <Seal verdict="pass" language={lang} level="A2" size="corner" animate={on} />
          </div>
        </div>
        <figcaption className="tnum mt-3 px-1 text-[12px] text-ink/60">
          {sample.checkedSummary}
        </figcaption>
      </figure>
    </div>
  );
}
