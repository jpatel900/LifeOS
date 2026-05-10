"use client";

import { useEffect, useState } from "react";
import type { Area } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { listAreas, type DataProvider } from "../../../lib/data/workflow";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";
import { GoogleCalendarConnectionPanel } from "./GoogleCalendarConnectionPanel";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

export default function AreasSettingsPage() {
  const { resetWorkflow } = useWorkflow();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const result = await listAreas(createSupabaseBrowserClient());

        if (!cancelled) {
          setState({
            status: "ready",
            provider: result.provider,
            areas: result.areas,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load areas right now.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Areas</h1>
        <p
          style={{
            marginTop: "0.25rem",
            color: "#4b5563",
            fontSize: "0.95rem",
          }}
        >
          Areas are first-class scopes for captures, tasks, scheduling, and
          future learning. Phase 4A loads areas from the data layer; Phase 2
          mock triage still uses separate session state tied to the shell header
          picker.
        </p>
      </section>

      {state.status === "loading" ? (
        <p role="status">Loading areas...</p>
      ) : null}

      {state.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Areas could not load</h2>
          <p>{state.message}</p>
          <p>
            If Supabase is configured, make sure you are signed in and the local
            stack is running. Without Supabase env vars, this page uses mock
            areas.
          </p>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <section style={{ marginTop: "0.5rem" }}>
          <p>
            Data source: <strong>{state.provider}</strong>
          </p>

          {state.areas.length === 0 ? (
            <p>No active areas yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {state.areas.map((area) => (
                <li
                  key={area.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>
                    {area.name}
                  </h2>
                  <p style={{ margin: 0 }}>
                    {area.description ?? "No description yet."}
                  </p>
                  <p style={{ color: "#666", marginBottom: 0 }}>
                    Slug: {area.slug}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <GoogleCalendarConnectionPanel />

      <section
        style={{
          marginTop: "1rem",
          padding: "1rem",
          borderRadius: "8px",
          border: "1px dashed #cbd5e1",
          backgroundColor: "#f8fafc",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>
          Phase 2 mock workflow
        </h2>
        <p
          style={{ marginTop: "0.25rem", fontSize: "0.9rem", color: "#475569" }}
        >
          Reset clears session-only triage and scheduling mocks (captures,
          drafts, proposals in browser storage). It does not delete persisted
          Phase 4A rows.
        </p>
        <Button type="button" variant="secondary" onClick={resetWorkflow}>
          Reset local mock flow
        </Button>
      </section>
    </div>
  );
}
