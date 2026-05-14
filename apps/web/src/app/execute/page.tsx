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
import { captureEvent } from "@/lib/observability";
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

type PersistedTerminalStatus = Extract<
  Phase2MockExecutionSession["status"],
  "completed" | "missed" | "distracted" | "stuck"
>;

type TerminalFormState = {
  status: PersistedTerminalStatus;
  outcome: ExecutionSession["outcome"];
  actualMinutes: string;
  productivityRating: string;
  notes: string;
};

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

const terminalOutcomeByStatus: Record<
  PersistedTerminalStatus,
  ExecutionSession["outcome"]
> = {
  completed: "completed",
  missed: "skipped",
  distracted: "distracted",
  stuck: "blocked",
};

const terminalOutcomeOptions: Array<{
  value: ExecutionSession["outcome"];
  label: string;
}> = [
  { value: "completed", label: "Completed" },
  { value: "partial", label: "Partial" },
  { value: "blocked", label: "Blocked" },
  { value: "skipped", label: "Skipped" },
  { value: "distracted", label: "Distracted" },
  { value: "stopped", label: "Stopped" },
];

function persistedOutcomeLabel(session: ExecutionSession | null) {
  return session ? session.outcome : "ready";
}

function createTerminalForm(status: PersistedTerminalStatus): TerminalFormState {
  return {
    status,
    outcome: terminalOutcomeByStatus[status],
    actualMinutes: "",
    productivityRating: "",
    notes: "",
  };
}

export default function ExecutePage() {
  const { state, startTaskSession, markSession } = useWorkflow();
  const [executeState, setExecuteState] = useState<ExecuteState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });
  const [terminalForm, setTerminalForm] = useState<TerminalFormState | null>(
    null,
  );
  const [terminalFormError, setTerminalFormError] = useState<string | null>(
    null,
  );

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
      void captureEvent({
        event: "execution_started",
        properties: {
          area_present: Boolean(activeTask.area_id),
          feature: "execute",
          provider: "mock",
          status: "started",
          used_mock: true,
        },
      });
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
      void captureEvent({
        event: "execution_started",
        properties: {
          area_present: Boolean(activeTask.area_id),
          feature: "execute",
          provider: result.provider,
          status: "started",
          used_mock: false,
        },
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to start session.",
      });
    }
  }

  async function persistMark(
    status: Phase2MockExecutionSession["status"],
    input:
      | {
          outcome: ExecutionSession["outcome"];
          actual_minutes: number;
          productivity_rating: number;
          notes: string | null;
        }
      | undefined,
  ) {
    if (!activePersistedSession || status === "running" || status === "stopped") {
      return;
    }

    setActionState({ status: "saving", label: markLabels[status].button });
    try {
      const result = await markExecutionSession(
        createSupabaseBrowserClient(),
        activePersistedSession.id,
        status === "paused"
          ? { status }
          : {
              status,
              outcome: input?.outcome ?? null,
              actual_minutes: input?.actual_minutes ?? null,
              productivity_rating: input?.productivity_rating ?? null,
              notes: input?.notes ?? null,
            },
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
      setTerminalForm(null);
      setTerminalFormError(null);
      if (result.session.outcome === "completed") {
        void captureEvent({
          event: "execution_completed",
          properties: {
            area_present: Boolean(activeTask?.area_id),
            feature: "execute",
            provider: result.provider,
            status: "completed",
            used_mock: false,
          },
        });
      }
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to update session.",
      });
    }
  }

  async function handleMark(status: Phase2MockExecutionSession["status"]) {
    if (!usesPersistedExecution) {
      markSession(status);
      if (status === "completed") {
        void captureEvent({
          event: "execution_completed",
          properties: {
            area_present: Boolean(activeTask?.area_id),
            feature: "execute",
            provider: "mock",
            status: "completed",
            used_mock: true,
          },
        });
      }
      return;
    }

    if (!activePersistedSession || status === "running" || status === "stopped") {
      return;
    }

    if (status === "paused") {
      await persistMark(status, undefined);
      return;
    }

    setTerminalForm(createTerminalForm(status));
    setTerminalFormError(null);
  }

  async function handleSubmitTerminalForm() {
    if (!terminalForm) {
      return;
    }

    const actualMinutes = Number.parseInt(terminalForm.actualMinutes, 10);
    const productivityRating = Number.parseInt(
      terminalForm.productivityRating,
      10,
    );

    if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
      setTerminalFormError("Enter actual duration in minutes (0 or more).");
      return;
    }

    if (
      !Number.isFinite(productivityRating) ||
      productivityRating < 1 ||
      productivityRating > 5
    ) {
      setTerminalFormError("Set productivity rating from 1 to 5.");
      return;
    }

    await persistMark(terminalForm.status, {
      outcome: terminalForm.outcome,
      actual_minutes: actualMinutes,
      productivity_rating: productivityRating,
      notes: terminalForm.notes.trim() || null,
    });
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
          style={{
            borderRadius: "0.75rem",
            backgroundColor: "#f8fafc",
            padding: "0.75rem 0.9rem",
            fontSize: "0.9rem",
            color: "#334155",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Definition of done</div>
          <div>
            {activeTask.definition_of_done ??
              "Complete the first useful move and note the outcome."}
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
              disabled={
                actionState.status === "saving" ||
                (usesPersistedExecution && !activePersistedSession)
              }
            >
              Pause
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("distracted")}
              disabled={
                actionState.status === "saving" ||
                (usesPersistedExecution && !activePersistedSession)
              }
            >
              Mark distracted
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("stuck")}
              disabled={
                actionState.status === "saving" ||
                (usesPersistedExecution && !activePersistedSession)
              }
            >
              Mark stuck
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("completed")}
              disabled={
                actionState.status === "saving" ||
                (usesPersistedExecution && !activePersistedSession)
              }
            >
              Complete
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("missed")}
              disabled={
                actionState.status === "saving" ||
                (usesPersistedExecution && !activePersistedSession)
              }
            >
              Mark missed
            </Button>
            <Button
              type="button"
              onClick={() => void handleMark("stopped")}
              disabled={actionState.status === "saving" || usesPersistedExecution}
            >
              Stop
            </Button>
          </div>
        </div>
        {usesPersistedExecution && terminalForm ? (
          <section
            aria-label="End session details"
            style={{
              borderRadius: "0.75rem",
              border: "1px solid #bfdbfe",
              backgroundColor: "#eff6ff",
              padding: "0.75rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "0.95rem" }}>
              End session details
            </h2>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Outcome
              <select
                aria-label="End session outcome"
                value={terminalForm.outcome}
                onChange={(event) =>
                  setTerminalForm((current) =>
                    current
                      ? {
                          ...current,
                          outcome: event.target
                            .value as ExecutionSession["outcome"],
                        }
                      : current,
                  )
                }
              >
                {terminalOutcomeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Actual duration (minutes)
              <input
                aria-label="Actual duration minutes"
                type="number"
                min={0}
                value={terminalForm.actualMinutes}
                onChange={(event) =>
                  setTerminalForm((current) =>
                    current
                      ? { ...current, actualMinutes: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Productivity rating (1-5)
              <input
                aria-label="Productivity rating"
                type="number"
                min={1}
                max={5}
                value={terminalForm.productivityRating}
                onChange={(event) =>
                  setTerminalForm((current) =>
                    current
                      ? { ...current, productivityRating: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Notes (optional)
              <textarea
                aria-label="End session notes"
                rows={2}
                value={terminalForm.notes}
                onChange={(event) =>
                  setTerminalForm((current) =>
                    current ? { ...current, notes: event.target.value } : current,
                  )
                }
              />
            </label>
            {terminalFormError ? (
              <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
                {terminalFormError}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button
                type="button"
                onClick={() => void handleSubmitTerminalForm()}
                disabled={actionState.status === "saving"}
              >
                Save end session
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setTerminalForm(null);
                  setTerminalFormError(null);
                }}
                disabled={actionState.status === "saving"}
              >
                Cancel
              </Button>
            </div>
          </section>
        ) : null}
      </section>

      {activeSession ? (
        <section
          aria-label="Most recent execution summary"
          style={{ maxWidth: "720px" }}
        >
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Recent execution summary
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
