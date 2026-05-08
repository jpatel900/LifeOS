"use client";

import { AppShell } from "../components/AppShell";

export default function HomePage() {
  return (
    <AppShell>
      <h1>LifeOS</h1>
      <p>Area-scoped personal workflow cockpit</p>
      <section style={{ marginTop: "2rem" }}>
        <h2>Quick Capture</h2>
        <form
          onSubmit={(e) => e.preventDefault()}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <textarea
            placeholder="What's on your mind? Type anything..."
            rows={4}
            style={{
              padding: "0.75rem",
              fontSize: "1rem",
              borderRadius: "8px",
              border: "1px solid #ccc",
              resize: "vertical",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              borderRadius: "8px",
              border: "none",
              background: "#0070f3",
              color: "white",
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Capture
          </button>
        </form>
      </section>
    </AppShell>
  );
}
