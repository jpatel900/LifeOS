"use client";

import { useEffect, useState } from "react";
import type { CalendarBlock, ExecutionSession, Task } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

function storageModeLabel(mode: DataProvider) {
  return mode === "supabase" ? "Saved workspace" : "Demo mode";
}

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
      <div className="flex flex-col gap-6">
        <section>
          <h1>Execute</h1>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">
            One current task. One first step. Keep forward motion visible.
          </p>
        </section>
        {executeState.status === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading execution context...
          </p>
        ) : null}
        {executeState.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Execution rows could not load</AlertTitle>
            <AlertDescription>{executeState.message}</AlertDescription>
          </Alert>
        ) : null}
        <details className="text-sm text-muted-foreground">
          <summary>System details</summary>
          {executeState.status === "ready" ? (
            <p className="mt-2">
              Storage mode:{" "}
              <strong>{storageModeLabel(executeState.provider)}</strong>
            </p>
          ) : null}
        </details>
        <details className="text-sm text-muted-foreground">
          <summary>Developer details</summary>
          {executeState.status === "ready" ? (
            <p className="mt-2">
              Storage mode id: <strong>{executeState.provider}</strong>
            </p>
          ) : null}
        </details>
        {actionState.status === "saving" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Saving {actionState.label}...
          </p>
        ) : null}
        {actionState.status === "saved" ? (
          <Alert role="status" className="border-border bg-muted text-foreground">
            <AlertTitle className="text-primary">Saved</AlertTitle>
            <AlertDescription>
              {actionState.label}{" "}
              <strong>{storageModeLabel(actionState.provider)}</strong>.
            </AlertDescription>
          </Alert>
        ) : null}
        {actionState.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Execution change was not saved</AlertTitle>
            <AlertDescription>{actionState.message}</AlertDescription>
          </Alert>
        ) : null}
        <EmptyState
          title="No current task is in execution."
          description="Plan one local block in Calendar or capture a task first. LifeOS does not invent scheduled work for you."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1>Execute</h1>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">
          Focus on one current task and keep progress visible.
        </p>
      </section>
      <details className="text-sm text-muted-foreground">
        <summary>System details</summary>
        {executeState.status === "ready" ? (
          <p className="mt-2">
            Storage mode: <strong>{storageModeLabel(executeState.provider)}</strong>
          </p>
        ) : null}
      </details>
      <details className="text-sm text-muted-foreground">
        <summary>Developer details</summary>
        {executeState.status === "ready" ? (
          <p className="mt-2">
            Storage mode id: <strong>{executeState.provider}</strong>
          </p>
        ) : null}
      </details>

      {actionState.status === "saving" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saving {actionState.label}...
        </p>
      ) : null}

      {actionState.status === "saved" ? (
        <Alert role="status" className="border-border bg-muted text-foreground">
          <AlertTitle className="text-primary">Saved</AlertTitle>
          <AlertDescription>
            {actionState.label}{" "}
            <strong>{storageModeLabel(actionState.provider)}</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      {actionState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Execution change was not saved</AlertTitle>
          <AlertDescription>{actionState.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="max-w-[720px]">
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-primary">Current focus</p>
          <div className="flex items-baseline justify-between gap-4">
          <div>
              <div className="text-[1.05rem] font-semibold">
              {activeTask.title}
            </div>
            {area ? (
                <div className="text-[0.85rem] text-muted-foreground">
                Area: {area.name}
              </div>
            ) : null}
          </div>
            <div className="text-right text-[0.8rem] text-muted-foreground">
            <div>
              {activeBlock
                ? `${new Date(activeBlock.start_at).toLocaleTimeString()} – ${new Date(
                    activeBlock.end_at,
                  ).toLocaleTimeString()}`
                : "Unscheduled session in this browser"}
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

          <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
            <div className="mb-1 font-medium text-primary">
            First tiny step
          </div>
          <div>
            {activeTask.first_tiny_step ??
              "Pick one small, concrete action you can do in the next few minutes."}
          </div>
        </div>
          <div className="rounded-lg border border-border bg-muted/80 p-3 text-sm text-foreground">
            <div className="mb-1 font-medium text-muted-foreground">Definition of done</div>
          <div>
            {activeTask.definition_of_done ??
              "Complete the first useful move and note the outcome."}
          </div>
        </div>

        <div
          aria-label="Timer (demo mode only)"
            className="mt-2 flex items-center justify-between gap-4"
        >
          <div>
              <div className="mb-0.5 text-xs text-muted-foreground">
              Session state (demo mode)
            </div>
              <div className="text-2xl [font-variant-numeric:tabular-nums]">
              {!usesPersistedExecution &&
              (activeSession as Phase2MockExecutionSession | null)?.status ===
                "running"
                ? "00:25:00"
                : "00:00:00"}
            </div>
          </div>
            <div className="flex flex-wrap gap-2">
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
              variant="secondary"
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
              variant="outline"
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
              variant="outline"
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
              variant="outline"
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
              {usesPersistedExecution ? "Stop (demo mode only)" : "Stop (this browser)"}
            </Button>
          </div>
        </div>
          <p className="m-0 text-xs text-muted-foreground">
          {usesPersistedExecution
            ? "Stop is disabled here. Saved sessions need an end status and end-session details."
            : "Stop only updates this browser in Demo mode. It does not save an end state."}
        </p>
        {usesPersistedExecution && terminalForm ? (
            <section
              aria-label="End session details"
              className="flex flex-col gap-3 rounded-lg border border-border bg-muted/60 p-4"
            >
              <h2 className="m-0 text-[0.95rem] font-semibold">
              End session details
            </h2>
              <label className="flex flex-col gap-1.5 text-sm text-foreground">
              Outcome
                <Select
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
                </Select>
            </label>
              <label className="flex flex-col gap-1.5 text-sm text-foreground">
              Actual duration (minutes)
                <Input
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
              <label className="flex flex-col gap-1.5 text-sm text-foreground">
              Productivity rating (1-5)
                <Input
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
              <label className="flex flex-col gap-1.5 text-sm text-foreground">
              Notes (optional)
                <Textarea
                aria-label="End session notes"
                rows={2}
                className="min-h-[72px]"
                value={terminalForm.notes}
                onChange={(event) =>
                  setTerminalForm((current) =>
                    current ? { ...current, notes: event.target.value } : current,
                  )
                }
              />
            </label>
            {terminalFormError ? (
                <p role="alert" className="m-0 text-sm text-destructive">
                {terminalFormError}
              </p>
            ) : null}
              <div className="flex flex-wrap gap-2">
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
        </CardContent>
      </Card>

      {activeSession ? (
        <Card aria-label="Most recent execution summary" className="max-w-[720px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent execution summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

