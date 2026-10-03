"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Renders its own document without globals.css, so styles are inline.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4efe6",
          color: "#1c2538",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <title>Something broke · Lociros</title>
        <main style={{ maxWidth: 420, padding: "0 20px" }}>
          <p style={{ fontSize: 13, opacity: 0.6 }}>
            Lociros
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 500, margin: "16px 0 12px" }}>Something broke</h1>
          <p style={{ opacity: 0.65, lineHeight: 1.5 }}>
            Lociros hit an error while loading. Your progress is saved. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              padding: "12px 24px",
              border: 0,
              borderRadius: 999,
              background: "#1c2538",
              color: "#f4efe6",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: 32, fontSize: 12, opacity: 0.5 }}>Reference: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
