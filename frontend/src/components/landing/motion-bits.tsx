"use client";

import { motion, useScroll, useTransform, type Variants } from "motion/react";
import { useRef } from "react";
import { ARROWS, artSrcSet } from "./art";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 22,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.1 } },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
};

export function Stagger({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

/** Fades an etching in like ink settling into paper. Remount with `key` to replay. */
export function InkArt({
  src,
  className = "",
  delay = 0,
  sizes = "(min-width: 1024px) 40vw, 90vw",
}: {
  src: string;
  className?: string;
  delay?: number;
  sizes?: string;
}) {
  return (
    <motion.img
      src={`/art/${src}.webp`}
      srcSet={artSrcSet(src)}
      sizes={sizes}
      alt=""
      aria-hidden="true"
      decoding="async"
      loading="lazy"
      className={`art ${className}`}
      initial={{ opacity: 0, scale: 1.02, filter: "blur(8px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 1.1, ease: EASE, delay }}
    />
  );
}

export function DrawnArrow({ kind, className = "" }: { kind: keyof typeof ARROWS; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      className={`art text-ink/55 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d={ARROWS[kind]}
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 1.1, ease: "easeInOut", delay: 0.3 }}
      />
    </svg>
  );
}

/** A slow idle bob, for chips that sit on top of art. */
export function Float({
  children,
  className = "",
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: [0, -5, 0] }}
      transition={{
        opacity: { duration: 0.7, delay },
        y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay },
      }}
    >
      {children}
    </motion.div>
  );
}

export function Parallax({
  children,
  className = "",
  distance = 60,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, distance]);
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
