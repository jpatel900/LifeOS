"use client";

import { useEffect, useState } from "react";
import {
  getHealthDashboard,
  type HealthDashboardResult,
} from "@/lib/data/health";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type HealthLoadState =
  | { status: "loading" }
  | { status: "ready"; result: HealthDashboardResult }
  | { status: "error"; message: string };

export default function HealthPage() {
  const [state, setState] = useState<HealthLoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const result = await getHealthDashboard(createSupabaseBrowserClient());

        if (!cancelled) {
          void captureEvent({
            event: "health_viewed",
            properties: {
              feature: "health",
              provider: result.provider,
              status: result.persistence,
              used_mock: result.provider === "mock",
            },
          });
          setState({ status: "ready", result });
        }
      } catch (error) {
        if (!cancelled) {
          void error;
          setState({
            status: "error",
            message:
              "Unable to load health checks right now. Verify auth/session and provider status, then retry.",
          });
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Health</h1>
        <p
          style={{
            marginTop: "0.25rem",
            color: "#4b5563",
            fontSize: "0.95rem",
          }}
        >
          Deterministic subsystem checks from current app state. No AI is used
          to score health.
        </p>
      </section>

      {state.status === "loading" ? (
        <p role="status">Loading health...</p>
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
          <h2 style={{ marginTop: 0 }}>Health checks could not load</h2>
          <p>{state.message}</p>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section>
            <p>
              Data source: <strong>{state.result.provider}</strong>
            </p>
            <p style={{ marginTop: "0.25rem", color: "#4b5563" }}>
              Checked at {state.result.checkedAt}. Health snapshot persistence:{" "}
              <strong>{state.result.persistence}</strong>
              {state.result.persistenceMessage
                ? ` (${state.result.persistenceMessage})`
                : ""}
            </p>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
            }}
          >
            {state.result.checks.map((check) => {
              const color =
                check.status === "healthy"
                  ? "#166534"
                  : check.status === "watch"
                    ? "#92400e"
                    : "#991b1b";
              const bg =
                check.status === "healthy"
                  ? "#dcfce7"
                  : check.status === "watch"
                    ? "#fef3c7"
                    : "#fee2e2";

              return (
                <article
                  key={check.id}
                  style={{
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    padding: "0.75rem 1rem",
                    fontSize: "0.9rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <h2 style={{ fontSize: "1rem", margin: 0 }}>
                      {check.subsystem}
                    </h2>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color,
                        backgroundColor: bg,
                        borderRadius: "999px",
                        padding: "0.05rem 0.6rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {check.status} · {check.score}
                    </span>
                  </div>
                  <p style={{ color: "#4b5563", margin: 0 }}>{check.summary}</p>
                </article>
              );
            })}
          </section>

          <section
            style={{
              border: "1px dashed #cbd5e1",
              borderRadius: "8px",
              padding: "1rem",
              backgroundColor: "#f8fafc",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Repair focus</h2>
            <ul style={{ marginBottom: 0 }}>
              {state.result.checks
                .filter((check) => check.status !== "healthy")
                .map((check) => (
                  <li key={`${check.id}-repair`}>
                    {check.subsystem}: {check.summary}
                  </li>
                ))}
            </ul>
          </section>
        </>
      ) : null}

      {state.status === "ready" &&
      state.result.checks.every((check) => check.status === "healthy") ? (
        <section
          style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>No active warnings</h2>
          <p style={{ marginBottom: 0 }}>
            All deterministic checks are healthy for this snapshot.
          </p>
        </section>
      ) : null}
    </div>
  );
}
