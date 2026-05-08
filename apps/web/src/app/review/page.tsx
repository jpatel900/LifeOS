"use client";

import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function ReviewPage() {
  const { state } = useWorkflow();
  const completed = state.executionSessions.filter(
    (session) => session.status === "completed",
  );
  const missed = state.executionSessions.filter((session) => session.status === "missed");
  const distracted = state.executionSessions.filter(
    (session) => session.status === "distracted",
  );
  const stuck = state.executionSessions.filter((session) => session.status === "stuck");
  const openTasks = state.tasks.filter((task) => task.status === "active");
  const areaSummaries = state.areas.map((area) => {
    const areaTasks = state.tasks.filter((task) => task.area_id === area.id);
    const areaSessions = state.executionSessions.filter(
      (session) => session.area_id === area.id,
    );
    return {
      area,
      open: areaTasks.filter((task) => task.status === "active").length,
      done: areaTasks.filter((task) => task.status === "done").length,
      sessions: areaSessions.length,
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Review</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Review summarizes only what happened in this browser session. No AI or
          external integrations are called.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "0.75rem 1rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Daily review</h2>
          {state.captureItems.length === 0 && state.executionSessions.length === 0 ? (
            <EmptyState
              title="No daily review yet."
              description="Complete the capture, triage, calendar, and execute flow to see a local review summary."
            />
          ) : (
            <ul style={{ paddingLeft: "1.25rem", margin: 0, fontSize: "0.9rem" }}>
              <li>Captured: {state.captureItems.length}</li>
              <li>Accepted tasks: {state.tasks.length}</li>
              <li>Completed sessions: {completed.length}</li>
              <li>Missed sessions: {missed.length}</li>
              <li>Distracted sessions: {distracted.length}</li>
              <li>Stuck sessions: {stuck.length}</li>
              <li>Still open: {openTasks.length}</li>
            </ul>
          )}
        </div>

        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "0.75rem 1rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Weekly review</h2>
          {state.tasks.length === 0 ? (
            <EmptyState
              title="No weekly review yet."
              description="Area-level patterns will appear here once you accept tasks and run sessions."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {areaSummaries
                .filter((summary) => summary.open + summary.done + summary.sessions > 0)
                .map((summary) => {
                const area = getAreaById(summary.area.id);
                return (
                  <div
                    key={summary.area.id}
                    style={{
                      borderRadius: "0.75rem",
                      border: "1px solid #e5e7eb",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.9rem",
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {area?.name ?? summary.area.name}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Open tasks: {summary.open}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Completed tasks: {summary.done}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Sessions recorded: {summary.sessions}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {state.reviewLog.length > 0 ? (
        <section>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Local event log
          </h2>
          <ul style={{ paddingLeft: "1.25rem", margin: 0, fontSize: "0.9rem" }}>
            {state.reviewLog.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

