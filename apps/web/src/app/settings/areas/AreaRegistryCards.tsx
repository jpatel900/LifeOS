"use client";

import Link from "next/link";
import { useState } from "react";
import type { Area, CalendarBlock, ReviewEntry, Task } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
import { EmptyState } from "../../components/EmptyState";
import { softDeleteArea, updateAreaColor } from "../../../lib/data/workflow";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { workflowAreaIdForPersistedArea } from "@/lib/workflowAreaMapping";
import { useWorkflow } from "@/lib/WorkflowContext";
import { buildAreaAccentStyle } from "@/lib/areaAccent";
import { AreaAccentPicker } from "./AreaAccentPicker";
import type { DataProvider } from "../../../lib/data/workflow";

function formatReviewDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface AreaRegistryCardsProps {
  provider: DataProvider;
  areas: Area[];
  tasks: Task[];
  blocks: CalendarBlock[];
  reviewEntries: ReviewEntry[];
  replaceReadyAreas: (nextAreas: Area[]) => void;
}

/**
 * #590 slice 5: the ready-state area registry — empty state, per-area cards
 * (accent, signal counts, actions, admin drawer with accent picker and
 * remove flow), and the post-remove confirmation banner. Extracted from
 * AreasSettingsPage; owns its own color/remove UI state and mutation calls,
 * mirroring the already-extracted sibling panels.
 */
export function AreaRegistryCards({
  provider,
  areas,
  tasks,
  blocks,
  reviewEntries,
  replaceReadyAreas,
}: AreaRegistryCardsProps) {
  const {
    state: workflowState,
    selectedAreaId,
    setSelectedAreaId,
  } = useWorkflow();
  const [colorState, setColorState] = useState<
    | { status: "idle" }
    | { status: "saving"; areaId: string }
    | { status: "saved"; areaName: string; color: string | null }
    | { status: "error"; areaName: string; message: string }
  >({ status: "idle" });
  const [removeState, setRemoveState] = useState<
    | { status: "idle" }
    | { status: "confirming"; areaId: string }
    | { status: "saving"; areaId: string }
    | { status: "saved"; areaName: string }
    | { status: "error"; areaId: string; message: string }
  >({ status: "idle" });

  async function handleConfirmRemoveArea(area: Area) {
    setRemoveState({ status: "saving", areaId: area.id });

    try {
      await softDeleteArea(createSupabaseBrowserClient(), { area_id: area.id });
      const nextAreas = areas.filter((item) => item.id !== area.id);
      replaceReadyAreas(nextAreas);
      setRemoveState({ status: "saved", areaName: area.name });
    } catch (error) {
      setRemoveState({
        status: "error",
        areaId: area.id,
        message:
          error instanceof Error ? error.message : "Unable to remove area.",
      });
    }
  }

  async function handleUpdateAreaColor(area: Area, color: string | null) {
    const previousAreas = areas;
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
    <>
      <section className="grid grid-cols-1 gap-4">
        {areas.length === 0 ? (
          <EmptyState
            title="No active areas yet."
            description="Create your first area above so new work has a clear scope."
            action={
              <Button asChild>
                <Link href="#area_name">Create area</Link>
              </Button>
            }
          />
        ) : (
          areas.map((area) => {
            const workflowAreaId = workflowAreaIdForPersistedArea(area);
            const isSelected = selectedAreaId === workflowAreaId;
            const areaTasks =
              provider === "supabase"
                ? tasks.filter((task) => task.area_id === area.id)
                : workflowState.tasks.filter(
                    (task) =>
                      workflowAreaId !== null &&
                      task.area_id === workflowAreaId,
                  );
            const areaBlocks =
              provider === "supabase"
                ? blocks.filter((block) => block.area_id === area.id)
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
              provider === "supabase"
                ? (reviewEntries.find((entry) => entry.area_id === area.id) ??
                  null)
                : null;
            const isUpdatingColor =
              colorState.status === "saving" && colorState.areaId === area.id;
            const colorFeedback =
              colorState.status === "saving" && colorState.areaId === area.id
                ? {
                    variant: "default" as const,
                    title: "Saving accent",
                    description:
                      "LifeOS is updating this area accent before it settles everywhere else.",
                    nextStep:
                      "Keep this card open until the accent save finishes.",
                  }
                : colorState.status === "saved" &&
                    colorState.areaName === area.name
                  ? {
                      variant: "success" as const,
                      title: "Accent updated.",
                      description: `${colorState.areaName} now uses ${
                        colorState.color
                          ? "the selected accent."
                          : "the default accent."
                      }`,
                      nextStep:
                        "Use accents for recognition only. The area name stays the source of truth.",
                    }
                  : colorState.status === "error" &&
                      colorState.areaName === area.name
                    ? {
                        variant: "destructive" as const,
                        title: "Accent could not be updated",
                        description: colorState.message,
                        nextStep:
                          "The previous accent is still active. Retry only if the change still matters.",
                      }
                    : null;
            const removeFeedback =
              removeState.status === "saving" && removeState.areaId === area.id
                ? {
                    variant: "default" as const,
                    title: "Removing area from active use",
                    description:
                      "LifeOS is updating active pickers before this card disappears.",
                    nextStep:
                      "Keep this page open until active areas finish refreshing.",
                  }
                : removeState.status === "error" &&
                    removeState.areaId === area.id
                  ? {
                      variant: "destructive" as const,
                      title: "Area could not be removed",
                      description: removeState.message,
                      nextStep:
                        "The area is still active. Fix the issue, then retry only if removal still matters.",
                    }
                  : null;

            return (
              <Card
                key={area.id}
                data-testid="areas-area-card"
                data-accent-strength={isSelected ? "subtle" : undefined}
                style={buildAreaAccentStyle(area.color)}
                // #660 audit line S6: was a four-class pileup
                // (`area-accent-card workflow-secondary-card
                // workflow-support-card areas-record-card`) — three of
                // those are shared by moments/* surfaces outside this
                // audit's scope (ScheduleBlock/CloseMoment/StartMoment),
                // so rather than edit their definitions, `.areas-record-card`
                // (already scoped to this file alone) now carries the full
                // moments-card-grammar surface itself: var(--surface-radius)/
                // var(--surface-shadow-sm), plus a full-perimeter accent tint
                // instead of `area-accent-card`'s inset-left accent stripe
                // (the same side-tab-shaped signal O1 replaced elsewhere in
                // this epic).
                className="areas-record-card"
              >
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      {/* #660 audit line S5: dropped the "Area" eyebrow — the
                          card already is the area; its name says so. */}
                      <CardTitle className="settings-card-title">
                        {area.name}
                      </CardTitle>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isSelected ? (
                        <Badge
                          variant="secondary"
                          className="area-accent-chip rounded-full"
                        >
                          Current area
                        </Badge>
                      ) : null}
                      <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                        {openTasks + plannedBlocks} active signal
                        {openTasks + plannedBlocks === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    {area.description ?? "No description yet."}
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="area-accent-panel rounded-[var(--surface-radius-sm)] border p-3">
                      <p className="font-medium text-foreground">
                        {openTasks} open task{openTasks === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {openTasks === 0
                          ? "Nothing active here right now."
                          : "Work is waiting for planning or execution."}
                      </p>
                    </div>
                    <div className="area-accent-panel rounded-[var(--surface-radius-sm)] border p-3">
                      <p className="font-medium text-foreground">
                        {plannedBlocks} planned block
                        {plannedBlocks === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {plannedBlocks === 0
                          ? "No block is scheduled for this area."
                          : "A block already exists here."}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {latestReview
                      ? `Last saved review: ${formatReviewDate(latestReview.period_end)}`
                      : "No saved review for this area yet."}
                  </p>

                  <div className="workflow-action-tray grid gap-3">
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
                      <Button asChild variant="outline">
                        <Link
                          href="/capture"
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          Capture here
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <DiagnosticsDisclosure
                    title="Registry actions and settings"
                    className="workflow-admin-card rounded-[var(--surface-radius-sm)] p-3 text-sm text-muted-foreground"
                    contentClassName="mt-3 grid gap-3 text-sm text-muted-foreground"
                  >
                    {removeFeedback ? (
                      <Alert
                        variant={removeFeedback.variant}
                        role={
                          removeFeedback.variant === "destructive"
                            ? "alert"
                            : "status"
                        }
                      >
                        <AlertTitle>{removeFeedback.title}</AlertTitle>
                        <AlertDescription>
                          {removeFeedback.description}
                        </AlertDescription>
                        <p className="text-sm font-medium">
                          {removeFeedback.nextStep}
                        </p>
                      </Alert>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href="/calendar"
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          Plan area
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href="/review"
                          onClick={() => setSelectedAreaId(workflowAreaId)}
                        >
                          Review area
                        </Link>
                      </Button>
                    </div>

                    <div
                      data-testid="areas-color-panel"
                      className="workflow-admin-card rounded-[var(--surface-radius-sm)] p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Accent color
                          </p>
                          <p className="text-muted-foreground">
                            Accent helps you recognize the area faster. The name
                            always stays visible.
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="area-accent-chip rounded-full"
                        >
                          {area.color ? "Custom accent" : "Default accent"}
                        </Badge>
                      </div>

                      <div className="mt-3">
                        <AreaAccentPicker
                          selectedColor={area.color}
                          disabled={isUpdatingColor}
                          includeDefault
                          onSelect={(color) =>
                            void handleUpdateAreaColor(area, color)
                          }
                          onDefault={() =>
                            void handleUpdateAreaColor(area, null)
                          }
                        />
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        Preview updates immediately on this card. Reset uses the
                        default accent token.
                      </p>
                      {colorFeedback ? (
                        <Alert
                          variant={colorFeedback.variant}
                          role={
                            colorFeedback.variant === "destructive"
                              ? "alert"
                              : "status"
                          }
                          aria-live={
                            colorFeedback.variant === "destructive"
                              ? undefined
                              : "polite"
                          }
                          className={
                            colorFeedback.variant === "success"
                              ? "mt-3 workflow-celebration-alert text-foreground"
                              : "mt-3"
                          }
                        >
                          <AlertTitle
                            className={
                              colorFeedback.variant === "success"
                                ? "text-primary"
                                : undefined
                            }
                          >
                            {colorFeedback.title}
                          </AlertTitle>
                          <AlertDescription>
                            {colorFeedback.description}
                          </AlertDescription>
                          <p className="text-sm font-medium">
                            {colorFeedback.nextStep}
                          </p>
                        </Alert>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {removeState.status === "confirming" &&
                      removeState.areaId === area.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleConfirmRemoveArea(area)}
                          >
                            Confirm remove
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setRemoveState({ status: "idle" })}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
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

                    <div className="workflow-admin-card rounded-[var(--surface-radius-sm)] p-3 text-xs">
                      <p className="font-medium text-foreground">Area record</p>
                      <div className="mt-2 space-y-1">
                        <p>
                          Technical area slug: <strong>{area.slug}</strong>
                        </p>
                        <p>
                          Workflow area id:{" "}
                          <strong>{workflowAreaId ?? "not mapped"}</strong>
                        </p>
                      </div>
                    </div>
                  </DiagnosticsDisclosure>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {removeState.status === "saved" ? (
        <Alert variant="success" role="status">
          <AlertTitle>Area removed from active use.</AlertTitle>
          <AlertDescription>
            {removeState.areaName} is now excluded from active pickers and new
            work assignment.
          </AlertDescription>
          <p className="text-sm font-medium">
            Pick another current area if you still need one for capture,
            planning, or review.
          </p>
        </Alert>
      ) : null}
    </>
  );
}
