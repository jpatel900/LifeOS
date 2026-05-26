"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CalendarBlock, ExecutionSession, Task } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

type SessionUiState =
  | "not_started"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "stuck"
  | "distracted"
  | "missed";

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
  running: { button: "Resume", saved: "running" },
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

function createTerminalForm(
  status: PersistedTerminalStatus,
): TerminalFormState {
  return {
    status,
    outcome: terminalOutcomeByStatus[status],
    actualMinutes: "",
    productivityRating: "",
    notes: "",
  };
}

function persistedSessionUiState(
  session: ExecutionSession | null,
  lastPersistedMark: Phase2MockExecutionSession["status"] | null,
): SessionUiState {
  if (!session) {
    return "not_started";
  }

  if (lastPersistedMark === "paused" && session.outcome === "partial") {
    return "paused";
  }

  switch (session.outcome) {
    case "completed":
      return "completed";
    case "blocked":
      return "stuck";
    case "distracted":
      return "distracted";
    case "skipped":
      return "missed";
    case "stopped":
      return "stopped";
    case "partial":
    default:
      return "running";
  }
}

function demoSessionUiState(
  session: Phase2MockExecutionSession | null,
): SessionUiState {
  if (!session) {
    return "not_started";
  }

  return session.status;
}

function sessionStateLabelFromUiState(uiState: SessionUiState) {
  switch (uiState) {
    case "not_started":
      return "Not started";
    case "running":
      return "In progress";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    case "completed":
      return "Completed";
    case "stuck":
      return "Stuck";
    case "distracted":
      return "Distracted";
    case "missed":
      return "Missed";
  }
}

function isTerminalSessionState(uiState: SessionUiState) {
  return (
    uiState === "stopped" ||
    uiState === "completed" ||
    uiState === "stuck" ||
    uiState === "distracted" ||
    uiState === "missed"
  );
}

function terminalNextStep(uiState: SessionUiState) {
  switch (uiState) {
    case "completed":
      return "Session completed. Plan another block or review this later.";
    case "stopped":
      return "Session stopped in this browser. Decide the next useful step.";
    case "stuck":
      return "Session ended as stuck. Capture the blocker, then plan the next step.";
    case "distracted":
      return "Session ended as distracted. Capture what interrupted focus, then reset.";
    case "missed":
      return "Session ended as missed. Capture why it was missed, then re-plan.";
    default:
      return null;
  }
}

function recoveryTitle(status: PersistedTerminalStatus) {
  switch (status) {
    case "completed":
      return "Close this session";
    case "stuck":
      return "Recovery: Stuck";
    case "distracted":
      return "Recovery: Distracted";
    case "missed":
      return "Recovery: Missed";
  }
}

function recoveryGuidance(status: PersistedTerminalStatus) {
  switch (status) {
    case "completed":
      return "Capture what was done and mark the session complete.";
    case "stuck":
      return "Describe what blocked progress and choose a small next move.";
    case "distracted":
      return "Document the interruption and decide the next focused action.";
    case "missed":
      return "Record why this was missed and what should happen next.";
  }
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
  const [lastPersistedMark, setLastPersistedMark] = useState<
    Phase2MockExecutionSession["status"] | null
  >(null);

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
  const latestPersistedSession = usesPersistedExecution
    ? (persistedSessions[0] ?? null)
    : null;

  useEffect(() => {
    if (!latestPersistedSession) {
      setLastPersistedMark(null);
      setTerminalForm(null);
      setTerminalFormError(null);
    }
  }, [latestPersistedSession]);

  const activeSession = usesPersistedExecution
    ? latestPersistedSession
    : (state.executionSessions[0] ?? null);
  const sessionUiState = usesPersistedExecution
    ? persistedSessionUiState(latestPersistedSession, lastPersistedMark)
    : demoSessionUiState(activeSession as Phase2MockExecutionSession | null);
  const sessionStateLabel = sessionStateLabelFromUiState(sessionUiState);
  const hasActiveSession =
    sessionUiState === "running" || sessionUiState === "paused";
  const isTerminalSession = isTerminalSessionState(sessionUiState);
  const terminalSessionNextStep = terminalNextStep(sessionUiState);
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
  const sessionStartedAt = activeSession
    ? "created_at" in activeSession
      ? new Date(activeSession.created_at).toLocaleTimeString()
      : "This browser session"
    : null;

  const startDisabledReason =
    actionState.status === "saving"
      ? "Another execution action is saving."
      : hasActiveSession
        ? "A session is already in progress. Pause or end it first."
        : !activeTask
          ? "No task is ready to start."
          : null;
  const pauseDisabledReason =
    actionState.status === "saving"
      ? "Another execution action is saving."
      : sessionUiState === "running"
        ? null
        : sessionUiState === "paused"
          ? "Session is already paused."
          : isTerminalSession
            ? "Session already ended. Start another session to pause again."
            : "Start a session first.";
  const resumeDisabledReason =
    actionState.status === "saving"
      ? "Another execution action is saving."
      : usesPersistedExecution
        ? sessionUiState === "paused"
          ? "Saved workspace does not support resume yet. Choose an end outcome."
          : "Resume is demo-mode only."
        : sessionUiState === "paused"
          ? null
          : sessionUiState === "running"
            ? "Session is already running."
            : "Resume is available after pausing.";
  const endDisabledReason =
    actionState.status === "saving"
      ? "Another execution action is saving."
      : hasActiveSession
        ? null
        : isTerminalSession
          ? "Session already ended. Start another session for new outcomes."
          : "Start a session first.";
  const stopDisabledReason =
    actionState.status === "saving"
      ? "Another execution action is saving."
      : usesPersistedExecution
        ? "Stop is demo-mode only. Saved sessions need an end outcome and details."
        : !hasActiveSession
          ? isTerminalSession
            ? "Session already ended. Start another session before stopping again."
            : "Start a session first."
          : null;

  const nextRecommendedAction = terminalForm
    ? "Finish the recovery details, then save the end session."
    : terminalSessionNextStep
      ? terminalSessionNextStep
      : sessionUiState === "paused"
        ? usesPersistedExecution
          ? "Paused in Saved workspace. Choose an end outcome to finish this session."
          : "Resume when ready, or choose an end outcome."
        : sessionUiState === "running"
          ? "When this block ends, choose Complete, Stuck, Distracted, or Missed."
          : "Start the session when you are ready to focus.";

  async function handleStart() {
    if (!activeTask || startDisabledReason) return;

    if (!usesPersistedExecution) {
      startTaskSession(activeTask.id);
      setActionState({
        status: "saved",
        label: "Session started through",
        provider: "mock",
      });
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
      setLastPersistedMark("running");
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
    if (
      !latestPersistedSession ||
      !hasActiveSession ||
      status === "running" ||
      status === "stopped"
    ) {
      return;
    }

    setActionState({ status: "saving", label: markLabels[status].button });
    try {
      const result = await markExecutionSession(
        createSupabaseBrowserClient(),
        latestPersistedSession.id,
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
      setLastPersistedMark(status);
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
      setActionState({
        status: "saved",
        label: `Session marked ${markLabels[status].saved} through`,
        provider: "mock",
      });
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

    if (
      !latestPersistedSession ||
      !hasActiveSession ||
      status === "running" ||
      status === "stopped"
    ) {
      return;
    }

    if (status === "paused") {
      await persistMark(status, undefined);
      return;
    }

    setTerminalForm(createTerminalForm(status));
    setTerminalFormError(null);
  }

  async function handleResume() {
    if (usesPersistedExecution) {
      return;
    }

    await handleMark("running");
  }

  function appendRecoveryNote(prefix: string) {
    setTerminalForm((current) =>
      current
        ? {
            ...current,
            notes: current.notes
              ? `${current.notes.trim()}\n${prefix}`
              : prefix,
          }
        : current,
    );
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
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Execute</h1>
          <p className="text-sm text-muted-foreground">
            Run one focused work session at a time with clear start and end
            decisions.
          </p>
        </section>
        {executeState.status === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking saved execution rows. Demo guidance is still available.
          </p>
        ) : null}
        {executeState.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Execution rows could not load</AlertTitle>
            <AlertDescription>{executeState.message}</AlertDescription>
          </Alert>
        ) : null}
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">
            System details
          </summary>
          {executeState.status === "ready" ? (
            <p className="mt-2">
              Storage mode:{" "}
              <strong>{storageModeLabel(executeState.provider)}</strong>
            </p>
          ) : null}
        </details>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Developer details
          </summary>
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
          <Alert
            role="status"
            className="border-border bg-muted text-foreground"
          >
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What Execute is for</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Execute is where one planned task becomes one focused session with
              a clear end outcome.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/calendar">Go to Planning</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/capture">Go to Capture</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <EmptyState
          title="No current task is in execution."
          description="Plan one block in Planning or capture and triage a task first."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Execute</h1>
        <p className="text-sm text-muted-foreground">
          Keep one current mission visible until you choose the end outcome.
        </p>
      </section>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">System details</summary>
        {executeState.status === "ready" ? (
          <p className="mt-2">
            Storage mode:{" "}
            <strong>{storageModeLabel(executeState.provider)}</strong>
          </p>
        ) : null}
      </details>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Developer details
        </summary>
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

      <Card className="max-w-[820px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current mission</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold leading-tight">
                {activeTask.title}
              </h2>
              {area ? (
                <Badge variant="secondary" className="w-fit">
                  Area: {area.name}
                </Badge>
              ) : null}
            </div>
            <Badge variant={hasActiveSession ? "default" : "outline"}>
              {sessionStateLabel}
            </Badge>
          </div>

          <div className="grid gap-2 text-sm">
            <p className="rounded-md border border-border bg-muted/60 p-3">
              <span className="font-medium text-foreground">
                First tiny step:
              </span>{" "}
              {activeTask.first_tiny_step ??
                "Pick one concrete action you can finish in a few minutes."}
            </p>
            <p className="rounded-md border border-border bg-muted/60 p-3">
              <span className="font-medium text-foreground">
                Definition of done:
              </span>{" "}
              {activeTask.definition_of_done ??
                "Complete the first useful move and note the result."}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Session started
              </p>
              <p className="mt-1 font-medium">
                {sessionStartedAt
                  ? `Started at ${sessionStartedAt}`
                  : "Not started"}
              </p>
            </div>
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Timing
              </p>
              <p className="mt-1 font-medium">
                {usesPersistedExecution
                  ? latestPersistedSession?.actual_minutes != null
                    ? `${latestPersistedSession.actual_minutes} minutes recorded`
                    : "Elapsed time is tracked after completion."
                  : "Demo timer only. No live elapsed tracking."}
              </p>
            </div>
          </div>

          <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
            <span className="font-medium">Next recommended action:</span>{" "}
            {nextRecommendedAction}
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-[820px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Primary session control
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleStart()}
                disabled={startDisabledReason !== null}
              >
                Start
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleMark("paused")}
                disabled={pauseDisabledReason !== null}
              >
                Pause
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleResume()}
                disabled={resumeDisabledReason !== null}
              >
                Resume
              </Button>
            </div>
            {startDisabledReason ? (
              <p className="text-xs text-muted-foreground">
                Start disabled: {startDisabledReason}
              </p>
            ) : null}
            {!startDisabledReason && pauseDisabledReason ? (
              <p className="text-xs text-muted-foreground">
                Pause disabled: {pauseDisabledReason}
              </p>
            ) : null}
            {!startDisabledReason &&
            !pauseDisabledReason &&
            resumeDisabledReason ? (
              <p className="text-xs text-muted-foreground">
                Resume disabled: {resumeDisabledReason}
              </p>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              End session outcomes
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleMark("completed")}
                disabled={endDisabledReason !== null}
              >
                Complete
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleMark("stuck")}
                disabled={endDisabledReason !== null}
              >
                Stuck
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleMark("distracted")}
                disabled={endDisabledReason !== null}
              >
                Distracted
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleMark("missed")}
                disabled={endDisabledReason !== null}
              >
                Missed
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleMark("stopped")}
                disabled={stopDisabledReason !== null}
              >
                {usesPersistedExecution
                  ? "Stop (demo mode only)"
                  : "Stop (this browser)"}
              </Button>
            </div>
            {endDisabledReason ? (
              <p className="text-xs text-muted-foreground">
                End outcomes disabled: {endDisabledReason}
              </p>
            ) : null}
            {stopDisabledReason ? (
              <p className="text-xs text-muted-foreground">
                Stop disabled: {stopDisabledReason}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Stop only updates this browser in Demo mode.
              </p>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recovery / next-step actions
            </p>
            {isTerminalSession ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This session is ended. Pick the next useful move.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline">
                    <Link href="/calendar">Plan another block</Link>
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <Link href="/capture">Capture what got in the way</Link>
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <Link href="/review">Review this later</Link>
                  </Button>
                  <Button asChild type="button" variant="secondary">
                    <Link href="/calendar">Back to Planning</Link>
                  </Button>
                  {!usesPersistedExecution && startDisabledReason === null ? (
                    <Button type="button" onClick={() => void handleStart()}>
                      Start another session
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Use these actions when a session ends or needs a reset.
              </p>
            )}
          </div>

          {usesPersistedExecution && terminalForm ? (
            <>
              <Separator />
              <section
                aria-label="End session details"
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/60 p-4"
              >
                <h2 className="m-0 text-[0.95rem] font-semibold">
                  {recoveryTitle(terminalForm.status)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {recoveryGuidance(terminalForm.status)}
                </p>
                {terminalForm.status !== "completed" ? (
                  <div className="rounded-md border border-border bg-background/60 p-3 text-sm">
                    <p className="font-medium text-foreground">
                      What got in the way?
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Capture the blocker in plain language so your next move is
                      clear.
                    </p>
                    <p className="mt-2 font-medium text-foreground">
                      What should happen next?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          appendRecoveryNote("Create smaller first move: ")
                        }
                        disabled={actionState.status === "saving"}
                      >
                        Create smaller first move
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => appendRecoveryNote("Reschedule later: ")}
                        disabled={actionState.status === "saving"}
                      >
                        Reschedule later
                      </Button>
                    </div>
                  </div>
                ) : null}
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
                          ? {
                              ...current,
                              productivityRating: event.target.value,
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-foreground">
                  Notes
                  <Textarea
                    aria-label="End session notes"
                    rows={3}
                    className="min-h-[90px]"
                    placeholder="What got in the way? What should happen next?"
                    value={terminalForm.notes}
                    onChange={(event) =>
                      setTerminalForm((current) =>
                        current
                          ? { ...current, notes: event.target.value }
                          : current,
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
            </>
          ) : null}
        </CardContent>
      </Card>

      {activeSession ? (
        <Card
          aria-label="Most recent execution summary"
          className="max-w-[820px]"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Recent execution summary
            </CardTitle>
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
