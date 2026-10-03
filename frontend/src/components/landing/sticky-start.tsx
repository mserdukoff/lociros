"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getDeviceId } from "@/lib/device";

/**
 * A/B test of a Start reading bar pinned to the bottom of phone screens.
 * Off unless NEXT_PUBLIC_STICKY_START_TEST=1. Browsers are split by device id,
 * and the arm rides on landing_view so the funnel metrics can compare how many
 * of each arm finish placement. Judge it on placement_done, not on clicks.
 */
export const STICKY_TEST = process.env.NEXT_PUBLIC_STICKY_START_TEST === "1";

export type StickyArm = "sticky" | "control";

export function stickyArm(deviceId: string): StickyArm {
  let h = 0;
  for (const ch of deviceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 === 0 ? "sticky" : "control";
}

function noop() {
  return () => {};
}

function useArm(): StickyArm | null {
  return useSyncExternalStore(
    noop,
    () => (STICKY_TEST ? stickyArm(getDeviceId()) : null),
    () => null,
  );
}

/**
 * Shown only while no other Start reading link (marked data-start) is on
 * screen, so a screen never has two primary buttons.
 */
export function StickyStart({ onStart }: { onStart: (event: React.MouseEvent) => void }) {
  const arm = useArm();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (arm !== "sticky") return;
    const targets = Array.from(document.querySelectorAll("[data-start]"));
    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setVisible(onScreen.size === 0 && window.scrollY > 200);
    });
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [arm]);

  if (arm !== "sticky") return null;
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur transition-transform duration-200 sm:hidden ${
        visible ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
    >
      <Link
        href="/library"
        tabIndex={visible ? 0 : -1}
        onClick={onStart}
        className="btn-primary w-full"
      >
        Start reading
      </Link>
    </div>
  );
}
