"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Area, Phase2ProjectDraft, Phase2TaskDraft } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiagnosticsDisclosure } from "../components/DiagnosticsDisclosure";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import {
  createProject,
  createTask,
  listAreas,
  type DataProvider,
} from "@/lib/data/workflow";
import { captureEvent } from "@/lib/observability";
import { saveModeLabel, savedViaLabel } from "@/lib/statusVocabulary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { triageLifecycleDisplay } from "@/lib/workflowLifecycle";
import { useWorkflow } from "@/lib/WorkflowContext";
import { persistedAreaIdForWorkflowAreaId } from "@/lib/workflowAreaMapping";
import { buildAreaAccentStyle, resolveAreaById } from "@/lib/areaAccent";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

type SaveState =
  | { status: "idle" }
  | { status: "saving"; label: string }
  | { status: "saved"; label: string; provider: DataProvider }
  | { status: "error"; message: string };

type QueueItem =
  | {
      queueId: string;
      kind: "task";
      draft: Phase2TaskDraft;
    }
  | {
      queueId: string;
      kind: "project";
      draft: Phase2ProjectDraft;
    };

function resolvePersistedAreaId(workflowAreaId: string, areas: Area[]) {
  const areaId =
    persistedAreaIdForWorkflowAreaId(workflowAreaId, areas) ?? areas[0]?.id;

  if (!areaId) {
    throw new Error("Create an active area before accepting triage drafts.");
  }

  return areaId;
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
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [activeQueueItemId, setActiveQueueItemId] = useState<string | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editedDraftIds, setEditedDraftIds] = useState<Record<string, true>>(
    {},
  );
  const [noteFeedbackByDraftId, setNoteFeedbackByDraftId] = useState<
    Record<string, string>
  >({});
  const triageCandidates = state.taskDrafts.filter(
    (draft) => draft.status === "pending",
  );
  const projectCandidates = state.projectDrafts.filter(
    (draft) => draft.status === "pending",
  );
  const queueItems = useMemo<QueueItem[]>(
    () => [
      ...triageCandidates.map((draft) => ({
        queueId: `task:${draft.id}`,
        kind: "task" as const,
        draft,
      })),
      ...projectCandidates.map((draft) => ({
        queueId: `project:${draft.id}`,
        kind: "project" as const,
        draft,
      })),
    ],
    [projectCandidates, triageCandidates],
  );
  const totalCandidates = triageCandidates.length + projectCandidates.length;
  const lifecycle = triageLifecycleDisplay();
  const hasCandidates = totalCandidates > 0;
  const activeQueueItem =
    queueItems.find((item) => item.queueId === activeQueueItemId) ??
    queueItems[0] ??
    null;
  const activeQueueItemArea = activeQueueItem
    ? resolveAreaById(state.areas, activeQueueItem.draft.area_id) ??
      getAreaById(activeQueueItem.draft.area_id) ??
      null
    : null;
  const upcomingQueueItems = activeQueueItem
    ? queueItems.filter((item) => item.queueId !== activeQueueItem.queueId)
    : [];

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

  useEffect(() => {
    if (queueItems.length === 0) {
      if (activeQueueItemId !== null) {
        setActiveQueueItemId(null);
      }
      return;
    }

    if (!activeQueueItemId) {
      setActiveQueueItemId(queueItems[0].queueId);
      return;
    }

    if (!queueItems.some((item) => item.queueId === activeQueueItemId)) {
      setActiveQueueItemId(queueItems[0].queueId);
    }
  }, [activeQueueItemId, queueItems]);

  async function handleAcceptTaskDraft(draftId: string) {
    const draft = state.taskDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    if (loadState.status !== "ready") {
      setSaveState({
        status: "error",
        message: "Account sync is not ready yet.",
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
        message: "Account sync is not ready yet.",
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
    const nextItem = document.getElementById("triage-current-item");
    if (!nextItem) {
      return;
    }

    nextItem.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSelectQueueItem(queueId: string) {
    setActiveQueueItemId(queueId);
  }

  function startEditingTaskDraft(taskId: string) {
    const draft = state.taskDrafts.find((item) => item.id === taskId);
    if (!draft) return;
    setEditingDraftId(taskId);
    setEditTitle(draft.title);
    setEditDescription(draft.description ?? "");
  }

  function applyTaskDraftEdit(taskId: string) {
    const title = editTitle.trim();
    if (!title) {
      return;
    }

    editTaskDraft(taskId, {
      title,
      description: editDescription.trim() || null,
    });
    setEditedDraftIds((current) => ({ ...current, [taskId]: true }));
    setNoteFeedbackByDraftId((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setEditingDraftId(null);
  }

  function appendNote(description: string | null, note: string) {
    const base = description?.trim();
    return base ? `${base}\n${note}` : note;
  }

  function addNoteOnlyFeedback(
    taskId: string,
    title: string,
    description: string | null,
    note: string,
  ) {
    editTaskDraft(taskId, {
      title,
      description: appendNote(description, note),
    });
    setNoteFeedbackByDraftId((current) => ({ ...current, [taskId]: note }));
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Triage</h1>
        <p className="text-sm text-muted-foreground">
          Review one thing at a time, make the next decision, and keep moving.
        </p>
      </section>

      <Card data-testid="triage-next-action-card" className="workflow-secondary-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Next action</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {hasCandidates ? (
            <Button type="button" onClick={handleReviewNextItem}>
              Open current item
            </Button>
          ) : (
            <Button asChild>
              <Link href="/capture">Go to Capture</Link>
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {hasCandidates
              ? upcomingQueueItems.length === 0
                ? "Review one item now. Nothing else is waiting after this."
                : `Review one item now. ${upcomingQueueItems.length} ${upcomingQueueItems.length === 1 ? "item waits" : "items wait"} after this one.`
              : "Nothing is waiting for review. Capture a thought to create the next item."}
          </p>
        </CardContent>
      </Card>

      <DiagnosticsDisclosure>
        {loadState.status === "ready" ? (
          <>
            <p>
              Accepted items are {savedViaLabel(loadState.provider)}. Drafts
              shown here stay on this device until you accept them.
            </p>
            <p>
              Save mode: <strong>{saveModeLabel(loadState.provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{loadState.provider}</strong>.
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {loadState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved context. You can still review drafts.
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
          <AlertTitle>Ready for Planning</AlertTitle>
          <AlertDescription>
            Accepted {saveState.label}. It was{" "}
            {savedViaLabel(saveState.provider)}. Plan time in Planning next, or
            capture another thought.
          </AlertDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/calendar">Plan time for this</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/capture">Capture another</Link>
            </Button>
          </div>
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
          {activeQueueItem ? (
            <Card
              id="triage-current-item"
              data-testid="triage-current-item-card"
              data-accent-strength="subtle"
              style={buildAreaAccentStyle(activeQueueItemArea?.color)}
              className="area-accent-card workflow-primary-card"
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Current item
                    </p>
                    <CardTitle className="text-lg">
                      {activeQueueItem.draft.title}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {activeQueueItem.kind === "task"
                          ? "Task suggestion"
                          : "Project suggestion"}
                      </Badge>
                      {activeQueueItemArea ? (
                        <Badge
                          variant="secondary"
                          className="area-accent-chip rounded-full"
                        >
                          Area: {activeQueueItemArea.name}
                        </Badge>
                      ) : null}
                      <Badge variant="warning">
                        Confidence:{" "}
                        {Math.round(activeQueueItem.draft.confidence * 100)}%
                      </Badge>
                      <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                    </div>
                  </div>
                  <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeQueueItem.kind === "task" ? (
                  <>
                    {(() => {
                      const task = activeQueueItem.draft;
                      const assessment = state.ambiguityAssessments.find(
                        (item) =>
                          item.source_capture_item_id === task.capture_item_id,
                      );

                      return (
                        <>
                          {assessment ? (
                            editedDraftIds[task.id] ? (
                              <Alert>
                                <AlertTitle>
                                  AI notes are from the original capture
                                </AlertTitle>
                                <AlertDescription>
                                  You edited this draft. Re-sort in Capture if
                                  you want updated AI notes.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <Card className="workflow-support-panel bg-muted/40 shadow-none">
                                <CardContent className="space-y-1 p-3 text-sm text-muted-foreground">
                                  <p className="font-medium text-foreground">
                                    Clarity notes
                                  </p>
                                  <p>
                                    First useful move:{" "}
                                    {assessment.recommended_first_move}
                                  </p>
                                  <p>
                                    Unknowns: {assessment.unknowns.join(", ")}
                                  </p>
                                  <p>
                                    What not to do yet:{" "}
                                    {assessment.what_not_to_do_yet.join(", ")}
                                  </p>
                                </CardContent>
                              </Card>
                            )
                          ) : null}
                          {task.description ? (
                            <Card className="workflow-support-panel bg-muted/40 shadow-none">
                              <CardContent className="space-y-1 p-3 text-sm text-muted-foreground">
                                <p className="font-medium text-foreground">
                                  Draft notes
                                </p>
                                <p className="whitespace-pre-line">
                                  {task.description}
                                </p>
                              </CardContent>
                            </Card>
                          ) : null}
                          {noteFeedbackByDraftId[task.id] ? (
                            <Alert variant="success">
                              <AlertTitle>Note saved in this browser</AlertTitle>
                              <AlertDescription>
                                {noteFeedbackByDraftId[task.id]}
                              </AlertDescription>
                            </Alert>
                          ) : null}
                          {editingDraftId === task.id ? (
                            <Card className="workflow-support-panel bg-muted/40 shadow-none">
                              <CardContent className="space-y-3 p-3">
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`${task.id}-title`}
                                    className="text-xs font-medium"
                                  >
                                    Title
                                  </label>
                                  <Input
                                    id={`${task.id}-title`}
                                    value={editTitle}
                                    onChange={(event) =>
                                      setEditTitle(event.target.value)
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`${task.id}-description`}
                                    className="text-xs font-medium"
                                  >
                                    Description
                                  </label>
                                  <Textarea
                                    id={`${task.id}-description`}
                                    value={editDescription}
                                    onChange={(event) =>
                                      setEditDescription(event.target.value)
                                    }
                                    rows={3}
                                  />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => applyTaskDraftEdit(task.id)}
                                    disabled={!editTitle.trim()}
                                  >
                                    Save edit
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingDraftId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
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
                              Accept as task
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => startEditingTaskDraft(task.id)}
                              aria-label="Edit draft"
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                addNoteOnlyFeedback(
                                  task.id,
                                  task.title,
                                  task.description,
                                  "Added note: review later.",
                                )
                              }
                              aria-label="Mark for later"
                            >
                              Mark for later (note only)
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                addNoteOnlyFeedback(
                                  task.id,
                                  task.title,
                                  task.description,
                                  "Added note: consider changing area.",
                                )
                              }
                              aria-label="Add area note"
                            >
                              Add area note (note only)
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
                            This adds a note for now; it does not move the item
                            yet.
                          </p>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {activeQueueItem.draft.description ? (
                      <Card className="bg-muted/40">
                        <CardContent className="space-y-1 p-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">
                            Draft notes
                          </p>
                          <p className="whitespace-pre-line">
                            {activeQueueItem.draft.description}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() =>
                          void handleAcceptProjectDraft(activeQueueItem.draft.id)
                        }
                        aria-label="Accept project draft"
                        disabled={saveState.status === "saving"}
                      >
                        Accept as project
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() =>
                          rejectProjectDraft(activeQueueItem.draft.id)
                        }
                        aria-label="Reject project draft"
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {upcomingQueueItems.length > 0 ? (
            <Card className="workflow-secondary-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Up next</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {upcomingQueueItems.map((item) => {
                  const area = getAreaById(item.draft.area_id);
                  return (
                    <div
                      key={item.queueId}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{item.draft.title}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">
                            {item.kind === "task"
                              ? "Task suggestion"
                              : "Project suggestion"}
                          </Badge>
                          {area ? (
                            <Badge variant="secondary">Area: {area.name}</Badge>
                          ) : null}
                          <Badge variant="warning">
                            Confidence:{" "}
                            {Math.round(item.draft.confidence * 100)}%
                          </Badge>
                          <Badge variant={lifecycle.variant}>
                            {lifecycle.label}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => handleSelectQueueItem(item.queueId)}
                      >
                        Review this next
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
