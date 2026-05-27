"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CalendarBlock,
  ExecutionSession,
  Task,
  TimeBlockProposal,
} from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWorkflow } from "@/lib/WorkflowContext";
import {
  listExecutionReviewItems,
  listPlanningItems,
  type DataProvider,
} from "@/lib/data/workflow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  buildTodayCockpitModel,
  type TodayCockpitModel,
  type TodayCockpitDraft,
  type TodayCockpitSession,
} from "@/lib/today/buildTodayCockpitModel";

type HomeDataState =
  | { status: "loading" }
  | {
      status: "ready" | "degraded";
      planning: {
        provider: DataProvider;
        tasks: Task[];
        proposals: TimeBlockProposal[];
        blocks: CalendarBlock[];
      } | null;
      execution: {
        provider: DataProvider;
        sessions: ExecutionSession[];
      } | null;
      issues: string[];
    };

function statusLabel(status: "loading" | "ready" | "degraded") {
  if (status === "loading") return "Checking saved workspace context.";
  if (status === "degraded") return "Saved workspace is partially unavailable.";
  return "Saved workspace context is available.";
}

function formatBlockTime(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function normalizeSession(session: ExecutionSession): TodayCockpitSession {
  if (session.outcome === "completed") {
    return {
      id: session.id,
      taskId: session.task_id,
      calendarBlockId: session.calendar_block_id,
      status: "completed",
      outcome: session.outcome,
    };
  }

  if (session.outcome === "blocked") {
    return {
      id: session.id,
      taskId: session.task_id,
      calendarBlockId: session.calendar_block_id,
      status: "stuck",
      outcome: session.outcome,
    };
  }

  if (session.outcome === "skipped") {
    return {
      id: session.id,
      taskId: session.task_id,
      calendarBlockId: session.calendar_block_id,
      status: "missed",
      outcome: session.outcome,
    };
  }

  if (session.outcome === "distracted") {
    return {
      id: session.id,
      taskId: session.task_id,
      calendarBlockId: session.calendar_block_id,
      status: "distracted",
      outcome: session.outcome,
    };
  }

  if (session.outcome === "stopped") {
    return {
      id: session.id,
      taskId: session.task_id,
      calendarBlockId: session.calendar_block_id,
      status: "stopped",
      outcome: session.outcome,
    };
  }

  return {
    id: session.id,
    taskId: session.task_id,
    calendarBlockId: session.calendar_block_id,
    status: "running",
    outcome: session.outcome,
  };
}

type HomeCardKey =
  | "quickCapture"
  | "needsDecision"
  | "unplanned"
  | "todayBlocks"
  | "recovery"
  | "systemStatus";

const DEFAULT_CARD_ORDER: HomeCardKey[] = [
  "quickCapture",
  "needsDecision",
  "unplanned",
  "todayBlocks",
  "recovery",
  "systemStatus",
];

function getPriorityCardOrder(cockpit: TodayCockpitModel): HomeCardKey[] {
  const prioritizedCardByNextKind: Record<
    TodayCockpitModel["next"]["kind"],
    HomeCardKey
  > = {
    recovery: "recovery",
    needs_decision: "needsDecision",
    current_work: "todayBlocks",
    unplanned_task: "unplanned",
    capture: "quickCapture",
    health_attention: "systemStatus",
  };
  const priorityCard = prioritizedCardByNextKind[cockpit.next.kind];

  return [
    priorityCard,
    ...DEFAULT_CARD_ORDER.filter((card) => card !== priorityCard),
  ];
}

export default function HomePage() {
  const { state, selectedAreaId, submitCaptureText } = useWorkflow();
  const [homeData, setHomeData] = useState<HomeDataState>({
    status: "loading",
  });
  const [quickCaptureText, setQuickCaptureText] = useState("");
  const [quickCaptureFeedback, setQuickCaptureFeedback] = useState<
    | { status: "idle" }
    | { status: "error"; message: string }
    | { status: "saved" }
  >({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function loadHomeData() {
      const client = createSupabaseBrowserClient();
      const [planningResult, executionResult] = await Promise.allSettled([
        listPlanningItems(client),
        listExecutionReviewItems(client),
      ]);

      if (cancelled) {
        return;
      }

      const issues: string[] = [];
      const planning =
        planningResult.status === "fulfilled"
          ? {
              provider: planningResult.value.provider,
              tasks: planningResult.value.tasks,
              proposals: planningResult.value.proposals,
              blocks: planningResult.value.blocks,
            }
          : null;
      const execution =
        executionResult.status === "fulfilled"
          ? {
              provider: executionResult.value.provider,
              sessions: executionResult.value.sessions,
            }
          : null;

      if (planningResult.status === "rejected") {
        issues.push(
          planningResult.reason instanceof Error
            ? planningResult.reason.message
            : "Planning rows are unavailable.",
        );
      }
      if (executionResult.status === "rejected") {
        issues.push(
          executionResult.reason instanceof Error
            ? executionResult.reason.message
            : "Execution rows are unavailable.",
        );
      }

      setHomeData({
        status: issues.length > 0 ? "degraded" : "ready",
        planning,
        execution,
        issues,
      });
    }

    void loadHomeData();

    return () => {
      cancelled = true;
    };
  }, []);

  const tasks =
    homeData.status !== "loading" && homeData.planning
      ? homeData.planning.tasks
      : state.tasks;
  const proposals =
    homeData.status !== "loading" && homeData.planning
      ? homeData.planning.proposals
      : state.timeBlockProposals;
  const blocks =
    homeData.status !== "loading" && homeData.planning
      ? homeData.planning.blocks
      : state.calendarBlocks;
  const sessionsForModel: TodayCockpitSession[] =
    homeData.status !== "loading" && homeData.execution
      ? homeData.execution.sessions.map(normalizeSession)
      : state.executionSessions.map((session) => ({
          id: session.id,
          taskId: session.task_id,
          calendarBlockId: session.calendar_block_id,
          status: session.status,
          outcome: session.outcome,
        }));

  const drafts = useMemo<TodayCockpitDraft[]>(
    () => [
      ...state.taskDrafts
        .filter((draft) => draft.status === "pending")
        .map((draft) => ({
          id: draft.id,
          title: draft.title,
          kind: "task" as const,
        })),
      ...state.projectDrafts
        .filter((draft) => draft.status === "pending")
        .map((draft) => ({
          id: draft.id,
          title: draft.title,
          kind: "project" as const,
        })),
    ],
    [state.projectDrafts, state.taskDrafts],
  );
  const healthState = useMemo(
    () =>
      state.healthChecks.some((check) => check.status === "critical")
        ? {
            state: "attention" as const,
            summary: "Recent checks show a critical issue.",
          }
        : { state: "unavailable" as const },
    [state.healthChecks],
  );
  const browserTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;

  const cockpit = useMemo(
    () =>
      buildTodayCockpitModel({
        timezone: browserTimeZone,
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
        })),
        drafts,
        proposals: proposals.map((proposal) => ({
          id: proposal.id,
          taskId: proposal.task_id,
          status: proposal.status,
        })),
        blocks: blocks.map((block) => ({
          id: block.id,
          taskId: block.task_id,
          startAt: block.start_at,
          endAt: block.end_at,
          status: block.status,
        })),
        sessions: sessionsForModel.map((session) => ({
          id: session.id,
          taskId: session.taskId,
          calendarBlockId: session.calendarBlockId,
          status: session.status,
          outcome: session.outcome,
        })),
        health: healthState,
        dataDegraded: homeData.status === "degraded",
      }),
    [
      blocks,
      browserTimeZone,
      drafts,
      healthState,
      homeData.status,
      proposals,
      sessionsForModel,
      tasks,
    ],
  );
  const prioritizedCardOrder = useMemo(
    () => getPriorityCardOrder(cockpit),
    [cockpit],
  );
  const showNowPrimaryCard = cockpit.now.kind !== "empty";

  function handleQuickCaptureSubmit() {
    const trimmed = quickCaptureText.trim();
    if (!trimmed) {
      setQuickCaptureFeedback({
        status: "error",
        message: "Type a note first.",
      });
      return;
    }

    try {
      submitCaptureText(trimmed, selectedAreaId);
      setQuickCaptureText("");
      setQuickCaptureFeedback({ status: "saved" });
    } catch {
      setQuickCaptureFeedback({
        status: "error",
        message: "Quick capture was not saved. Open Capture and try again.",
      });
    }
  }

  return (
    <main className="grid gap-4">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          Pick one useful next move.
        </p>
      </section>

      {homeData.status === "degraded" ? (
        <Alert variant="destructive">
          <AlertTitle>Saved workspace is partially unavailable</AlertTitle>
          <AlertDescription>
            Showing this browser data where available. You can continue safely.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-2xl">Next</CardTitle>
          <CardDescription>Deterministic next step.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-lg font-semibold">{cockpit.next.label}</p>
          <p className="text-sm text-muted-foreground">{cockpit.next.reason}</p>
          <Button asChild className="w-full sm:w-auto">
            <Link href={cockpit.next.href}>Open next step</Link>
          </Button>
        </CardContent>
      </Card>

      {showNowPrimaryCard ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Now</CardTitle>
            <CardDescription>What is already in motion.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="break-words font-medium">{cockpit.now.title}</p>
            <p className="text-sm text-muted-foreground">
              {cockpit.now.summary}
            </p>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={cockpit.now.href}>Go to Execute</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {prioritizedCardOrder.map((cardKey) => {
          if (cardKey === "quickCapture") {
            return (
              <Card key={cardKey}>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Capture</CardTitle>
                  <CardDescription>Save one thing fast.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Input
                    aria-label="Home quick capture text"
                    placeholder="What matters right now?"
                    value={quickCaptureText}
                    onChange={(event) => {
                      setQuickCaptureText(event.target.value);
                      if (quickCaptureFeedback.status !== "idle") {
                        setQuickCaptureFeedback({ status: "idle" });
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleQuickCaptureSubmit}
                    className="w-full sm:w-auto"
                  >
                    Save quick capture
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Browser save plus a Triage draft.
                  </p>
                  {quickCaptureFeedback.status === "error" ? (
                    <p role="alert" className="text-sm text-destructive">
                      {quickCaptureFeedback.message}
                    </p>
                  ) : null}
                  {quickCaptureFeedback.status === "saved" ? (
                    <Alert variant="success">
                      <AlertTitle>Saved.</AlertTitle>
                      <AlertDescription>
                        Saved in this browser and sent to{" "}
                        <Link
                          href="/triage"
                          className="underline underline-offset-2"
                        >
                          Triage
                        </Link>
                        .
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            );
          }

          if (cardKey === "needsDecision") {
            return (
              <Card key={cardKey}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>Needs decision</span>
                    {cockpit.needsDecision.count > 0 ? (
                      <Badge variant="secondary">
                        {cockpit.needsDecision.count}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>Drafts waiting in Triage.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {cockpit.needsDecision.count === 0 ? (
                    <p className="text-muted-foreground">No drafts waiting.</p>
                  ) : (
                    cockpit.needsDecision.items.map((item) => (
                      <p key={item.id} className="break-words text-foreground">
                        {item.title}
                      </p>
                    ))
                  )}
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/triage">Open Triage</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (cardKey === "unplanned") {
            return (
              <Card key={cardKey}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>{cockpit.unplanned.title}</span>
                    {cockpit.unplanned.items.length > 0 ? (
                      <Badge variant="secondary">
                        {cockpit.unplanned.items.length}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>Active tasks without a plan.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {cockpit.unplanned.items.length === 0 ? (
                    <p className="text-muted-foreground">
                      No tasks need planning.
                    </p>
                  ) : (
                    cockpit.unplanned.items.map((task) => (
                      <p key={task.id} className="break-words text-foreground">
                        {task.title}
                      </p>
                    ))
                  )}
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/calendar">Open Planning</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (cardKey === "todayBlocks") {
            return (
              <Card key={cardKey}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>Today&apos;s planned blocks</span>
                    {cockpit.todayBlocks.length > 0 ? (
                      <Badge variant="secondary">
                        {cockpit.todayBlocks.length}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>Today in local time.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {cockpit.todayBlocks.length === 0 ? (
                    <p className="text-muted-foreground">
                      Nothing planned today.
                    </p>
                  ) : (
                    cockpit.todayBlocks.map((block) => {
                      const task = tasks.find((item) => item.id === block.taskId);
                      return (
                        <div
                          key={block.id}
                          className="rounded-md border border-border p-2"
                        >
                          <p className="break-words font-medium">
                            {task?.title ?? "Planned block"}
                          </p>
                          <p className="text-muted-foreground">
                            {formatBlockTime(block.startAt, block.endAt)}
                          </p>
                          <Badge variant="outline" className="mt-1">
                            {block.status}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                  <div className="grid gap-2 sm:flex">
                    <Button
                      asChild
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      <Link href="/calendar">Open Planning</Link>
                    </Button>
                    {cockpit.todayBlocks.length > 0 ? (
                      <Button
                        asChild
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        <Link href="/execute">Open Execute</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (cardKey === "recovery") {
            return (
              <Card key={cardKey}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>Stuck / needs recovery</span>
                    {cockpit.recoveryItems.length > 0 ? (
                      <Badge variant="secondary">
                        {cockpit.recoveryItems.length}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>Missed or interrupted work.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {cockpit.recoveryItems.length === 0 ? (
                    <p className="text-muted-foreground">
                      Nothing needs recovery.
                    </p>
                  ) : (
                    cockpit.recoveryItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border border-border p-2"
                      >
                        <p className="break-words font-medium">{item.label}</p>
                        <p className="text-muted-foreground">{item.reason}</p>
                      </div>
                    ))
                  )}
                  {cockpit.recoveryItems.length > 0 ? (
                    <div className="grid gap-2 sm:flex">
                      <Button
                        asChild
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        <Link href="/execute">Open Execute</Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        <Link href="/review">Open Review</Link>
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={cardKey}>
              <CardHeader>
                <CardTitle className="text-lg">System trust/status</CardTitle>
                <CardDescription>Deterministic health only.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p className="text-muted-foreground">
                  {cockpit.systemStatus.summary}
                </p>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={cockpit.systemStatus.href}>Open Health</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!showNowPrimaryCard ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Now</CardTitle>
            <CardDescription>Nothing active yet.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="break-words font-medium">{cockpit.now.title}</p>
            <p className="text-sm text-muted-foreground">
              {cockpit.now.summary}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">System details</summary>
        <p className="mt-2">{statusLabel(homeData.status)}</p>
      </details>

      {homeData.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved workspace rows. This browser workflow state remains
          available.
        </p>
      ) : null}

      {homeData.status !== "loading" && homeData.issues.length > 0 ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Developer details
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {homeData.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}
