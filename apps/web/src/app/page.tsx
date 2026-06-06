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
  | "needsDecision"
  | "unplanned"
  | "todayBlocks"
  | "recovery"
  | "systemStatus";

const DEFAULT_CARD_ORDER: HomeCardKey[] = [
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
    capture: "needsDecision",
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

function getNextActionSupportSteps(kind: TodayCockpitModel["next"]["kind"]) {
  switch (kind) {
    case "capture":
      return ["Save one thought", "Sort it in Triage", "Plan one real block"];
    case "needs_decision":
      return [
        "Accept one draft",
        "Plan the accepted work",
        "Ignore the rest for now",
      ];
    case "unplanned_task":
      return [
        "Choose one slot",
        "Keep scope narrow",
        "Leave Google writes explicit",
      ];
    case "current_work":
      return [
        "Stay with one mission",
        "Record a real outcome",
        "Close the loop in Review",
      ];
    case "recovery":
      return [
        "Capture what happened",
        "Make the next move smaller",
        "Re-plan only what matters",
      ];
    case "health_attention":
      return ["Verify trust first", "Fix the blocker", "Return to Today"];
  }
}

function splitPreviewItems<T>(items: T[], visibleCount = 2) {
  return {
    visible: items.slice(0, visibleCount),
    overflow: items.slice(visibleCount),
  };
}

export default function HomePage() {
  const { state, selectedAreaId } = useWorkflow();
  const [homeData, setHomeData] = useState<HomeDataState>({
    status: "loading",
  });

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
  const focusOrderedSecondaryCardOrder = showDailyLoop
    ? []
    : visibleSecondaryCardOrder;
  const featuredSecondaryCardOrder = focusOrderedSecondaryCardOrder.slice(0, 1);
  const overflowSecondaryCardOrder = focusOrderedSecondaryCardOrder.slice(1);
  const overflowSummaryLabel = "More context";

  function renderHomeSupportCard(cardKey: HomeCardKey) {
    if (cardKey === "needsDecision") {
      const { visible, overflow } = splitPreviewItems(
        cockpit.needsDecision.items,
      );
      return (
        <Card
          key={cardKey}
          className="workflow-secondary-card workflow-support-card shadow-none"
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span>Needs decision</span>
              {cockpit.needsDecision.count > 0 ? (
                <Badge variant="secondary">{cockpit.needsDecision.count}</Badge>
              ) : null}
            </CardTitle>
            <CardDescription>Drafts waiting in Triage.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {cockpit.needsDecision.count === 0 ? (
              <p className="text-muted-foreground">No drafts waiting.</p>
            ) : (
              <>
                <div className="workflow-compact-list">
                  {visible.map((item) => (
                    <div key={item.id} className="workflow-compact-item">
                      <p className="break-words text-foreground">
                        {item.title}
                      </p>
                    </div>
                  ))}
                </div>
                {overflow.length > 0 ? (
                  <DiagnosticsDisclosure
                    title={`${overflow.length} more draft${overflow.length === 1 ? "" : "s"}`}
                    className="workflow-inline-disclosure"
                    contentClassName="workflow-compact-list mt-3 text-sm text-muted-foreground"
                  >
                      {overflow.map((item) => (
                        <div key={item.id} className="workflow-compact-item">
                          <p className="break-words text-foreground">
                            {item.title}
                          </p>
                        </div>
                      ))}
                  </DiagnosticsDisclosure>
                ) : null}
              </>
            )}
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/triage">Open Triage</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (cardKey === "unplanned") {
      const { visible, overflow } = splitPreviewItems(cockpit.unplanned.items);
      return (
        <Card
          key={cardKey}
          className="workflow-secondary-card workflow-support-card shadow-none"
        >
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
              <p className="text-muted-foreground">No tasks need planning.</p>
            ) : (
              <>
                <div className="workflow-compact-list">
                  {visible.map((task) => (
                    <div key={task.id} className="workflow-compact-item">
                      <p className="break-words text-foreground">
                        {task.title}
                      </p>
                    </div>
                  ))}
                </div>
                {overflow.length > 0 ? (
                  <DiagnosticsDisclosure
                    title={`${overflow.length} more task${overflow.length === 1 ? "" : "s"}`}
                    className="workflow-inline-disclosure"
                    contentClassName="workflow-compact-list mt-3 text-sm text-muted-foreground"
                  >
                      {overflow.map((task) => (
                        <div key={task.id} className="workflow-compact-item">
                          <p className="break-words text-foreground">
                            {task.title}
                          </p>
                        </div>
                      ))}
                  </DiagnosticsDisclosure>
                ) : null}
              </>
            )}
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/calendar">Open Planning</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (cardKey === "todayBlocks") {
      const { visible, overflow } = splitPreviewItems(cockpit.todayBlocks);
      return (
        <Card
          key={cardKey}
          className="workflow-secondary-card workflow-support-card shadow-none"
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span>Today&apos;s planned blocks</span>
              {cockpit.todayBlocks.length > 0 ? (
                <Badge variant="secondary">{cockpit.todayBlocks.length}</Badge>
              ) : null}
            </CardTitle>
            <CardDescription>Today in local time.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {cockpit.todayBlocks.length === 0 ? (
              <p className="text-muted-foreground">Nothing planned today.</p>
            ) : (
              <>
                <div className="workflow-compact-list">
                  {visible.map((block) => {
                    const task = tasks.find((item) => item.id === block.taskId);
                    return (
                      <div key={block.id} className="workflow-compact-item">
                        <p className="break-words font-medium">
                          {task?.title ?? "Planned block"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {formatBlockTime(block.startAt, block.endAt)}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          {block.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                {overflow.length > 0 ? (
                  <DiagnosticsDisclosure
                    title={`${overflow.length} more block${overflow.length === 1 ? "" : "s"}`}
                    className="workflow-inline-disclosure"
                    contentClassName="workflow-compact-list mt-3 text-sm text-muted-foreground"
                  >
                      {overflow.map((block) => {
                        const task = tasks.find(
                          (item) => item.id === block.taskId,
                        );
                        return (
                          <div key={block.id} className="workflow-compact-item">
                            <p className="break-words font-medium">
                              {task?.title ?? "Planned block"}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {formatBlockTime(block.startAt, block.endAt)}
                            </p>
                            <Badge variant="outline" className="mt-2">
                              {block.status}
                            </Badge>
                          </div>
                        );
                      })}
                  </DiagnosticsDisclosure>
                ) : null}
              </>
            )}
            <div className="grid gap-2 sm:flex">
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/calendar">Open Planning</Link>
              </Button>
              {cockpit.todayBlocks.length > 0 ? (
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/execute">Open Execute</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (cardKey === "recovery") {
      const { visible, overflow } = splitPreviewItems(cockpit.recoveryItems);
      return (
        <Card
          key={cardKey}
          className="workflow-secondary-card workflow-support-card shadow-none"
        >
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
              <p className="text-muted-foreground">Nothing needs recovery.</p>
            ) : (
              <>
                <div className="workflow-compact-list">
                  {visible.map((item) => (
                    <div key={item.id} className="workflow-compact-item">
                      <p className="break-words font-medium">{item.label}</p>
                      <p className="mt-1 text-muted-foreground">
                        {item.reason}
                      </p>
                    </div>
                  ))}
                </div>
                {overflow.length > 0 ? (
                  <DiagnosticsDisclosure
                    title={`${overflow.length} more recovery item${overflow.length === 1 ? "" : "s"}`}
                    className="workflow-inline-disclosure"
                    contentClassName="workflow-compact-list mt-3 text-sm text-muted-foreground"
                  >
                      {overflow.map((item) => (
                        <div key={item.id} className="workflow-compact-item">
                          <p className="break-words font-medium">
                            {item.label}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {item.reason}
                          </p>
                        </div>
                      ))}
                  </DiagnosticsDisclosure>
                ) : null}
              </>
            )}
            {cockpit.recoveryItems.length > 0 ? (
              <div className="grid gap-2 sm:flex">
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/execute">Open Execute</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
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
  }

  return (
    <main className="grid gap-6 pb-6">
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
          data-next-kind={cockpit.next.kind}
          data-accent-strength="subtle"
          style={selectedAreaStyle}
          className="area-accent-card workflow-primary-card workflow-flagship-card border-primary/40 shadow-sm"
        >
          <CardHeader className="gap-4 pb-2 sm:pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-3">
                <p className="workflow-surface-kicker">Instrument panel</p>
                <h1 className="workflow-surface-title text-3xl font-semibold tracking-tight sm:text-4xl">
                  Today
                </h1>
                <CardTitle className="text-2xl tracking-tight sm:text-3xl">
                  Next
                </CardTitle>
                <CardDescription className="workflow-surface-body max-w-2xl text-sm leading-6 sm:text-base">
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
            <DiagnosticsDisclosure
              title="Suggested follow-through"
              className="workflow-inline-disclosure"
              contentClassName="mt-3 text-sm text-muted-foreground"
            >
              <div
                className="workflow-next-steps"
                aria-label="Suggested follow-through"
              >
                {getNextActionSupportSteps(cockpit.next.kind).map((step) => (
                  <span key={step} className="workflow-next-step-chip">
                    {step}
                  </span>
                ))}
              </div>
            </DiagnosticsDisclosure>
          </CardContent>
        </Card>

        {showNowPrimaryCard ? (
          <Card className="workflow-secondary-card workflow-support-card border-border/70 bg-background/70 shadow-none">
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
            description="Capture one real thing, sort it in Triage, plan one local block, then let Execute and Review close the loop. Home stays read-only."
          />
        ) : null}
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-2 xl:grid-cols-3">
        {featuredSecondaryCardOrder.map((cardKey) =>
          renderHomeSupportCard(cardKey),
        )}
      </section>

      {overflowSecondaryCardOrder.length > 0 ? (
        <DiagnosticsDisclosure
          title={overflowSummaryLabel}
          className="mx-auto w-full max-w-5xl"
          contentClassName="mt-4"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {overflowSecondaryCardOrder.map((cardKey) =>
              renderHomeSupportCard(cardKey),
            )}
          </div>
        </DiagnosticsDisclosure>
      ) : null}

      <DiagnosticsDisclosure title="Today details">
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
