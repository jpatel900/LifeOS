"use client";

import { EmptyState } from "../components/EmptyState";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function HealthPage() {
  const { state } = useWorkflow();
  const healthChecks = state.healthChecks;

  if (healthChecks.length === 0) {
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
            System and area health, using deterministic mock scores only. No live checks
            are run in this Phase 1 shell.
          </p>
        </section>
        <EmptyState
          title="No health data."
          description="When real checks are wired up, you will see subsystem status here. For now this is intentionally empty mock data."
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Health</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Deterministic mock health scores for core subsystems. These explain what will
          be checked once real integrations are added.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {healthChecks.map((check) => {
          const color =
            check.status === "healthy"
              ? "#16a34a"
              : check.status === "watch"
                ? "#b45309"
                : "#b91c1c";
          const bg =
            check.status === "healthy"
              ? "#dcfce7"
              : check.status === "watch"
                ? "#fffbeb"
                : "#fee2e2";

          return (
            <div
              key={check.id}
              style={{
                borderRadius: "0.75rem",
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
                  marginBottom: "0.25rem",
                }}
              >
                <div style={{ fontWeight: 500 }}>{check.subsystem}</div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color,
                    backgroundColor: bg,
                    borderRadius: "999px",
                    padding: "0.05rem 0.6rem",
                  }}
                >
                  {check.status} · {check.score}
                </span>
              </div>
              <div style={{ color: "#4b5563" }}>{check.summary}</div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

