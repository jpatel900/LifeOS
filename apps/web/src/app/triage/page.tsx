"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Area } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import {
  createProject,
  createTask,
  listAreas,
  type DataProvider,
} from "@/lib/data/workflow";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";
import { slugForWorkflowAreaId } from "@/lib/workflowAreaMapping";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

type SaveState =
  | { status: "idle" }
  | { status: "saving"; label: string }
  | { status: "saved"; label: string; provider: DataProvider }
  | { status: "error"; message: string };

function storageModeLabel(mode: DataProvider) {
  return mode === "supabase" ? "Saved workspace" : "Demo mode";
}

function resolvePersistedAreaId(workflowAreaId: string, areas: Area[]) {
  const slug = slugForWorkflowAreaId(workflowAreaId);
  const area = areas.find((item) => item.slug === slug) ?? areas[0];

  if (!area) {
    throw new Error("Create an active area before accepting triage drafts.");
  }

  return area.id;
}

function sourceCaptureIdForPersistence(captureItemId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    captureItemId,
  )
    ? captureItemId
    : null;
}

export default function TriagePage() {
  const {
    state,
    acceptTaskDraft,
    acceptProjectDraft,
    rejectTaskDraft,
    rejectProjectDraft,
    editTaskDraft,
  } = useWorkflow();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const triageCandidates = state.taskDrafts.filter(
    (draft) => draft.status === "pending",
  );
  const projectCandidates = state.projectDrafts.filter(
    (draft) => draft.status === "pending",
  );
  const totalCandidates = triageCandidates.length + projectCandidates.length;
  const hasCandidates = totalCandidates > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const result = await listAreas(createSupabaseBrowserClient());
        if (!cancelled) {
          setLoadState({
            status: "ready",
            provider: result.provider,
            areas: result.areas,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load triage persistence context.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAcceptTaskDraft(draftId: string) {
    const draft = state.taskDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    if (loadState.status !== "ready") {
      setSaveState({
        status: "error",
        message: "Saved workspace is not ready yet.",
      });
      return;
    }

    setSaveState({ status: "saving", label: draft.title });
    try {
      const result = await createTask(createSupabaseBrowserClient(), {
        area_id: resolvePersistedAreaId(draft.area_id, loadState.areas),
        source_capture_item_id: sourceCaptureIdForPersistence(
          draft.capture_item_id,
        ),
        title: draft.title,
        description: draft.description,
        priority_confidence: draft.confidence,
        estimated_minutes_low: draft.estimated_minutes_low,
        estimated_minutes_high: draft.estimated_minutes_high,
        first_tiny_step: draft.first_tiny_step,
      });
      acceptTaskDraft(draftId);
      setSaveState({
        status: "saved",
        label: result.task.title,
        provider: result.provider,
      });
      void captureEvent({
        event: "triage_item_accepted",
        properties: {
          area_present: true,
          feature: "triage",
          item_type: "task",
          status: "accepted",
        },
      });
      void captureEvent({
        event: "task_created",
        properties: {
          area_present: true,
          feature: "triage",
          status: result.task.status,
        },
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to accept task draft.",
      });
    }
  }

  async function handleAcceptProjectDraft(draftId: string) {
    const draft = state.projectDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    if (loadState.status !== "ready") {
      setSaveState({
        status: "error",
        message: "Saved workspace is not ready yet.",
      });
      return;
    }

    setSaveState({ status: "saving", label: draft.title });
    try {
      const result = await createProject(createSupabaseBrowserClient(), {
        area_id: resolvePersistedAreaId(draft.area_id, loadState.areas),
        title: draft.title,
        description: draft.description,
      });
      acceptProjectDraft(draftId);
      setSaveState({
        status: "saved",
        label: result.project.title,
        provider: result.provider,
      });
      void captureEvent({
        event: "triage_item_accepted",
        properties: {
          area_present: true,
          feature: "triage",
          item_type: "project",
          status: "accepted",
        },
      });
      void captureEvent({
        event: "project_created",
        properties: {
          area_present: true,
          feature: "triage",
          status: result.project.status,
        },
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to accept project draft.",
      });
    }
  }

  function handleReviewNextItem() {
    const nextItem = document.getElementById("triage-next-item");
    if (!nextItem) {
      return;
    }

    nextItem.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Triage</h1>
        <p className="text-sm text-muted-foreground">
          Review suggestions, decide quickly, and keep momentum.
        </p>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Next action</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {hasCandidates ? (
            <Button type="button" onClick={handleReviewNextItem}>
              Review next item
            </Button>
          ) : (
            <Button asChild>
              <Link href="/capture">Go to Capture</Link>
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {hasCandidates
              ? "Open the first pending suggestion and accept or reject it."
              : "Nothing is waiting for review. Capture a thought to create the next triage item."}
          </p>
        </CardContent>
      </Card>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">System details</summary>
        {loadState.status === "ready" ? (
          <p className="mt-2">
            Saved workspace: <strong>{storageModeLabel(loadState.provider)}</strong>
            . Drafts shown from this browser.
          </p>
        ) : null}
      </details>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">Developer details</summary>
        {loadState.status === "ready" ? (
          <p className="mt-2">
            Acceptance storage mode id: <strong>{loadState.provider}</strong>.
          </p>
        ) : null}
      </details>

      {loadState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading triage context...
        </p>
      ) : null}

      {loadState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Triage context could not load</AlertTitle>
          <AlertDescription>{loadState.message}</AlertDescription>
        </Alert>
      ) : null}

      {saveState.status === "saving" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Accepting {saveState.label}...
        </p>
      ) : null}

      {saveState.status === "saved" ? (
        <Alert variant="success">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            Accepted {saveState.label} in{" "}
            <strong>{storageModeLabel(saveState.provider)}</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      {saveState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Draft was not accepted</AlertTitle>
          <AlertDescription>{saveState.message}</AlertDescription>
        </Alert>
      ) : null}

      {totalCandidates === 0 ? (
        <EmptyState
          title="Nothing to triage right now."
          description="No pending suggestions in this browser. Go to Capture, save a thought, then return here to review it."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {triageCandidates.map((task, index) => {
            const area = getAreaById(task.area_id);
            const assessment = state.ambiguityAssessments.find(
              (item) => item.source_capture_item_id === task.capture_item_id,
            );
            return (
              <Card key={task.id} id={index === 0 ? "triage-next-item" : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{task.title}</CardTitle>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Task suggestion</Badge>
                        {area ? <Badge variant="secondary">Area: {area.name}</Badge> : null}
                        <Badge variant="warning">
                          Confidence: {Math.round(task.confidence * 100)}%
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="warning">Needs review</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assessment ? (
                    <Card className="bg-muted/40">
                      <CardContent className="space-y-1 p-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">Clarity notes</p>
                        <p>First useful move: {assessment.recommended_first_move}</p>
                        <p>Unknowns: {assessment.unknowns.join(", ")}</p>
                        <p>What not to do yet: {assessment.what_not_to_do_yet.join(", ")}</p>
                      </CardContent>
                    </Card>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleAcceptTaskDraft(task.id)}
                      aria-label="Accept task draft"
                      disabled={saveState.status === "saving"}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        editTaskDraft(task.id, {
                          title: `${task.title} (edited)`,
                          description: task.description,
                        })
                      }
                      aria-label="Edit draft"
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        editTaskDraft(task.id, {
                          title: task.title,
                          description: `${task.description ?? ""}\nAdded note: review later.`,
                        })
                      }
                      aria-label="Add defer note"
                    >
                      Add defer note
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        editTaskDraft(task.id, {
                          title: task.title,
                          description: `${task.description ?? ""}\nAdded note: consider changing area.`,
                        })
                      }
                      aria-label="Add area note"
                    >
                      Add area note
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => rejectTaskDraft(task.id)}
                      aria-label="Reject task draft"
                    >
                      Reject
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add defer note and Add area note only add notes in this browser.
                    They do not change status or area yet.
                  </p>
                </CardContent>
              </Card>
            );
          })}
          {projectCandidates.map((project) => {
            const area = getAreaById(project.area_id);
            return (
              <Card key={project.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{project.title}</CardTitle>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Project suggestion</Badge>
                        {area ? <Badge variant="secondary">Area: {area.name}</Badge> : null}
                        <Badge variant="warning">
                          Confidence: {Math.round(project.confidence * 100)}%
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="warning">Needs review</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.description ? (
                    <p className="text-sm text-muted-foreground">{project.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleAcceptProjectDraft(project.id)}
                      aria-label="Accept project draft"
                      disabled={saveState.status === "saving"}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => rejectProjectDraft(project.id)}
                      aria-label="Reject project draft"
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

