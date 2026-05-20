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

export default function HomePage() {
  const { state, selectedAreaId, submitCaptureText } = useWorkflow();
  const [homeData, setHomeData] = useState<HomeDataState>({ status: "loading" });
  const [quickCaptureText, setQuickCaptureText] = useState("");
  const [quickCaptureFeedback, setQuickCaptureFeedback] = useState<
    { status: "idle" } | { status: "error"; message: string } | { status: "saved" }
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

  const cockpit = useMemo(
    () =>
      buildTodayCockpitModel({
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
    [blocks, drafts, healthState, homeData.status, proposals, sessionsForModel, tasks],
  );

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
          Use this cockpit to decide what matters now and what to do next.
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
          <CardDescription>
            One recommended next click, chosen by deterministic rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-base font-medium">{cockpit.next.label}</p>
          <p className="text-sm text-muted-foreground">{cockpit.next.reason}</p>
          <Button asChild>
            <Link href={cockpit.next.href}>Open next step</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Now</CardTitle>
          <CardDescription>
            What is currently in progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="font-medium">{cockpit.now.title}</p>
          <p className="text-sm text-muted-foreground">{cockpit.now.summary}</p>
          <Button asChild variant="outline">
            <Link href={cockpit.now.href}>Go to Execute</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Capture</CardTitle>
            <CardDescription>
              Capture one thing fast without leaving Home.
            </CardDescription>
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
            <Button type="button" onClick={handleQuickCaptureSubmit}>
              Save quick capture
            </Button>
            <p className="text-xs text-muted-foreground">
              Saves in this browser and sends a draft to Triage.
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
                  <Link href="/triage" className="underline underline-offset-2">
                    Triage
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Needs decision</CardTitle>
            <CardDescription>
              Pending task/project drafts that need accept or reject.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {cockpit.needsDecision.count === 0 ? (
              <p className="text-muted-foreground">No pending drafts right now.</p>
            ) : (
              cockpit.needsDecision.items.map((item) => (
                <p key={item.id} className="text-foreground">
                  {item.title}
                </p>
              ))
            )}
            <Button asChild variant="outline">
              <Link href="/triage">Open Triage</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{cockpit.unplanned.title}</CardTitle>
            <CardDescription>
              Active work that has no active proposal or running block.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {cockpit.unplanned.items.length === 0 ? (
              <p className="text-muted-foreground">
                No unplanned active tasks right now.
              </p>
            ) : (
              cockpit.unplanned.items.map((task) => (
                <p key={task.id} className="text-foreground">
                  {task.title}
                </p>
              ))
            )}
            <Button asChild variant="outline">
              <Link href="/calendar">Open Planning</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s planned blocks</CardTitle>
            <CardDescription>
              Local blocks scheduled, running, missed, or completed today.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {cockpit.todayBlocks.length === 0 ? (
              <p className="text-muted-foreground">
                No local planned blocks for today.
              </p>
            ) : (
              cockpit.todayBlocks.map((block) => {
                const task = tasks.find((item) => item.id === block.taskId);
                return (
                  <div key={block.id} className="rounded-md border border-border p-2">
                    <p className="font-medium">{task?.title ?? "Planned block"}</p>
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
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/calendar">Open Planning</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/execute">Open Execute</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stuck / needs recovery</CardTitle>
            <CardDescription>
              Non-shaming recovery signals from missed or interrupted work.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {cockpit.recoveryItems.length === 0 ? (
              <p className="text-muted-foreground">No recovery items right now.</p>
            ) : (
              cockpit.recoveryItems.map((item) => (
                <div key={item.id} className="rounded-md border border-border p-2">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-muted-foreground">{item.reason}</p>
                </div>
              ))
            )}
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/execute">Open Execute</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/review">Open Review</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System trust/status</CardTitle>
            <CardDescription>
              Health checks stay explicit and deterministic.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-muted-foreground">{cockpit.systemStatus.summary}</p>
            <Button asChild variant="outline">
              <Link href={cockpit.systemStatus.href}>Open Health</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">System details</summary>
        <p className="mt-2">{statusLabel(homeData.status)}</p>
      </details>

      {homeData.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved workspace rows. This browser workflow state remains available.
        </p>
      ) : null}

      {homeData.status !== "loading" && homeData.issues.length > 0 ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">Developer details</summary>
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
