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
import { buildAreaAccentStyle, resolveSelectedArea } from "@/lib/areaAccent";
import { DiagnosticsDisclosure } from "./components/DiagnosticsDisclosure";
import { EmptyState } from "./components/EmptyState";

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
  if (status === "loading") return "Checking account data and local state.";
  if (status === "degraded")
    return "Account data is partially unavailable. Local state is still available.";
  return "Account data and local state are available.";
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

function getNextActionCtaLabel(kind: TodayCockpitModel["next"]["kind"]) {
  switch (kind) {
    case "capture":
      return "Capture a thought";
    case "needs_decision":
      return "Review in Triage";
    case "unplanned_task":
      return "Plan this task";
    case "current_work":
      return "Open Execute";
    case "recovery":
      return "Recover session";
    case "health_attention":
      return "Check Health";
  }
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
  const selectedArea = resolveSelectedArea(state.areas, selectedAreaId);
  const selectedAreaStyle = buildAreaAccentStyle(selectedArea?.color);
  const showNowPrimaryCard = cockpit.now.kind !== "empty";
  const hasWorkflowState =
    showNowPrimaryCard ||
    cockpit.needsDecision.count > 0 ||
    cockpit.unplanned.items.length > 0 ||
    cockpit.todayBlocks.length > 0 ||
    cockpit.recoveryItems.length > 0;
  const showDailyLoop = !hasWorkflowState;
  const showSystemStatusCard =
    cockpit.dataDegraded || cockpit.next.kind === "health_attention";
  const visibleSecondaryCardOrder = prioritizedCardOrder.filter((cardKey) => {
    switch (cardKey) {
      case "quickCapture":
        return true;
      case "needsDecision":
        return cockpit.needsDecision.count > 0;
      case "unplanned":
        return cockpit.unplanned.items.length > 0;
      case "todayBlocks":
        return cockpit.todayBlocks.length > 0;
      case "recovery":
        return cockpit.recoveryItems.length > 0;
      case "systemStatus":
        return showSystemStatusCard;
    }
  });

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
    <main className="grid gap-6 pb-6">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Today
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          One clear next move first. Everything else stays visible, quieter,
          and read-only.
        </p>
      </section>

      {homeData.status === "degraded" ? (
        <Alert variant="destructive">
          <AlertTitle>Account data is partially unavailable</AlertTitle>
          <AlertDescription>
            Showing local data where available. You can continue safely.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mx-auto grid w-full max-w-5xl gap-4">
        <Card
          data-testid="today-next-card"
          data-accent-strength="subtle"
          style={selectedAreaStyle}
          className="area-accent-card workflow-primary-card border-primary/40 shadow-sm"
        >
          <CardHeader className="gap-4 pb-2 sm:pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="text-3xl tracking-tight sm:text-4xl">
                  Next
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6 sm:text-base">
                  One useful move from the state you already have.
                </CardDescription>
              </div>
              {selectedArea ? (
                <Badge
                  variant="secondary"
                  className="area-accent-chip inline-flex items-center gap-2 rounded-full px-3 py-1"
                >
                  <span
                    aria-hidden
                    className="area-accent-dot h-2 w-2 rounded-full"
                  />
                  Current area: {selectedArea.name}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 sm:gap-6">
            <div className="grid gap-2">
              <p className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                {cockpit.next.label}
              </p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {cockpit.next.reason}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="min-w-[14rem]">
                <Link href={cockpit.next.href}>
                  {getNextActionCtaLabel(cockpit.next.kind)}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {showNowPrimaryCard ? (
          <Card className="workflow-secondary-card border-border/70 bg-background/70 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Now</CardTitle>
              <CardDescription>What is already in motion.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <p className="break-words font-medium">{cockpit.now.title}</p>
              <p className="text-sm text-muted-foreground">
                {cockpit.now.summary}
              </p>
              <div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={cockpit.now.href}>Go to Execute</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showDailyLoop ? (
          <EmptyState
            title="Daily loop"
            description="Start with one real capture, sort it in Triage, plan one local block, then use Execute and Review to close the loop. No sample data is created until you save something."
            action={
              <>
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/capture">Start with Capture</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/triage">Open Triage</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/calendar">Open Planning</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/review">Open Review</Link>
                </Button>
              </>
            }
          />
        ) : null}
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleSecondaryCardOrder.map((cardKey) => {
          if (cardKey === "quickCapture") {
            return (
              <Card
                key={cardKey}
                className="workflow-secondary-card border-border/80 xl:col-span-2"
              >
                <CardHeader>
                  <CardTitle className="text-lg">Quick Capture</CardTitle>
                  <CardDescription>
                    Save one real thing fast. Home stays read-only except this
                    capture handoff.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
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
                    Saves on this device and sends it to Triage. No planning,
                    execute, calendar, or health changes happen here.
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
                        Saved on this device and sent to{" "}
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
              <Card key={cardKey} className="workflow-secondary-card shadow-none">
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
                  <Button
                    asChild
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <Link href="/triage">Open Triage</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (cardKey === "unplanned") {
            return (
              <Card key={cardKey} className="workflow-secondary-card shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>{cockpit.unplanned.title}</span>
                    {cockpit.unplanned.items.length > 0 ? (
                      <Badge variant="secondary">
                        {cockpit.unplanned.items.length}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>
                    Active tasks without a plan.
                  </CardDescription>
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
                  <Button
                    asChild
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <Link href="/calendar">Open Planning</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (cardKey === "todayBlocks") {
            return (
              <Card key={cardKey} className="workflow-secondary-card shadow-none">
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
                      const task = tasks.find(
                        (item) => item.id === block.taskId,
                      );
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
              <Card key={cardKey} className="workflow-secondary-card shadow-none">
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
            <EmptyState
              key={cardKey}
              title="System trust/status"
              description={cockpit.systemStatus.summary}
              action={
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={cockpit.systemStatus.href}>Open Health</Link>
                </Button>
              }
            />
          );
        })}
      </section>

      {!showNowPrimaryCard && !hasWorkflowState ? (
        <section className="mx-auto w-full max-w-5xl">
          <EmptyState
            title="Now"
            description={`${cockpit.now.title} ${cockpit.now.summary}`}
          />
        </section>
      ) : null}

      <DiagnosticsDisclosure>
        <p>{statusLabel(homeData.status)}</p>
        {homeData.status !== "loading" && homeData.issues.length > 0 ? (
          <ul className="list-disc pl-5">
            {homeData.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </DiagnosticsDisclosure>

      {homeData.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved information. Local workflow state remains available.
        </p>
      ) : null}
    </main>
  );
}
