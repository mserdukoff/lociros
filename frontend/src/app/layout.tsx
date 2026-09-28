import type { Metadata } from "next";
import { Caveat, Literata, Noto_Naskh_Arabic, Outfit } from "next/font/google";
import { AuthBridge } from "@/components/auth-bridge";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

// Variable Literata with its optical-size axis, so the same face sets
// 11px labels and 64px display without looking like two fonts.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "cyrillic"],
  axes: ["opsz"],
  display: "swap",
});

const naskh = Noto_Naskh_Arabic({
  variable: "--font-naskh",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Lociros — graded readers",
    template: "%s · Lociros",
  },
  description:
    "CEFR-calibrated Japanese, Arabic, Italian, and Russian passages. The level is checked by a morphological analyzer, not promised by a prompt. Tap any word for lemma, grammar, and a gloss.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Lociros",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${literata.variable} ${naskh.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">
        <AuthBridge />
        {children}
        <script
          // Only register the offline cache in production. In dev the app
          // changes under you constantly, and a service worker happily
          // keeps serving yesterday's JS and API responses over that —
          // "I did X and it doesn't show up" with no error anywhere. Any
          // worker left over from an earlier dev session gets torn down
          // here too, along with its caches, so a stale one can't linger.
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator){if(${
              process.env.NODE_ENV === "production"
            }){window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js"))}else{navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));if(window.caches)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))}}`,
          }}
        />
      </body>
    </html>
  );
}
