"use client";

import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function ExecutePage() {
  const { state, startTaskSession, markSession } = useWorkflow();
  const activeSession = state.executionSessions[0] ?? null;
  const runnableTask =
    state.tasks.find((task) => task.status === "active") ?? state.tasks[0] ?? null;
  const activeTask = activeSession
    ? state.tasks.find((task) => task.id === activeSession.task_id) ?? runnableTask
    : runnableTask;
  const activeBlock =
    activeSession?.calendar_block_id
      ? state.calendarBlocks.find((block) => block.id === activeSession.calendar_block_id)
      : state.calendarBlocks.find((block) => block.task_id === activeTask?.id) ?? null;
  const area = activeTask ? getAreaById(activeTask.area_id) : null;

  if (!activeTask) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <section>
          <h1>Execute</h1>
          <p
            style={{
              marginTop: "0.25rem",
              color: "#4b5563",
              fontSize: "0.95rem",
            }}
          >
            Focus on one block at a time. In this mock shell, we show a single hard-coded
            block if available.
          </p>
        </section>
        <EmptyState
          title="No active block."
          description="Capture text, accept the draft in Triage, and accept a local proposal in Calendar to start a session here."
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Execute</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Single-task execution mode using mock data only. Buttons adjust local state
          and update the local review summary.
        </p>
      </section>

      <section
        style={{
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          padding: "1rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxWidth: "720px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "baseline",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
              {activeTask.title}
            </div>
            {area ? (
              <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                Area: {area.name}
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6b7280", textAlign: "right" }}>
            <div>
              {activeBlock
                ? `${new Date(activeBlock.start_at).toLocaleTimeString()} – ${new Date(
                    activeBlock.end_at,
                  ).toLocaleTimeString()}`
                : "Unscheduled local session"}
            </div>
            <div>Status: {activeSession?.status ?? activeBlock?.status ?? "ready"}</div>
          </div>
        </div>

        <div
          style={{
            borderRadius: "0.75rem",
            backgroundColor: "#eff6ff",
            padding: "0.75rem 0.9rem",
            fontSize: "0.9rem",
            color: "#1d4ed8",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>First tiny step</div>
          <div>
            {activeTask.first_tiny_step ??
              "Pick one small, concrete action you can do in the next few minutes."}
          </div>
        </div>

        <div
          aria-label="Timer (mock only)"
          style={{
            marginTop: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginBottom: "0.15rem",
              }}
            >
              Session state (mock)
            </div>
            <div style={{ fontSize: "1.5rem", fontVariantNumeric: "tabular-nums" }}>
              {activeSession?.status === "running" ? "00:25:00" : "00:00:00"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button type="button" onClick={() => startTaskSession(activeTask.id)}>
              Start
            </Button>
            <Button type="button" onClick={() => markSession("paused")}>
              Pause
            </Button>
            <Button type="button" onClick={() => markSession("distracted")}>
              Mark distracted
            </Button>
            <Button type="button" onClick={() => markSession("stuck")}>
              Mark stuck
            </Button>
            <Button type="button" onClick={() => markSession("completed")}>
              Complete
            </Button>
            <Button type="button" onClick={() => markSession("missed")}>
              Mark missed
            </Button>
            <Button type="button" onClick={() => markSession("stopped")}>
              Stop
            </Button>
          </div>
        </div>
      </section>

      {activeSession ? (
        <section
          aria-label="Most recent execution summary (mock)"
          style={{ maxWidth: "720px" }}
        >
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Recent execution (mock)
          </h2>
          <div
            style={{
              borderRadius: "0.75rem",
              border: "1px solid #e5e7eb",
              padding: "0.75rem 1rem",
              fontSize: "0.9rem",
              color: "#4b5563",
            }}
          >
            <div>Planned: {activeSession.planned_minutes ?? 0} min</div>
            <div>Actual: {activeSession.actual_minutes ?? 0} min</div>
            <div>Status: {activeSession.status}</div>
            <div>Outcome: {activeSession.outcome}</div>
            <div>Paused: {activeSession.paused_minutes ?? 0} min</div>
            <div>Distracted: {activeSession.distraction_minutes ?? 0} min</div>
            {activeSession.productivity_rating ? (
              <div>Productivity rating: {activeSession.productivity_rating}/5</div>
            ) : null}
            {activeSession.notes ? <div>Notes: {activeSession.notes}</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

