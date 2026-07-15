import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import "./globals.css";

/* D-13 (issue #483): self-hosted Inter, the ratified display face.
 *
 * `next/font/local` (not next/font/google) because it reads the committed
 * woff2 under ./fonts — the build never reaches the network, which is what
 * retires this repo's Google-Fonts @import-variance issue. It also emits an
 * `adjustFontFallback` metric override (ascent/descent/line-gap/size-adjust
 * synthesized onto the local fallback), so the swap from the system face to
 * Inter carries no layout shift.
 *
 * One variable file: latin subset, weight axis, normal only. No italic —
 * nothing on the moments home sets one, and shipping it would double the
 * payload for glyphs that never paint.
 *
 * `weight: "100 900"` is the file's TRUE axis range, not the 400-700 the app
 * was assumed to need: `font-extrabold` (800) renders in 11 live cockpit
 * headings (ExecuteView/HealthView/OverviewView/PlanView/ReviewView/
 * StatusBanners/TodayView/TriageView). Declaring a narrower range would clamp
 * those to 700 rather than reach the real 800 instance the file carries.
 *
 * Licence: SIL OFL 1.1, notice shipped beside the binary at ./fonts/OFL.txt.
 * Inter declares NO Reserved Font Name, and this file is fontsource's
 * pre-subset distribution used verbatim (byte-identical, unmodified).
 *
 * The variable is `--font-inter` (the loader's raw handle), NOT `--font-sans`
 * (the app's semantic token, composed from this one in globals.css). They
 * must differ: this class lands on <html>, which is the very element `:root`
 * selects, so a `:root { --font-sans: ... }` rule and this class would carry
 * equal specificity on the same element and be resolved by injection order.
 * Two names keeps each side's ownership unambiguous.
 */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto"],
});

export const metadata: Metadata = {
  title: "LifeOS — Workflow Cockpit",
  description: "Area-scoped personal workflow cockpit",
  manifest: "/manifest.webmanifest",
  icons: {
    // SVG for browsers that accept it; PNG fallbacks for those that don't.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    // iOS ignores the web manifest for the home-screen icon; the full-bleed
    // (non-transparent) maskable PNG masks cleanly under iOS's own rounding.
    apple: [{ url: "/icon-maskable-512.png", sizes: "512x512" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
