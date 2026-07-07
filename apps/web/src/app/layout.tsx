import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
