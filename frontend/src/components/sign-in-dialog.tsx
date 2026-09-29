"use client";

import { AuthPanel } from "@/components/auth-panel";
import { Modal } from "@/components/modal";
import type { MeResponse } from "@/lib/types";

export type AuthMode = "signup" | "signin";

export function SignInDialog({
  open,
  onClose,
  me,
  onRefresh,
  mode = "signin",
  nextPath = "/library",
}: {
  open: boolean;
  onClose: () => void;
  me: MeResponse | null;
  onRefresh: () => void;
  mode?: AuthMode;
  nextPath?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} label={mode === "signup" ? "Create account" : "Sign in"}>
      <AuthPanel
        key={mode}
        me={me}
        onRefresh={onRefresh}
        layout="dialog"
        initialMode={mode}
        nextPath={nextPath}
        redirectOnSuccess
        onSignedIn={onClose}
      />
    </Modal>
  );
}
