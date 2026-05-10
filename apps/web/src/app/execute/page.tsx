"use client";

import { useEffect, useState } from "react";
import type { CalendarBlock, ExecutionSession, Task } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import {
  createExecutionSession,
  listExecutionReviewItems,
  markExecutionSession,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";
import type { Phase2MockExecutionSession } from "@/lib/types";

type ExecuteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
      tasks: Task[];
      blocks: CalendarBlock[];
      sessions: ExecutionSession[];
    };

type ActionState =
  | { status: "idle" }
  | { status: "saving"; label: string }
  | { status: "saved"; label: string; provider: DataProvider }
  | { status: "error"; message: string };

const markLabels: Record<
  Phase2MockExecutionSession["status"],
  { button: string; saved: string }
> = {
  running: { button: "Start", saved: "running" },
  paused: { button: "Pause", saved: "paused" },
  completed: { button: "Complete", saved: "completed" },
  missed: { button: "Mark missed", saved: "missed" },
  distracted: { button: "Mark distracted", saved: "distracted" },
  stuck: { button: "Mark stuck", saved: "stuck" },
  stopped: { button: "Stop", saved: "stopped" },
};

function persistedOutcomeLabel(session: ExecutionSession | null) {
  return session ? session.outcome : "ready";
}

export default function ExecutePage() {
  const { state, startTaskSession, markSession } = useWorkflow();
  const [executeState, setExecuteState] = useState<ExecuteState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadExecutionItems() {
      try {
        const result = await listExecutionReviewItems(
          createSupabaseBrowserClient(),
        );
        if (!cancelled) {
          setExecuteState({
            status: "ready",
            provider: result.provider,
            tasks: result.tasks,
            blocks: result.blocks,
            sessions: result.sessions,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setExecuteState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load execution rows.",
          });
        }
      }
    }

    void loadExecutionItems();

    return () => {
      cancelled = true;
    };
  }, []);

  const usesPersistedExecution =
    executeState.status === "ready" && executeState.provider === "supabase";
  const persistedTasks = usesPersistedExecution ? executeState.tasks : [];
  const persistedBlocks = usesPersistedExecution ? executeState.blocks : [];
  const persistedSessions = usesPersistedExecution ? executeState.sessions : [];
  const activePersistedSession =
    persistedSessions.find(
      (session) =>
        session.outcome === "partial" || session.outcome === "distracted",
    ) ?? null;

  const activeSession = usesPersistedExecution
    ? activePersistedSession
    : (state.executionSessions[0] ?? null);
  const runnableTask = usesPersistedExecution
    ? (persistedTasks.find((task) => task.status === "active") ?? null)
    : (state.tasks.find((task) => task.status === "active") ??
      state.tasks[0] ??
      null);
  const activeTask = activeSession
    ? ((usesPersistedExecution ? persistedTasks : state.tasks).find(
        (task) => task.id === activeSession.task_id,
      ) ?? runnableTask)
    : runnableTask;
  const blocks = usesPersistedExecution
    ? persistedBlocks
    : state.calendarBlocks;
  const activeBlock = activeSession?.calendar_block_id
    ? (blocks.find((block) => block.id === activeSession.calendar_block_id) ??
      null)
    : (blocks.find((block) => block.task_id === activeTask?.id) ?? null);
  const area = activeTask ? getAreaById(activeTask.area_id) : null;

  async function handleStart() {
    if (!activeTask) return;

    if (!usesPersistedExecution) {
      startTaskSession(activeTask.id);
      return;
    }

    setActionState({ status: "saving", label: "session" });
    try {
      const result = await createExecutionSession(
        createSupabaseBrowserClient(),
        {
          task_id: activeTask.id,
          calendar_block_id: activeBlock?.id ?? null,
        },
      );
      setExecuteState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              sessions: [result.session, ...current.sessions],
              blocks: result.block
                ? current.blocks.map((block) =>
                    block.id === result.block?.id ? result.block : block,
                  )
                : current.blocks,
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Session started through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to start session.",
      });
    }
  }

  async function handleMark(status: Phase2MockExecutionSession["status"]) {
    if (!usesPersistedExecution) {
      markSession(status);
      return;
    }

    if (
      !activePersistedSession ||
      status === "running" ||
      status === "stopped"
    ) {
      return;
    }

    setActionState({ status: "saving", label: markLabels[status].button });
    try {
      const result = await markExecutionSession(
        createSupabaseBrowserClient(),
        activePersistedSession.id,
        { status },
      );
      setExecuteState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              sessions: current.sessions.map((session) =>
                session.id === result.session.id ? result.session : session,
              ),
              blocks: result.block
                ? current.blocks.map((block) =>
                    block.id === result.block?.id ? result.block : block,
                  )
                : current.blocks,
              tasks: result.task
                ? current.tasks.map((task) =>
                    task.id === result.task?.id ? result.task : task,
                  )
                : current.tasks,
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: `Session marked ${markLabels[status].saved} through`,
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to update session.",
      });
    }
  }

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
            Focus on one block at a time. Persisted sessions load when Supabase
            is configured; mock mode remains session-only.
          </p>
        </section>
        {executeState.status === "loading" ? (
          <p role="status">Loading execution context...</p>
        ) : null}
        {executeState.status === "error" ? (
          <section
            role="alert"
            style={{
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              borderRadius: "8px",
              padding: "1rem",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Execution rows could not load</h2>
            <p>{executeState.message}</p>
          </section>
        ) : null}
        {executeState.status === "ready" ? (
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}>
            Data source: <strong>{executeState.provider}</strong>
          </p>
        ) : null}
        {actionState.status === "saving" ? (
          <p role="status">Saving {actionState.label}...</p>
        ) : null}
        {actionState.status === "saved" ? (
          <section
            role="status"
            style={{
              border: "1px solid #86efac",
              background: "#f0fdf4",
              borderRadius: "8px",
              padding: "1rem",
            }}
          >
            {actionState.label} <strong>{actionState.provider}</strong>.
          </section>
        ) : null}
        {actionState.status === "error" ? (
          <section
            role="alert"
            style={{
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              borderRadius: "8px",
              padding: "1rem",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Execution change was not saved</h2>
            <p>{actionState.message}</p>
          </section>
        ) : null}
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
        <p
          style={{
            marginTop: "0.25rem",
            color: "#4b5563",
            fontSize: "0.95rem",
          }}
        >
          Single-task execution mode. Supabase rows are used when configured;
          otherwise buttons adjust local mock state only.
        </p>
      </section>

      {executeState.status === "ready" ? (
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}>
          Data source: <strong>{executeState.provider}</strong>
        </p>
      ) : null}

      {actionState.status === "saving" ? (
        <p role="status">Saving {actionState.label}...</p>
      ) : null}

      {actionState.status === "saved" ? (
        <section
          role="status"
          style={{
            border: "1px solid #86efac",
            background: "#f0fdf4",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          {actionState.label} <strong>{actionState.provider}</strong>.
        </section>
      ) : null}

      {actionState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Execution change was not saved</h2>
          <p>{actionState.message}</p>
        </section>
      ) : null}

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
          <div
            style={{ fontSize: "0.8rem", color: "#6b7280", textAlign: "right" }}
          >
            <div>
              {activeBlock
                ? `${new Date(activeBlock.start_at).toLocaleTimeString()} – ${new Date(
                    activeBlock.end_at,
                  ).toLocaleTimeString()}`
                : "Unscheduled local session"}
            </div>
            <div>
              Status:{" "}
              {usesPersistedExecution
                ? persistedOutcomeLabel(activePersistedSession)
                : ((activeSession as Phase2MockExecutionSession | null)
                    ?.status ??
                  activeBlock?.status ??
                  "ready")}
            </div>
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
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            First tiny step
          </div>
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
            <div
              style={{ fontSize: "1.5rem", fontVariantNumeric: "tabular-nums" }}
            >
              {!usesPersistedExecution &&
              (activeSession as Phase2MockExecutionSession | null)?.status ===
                "running"
                ? "00:25:00"
                : "00:00:00"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button
              type="button"
              onClick={() => void handleStart()}
              disabled={actionState.status === "saving"}
            >
              Start
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("paused")}
              disabled={usesPersistedExecution && !activePersistedSession}
            >
              Pause
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("distracted")}
              disabled={usesPersistedExecution && !activePersistedSession}
            >
              Mark distracted
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("stuck")}
              disabled={usesPersistedExecution && !activePersistedSession}
            >
              Mark stuck
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("completed")}
              disabled={usesPersistedExecution && !activePersistedSession}
            >
              Complete
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("missed")}
              disabled={usesPersistedExecution && !activePersistedSession}
            >
              Mark missed
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("stopped")}
              disabled={usesPersistedExecution}
            >
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
            {"status" in activeSession ? (
              <div>Status: {activeSession.status}</div>
            ) : null}
            <div>Outcome: {activeSession.outcome}</div>
            <div>Paused: {activeSession.paused_minutes ?? 0} min</div>
            <div>Distracted: {activeSession.distraction_minutes ?? 0} min</div>
            {activeSession.productivity_rating ? (
              <div>
                Productivity rating: {activeSession.productivity_rating}/5
              </div>
            ) : null}
            {activeSession.notes ? (
              <div>Notes: {activeSession.notes}</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
