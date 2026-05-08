import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <nav
        aria-label="Primary"
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "2rem",
          flexWrap: "wrap",
        }}
      >
        <Link href="/">Home</Link>
        <Link href="/login">Login</Link>
        <Link href="/capture">Capture</Link>
        <Link href="/settings/areas">Areas</Link>
      </nav>
      {children}
    </main>
  );
}
