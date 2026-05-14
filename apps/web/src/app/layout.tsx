import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeOS — Workflow Cockpit",
  description: "Area-scoped personal workflow cockpit",
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
