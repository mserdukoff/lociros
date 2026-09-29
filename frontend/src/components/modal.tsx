"use client";

import { useEffect, useRef } from "react";

/**
 * Native <dialog> shown with showModal(): focus stays inside, Escape closes,
 * the page behind is inert. Focus goes to the first [data-autofocus] element.
 */
export function Modal({
  open,
  onClose,
  label,
  width = "24rem",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  width?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ width: `min(${width}, calc(100% - 2rem))` }}
      className="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[12px] border border-ink/8 bg-paper-raised p-0 text-ink shadow-float backdrop:bg-ink/35"
    >
      <div className="relative px-7 pb-7 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="t-quiet absolute right-5 top-5 text-[13px]!"
          aria-label={`Close ${label.toLowerCase()}`}
        >
          Close
        </button>
        {open ? children : null}
      </div>
    </dialog>
  );
}
