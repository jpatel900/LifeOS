"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Area, CalendarBlock, ReviewEntry, Task } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
import { EmptyState } from "../../components/EmptyState";
import {
  listAreas,
  listExecutionReviewItems,
  type DataProvider,
} from "../../../lib/data/workflow";
import { saveModeLabel } from "../../../lib/statusVocabulary";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { workflowAreaIdForSlug } from "@/lib/workflowAreaMapping";
import { useWorkflow } from "@/lib/WorkflowContext";
import { GoogleCalendarConnectionPanel } from "./GoogleCalendarConnectionPanel";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
      areas: Area[];
      tasks: Task[];
      blocks: CalendarBlock[];
      reviewEntries: ReviewEntry[];
    };

function formatReviewDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AreasSettingsPage() {
  const { state: workflowState, selectedAreaId, setSelectedAreaId, resetWorkflow } =
    useWorkflow();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [resetState, setResetState] = useState<
    "idle" | "confirming" | "success"
  >("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const client = createSupabaseBrowserClient();
        const [areasResult, executionResult] = await Promise.all([
          listAreas(client),
          listExecutionReviewItems(client),
        ]);

        if (!cancelled) {
          setState({
            status: "ready",
            provider: areasResult.provider,
            areas: areasResult.areas,
            tasks: executionResult.tasks,
            blocks: executionResult.blocks,
            reviewEntries: executionResult.reviewEntries,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load areas right now.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Areas</h1>
        <p className="text-sm text-muted-foreground">
          Areas are first-class workspace scopes for capture, planning, and
          review.
        </p>
      </section>

      <DiagnosticsDisclosure>
        {state.status === "ready" ? (
          <>
            <p>
              Save mode: <strong>{saveModeLabel(state.provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{state.provider}</strong>
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {state.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading areas...
        </p>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Areas could not load</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <p>
              If Supabase is configured, make sure you are signed in and the
              local stack is running. Without Supabase env vars, this page uses
              local-only areas.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ready" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {state.areas.length === 0 ? (
            <EmptyState
              title="No active areas yet."
              description="Create or load an area before capture and planning so work has a clear scope."
            />
          ) : (
            state.areas.map((area) => {
              const workflowAreaId = workflowAreaIdForSlug(area.slug);
              const isSelected =
                workflowAreaId !== null && selectedAreaId === workflowAreaId;
              const areaTasks =
                state.provider === "supabase"
                  ? state.tasks.filter((task) => task.area_id === area.id)
                  : workflowState.tasks.filter(
                      (task) =>
                        workflowAreaId !== null &&
                        task.area_id === workflowAreaId,
                    );
              const areaBlocks =
                state.provider === "supabase"
                  ? state.blocks.filter((block) => block.area_id === area.id)
                  : workflowState.calendarBlocks.filter(
                      (block) =>
                        workflowAreaId !== null &&
                        block.area_id === workflowAreaId,
                    );
              const openTasks = areaTasks.filter(
                (task) => task.status === "active",
              ).length;
              const plannedBlocks = areaBlocks.filter(
                (block) =>
                  block.status === "scheduled" || block.status === "running",
              ).length;
              const latestReview =
                state.provider === "supabase"
                  ? (state.reviewEntries.find(
                      (entry) => entry.area_id === area.id,
                    ) ?? null)
                  : null;

              return (
                <Card key={area.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-xl">{area.name}</CardTitle>
                      {isSelected ? (
                        <Badge variant="secondary">Current area</Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p className="text-muted-foreground">
                      {area.description ?? "No description yet."}
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/40 p-3">
                        <p className="font-medium text-foreground">
                          {openTasks} open task{openTasks === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {openTasks === 0
                            ? "Nothing active here right now."
                            : "Work is waiting to be planned or executed."}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/40 p-3">
                        <p className="font-medium text-foreground">
                          {plannedBlocks} planned block{plannedBlocks === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {plannedBlocks === 0
                            ? "No block is scheduled for this area."
                            : "A block already exists for this area."}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {latestReview
                        ? `Last saved review: ${formatReviewDate(latestReview.period_end)}`
                        : "No saved review for this area yet."}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {workflowAreaId ? (
                        <Button
                          type="button"
                          variant={isSelected ? "secondary" : "outline"}
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          {isSelected ? "Using this area" : "Use this area"}
                        </Button>
                      ) : null}
                      <Button asChild>
                        <Link
                          href="/capture"
                          onClick={() =>
                            workflowAreaId && setSelectedAreaId(workflowAreaId)
                          }
                        >
                          Capture here
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link
                          href="/calendar"
                          onClick={() =>
                            workflowAreaId && setSelectedAreaId(workflowAreaId)
                          }
                        >
                          Plan area
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link
                          href="/review"
                          onClick={() =>
                            workflowAreaId && setSelectedAreaId(workflowAreaId)
                          }
                        >
                          Review area
                        </Link>
                      </Button>
                    </div>

                    <details className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none font-medium text-foreground">
                        Area diagnostics
                      </summary>
                      <div className="mt-2 space-y-1">
                        <p>
                          Technical area slug: <strong>{area.slug}</strong>
                        </p>
                        <p>
                          Workflow area id:{" "}
                          <strong>{workflowAreaId ?? "not mapped"}</strong>
                        </p>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
      ) : null}

      <GoogleCalendarConnectionPanel />

      <Card className="border-dashed border-destructive/60 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-lg">Local reset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This only clears on-device data on this device. It does not delete
            cloud data.
          </p>
          {resetState === "success" ? (
            <Alert variant="success" role="status" aria-live="polite">
              <AlertTitle>Local browser data reset.</AlertTitle>
            </Alert>
          ) : null}
          {resetState === "confirming" ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Reset local data on this browser?</AlertTitle>
              <AlertDescription>
                This clears on-device data for this device only,
                including captures, drafts, ambiguity checks, and planned time
                blocks. It does not delete cloud data.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {resetState === "confirming" ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    resetWorkflow();
                    setResetState("success");
                  }}
                >
                  Yes, reset this browser
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setResetState("idle")}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setResetState("confirming")}
              >
                Reset this browser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
