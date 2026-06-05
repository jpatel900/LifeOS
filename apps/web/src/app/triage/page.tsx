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
import { WorkflowLoadingState } from "../components/WorkflowLoadingState";
import { WorkflowPageHeader } from "../components/WorkflowPageHeader";
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
  const visibleUpcomingQueueItems = upcomingQueueItems.slice(0, 2);
  const overflowUpcomingQueueItems = upcomingQueueItems.slice(2);

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
      <WorkflowPageHeader
        eyebrow="One decision at a time"
        title="Triage"
        description="Stay with the current item, make the next useful decision, then let the queue fall away behind you."
        spotlight={
          <div className="workflow-metric-grid">
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Current item</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {hasCandidates ? "Ready now" : "Nothing waiting"}
              </p>
              <p className="workflow-metric-context">
                {hasCandidates
                  ? "Keep attention on one draft until it is accepted or rejected."
                  : "Capture a new thought to create the next review decision."}
              </p>
            </div>
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Waiting after this</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {upcomingQueueItems.length}
              </p>
              <p className="workflow-metric-context">
                {upcomingQueueItems.length === 0
                  ? "Nothing else will compete for attention once this item is done."
                  : `The queue stays compressed until this decision is finished.`}
              </p>
            </div>
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Accepted items save</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {loadState.status === "ready"
                  ? saveModeLabel(loadState.provider)
                  : "Checking"}
              </p>
              <p className="workflow-metric-context">
                Drafts stay on this device until you accept them.
              </p>
            </div>
          </div>
        }
      >
        {activeQueueItemArea ? (
          <Badge
            variant="secondary"
            className="area-accent-chip inline-flex items-center gap-2 rounded-full"
          >
            <span
              aria-hidden
              className="area-accent-dot h-2 w-2 rounded-full"
            />
            Current area: {activeQueueItemArea.name}
          </Badge>
        ) : null}
      </WorkflowPageHeader>

      {hasCandidates ? (
        <Card
          data-testid="triage-next-action-card"
          className="workflow-secondary-card"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current focus</CardTitle>
          </CardHeader>
          <CardContent className="workflow-action-tray flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="workflow-section-kicker">Next move</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {upcomingQueueItems.length === 0
                  ? "Review the current item now. Nothing else is waiting after this."
                  : `Review the current item now. ${upcomingQueueItems.length} ${upcomingQueueItems.length === 1 ? "item waits" : "items wait"} after this one.`}
              </p>
            </div>
            <Button type="button" onClick={handleReviewNextItem}>
              Review current item
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
        <WorkflowLoadingState
          title="Checking saved context"
          description="You can still review drafts while account context loads."
        />
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
        <Alert variant="success" className="workflow-celebration-alert">
          <AlertTitle>Ready for Planning</AlertTitle>
          <AlertDescription>
            Accepted {saveState.label}. It was{" "}
            {savedViaLabel(saveState.provider)}. Plan time in Planning next, or
            capture another thought.
          </AlertDescription>
          <div className="workflow-celebration-meta">
            <span className="workflow-celebration-chip">
              {savedViaLabel(saveState.provider)}
            </span>
            <span className="workflow-celebration-chip">
              Planning is the next useful place
            </span>
          </div>
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
          action={
            <Button asChild>
              <Link href="/capture">Go to Capture</Link>
            </Button>
          }
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
                    <p className="text-sm text-muted-foreground">
                      Make the next decision here before looking at anything
                      else.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {activeQueueItemArea ? (
                        <Badge
                          variant="secondary"
                          className="area-accent-chip rounded-full"
                        >
                          Area: {activeQueueItemArea.name}
                        </Badge>
                      ) : null}
                      <Badge variant="outline">
                        {activeQueueItem.kind === "task"
                          ? "Task suggestion"
                          : "Project suggestion"}
                      </Badge>
                      <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                      <Badge variant="warning">
                        Confidence:{" "}
                        {Math.round(activeQueueItem.draft.confidence * 100)}%
                      </Badge>
                      <Badge variant="outline">
                        {totalCandidates} item{totalCandidates === 1 ? "" : "s"} ready
                      </Badge>
                    </div>
                  </div>
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
                          {assessment && editedDraftIds[task.id] ? (
                            <Alert>
                              <AlertTitle>
                                AI notes are from the original capture
                              </AlertTitle>
                              <AlertDescription>
                                You edited this draft. Re-sort in Capture if you
                                want updated AI notes.
                              </AlertDescription>
                            </Alert>
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
                          <div className="workflow-action-tray">
                            <p className="workflow-section-kicker">Decide</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Keep the choice narrow: accept it, reject it, or tighten the draft before it becomes real work.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
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
                                variant="destructive"
                                onClick={() => rejectTaskDraft(task.id)}
                                aria-label="Reject task draft"
                              >
                                Reject
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => startEditingTaskDraft(task.id)}
                                aria-label="Edit draft"
                              >
                                Edit draft
                              </Button>
                            </div>
                          </div>
                          {assessment || task.description ? (
                            <details className="system-details-disclosure">
                              <summary className="text-sm font-medium text-foreground">
                                Context and notes
                              </summary>
                              <div className="mt-4 grid gap-3">
                                {assessment && !editedDraftIds[task.id] ? (
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
                              </div>
                            </details>
                          ) : null}
                          <details className="system-details-disclosure">
                            <summary className="text-sm font-medium text-foreground">
                              Browser notes
                            </summary>
                            <div className="mt-4 rounded-lg border border-border bg-background/50 p-3">
                              <div className="flex flex-wrap gap-2">
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
                                  aria-label="Add review-later note"
                                >
                                  Review later note
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
                                  aria-label="Add area-change note"
                                >
                                  Area change note
                                </Button>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                These notes stay on this device and do not move the item.
                              </p>
                            </div>
                          </details>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="workflow-action-tray">
                      <p className="workflow-section-kicker">Decide</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Accept it as a project only if it is clearly bigger than one task. Otherwise reject and return to Capture for a cleaner pass.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
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
                    </div>
                    {activeQueueItem.draft.description ? (
                      <details className="system-details-disclosure">
                        <summary className="text-sm font-medium text-foreground">
                          Context and notes
                        </summary>
                        <div className="mt-4">
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
                        </div>
                      </details>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {upcomingQueueItems.length > 0 ? (
            <Card
              data-testid="triage-waiting-queue-card"
              className="workflow-secondary-card"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Waiting after this</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {visibleUpcomingQueueItems.map((item) => {
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
                {overflowUpcomingQueueItems.length > 0 ? (
                  <details className="system-details-disclosure">
                    <summary className="text-sm font-medium text-foreground">
                      {overflowUpcomingQueueItems.length} more queued item
                      {overflowUpcomingQueueItems.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-4 grid gap-2">
                      {overflowUpcomingQueueItems.map((item) => {
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
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
