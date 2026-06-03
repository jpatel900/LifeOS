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
import { Textarea } from "@/components/ui/textarea";
import { DiagnosticsDisclosure } from "../components/DiagnosticsDisclosure";
import { EmptyState } from "../components/EmptyState";
import { WorkflowLoadingState } from "../components/WorkflowLoadingState";
import {
  createExecutionSession,
  listExecutionReviewItems,
  markExecutionSession,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
import { captureEvent } from "@/lib/observability";
import { saveModeLabel, savedViaLabel } from "@/lib/statusVocabulary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { executeLifecycleDisplay } from "@/lib/workflowLifecycle";
import { useWorkflow } from "@/lib/WorkflowContext";
import type { Phase2MockExecutionSession } from "@/lib/types";
import {
  buildAreaAccentStyle,
  resolveAreaById,
  resolveSelectedArea,
} from "@/lib/areaAccent";

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
      return "Session stopped on this device. Decide the next useful step.";
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

function focusStateTitle(
  uiState: SessionUiState,
  usesPersistedExecution: boolean,
) {
  switch (uiState) {
    case "not_started":
      return "Ready to focus";
    case "running":
      return "Focus in progress";
    case "paused":
      return usesPersistedExecution
        ? "Paused and waiting for a real outcome"
        : "Paused on purpose";
    case "completed":
      return "Session complete";
    case "stopped":
      return "Stopped on this device";
    case "stuck":
      return "Blocked, but recoverable";
    case "distracted":
      return "Focus was interrupted";
    case "missed":
      return "Missed block";
  }
}

function focusStateDescription(
  uiState: SessionUiState,
  usesPersistedExecution: boolean,
) {
  switch (uiState) {
    case "not_started":
      return "One mission is staged. Start when you are ready, then keep the outcome honest.";
    case "running":
      return "Stay with this mission until you can mark a real end outcome.";
    case "paused":
      return usesPersistedExecution
        ? "Sessions saved to your account cannot resume yet. Finish with the outcome that matches what happened."
        : "Resume when you are ready, or end the session with the outcome that fits.";
    case "completed":
      return "Close the loop in Review, then decide whether another block is needed.";
    case "stopped":
      return "This device-only session ended without a saved account outcome. Choose the next useful move.";
    case "stuck":
      return "Capture the blocker in plain language, then make the next move smaller or later.";
    case "distracted":
      return "Capture the interruption, then choose whether to reset or re-plan.";
    case "missed":
      return "Record why the block was missed, then pick the next useful step without shame.";
  }
}

function executeSuccessFeedback(
  actionState: Extract<ActionState, { status: "saved" }>,
  usesPersistedExecution: boolean,
) {
  const savedWhere = savedViaLabel(actionState.provider);

  if (actionState.label === "Session started") {
    return {
      title: "Focus session started",
      description: `Session started and ${savedWhere}. Stay here until you can record a real outcome.`,
      primaryLink: null,
      secondaryLink: null,
    };
  }

  if (actionState.label === "Session marked paused") {
    return {
      title: "Session paused",
      description: usesPersistedExecution
        ? `Session paused and ${savedWhere}. Stay here and choose the end outcome that matches what happened.`
        : `Session paused and ${savedWhere}. Resume here when you are ready, or end the session honestly.`,
      primaryLink: null,
      secondaryLink: null,
    };
  }

  if (actionState.label === "Session marked completed") {
    return {
      title: "Session complete",
      description: `Session marked completed and ${savedWhere}. Move to Review next or plan another block.`,
      primaryLink: {
        href: "/review",
        label: "Open Review",
      },
      secondaryLink: {
        href: "/calendar",
        label: "Plan next block",
      },
    };
  }

  if (actionState.label === "Session marked stopped") {
    return {
      title: "Session stopped",
      description: `Session marked stopped and ${savedWhere}. Capture what happened or plan the next block.`,
      primaryLink: {
        href: "/capture",
        label: "Capture follow-up",
      },
      secondaryLink: {
        href: "/calendar",
        label: "Plan next block",
      },
    };
  }

  if (
    actionState.label === "Session marked stuck" ||
    actionState.label === "Session marked distracted" ||
    actionState.label === "Session marked missed"
  ) {
    const stateLabel = actionState.label.replace("Session marked ", "");

    return {
      title: `Session ${stateLabel}`,
      description: `${actionState.label}. It was ${savedWhere}. Capture what happened, then re-plan or review it later.`,
      primaryLink: {
        href: "/capture",
        label: "Capture follow-up",
      },
      secondaryLink: {
        href: "/calendar",
        label: "Plan next block",
      },
    };
  }

  return {
    title: "Execution updated",
    description: `${actionState.label}. It was ${savedWhere}. Review the current session state below.`,
    primaryLink: null,
    secondaryLink: null,
  };
}

export default function ExecutePage() {
  const { state, selectedAreaId, startTaskSession, markSession } =
    useWorkflow();
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
  const executeProvider =
    executeState.status === "ready" ? executeState.provider : "mock";
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
  const area = activeTask
    ? resolveAreaById(state.areas, activeTask.area_id) ??
      getAreaById(activeTask.area_id) ??
      null
    : null;
  const selectedArea = resolveSelectedArea(state.areas, selectedAreaId);
  const missionArea = area ?? selectedArea;
  const sessionStartedLabel = !activeSession
    ? "Not started"
    : usesPersistedExecution
      ? latestPersistedSession
        ? `Saved at ${new Date(latestPersistedSession.created_at).toLocaleTimeString()}`
        : "Not started"
      : "Started in this browser";
  const timingLabel = usesPersistedExecution
    ? latestPersistedSession?.actual_minutes != null
      ? `${latestPersistedSession.actual_minutes} minutes recorded`
      : hasActiveSession
        ? "Add the actual minutes when you end this session."
        : "Actual minutes are recorded when you close the session."
    : activeSession
      ? "This browser-only session does not track live minutes. Record the actual minutes when you finish."
      : "Actual minutes are recorded when you end the session.";

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
          ? "Sessions saved to your account do not support resume yet. Choose an end outcome."
          : "Resume is available only for sessions saved on this device."
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
        ? "Stop is available only for sessions saved on this device. Sessions saved to your account need an end outcome and details."
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
          ? "Paused. Sessions saved to your account need an end outcome to finish."
          : "Resume when ready, or choose an end outcome."
        : sessionUiState === "running"
          ? "When this block ends, choose Complete, Stuck, Distracted, or Missed."
          : "Start the session when you are ready to focus.";
  const showStartControl =
    !terminalForm &&
    (sessionUiState === "not_started" || sessionUiState === "stopped");
  const showPauseControl = !terminalForm && sessionUiState === "running";
  const showResumeControl =
    !terminalForm && !usesPersistedExecution && sessionUiState === "paused";
  const showEndOutcomeControls =
    !terminalForm &&
    (sessionUiState === "running" || sessionUiState === "paused");
  const showStopControl =
    !terminalForm && !usesPersistedExecution && hasActiveSession;
  const showPersistedStopGuidance =
    !terminalForm &&
    usesPersistedExecution &&
    (sessionUiState === "running" || sessionUiState === "paused");
  const lifecycle = executeLifecycleDisplay({
    uiState: sessionUiState,
    hasPlannedBlock: Boolean(activeBlock),
  });
  const focusTitle = focusStateTitle(sessionUiState, usesPersistedExecution);
  const focusDescription = focusStateDescription(
    sessionUiState,
    usesPersistedExecution,
  );
  const focusTruthNote = usesPersistedExecution
    ? sessionUiState === "paused"
      ? "Resume is intentionally unavailable here. Persisted paused sessions need a real end outcome, not a fake restart path."
      : showPersistedStopGuidance
        ? "Stop stays device-only. Persisted sessions need an explicit end outcome and notes."
        : "Persisted sessions keep account truth first. Timing is recorded when you finish, not faked live."
    : sessionUiState === "paused"
      ? "This paused session lives only on this device, so resume stays available here."
      : "This device-only mode keeps the session honest without pretending it was saved to your account.";

  async function handleStart() {
    if (!activeTask || startDisabledReason) return;

    if (!usesPersistedExecution) {
      startTaskSession(activeTask.id);
      setActionState({
        status: "saved",
        label: "Session started",
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
        label: "Session started",
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
        label: `Session marked ${markLabels[status].saved}`,
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
        label: `Session marked ${markLabels[status].saved}`,
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
          <WorkflowLoadingState
            title="Checking saved execution rows"
            description="Device-only guidance is still available while saved execution rows load."
          />
        ) : null}
        {executeState.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Execution rows could not load</AlertTitle>
            <AlertDescription>{executeState.message}</AlertDescription>
          </Alert>
        ) : null}
        <DiagnosticsDisclosure>
          {executeState.status === "ready" ? (
            <>
              <p>
                Save mode: <strong>{saveModeLabel(executeState.provider)}</strong>
              </p>
              <p>
                Technical save mode id: <strong>{executeState.provider}</strong>
              </p>
            </>
          ) : null}
        </DiagnosticsDisclosure>
        {actionState.status === "saving" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Saving {actionState.label}...
          </p>
        ) : null}
        {actionState.status === "saved" ? (
          (() => {
            const feedback = executeSuccessFeedback(
              actionState,
              usesPersistedExecution,
            );

            return (
              <Alert
                role="status"
                className="border-border bg-muted text-foreground"
              >
                <AlertTitle className="text-primary">
                  {feedback.title}
                </AlertTitle>
                <AlertDescription>{feedback.description}</AlertDescription>
                {feedback.primaryLink || feedback.secondaryLink ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {feedback.primaryLink ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={feedback.primaryLink.href}>
                          {feedback.primaryLink.label}
                        </Link>
                      </Button>
                    ) : null}
                    {feedback.secondaryLink ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={feedback.secondaryLink.href}>
                          {feedback.secondaryLink.label}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Alert>
            );
          })()
        ) : null}
        {actionState.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Execution change was not saved</AlertTitle>
            <AlertDescription>{actionState.message}</AlertDescription>
          </Alert>
        ) : null}
        <Card className="workflow-primary-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What Execute is for</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Execute is where one planned task becomes one focused session with
              a clear end outcome.
            </p>
          </CardContent>
        </Card>
        <EmptyState
          title="No current task is in execution."
          description="Plan one block in Planning or capture and triage a task first."
          action={
            <Button asChild>
              <Link href="/calendar">Go to Planning</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Execute</h1>
        <p className="text-sm text-muted-foreground">
          Keep one current mission visible until you decide what happened and
          what comes next.
        </p>
      </section>

      <DiagnosticsDisclosure>
        {executeState.status === "ready" ? (
          <>
            <p>
              Save mode: <strong>{saveModeLabel(executeState.provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{executeState.provider}</strong>
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {actionState.status === "saving" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saving {actionState.label}...
        </p>
      ) : null}

      {actionState.status === "saved" ? (
        (() => {
          const feedback = executeSuccessFeedback(
            actionState,
            usesPersistedExecution,
          );

          return (
            <Alert
              role="status"
              className="workflow-celebration-alert text-foreground"
            >
              <AlertTitle className="text-primary">{feedback.title}</AlertTitle>
              <AlertDescription>{feedback.description}</AlertDescription>
              <div className="workflow-celebration-meta">
                <span className="workflow-celebration-chip">
                  {savedViaLabel(actionState.provider)}
                </span>
                <span className="workflow-celebration-chip">
                  {actionState.label}
                </span>
              </div>
              {feedback.primaryLink || feedback.secondaryLink ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {feedback.primaryLink ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={feedback.primaryLink.href}>
                        {feedback.primaryLink.label}
                      </Link>
                    </Button>
                  ) : null}
                  {feedback.secondaryLink ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={feedback.secondaryLink.href}>
                        {feedback.secondaryLink.label}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Alert>
          );
        })()
      ) : null}

      {actionState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Execution change was not saved</AlertTitle>
          <AlertDescription>{actionState.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card
        data-testid="execute-current-mission-card"
        data-accent-strength="strong"
        data-session-ui-state={sessionUiState}
        style={buildAreaAccentStyle(missionArea?.color)}
        className="area-accent-card workflow-primary-card max-w-[980px]"
      >
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Current mission
              </p>
              <CardTitle className="text-3xl font-semibold leading-tight">
                {activeTask.title}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
              <Badge variant={hasActiveSession ? "default" : "outline"}>
                {sessionStateLabel}
              </Badge>
              {area ? (
                <Badge
                  variant="secondary"
                  className="area-accent-chip w-fit rounded-full"
                >
                  Area: {area.name}
                </Badge>
              ) : selectedArea ? (
                <Badge
                  variant="secondary"
                  className="area-accent-chip w-fit rounded-full"
                >
                  Current area: {selectedArea.name}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold leading-tight">{focusTitle}</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {focusDescription}
            </p>
          </div>

          {showEndOutcomeControls ? (
            <p
              id="execute-end-actions"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              End this session
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {showStartControl ? (
              <>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => void handleStart()}
                  disabled={startDisabledReason !== null}
                >
                  Start
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/calendar">Check Planning</Link>
                </Button>
              </>
            ) : null}

            {showPauseControl ? (
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => void handleMark("paused")}
                disabled={pauseDisabledReason !== null}
              >
                Pause
              </Button>
            ) : null}

            {showResumeControl ? (
              <Button
                type="button"
                size="lg"
                onClick={() => void handleResume()}
                disabled={resumeDisabledReason !== null}
              >
                Resume
              </Button>
            ) : null}

            {showEndOutcomeControls ? (
              <>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => void handleMark("completed")}
                  disabled={endDisabledReason !== null}
                >
                  Complete
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => void handleMark("stuck")}
                  disabled={endDisabledReason !== null}
                >
                  Stuck
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => void handleMark("distracted")}
                  disabled={endDisabledReason !== null}
                >
                  Distracted
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => void handleMark("missed")}
                  disabled={endDisabledReason !== null}
                >
                  Missed
                </Button>
              </>
            ) : null}

            {showStopControl ? (
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => void handleMark("stopped")}
                disabled={stopDisabledReason !== null}
              >
                Stop on this device
              </Button>
            ) : null}

            {usesPersistedExecution && sessionUiState === "paused" ? (
              <Button asChild size="lg" variant="outline">
                <Link href="/review">Review context</Link>
              </Button>
            ) : null}

            {sessionUiState === "completed" ? (
              <>
                <Button asChild size="lg">
                  <Link href="/review">Review this session</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/calendar">Plan next block</Link>
                </Button>
              </>
            ) : null}

            {["stopped", "stuck", "distracted", "missed"].includes(
              sessionUiState,
            ) ? (
              <>
                <Button asChild size="lg">
                  <Link href="/capture">Capture follow-up</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/calendar">Plan next block</Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="/review">Review this session</Link>
                </Button>
              </>
            ) : null}
          </div>

          <p className="text-sm text-muted-foreground">
            {showStartControl
              ? "Start when you are ready to focus on this one task."
              : showResumeControl
                ? "Resume when you are ready, or finish the session with a real outcome."
                : showPauseControl
                  ? "Pause if you need to step away. Keep the outcome honest when the block ends."
                  : isTerminalSession
                      ? "This session is ended. Pick the next useful move."
                      : "Choose the control that matches what actually happened in this block."}
          </p>

          {showPersistedStopGuidance ? (
            <p className="text-sm text-muted-foreground">
              Stop (device-only sessions) is only available when the session
              lives on this device. Sessions saved to your account need an end
              outcome and notes.
            </p>
          ) : null}

          <div className="grid gap-2 text-sm">
            <p className="area-accent-panel rounded-md border p-3">
              <span className="font-medium text-foreground">
                First tiny step:
              </span>{" "}
              {activeTask.first_tiny_step ??
                "Pick one concrete action you can finish in a few minutes."}
            </p>
          </div>

          <details className="system-details-disclosure">
            <summary className="text-sm font-medium text-foreground">
              Mission details
            </summary>
            <div className="mt-4 grid gap-3 text-sm">
              <p className="area-accent-panel rounded-md border p-3">
                <span className="font-medium text-foreground">
                  Definition of done:
                </span>{" "}
                {activeTask.definition_of_done ??
                  "Complete the first useful move and note the result."}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="area-accent-panel rounded-md border p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Session started
                  </p>
                  <p className="mt-1 font-medium">{sessionStartedLabel}</p>
                </div>
                <div className="area-accent-panel rounded-md border p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Timing
                  </p>
                  <p className="mt-1 font-medium">{timingLabel}</p>
                </div>
              </div>
              {activeBlock ? (
                <p className="area-accent-panel rounded-md border p-3 text-sm text-foreground">
                  <span className="font-medium">Planned block:</span>{" "}
                  {new Date(activeBlock.start_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  to{" "}
                  {new Date(activeBlock.end_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  .
                </p>
              ) : (
                <p className="area-accent-panel rounded-md border p-3 text-sm text-foreground">
                  <span className="font-medium">Planned block:</span> No planned
                  block is attached right now. You can still focus this task,
                  or plan a block first.
                </p>
              )}
              <p className="area-accent-panel rounded-md border p-3 text-sm text-foreground">
                <span className="font-medium">Next recommended action:</span>{" "}
                {nextRecommendedAction}
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card
          data-testid="execute-focus-state-card"
          data-focus-state={sessionUiState}
          style={buildAreaAccentStyle(missionArea?.color)}
          className="focus-state-card h-full"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Focus state</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="focus-state-orb"
                />
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {sessionStateLabel}
                </p>
              </div>
              <h2 className="text-2xl font-semibold leading-tight">
                {focusTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{focusTruthNote}</p>
            </div>

            {missionArea ? (
              <span className="area-accent-chip inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
                <span
                  aria-hidden="true"
                  className="area-accent-dot size-2 rounded-full"
                />
                Current area: {missionArea.name}
              </span>
            ) : null}

            <details className="system-details-disclosure">
              <summary className="text-sm font-medium text-foreground">
                System details
              </summary>
              <div className="mt-4 grid gap-3">
                <div className="area-accent-panel rounded-md border p-3 text-sm text-foreground">
                  <p className="font-medium">Execution truth</p>
                  <p className="mt-1 text-muted-foreground">{focusDescription}</p>
                </div>
                <div className="area-accent-panel rounded-md border p-3 text-sm text-foreground">
                  <p className="font-medium">Save mode</p>
                  <p className="mt-1 text-muted-foreground">
                    {saveModeLabel(executeProvider)} via{" "}
                    <strong>{executeProvider}</strong>.
                  </p>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card className="workflow-secondary-card h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isTerminalSession || (usesPersistedExecution && terminalForm)
                ? "Close the loop"
                : "Keep this block clean"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isTerminalSession ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recovery / next-step actions
                </p>
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
                  {!usesPersistedExecution && startDisabledReason === null ? (
                    <Button type="button" onClick={() => void handleStart()}>
                      Start another session
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div
              data-testid="execute-side-thought-card"
              className="workflow-support-panel flex flex-col gap-2 rounded-lg border p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Side thought
              </p>
              <p className="text-sm text-muted-foreground">
                Capture it without losing the current mission. Keep it secondary
                until this focus block is done.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href="/capture">Capture a side thought</Link>
                </Button>
              </div>
            </div>

            {usesPersistedExecution && terminalForm ? (
              <>
                <section
                  aria-label="End session details"
                  className="workflow-support-panel flex flex-col gap-3 rounded-lg border bg-muted/60 p-4"
                >
                  <h2 className="m-0 text-[0.95rem] font-semibold">
                    {recoveryTitle(terminalForm.status)}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {recoveryGuidance(terminalForm.status)}
                  </p>
                  {terminalForm.status !== "completed" ? (
                    <div className="workflow-support-panel rounded-md border bg-background/60 p-3 text-sm">
                      <p className="font-medium text-foreground">
                        What got in the way?
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Capture the blocker in plain language so your next move
                        is clear.
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
                          onClick={() =>
                            appendRecoveryNote("Reschedule later: ")
                          }
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
      </div>

      {activeSession ? (
        <details className="system-details-disclosure max-w-[820px]">
          <summary className="text-sm font-medium text-foreground">
            Recent session details
          </summary>
          <div
            aria-label="Most recent execution summary"
            className="mt-4 grid gap-1 text-sm text-muted-foreground"
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
        </details>
      ) : null}
    </div>
  );
}
