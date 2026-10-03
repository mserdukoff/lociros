import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Lociros — graded readers in Japanese, Arabic, Italian, and Russian";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The bundled OG font is Latin-only, so CJK and Arabic samples would render as boxes.
const SAMPLES = ["Japanese", "Arabic", "Italian", "Russian"];

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/logo.svg"), "utf8");
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f4efe6",
          color: "#1c2538",
          padding: "72px 80px",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={64} height={70} alt="" />
            <span style={{ fontSize: 40, letterSpacing: "0.02em" }}>Lociros</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 68, lineHeight: 1.08, maxWidth: 640 }}>
              Graded readers at your exact level.
            </span>
            <span style={{ marginTop: 24, fontSize: 28, opacity: 0.6, maxWidth: 620 }}>
              CEFR A1 to B2, checked word by word. Tap any word for its lemma, grammar, and gloss.
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 22,
            width: 360,
            paddingLeft: 48,
            borderLeft: "2px solid rgba(28,37,56,0.12)",
          }}
        >
          {SAMPLES.map((name) => (
            <span key={name} style={{ fontSize: 34, color: "#4f6e57" }}>
              {name}
            </span>
          ))}
          <span style={{ marginTop: 12, fontSize: 22, opacity: 0.5 }}>A1 · A2 · B1 · B2</span>
        </div>
      </div>
    ),
    size,
  );
}
