"use client";

import { useEffect, useState } from "react";
import type { CalendarBlock, ExecutionSession, ReviewEntry, Task } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import {
  createReviewEntry,
  listExecutionReviewItems,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
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
    };

type ActionState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; provider: DataProvider }
  | { status: "error"; message: string };

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReviewPage() {
  const { state } = useWorkflow();
  const [reviewState, setReviewState] = useState<ReviewState>({ status: "loading" });
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function loadReviewItems() {
      try {
        const result = await listExecutionReviewItems(createSupabaseBrowserClient());
        if (!cancelled) {
          setReviewState({
            status: "ready",
            provider: result.provider,
            tasks: result.tasks,
            blocks: result.blocks,
            sessions: result.sessions,
            reviewEntries: result.reviewEntries,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setReviewState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Unable to load review rows.",
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
  const blocks = usesPersistedReview ? reviewState.blocks : state.calendarBlocks;
  const sessions = usesPersistedReview
    ? reviewState.sessions
    : state.executionSessions;
  const reviewEntries = usesPersistedReview ? reviewState.reviewEntries : [];

  const completed = sessions.filter((session) =>
    "status" in session
      ? session.status === "completed"
      : session.outcome === "completed",
  );
  const missed = sessions.filter((session) =>
    "status" in session ? session.status === "missed" : session.outcome === "skipped",
  );
  const distracted = sessions.filter((session) =>
    "status" in session
      ? session.status === "distracted"
      : session.outcome === "distracted",
  );
  const stuck = sessions.filter((session) =>
    "status" in session ? session.status === "stuck" : session.outcome === "blocked",
  );
  const openTasks = tasks.filter((task) => task.status === "active");
  const areaSummaries = state.areas.map((area) => {
    const areaTasks = tasks.filter((task) => task.area_id === area.id);
    const areaSessions = sessions.filter((session) => session.area_id === area.id);
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
    scheduled_blocks: blocks.filter((block) => block.status === "scheduled").length,
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
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to create review entry.",
      });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Review</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Review summarizes tasks, local blocks, and execution sessions. No AI or
          external integrations are called in Phase 4D.
        </p>
      </section>

      {reviewState.status === "loading" ? (
        <p role="status">Loading review context...</p>
      ) : null}

      {reviewState.status === "ready" ? (
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}>
          Data source: <strong>{reviewState.provider}</strong>
        </p>
      ) : null}

      {reviewState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Review rows could not load</h2>
          <p>{reviewState.message}</p>
        </section>
      ) : null}

      {actionState.status === "saving" ? (
        <p role="status">Creating daily review...</p>
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
          Review entry created through <strong>{actionState.provider}</strong>.
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
          <h2 style={{ marginTop: 0 }}>Review entry was not saved</h2>
          <p>{actionState.message}</p>
        </section>
      ) : null}

      {reviewState.status === "ready" ? (
        <div>
          <Button
            type="button"
            onClick={() => void handleCreateDailyReview()}
            disabled={actionState.status === "saving"}
          >
            Create daily review
          </Button>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "0.75rem 1rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Daily review</h2>
          {state.captureItems.length === 0 && sessions.length === 0 ? (
            <EmptyState
              title="No daily review yet."
              description="Complete the capture, triage, calendar, and execute flow to see a local review summary."
            />
          ) : (
            <ul style={{ paddingLeft: "1.25rem", margin: 0, fontSize: "0.9rem" }}>
              <li>Captured: {state.captureItems.length}</li>
              <li>Accepted tasks: {tasks.length}</li>
              <li>Completed sessions: {completed.length}</li>
              <li>Missed sessions: {missed.length}</li>
              <li>Distracted sessions: {distracted.length}</li>
              <li>Stuck sessions: {stuck.length}</li>
              <li>Still open: {openTasks.length}</li>
            </ul>
          )}
        </div>

        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "0.75rem 1rem",
          }}
          >
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Weekly review</h2>
          {tasks.length === 0 ? (
            <EmptyState
              title="No weekly review yet."
              description="Area-level patterns will appear here once you accept tasks and run sessions."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {areaSummaries
                .filter((summary) => summary.open + summary.done + summary.sessions > 0)
                .map((summary) => {
                const area = getAreaById(summary.area.id);
                return (
                  <div
                    key={summary.area.id}
                    style={{
                      borderRadius: "0.75rem",
                      border: "1px solid #e5e7eb",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.9rem",
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {area?.name ?? summary.area.name}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Open tasks: {summary.open}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Completed tasks: {summary.done}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Sessions recorded: {summary.sessions}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {reviewEntries.length > 0 ? (
        <section>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Persisted review entries
          </h2>
          <ul style={{ paddingLeft: "1.25rem", margin: 0, fontSize: "0.9rem" }}>
            {reviewEntries.map((entry) => (
              <li key={entry.id}>
                {entry.review_type} review: {entry.period_start} to{" "}
                {entry.period_end}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {state.reviewLog.length > 0 ? (
        <section>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
            Local event log
          </h2>
          <ul style={{ paddingLeft: "1.25rem", margin: 0, fontSize: "0.9rem" }}>
            {state.reviewLog.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

