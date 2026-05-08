import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";

export const metadata: Metadata = {
  title: "LifeOS — Workflow Cockpit",
  description: "Area-scoped personal workflow cockpit",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
