"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  Area,
  CalendarBlock,
  CaptureItem,
  ExecutionSession,
  ReviewEntry,
  Task,
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
import { DiagnosticsDisclosure } from "../components/DiagnosticsDisclosure";
import { EmptyState } from "../components/EmptyState";
import {
  createReviewEntry,
  listAreas,
  listCaptureItems,
  listExecutionReviewItems,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
import { captureEvent } from "@/lib/observability";
import { saveModeLabel, savedViaLabel } from "@/lib/statusVocabulary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  reviewGroupLifecycleDisplay,
  reviewedLifecycleDisplay,
} from "@/lib/workflowLifecycle";
import { useWorkflow } from "@/lib/WorkflowContext";
import {
  buildAreaAccentStyle,
  resolveSelectedArea,
} from "@/lib/areaAccent";

type ReviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
      captures: CaptureItem[];
      tasks: Task[];
      blocks: CalendarBlock[];
      sessions: ExecutionSession[];
      reviewEntries: ReviewEntry[];
      areas: Area[];
    };

type ActionState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; provider: DataProvider }
  | { status: "error"; message: string };

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatReviewDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function summaryNumber(
  summary: ReviewEntry["summary_json"],
  key: string,
): number | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const value = (summary as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function uniqTruthy(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim()))),
  );
}

export default function ReviewPage() {
  const { state, selectedAreaId } = useWorkflow();
  const [reviewState, setReviewState] = useState<ReviewState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadReviewItems() {
      try {
        const client = createSupabaseBrowserClient();
        const result = await listExecutionReviewItems(client);
        const [areasResult, capturesResult] =
          result.provider === "supabase"
            ? await Promise.all([listAreas(client), listCaptureItems(client)])
            : [null, null];
        if (!cancelled) {
          setReviewState({
            status: "ready",
            provider: result.provider,
            captures: capturesResult?.captures ?? [],
            tasks: result.tasks,
            blocks: result.blocks,
            sessions: result.sessions,
            reviewEntries: result.reviewEntries,
            areas: areasResult?.areas ?? [],
          });
        }
      } catch (error) {
        if (!cancelled) {
          setReviewState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load review rows.",
          });
        }
      }
    }

    void loadReviewItems();

    return () => {
      cancelled = true;
    };
  }, []);

  const usesPersistedReview =
    reviewState.status === "ready" && reviewState.provider === "supabase";
  const captures = usesPersistedReview ? reviewState.captures : state.captureItems;
  const tasks = usesPersistedReview ? reviewState.tasks : state.tasks;
  const blocks = usesPersistedReview
    ? reviewState.blocks
    : state.calendarBlocks;
  const sessions = usesPersistedReview
    ? reviewState.sessions
    : state.executionSessions;
  const reviewEntries = usesPersistedReview ? reviewState.reviewEntries : [];
  const areas = usesPersistedReview ? reviewState.areas : state.areas;
  const localReviewLog = usesPersistedReview ? [] : state.reviewLog;
  const selectedArea = resolveSelectedArea(state.areas, selectedAreaId);
  const selectedAreaStyle = buildAreaAccentStyle(selectedArea?.color);
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));

  const completed = sessions.filter((session) =>
    "status" in session
      ? session.status === "completed"
      : session.outcome === "completed",
  );
  const missed = sessions.filter((session) =>
    "status" in session
      ? session.status === "missed"
      : session.outcome === "skipped",
  );
  const distracted = sessions.filter((session) =>
    "status" in session
      ? session.status === "distracted"
      : session.outcome === "distracted",
  );
  const stuck = sessions.filter((session) =>
    "status" in session
      ? session.status === "stuck"
      : session.outcome === "blocked",
  );
  const openTasks = tasks.filter((task) => task.status === "active");
  const capturedWaiting = captures.filter(
    (capture) =>
      capture.status !== "resolved" && capture.status !== "archived",
  );
  const plannedBlocks = blocks.filter(
    (block) => block.status === "scheduled" || block.status === "running",
  );
  const completedTitles = uniqTruthy([
    ...completed.map((session) => taskById.get(session.task_id ?? "")?.title),
    ...tasks
      .filter((task) => task.status === "done")
      .map((task) => task.title),
  ]);
  const plannedTitles = uniqTruthy(
    plannedBlocks.map((block) => taskById.get(block.task_id ?? "")?.title),
  );
  const recoveryTitles = uniqTruthy([
    ...missed.map((session) => taskById.get(session.task_id ?? "")?.title),
    ...distracted.map((session) => taskById.get(session.task_id ?? "")?.title),
    ...stuck.map((session) => taskById.get(session.task_id ?? "")?.title),
  ]);
  const carryForwardTitles = uniqTruthy(openTasks.map((task) => task.title));
  const areaSummaries = areas.map((area) => {
    const areaTasks = tasks.filter((task) => task.area_id === area.id);
    const areaSessions = sessions.filter(
      (session) => session.area_id === area.id,
    );
    const latestReview =
      reviewEntries.find((entry) => entry.area_id === area.id) ?? null;
    return {
      area,
      open: areaTasks.filter((task) => task.status === "active").length,
      done: areaTasks.filter((task) => task.status === "done").length,
      sessions: areaSessions.length,
      latestReview,
    };
  });
  const summary = {
    completed_sessions: completed.length,
    missed_sessions: missed.length,
    distracted_sessions: distracted.length,
    stuck_sessions: stuck.length,
    open_tasks: openTasks.length,
    scheduled_blocks: blocks.filter((block) => block.status === "scheduled")
      .length,
  };
  const summaryGroups = [
    {
      lifecycle: "captured" as const,
      title: "Captured and still waiting",
      count: capturedWaiting.length,
      items: capturedWaiting.slice(0, 3).map((capture) => capture.raw_text),
      empty: "Nothing is stuck in capture right now.",
    },
    {
      lifecycle: "planned" as const,
      title: "Planned",
      count: plannedBlocks.length,
      items: plannedTitles.slice(0, 3),
      empty: "Nothing is planned right now.",
    },
    {
      lifecycle: "completed" as const,
      title: "Completed",
      count: completed.length,
      items: completedTitles.slice(0, 3),
      empty: "Nothing was marked complete yet.",
    },
    {
      lifecycle: "follow_up" as const,
      title: "Needs follow-up",
      count: missed.length + distracted.length + stuck.length,
      items: recoveryTitles.slice(0, 3),
      empty: "Nothing ended as missed, stuck, or distracted.",
    },
    {
      lifecycle: "carry_forward" as const,
      title: "Carry forward",
      count: openTasks.length,
      items: carryForwardTitles.slice(0, 3),
      empty: "Nothing is still open right now.",
    },
  ];

  async function handleCreateDailyReview() {
    setActionState({ status: "saving" });
    const period = todayIsoDate();

    try {
      const result = await createReviewEntry(createSupabaseBrowserClient(), {
        review_type: "daily",
        period_start: period,
        period_end: period,
        area_id: null,
        summary_json: summary,
      });

      setReviewState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              reviewEntries: [result.reviewEntry, ...current.reviewEntries],
            }
          : current,
      );
      setActionState({ status: "saved", provider: result.provider });
      void captureEvent({
        event: "review_submitted",
        properties: {
          feature: "review",
          provider: result.provider,
          status: "submitted",
          used_mock: result.provider === "mock",
        },
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create review entry.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1>Review</h1>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">
          Review closes the loop: carry something forward, reschedule it, or let
          it stop for today.
        </p>
      </section>

      {reviewState.status === "ready" ? (
        <Card data-testid="review-next-decision-card" className="workflow-primary-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Next review decision</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleCreateDailyReview()}
              disabled={actionState.status === "saving"}
            >
              Create daily review
            </Button>
            <p className="text-sm text-muted-foreground">
              {reviewEntries.length === 0
                ? "Start one daily review to decide what to carry forward."
                : "Log the day once you know what to carry forward, reschedule, or let stop."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {reviewState.status === "ready" ? (
        <Card className="workflow-quiet-card shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reflection prompts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="m-0 list-disc pl-5">
              <li>What should move forward?</li>
              <li>What needs rescheduling?</li>
              <li>What did reality teach?</li>
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {reviewState.status === "ready" ? (
        <Card data-testid="review-close-loop-card" className="workflow-primary-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Close the loop</CardTitle>
            <CardDescription>
              Pick the next action on purpose instead of leaving the day half
              open.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <p className="workflow-support-panel rounded-lg border p-3">
                Continue or reschedule in Planning if the work still matters.
              </p>
              <p className="workflow-support-panel rounded-lg border p-3">
                Capture a follow-up, carry it forward, or stop for today on purpose.
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/calendar">Plan the next block</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/capture">Capture a follow-up</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/calendar">Carry forward in Planning</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/">Stop for today</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {reviewState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved review rows. Local reflection is still available.
        </p>
      ) : null}

      <DiagnosticsDisclosure>
        {reviewState.status === "ready" ? (
          <>
            <p>
              Review entries are {savedViaLabel(reviewState.provider)}.
            </p>
            <p>
              Save mode: <strong>{saveModeLabel(reviewState.provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{reviewState.provider}</strong>
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {reviewState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Review rows could not load</AlertTitle>
          <AlertDescription>{reviewState.message}</AlertDescription>
        </Alert>
      ) : null}

      {actionState.status === "saving" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Creating daily review...
        </p>
      ) : null}

      {actionState.status === "saved" ? (
        <Alert role="status" className="border-border bg-muted text-foreground">
          <AlertTitle className="text-primary">Saved</AlertTitle>
          <AlertDescription>
            Review entry {savedViaLabel(actionState.provider)}.
          </AlertDescription>
        </Alert>
      ) : null}

      {actionState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Review entry was not saved</AlertTitle>
          <AlertDescription>{actionState.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card
        data-testid="review-today-at-a-glance-card"
        data-accent-strength="subtle"
        style={selectedAreaStyle}
        className="area-accent-card workflow-secondary-card"
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Today at a glance</CardTitle>
              <CardDescription>
                Group the day into what was captured, planned, finished,
                interrupted, and still open.
              </CardDescription>
            </div>
            {selectedArea ? (
              <Badge
                variant="secondary"
                className="area-accent-chip rounded-full"
              >
                Current area: {selectedArea.name}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summaryGroups.map((group) => (
            <div
              key={group.title}
              data-testid={
                group.lifecycle === "carry_forward"
                  ? "review-carry-forward-card"
                  : undefined
              }
              data-accent-strength={
                group.lifecycle === "carry_forward" ? "subtle" : undefined
              }
              className={
                group.lifecycle === "carry_forward"
                  ? "area-accent-card rounded-lg border p-4"
                  : "area-accent-panel rounded-lg border p-4"
              }
            >
              {(() => {
                const lifecycle = reviewGroupLifecycleDisplay(group.lifecycle);
                return (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{group.title}</p>
                    <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {group.count === 0 ? group.empty : `${group.count} item${group.count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                  {group.count}
                </span>
              </div>
                );
              })()}
              {group.items.length > 0 ? (
                <ul className="mt-3 list-disc pl-5 text-sm text-foreground">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <Card className="workflow-secondary-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Counts</CardTitle>
          </CardHeader>
          <CardContent>
            {captures.length === 0 && sessions.length === 0 ? (
              <EmptyState
                title="No daily review yet."
                description="Complete the capture, triage, calendar, and execute flow to see a local review summary."
              />
            ) : (
              <ul className="m-0 list-disc pl-5 text-sm text-foreground">
                <li>Captured and waiting: {capturedWaiting.length}</li>
                <li>Planned blocks: {plannedBlocks.length}</li>
                <li>Completed sessions: {completed.length}</li>
                <li>Missed sessions: {missed.length}</li>
                <li>Distracted sessions: {distracted.length}</li>
                <li>Stuck sessions: {stuck.length}</li>
                <li>Still open: {openTasks.length}</li>
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Area backlog this week</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <EmptyState
                title="No weekly review yet."
                description="Area-level patterns will appear here once you accept tasks and run sessions."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {areaSummaries
                  .filter(
                    (summary) =>
                      summary.open + summary.done + summary.sessions > 0,
                  )
                  .map((summary) => {
                    const area = getAreaById(summary.area.id);
                    return (
                      <div
                        key={summary.area.id}
                        data-testid="review-area-summary-card"
                        data-accent-strength="subtle"
                        style={buildAreaAccentStyle(
                          area?.color ?? summary.area.color,
                        )}
                        className="area-accent-card rounded-lg border p-3 text-sm"
                      >
                        <div className="font-medium">
                          {area?.name ?? summary.area.name}
                        </div>
                        <div className="text-muted-foreground">
                          Open tasks: {summary.open}
                        </div>
                        <div className="text-muted-foreground">
                          Completed tasks: {summary.done}
                        </div>
                      <div className="text-muted-foreground">
                        Sessions recorded: {summary.sessions}
                      </div>
                      {summary.latestReview ? (
                        <div className="text-muted-foreground">
                          Last review: {formatReviewDate(summary.latestReview.period_end)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="workflow-quiet-card shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Past reviews and notes</CardTitle>
          <CardDescription>
            Open this only when you need the saved detail or raw browser notes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {reviewEntries.length === 0 && localReviewLog.length === 0 ? (
            <EmptyState
              title="No saved review details yet."
              description="Create the first daily review and saved details will appear here."
            />
          ) : null}

          {reviewEntries.length > 0 ? (
            <details className="rounded-lg border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer select-none font-medium">
                Open saved review details
              </summary>
              <div className="mt-3 grid gap-3">
                {reviewEntries.map((entry) => {
                  const lifecycle = reviewedLifecycleDisplay();
                  const areaName =
                    entry.area_id === null
                      ? "All areas"
                      : (areas.find((area) => area.id === entry.area_id)?.name ??
                        "Saved area");
                  const completedCount = summaryNumber(
                    entry.summary_json,
                    "completed_sessions",
                  );
                  const openCount = summaryNumber(
                    entry.summary_json,
                    "open_tasks",
                  );
                  const missedCount = summaryNumber(
                    entry.summary_json,
                    "missed_sessions",
                  );

                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-border bg-background/50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {entry.review_type} review for{" "}
                              {formatReviewDate(entry.period_end)}
                            </p>
                            <Badge variant={lifecycle.variant}>
                              {lifecycle.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {areaName}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Saved {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {completedCount !== null ? (
                          <span className="rounded-full border border-border px-2 py-1">
                            Completed sessions: {completedCount}
                          </span>
                        ) : null}
                        {openCount !== null ? (
                          <span className="rounded-full border border-border px-2 py-1">
                            Open tasks: {openCount}
                          </span>
                        ) : null}
                        {missedCount !== null ? (
                          <span className="rounded-full border border-border px-2 py-1">
                            Missed sessions: {missedCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {localReviewLog.length > 0 ? (
            <details className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <summary className="cursor-pointer select-none font-medium">
                Open raw browser notes
              </summary>
              <ul className="mt-3 m-0 list-disc pl-5 text-foreground">
                {localReviewLog.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
