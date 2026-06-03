"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { Area, CalendarBlock, ReviewEntry, Task } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
import { EmptyState } from "../../components/EmptyState";
import { WorkflowLoadingState } from "../../components/WorkflowLoadingState";
import {
  createArea,
  listAreas,
  listExecutionReviewItems,
  softDeleteArea,
  updateAreaColor,
  type DataProvider,
} from "../../../lib/data/workflow";
import { saveModeLabel } from "../../../lib/statusVocabulary";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { workflowAreaIdForPersistedArea } from "@/lib/workflowAreaMapping";
import { useWorkflow } from "@/lib/WorkflowContext";
import { GoogleCalendarConnectionPanel } from "./GoogleCalendarConnectionPanel";
import { buildAreaAccentStyle } from "@/lib/areaAccent";

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

const AREA_COLOR_PRESETS = [
  { label: "Ocean", value: "#2563eb" },
  { label: "Forest", value: "#16a34a" },
  { label: "Sunrise", value: "#f59e0b" },
  { label: "Clay", value: "#f97316" },
  { label: "Violet", value: "#9333ea" },
  { label: "Teal", value: "#0f766e" },
] as const;

export default function AreasSettingsPage() {
  const {
    state: workflowState,
    selectedAreaId,
    setSelectedAreaId,
    syncPersistedAreas,
    resetWorkflow,
  } = useWorkflow();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [resetState, setResetState] = useState<
    "idle" | "confirming" | "success"
  >("idle");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaDescription, setNewAreaDescription] = useState("");
  const [createState, setCreateState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; areaName: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [removeState, setRemoveState] = useState<
    | { status: "idle" }
    | { status: "confirming"; areaId: string }
    | { status: "saving"; areaId: string }
    | { status: "saved"; areaName: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  function sortAreas(areas: Area[]) {
    return [...areas].sort((left, right) => left.sort_order - right.sort_order);
  }

  function replaceReadyAreas(nextAreas: Area[]) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            areas: sortAreas(nextAreas),
          }
        : current,
    );
    syncPersistedAreas(nextAreas);
  }

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

  async function handleCreateArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateState({ status: "saving" });

    try {
      const result = await createArea(createSupabaseBrowserClient(), {
        name: newAreaName,
        description: newAreaDescription,
      });

      const nextAreas =
        state.status === "ready" ? [...state.areas, result.area] : [result.area];
      replaceReadyAreas(nextAreas);
      setSelectedAreaId(workflowAreaIdForPersistedArea(result.area));
      setNewAreaName("");
      setNewAreaDescription("");
      setCreateState({ status: "saved", areaName: result.area.name });
    } catch (error) {
      setCreateState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to create area.",
      });
    }
  }

  async function handleConfirmRemoveArea(area: Area) {
    setRemoveState({ status: "saving", areaId: area.id });

    try {
      await softDeleteArea(createSupabaseBrowserClient(), { area_id: area.id });
      const nextAreas =
        state.status === "ready"
          ? state.areas.filter((item) => item.id !== area.id)
          : [];
      replaceReadyAreas(nextAreas);
      setRemoveState({ status: "saved", areaName: area.name });
    } catch (error) {
      setRemoveState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to remove area.",
      });
    }
  }
  const [colorState, setColorState] = useState<
    | { status: "idle" }
    | { status: "saving"; areaId: string }
    | { status: "saved"; areaName: string; color: string | null }
    | { status: "error"; areaName: string; message: string }
  >({ status: "idle" });

  async function handleUpdateAreaColor(area: Area, color: string | null) {
    if (state.status !== "ready") {
      return;
    }

    const previousAreas = state.areas;
    const optimisticAreas = previousAreas.map((item) =>
      item.id === area.id
        ? {
            ...item,
            color,
          }
        : item,
    );

    replaceReadyAreas(optimisticAreas);
    setColorState({ status: "saving", areaId: area.id });

    try {
      const result = await updateAreaColor(createSupabaseBrowserClient(), {
        area_id: area.id,
        color,
      });
      replaceReadyAreas(
        optimisticAreas.map((item) =>
          item.id === result.area.id ? result.area : item,
        ),
      );
      setColorState({
        status: "saved",
        areaName: result.area.name,
        color: result.area.color,
      });
    } catch (error) {
      replaceReadyAreas(previousAreas);
      setColorState({
        status: "error",
        areaName: area.name,
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the area accent.",
      });
    }
  }

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

      <Card data-testid="areas-create-card" className="workflow-primary-card">
        <CardHeader>
          <CardTitle className="text-lg">Create area</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreateArea} className="space-y-4">
            <div className="grid gap-2 sm:max-w-md">
              <label htmlFor="area_name" className="text-sm font-medium">
                Area name
              </label>
              <Input
                id="area_name"
                value={newAreaName}
                onChange={(event) => {
                  setNewAreaName(event.target.value);
                  if (createState.status !== "idle") {
                    setCreateState({ status: "idle" });
                  }
                }}
                placeholder="Main Job"
                disabled={createState.status === "saving"}
              />
            </div>
            <div className="grid gap-2 sm:max-w-xl">
              <label htmlFor="area_description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="area_description"
                value={newAreaDescription}
                onChange={(event) => setNewAreaDescription(event.target.value)}
                placeholder="What belongs in this area?"
                rows={3}
                disabled={createState.status === "saving"}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={createState.status === "saving"}>
                {createState.status === "saving" ? "Creating..." : "Create area"}
              </Button>
              <p className="text-sm text-muted-foreground">
                New work should have a clear area before you plan or review it.
              </p>
            </div>
          </form>

          {createState.status === "saved" ? (
            <Alert variant="success" role="status">
              <AlertTitle>Area created.</AlertTitle>
              <AlertDescription>
                {createState.areaName} is now available in active area pickers.
              </AlertDescription>
            </Alert>
          ) : null}

          {createState.status === "error" ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Area could not be created</AlertTitle>
              <AlertDescription>{createState.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {state.status === "loading" ? (
        <WorkflowLoadingState
          title="Checking saved areas"
          description="You can still prepare the next area while saved area rows load."
        />
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
              description="Create your first area above before capture and planning so new work has a clear scope."
              action={
                <Button asChild>
                  <Link href="#area_name">Create area</Link>
                </Button>
              }
            />
          ) : (
            state.areas.map((area) => {
              const workflowAreaId = workflowAreaIdForPersistedArea(area);
              const isSelected = selectedAreaId === workflowAreaId;
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
              const isUpdatingColor =
                colorState.status === "saving" && colorState.areaId === area.id;

              return (
                <Card
                  key={area.id}
                  data-testid="areas-area-card"
                  data-accent-strength={isSelected ? "subtle" : undefined}
                  style={buildAreaAccentStyle(area.color)}
                  className="area-accent-card workflow-secondary-card"
                >
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-xl">{area.name}</CardTitle>
                      {isSelected ? (
                        <Badge
                          variant="secondary"
                          className="area-accent-chip rounded-full"
                        >
                          Current area
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p className="text-muted-foreground">
                      {area.description ?? "No description yet."}
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="area-accent-panel rounded-lg border p-3">
                        <p className="font-medium text-foreground">
                          {openTasks} open task{openTasks === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {openTasks === 0
                            ? "Nothing active here right now."
                            : "Work is waiting to be planned or executed."}
                        </p>
                      </div>
                      <div className="area-accent-panel rounded-lg border p-3">
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

                    <div
                      data-testid="areas-color-panel"
                      className="area-accent-panel rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Accent color
                          </p>
                          <p className="text-muted-foreground">
                            Accent helps you recognize this area faster. The
                            area name always stays visible.
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="area-accent-chip rounded-full"
                        >
                          {area.color ? "Custom accent" : "Default accent"}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {AREA_COLOR_PRESETS.map((preset) => (
                          <Button
                            key={preset.value}
                            type="button"
                            size="sm"
                            variant={
                              area.color === preset.value
                                ? "secondary"
                                : "outline"
                            }
                            className="gap-2"
                            onClick={() =>
                              void handleUpdateAreaColor(area, preset.value)
                            }
                            disabled={isUpdatingColor}
                          >
                            <span
                              aria-hidden="true"
                              className="size-3 rounded-full border border-black/10"
                              style={{ backgroundColor: preset.value }}
                            />
                            {preset.label}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant={area.color === null ? "secondary" : "ghost"}
                          onClick={() => void handleUpdateAreaColor(area, null)}
                          disabled={isUpdatingColor}
                        >
                          Default
                        </Button>
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        Preview updates immediately on this card. Reset uses the
                        default accent token instead of inventing a fake theme.
                      </p>
                      {isUpdatingColor ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Saving accent...
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={
                          isSelected
                            ? "border-[var(--area-accent)] bg-foreground text-background ring-1 ring-[var(--area-accent-soft)] hover:bg-foreground"
                            : undefined
                        }
                        onClick={() => setSelectedAreaId(workflowAreaId)}
                      >
                        {isSelected ? "Using this area" : "Use this area"}
                      </Button>
                      <Button asChild>
                        <Link
                          href="/capture"
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          Capture here
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link
                          href="/calendar"
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          Plan area
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link
                          href="/review"
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          Review area
                        </Link>
                      </Button>
                      {removeState.status === "confirming" &&
                      removeState.areaId === area.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void handleConfirmRemoveArea(area)}
                          >
                            Confirm remove
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setRemoveState({ status: "idle" })}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() =>
                            setRemoveState({
                              status: "confirming",
                              areaId: area.id,
                            })
                          }
                        >
                          Remove area
                        </Button>
                      )}
                    </div>

                    {removeState.status === "saving" &&
                    removeState.areaId === area.id ? (
                      <p className="text-sm text-muted-foreground">
                        Removing area...
                      </p>
                    ) : null}

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

      {removeState.status === "saved" ? (
        <Alert variant="success" role="status">
          <AlertTitle>Area removed from active use.</AlertTitle>
          <AlertDescription>
            {removeState.areaName} is now excluded from active pickers and new
            work assignment.
          </AlertDescription>
        </Alert>
      ) : null}

      {removeState.status === "error" ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Area could not be removed</AlertTitle>
          <AlertDescription>{removeState.message}</AlertDescription>
        </Alert>
      ) : null}

      {colorState.status === "saved" ? (
        <Alert variant="success" role="status">
          <AlertTitle>Accent updated.</AlertTitle>
          <AlertDescription>
            {colorState.areaName} now uses{" "}
            {colorState.color ? "the selected accent." : "the default accent."}
          </AlertDescription>
        </Alert>
      ) : null}

      {colorState.status === "error" ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Accent could not be updated</AlertTitle>
          <AlertDescription>
            {colorState.areaName}: {colorState.message}
          </AlertDescription>
        </Alert>
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
