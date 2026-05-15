"use client";

import { useEffect, useState } from "react";
import type {
  Area,
  CalendarBlock,
  ExecutionSession,
  ReviewEntry,
  Task,
} from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../components/EmptyState";
import {
  createReviewEntry,
  listAreas,
  listExecutionReviewItems,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";

type ReviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
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

function storageModeLabel(mode: DataProvider) {
  return mode === "supabase" ? "Saved workspace" : "Demo mode";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReviewPage() {
  const { state } = useWorkflow();
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
        const areasResult =
          result.provider === "supabase" ? await listAreas(client) : null;
        if (!cancelled) {
          setReviewState({
            status: "ready",
            provider: result.provider,
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
  const tasks = usesPersistedReview ? reviewState.tasks : state.tasks;
  const blocks = usesPersistedReview
    ? reviewState.blocks
    : state.calendarBlocks;
  const sessions = usesPersistedReview
    ? reviewState.sessions
    : state.executionSessions;
  const reviewEntries = usesPersistedReview ? reviewState.reviewEntries : [];
  const areas = usesPersistedReview ? reviewState.areas : state.areas;
  const captureCount = usesPersistedReview ? null : state.captureItems.length;
  const localReviewLog = usesPersistedReview ? [] : state.reviewLog;

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
  const areaSummaries = areas.map((area) => {
    const areaTasks = tasks.filter((task) => task.area_id === area.id);
    const areaSessions = sessions.filter(
      (session) => session.area_id === area.id,
    );
    return {
      area,
      open: areaTasks.filter((task) => task.status === "active").length,
      done: areaTasks.filter((task) => task.status === "done").length,
      sessions: areaSessions.length,
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
          Reflection helps decide the next move, not just count what happened.
        </p>
      </section>

      {reviewState.status === "ready" ? (
        <Card>
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
                : "When this day is done, log what to move forward and what to change."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {reviewState.status === "ready" ? (
        <Card>
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

      {reviewState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading review context...
        </p>
      ) : null}

      <details className="text-sm text-muted-foreground">
        <summary>System details</summary>
        {reviewState.status === "ready" ? (
          <p className="mt-2">
            Storage mode: <strong>{storageModeLabel(reviewState.provider)}</strong>
          </p>
        ) : null}
      </details>

      <details className="text-sm text-muted-foreground">
        <summary>Developer details</summary>
        {reviewState.status === "ready" ? (
          <p className="mt-2">
            Storage mode id: <strong>{reviewState.provider}</strong>
          </p>
        ) : null}
      </details>

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
            Review entry created in{" "}
            <strong>{storageModeLabel(actionState.provider)}</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      {actionState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Review entry was not saved</AlertTitle>
          <AlertDescription>{actionState.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Numbers at a glance</CardTitle>
          </CardHeader>
          <CardContent>
            {captureCount === 0 && sessions.length === 0 ? (
              <EmptyState
                title="No daily review yet."
                description="Complete the capture, triage, calendar, and execute flow to see a local review summary."
              />
            ) : (
              <ul className="m-0 list-disc pl-5 text-sm text-foreground">
                {captureCount !== null ? <li>Captured: {captureCount}</li> : null}
                <li>Accepted tasks: {tasks.length}</li>
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
            <CardTitle className="text-base">Area patterns this week</CardTitle>
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
                        className="rounded-lg border border-border bg-card p-3 text-sm"
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
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {reviewEntries.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base">Saved reflections</h2>
          <ul className="m-0 list-disc pl-5 text-sm text-foreground">
            {reviewEntries.map((entry) => (
              <li key={entry.id}>
                {entry.review_type} review: {entry.period_start} to{" "}
                {entry.period_end}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {localReviewLog.length > 0 ? (
        <details>
          <summary className="mb-2 text-base">Session notes log</summary>
          <ul className="m-0 list-disc pl-5 text-sm text-foreground">
            {localReviewLog.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

