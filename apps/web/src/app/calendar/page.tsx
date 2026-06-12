"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CalendarBlock, Task, TimeBlockProposal } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DiagnosticsDisclosure } from "../components/DiagnosticsDisclosure";
import { EmptyState } from "../components/EmptyState";
import { WorkflowPageHeader } from "../components/WorkflowPageHeader";
import { WorkflowLoadingState } from "../components/WorkflowLoadingState";
import {
  acceptTimeBlockProposal,
  checkTimeBlockProposalConflict,
  createGoogleCalendarEventFromProposal,
  createTimeBlockProposal,
  editTimeBlockProposal,
  listPlanningItems,
  rejectTimeBlockProposal,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
import {
  adjustedProposalTimes,
  adjustmentLabel,
  nextLocalSlot,
  normalizeCalendarFailure,
  planningPendingFeedback,
  planningSuccessFeedback,
  proposalConflictSummary,
  proposalHasConflictCheck,
  proposalRationale,
  QUICK_PROPOSAL_RATIONALE,
  type ProposalAdjustment,
} from "@/lib/planning/presentation";
import { captureEvent } from "@/lib/observability";
import { saveModeLabel, savedViaLabel } from "@/lib/statusVocabulary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  blockLifecycleDisplay,
  planningTaskLifecycleDisplay,
  proposalLifecycleDisplay,
} from "@/lib/workflowLifecycle";
import {
  buildAreaAccentStyle,
  resolveAreaById,
  resolveSelectedArea,
} from "@/lib/areaAccent";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";

type PlanningState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
      tasks: Task[];
      proposals: TimeBlockProposal[];
      blocks: CalendarBlock[];
    };

type ActionState =
  | { status: "idle" }
  | { status: "saving"; label: string }
  | { status: "saved"; label: string; provider: DataProvider }
  | {
      status: "error";
      title: string;
      message: string;
      nextStep: string;
    };

type GoogleConnectionState =
  | { status: "loading" }
  | {
      status: "ready";
      connected: boolean;
      firstWriteWarningAcknowledged: boolean;
    }
  | { status: "error"; message: string };

type GoogleCalendarConnectionResponse = {
  ok: boolean;
  connection?: {
    first_write_warning_acknowledged_at: string | null;
    status: "connected" | "disconnected" | "error" | "metadata_only";
  } | null;
  status?: "connected" | "disconnected" | "error";
  error?: string;
};

export default function CalendarPage() {
  const {
    state,
    selectedAreaId,
    acceptLocalProposal,
    createLocalProposalForTask,
    rejectLocalProposal,
    editLocalProposal,
  } = useWorkflow();
  const [planningState, setPlanningState] = useState<PlanningState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });
  const [googleConnectionState, setGoogleConnectionState] =
    useState<GoogleConnectionState>({ status: "loading" });
  const [acknowledgeFirstWriteWarning, setAcknowledgeFirstWriteWarning] =
    useState(false);
  const [adjustingProposalId, setAdjustingProposalId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPlanningItems() {
      try {
        const result = await listPlanningItems(createSupabaseBrowserClient());
        if (!cancelled) {
          setPlanningState({
            status: "ready",
            provider: result.provider,
            tasks: result.tasks,
            proposals: result.proposals,
            blocks: result.blocks,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setPlanningState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load planning rows.",
          });
        }
      }
    }

    void loadPlanningItems();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGoogleConnection() {
      const client = createSupabaseBrowserClient();

      if (!client?.auth?.getSession) {
        if (!cancelled) {
          setGoogleConnectionState({
            status: "ready",
            connected: false,
            firstWriteWarningAcknowledged: false,
          });
        }
        return;
      }

      const { data, error } = await client.auth.getSession();

      if (error || !data.session?.access_token) {
        if (!cancelled) {
          setGoogleConnectionState({
            status: "ready",
            connected: false,
            firstWriteWarningAcknowledged: false,
          });
        }
        return;
      }

      try {
        const response = await fetch("/api/google-calendar/connection", {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        });
        const payload =
          (await response.json()) as GoogleCalendarConnectionResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ?? "Google Calendar connection could not load.",
          );
        }

        if (!cancelled) {
          setGoogleConnectionState({
            status: "ready",
            connected: payload.status === "connected",
            firstWriteWarningAcknowledged: Boolean(
              payload.connection?.first_write_warning_acknowledged_at,
            ),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setGoogleConnectionState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Google Calendar connection could not load.",
          });
        }
      }
    }

    void loadGoogleConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  const usesPersistedPlanning =
    planningState.status === "ready" && planningState.provider === "supabase";
  const selectedArea = resolveSelectedArea(state.areas, selectedAreaId);

  async function handleCreateProposal(task: Task) {
    setActionState({ status: "saving", label: task.title });

    if (!usesPersistedPlanning) {
      const slot = nextLocalSlot(task);
      createLocalProposalForTask({
        taskId: task.id,
        proposedStart: slot.proposed_start,
        proposedEnd: slot.proposed_end,
        rationale: QUICK_PROPOSAL_RATIONALE,
      });
      setActionState({
        status: "saved",
        label: "Suggested time block created",
        provider: "mock",
      });
      void captureEvent({
        event: "proposal_created",
        properties: {
          area_present: Boolean(task.area_id),
          feature: "calendar",
          status: "proposed",
        },
      });
      return;
    }

    try {
      const result = await createTimeBlockProposal(
        createSupabaseBrowserClient(),
        {
          task_id: task.id,
          ...nextLocalSlot(task),
          rationale_note: QUICK_PROPOSAL_RATIONALE,
        },
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? { ...current, proposals: [result.proposal, ...current.proposals] }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Suggested time block created",
        provider: result.provider,
      });
      void captureEvent({
        event: "proposal_created",
        properties: {
          area_present: Boolean(task.area_id),
          feature: "calendar",
          status: result.proposal.status,
        },
      });
    } catch (error) {
      const failure = normalizeCalendarFailure(
        error instanceof Error ? error.message : "",
        "proposal_mutation",
      );
      setActionState({
        status: "error",
        title: failure.title,
        message: failure.message,
        nextStep: failure.nextStep,
      });
    }
  }

  async function handleAdjustPersistedProposal(
    proposal: TimeBlockProposal,
    adjustment: ProposalAdjustment,
  ) {
    const nextTimes = adjustedProposalTimes(proposal, adjustment);
    setActionState({ status: "saving", label: "proposal adjustment" });
    try {
      const result = await editTimeBlockProposal(
        createSupabaseBrowserClient(),
        proposal.id,
        nextTimes,
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: `Suggested time block ${adjustmentLabel(adjustment)}`,
        provider: result.provider,
      });
      setAdjustingProposalId(null);
    } catch (error) {
      const failure = normalizeCalendarFailure(
        error instanceof Error ? error.message : "",
        "proposal_mutation",
      );
      setActionState({
        status: "error",
        title: failure.title,
        message: failure.message,
        nextStep: failure.nextStep,
      });
    }
  }

  function handleAdjustLocalProposal(
    proposal: TimeBlockProposal,
    adjustment: ProposalAdjustment,
  ) {
    const nextTimes = adjustedProposalTimes(proposal, adjustment);
    setActionState({ status: "saving", label: "proposal adjustment" });
    editLocalProposal(proposal.id, {
      ...nextTimes,
      rationale: `${proposalRationale(proposal)} Time ${adjustmentLabel(
        adjustment,
      )}.`,
    });
    setActionState({
      status: "saved",
      label: `Suggested time block ${adjustmentLabel(adjustment)}`,
      provider: "mock",
    });
    setAdjustingProposalId(null);
  }

  function handleAcceptLocalProposal(proposalId: string) {
    setActionState({ status: "saving", label: "planned block" });
    acceptLocalProposal(proposalId);
    setActionState({
      status: "saved",
      label: "Planned block created",
      provider: "mock",
    });
  }

  function handleRejectLocalPlanningProposal(proposalId: string) {
    setActionState({ status: "saving", label: "proposal rejection" });
    rejectLocalProposal(proposalId);
    setActionState({
      status: "saved",
      label: "Suggested time removed",
      provider: "mock",
    });
  }

  async function handleRejectProposal(proposalId: string) {
    setActionState({ status: "saving", label: "proposal rejection" });
    try {
      const result = await rejectTimeBlockProposal(
        createSupabaseBrowserClient(),
        proposalId,
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Suggested time removed",
        provider: result.provider,
      });
    } catch (error) {
      const failure = normalizeCalendarFailure(
        error instanceof Error ? error.message : "",
        "proposal_mutation",
      );
      setActionState({
        status: "error",
        title: failure.title,
        message: failure.message,
        nextStep: failure.nextStep,
      });
    }
  }

  async function handleAcceptProposal(proposalId: string) {
    setActionState({ status: "saving", label: "planned block" });
    try {
      const result = await acceptTimeBlockProposal(
        createSupabaseBrowserClient(),
        proposalId,
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
              blocks: [result.block, ...current.blocks],
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Planned block created",
        provider: result.provider,
      });
    } catch (error) {
      const failure = normalizeCalendarFailure(
        error instanceof Error ? error.message : "",
        "proposal_mutation",
      );
      setActionState({
        status: "error",
        title: failure.title,
        message: failure.message,
        nextStep: failure.nextStep,
      });
    }
  }

  async function handleCheckConflict(proposalId: string) {
    setActionState({ status: "saving", label: "calendar conflict check" });
    void captureEvent({
      event: "conflict_check_requested",
      properties: {
        feature: "calendar",
        status: "requested",
      },
    });
    try {
      const result = await checkTimeBlockProposalConflict(
        createSupabaseBrowserClient(),
        proposalId,
      );

      let storedConflictResult = false;
      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? (() => {
              const nextProposals = current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              );
              storedConflictResult = nextProposals.some(
                (item) => item.id === result.proposal.id,
              );
              return {
                ...current,
                proposals: nextProposals,
              };
            })()
          : current,
      );
      if (!storedConflictResult) {
        setActionState({
          status: "error",
          title: "Calendar conflict check result could not be confirmed",
          message:
            "LifeOS could not confirm the suggested time update after checking calendar availability.",
          nextStep: "Refresh this page and retry Check calendar availability.",
        });
        return;
      }
      setActionState({
        status: "saved",
        label: "Calendar availability checked",
        provider: result.provider,
      });
    } catch (error) {
      const failure = normalizeCalendarFailure(
        error instanceof Error ? error.message : "",
        "conflict_check",
      );
      setActionState({
        status: "error",
        title: failure.title,
        message: failure.message,
        nextStep: failure.nextStep,
      });
    }
  }

  async function handleCreateGoogleEvent(proposalId: string) {
    setActionState({ status: "saving", label: "Google Calendar event" });
    void captureEvent({
      event: "calendar_write_approved",
      properties: {
        feature: "calendar",
        provider: "google_calendar",
        status: "approved",
      },
    });
    try {
      const result = await createGoogleCalendarEventFromProposal(
        createSupabaseBrowserClient(),
        {
          acknowledge_first_write_warning: acknowledgeFirstWriteWarning,
          approved: true,
          proposal_id: proposalId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? (() => {
              const nextProposals = current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              );
              const nextBlocks = current.blocks.some(
                (item) => item.id === result.block.id,
              )
                ? current.blocks.map((item) =>
                    item.id === result.block.id ? result.block : item,
                  )
                : [result.block, ...current.blocks];

              return {
                ...current,
                proposals: nextProposals,
                blocks: nextBlocks,
              };
            })()
          : current,
      );
      setGoogleConnectionState((current) =>
        current.status === "ready"
          ? { ...current, firstWriteWarningAcknowledged: true }
          : current,
      );
      setAcknowledgeFirstWriteWarning(false);
      setActionState({
        status: "saved",
        label: "Google Calendar event created",
        provider: result.provider,
      });
      void captureEvent({
        event: "calendar_write_succeeded",
        properties: {
          feature: "calendar",
          provider: "google_calendar",
          status: "succeeded",
        },
      });
    } catch (error) {
      void captureEvent({
        event: "calendar_write_failed",
        properties: {
          error_category: "google_calendar_write_failed",
          feature: "calendar",
          provider: "google_calendar",
          status: "failed",
        },
      });
      const failure = normalizeCalendarFailure(
        error instanceof Error ? error.message : "",
        "google_write",
      );
      setActionState({
        status: "error",
        title: failure.title,
        message: failure.message,
        nextStep: failure.nextStep,
      });
    }
  }

  function handleReviewNextProposal() {
    const nextItem = document.getElementById("planning-next-proposal");
    if (!nextItem) {
      return;
    }

    nextItem.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const scheduleableTasks = (
    usesPersistedPlanning ? planningState.tasks : state.tasks
  ).filter((task) => {
    if (task.status !== "active") return false;
    if (usesPersistedPlanning || !selectedAreaId) return true;
    return task.area_id === selectedAreaId;
  });
  const proposals = (
    usesPersistedPlanning ? planningState.proposals : state.timeBlockProposals
  ).filter((proposal) => {
    if (usesPersistedPlanning || !selectedAreaId) return true;
    return proposal.area_id === selectedAreaId;
  });
  const blocks = (
    usesPersistedPlanning ? planningState.blocks : state.calendarBlocks
  ).filter((block) => {
    if (usesPersistedPlanning || !selectedAreaId) return true;
    return block.area_id === selectedAreaId;
  });
  const hasAny =
    scheduleableTasks.length > 0 || proposals.length > 0 || blocks.length > 0;
  const nextTaskForProposal = scheduleableTasks[0] ?? null;
  const visibleScheduleableTasks = scheduleableTasks.slice(0, 1);
  const overflowScheduleableTasks = scheduleableTasks.slice(1);
  const visibleProposals = proposals.slice(0, 1);
  const overflowProposals = proposals.slice(1);
  const visibleBlocks = blocks.slice(0, 2);
  const overflowBlocks = blocks.slice(2);

  return (
    <div className="flex flex-col gap-6">
      <WorkflowPageHeader
        eyebrow="Local-first planning"
        title="Planning"
        description="Start local, shape one suggestion, and approve any real Google write explicitly."
      >
        {selectedArea ? (
          <Badge
            variant="secondary"
            className="area-accent-chip inline-flex items-center gap-2 rounded-full"
          >
            <span
              aria-hidden="true"
              className="area-accent-dot size-2 rounded-full"
            />
            Current area: {selectedArea.name}
          </Badge>
        ) : null}
      </WorkflowPageHeader>

      <Card
        data-testid="planning-flow-card"
        className="workflow-primary-card workflow-flagship-card"
      >
        <CardHeader className="pb-3">
          <p className="workflow-surface-kicker">Guide the next block</p>
          <CardTitle className="workflow-surface-title text-3xl font-semibold leading-tight">
            Planning flow
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,1.05fr)] lg:items-start">
          <div className="workflow-action-tray">
            <p className="workflow-section-kicker">Next planning move</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Start local. Suggest one time, adjust it if needed, and approve
              any Google write separately.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextTaskForProposal ? (
                <Button
                  type="button"
                  onClick={() => void handleCreateProposal(nextTaskForProposal)}
                  disabled={actionState.status === "saving"}
                >
                  Suggest a time for next task
                </Button>
              ) : proposals.length > 0 ? (
                <Button type="button" onClick={handleReviewNextProposal}>
                  Review next suggested time block
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/triage">Get a task ready in Triage</Link>
                </Button>
              )}
            </div>
          </div>
          <div className="workflow-metric-grid">
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Save mode</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {planningState.status === "ready"
                  ? saveModeLabel(planningState.provider)
                  : "Checking"}
              </p>
              <p className="workflow-metric-context">
                Planning still works before account rows load.
              </p>
            </div>
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Google writes</p>
              <p className="workflow-metric-value text-[1.35rem]">
                Explicit only
              </p>
              <p className="workflow-metric-context">
                Real Google writes stay approval-gated.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {planningState.status === "loading" ? (
        <WorkflowLoadingState
          title="Checking saved planning rows"
          description="Local planning view is still available while saved rows load."
        />
      ) : null}

      <DiagnosticsDisclosure title="Planning details">
        {planningState.status === "ready" ? (
          <>
            <p>
              Save mode:{" "}
              <strong>{saveModeLabel(planningState.provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{planningState.provider}</strong>
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {planningState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Planning rows could not load</AlertTitle>
          <AlertDescription>{planningState.message}</AlertDescription>
        </Alert>
      ) : null}

      {googleConnectionState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Google Calendar status could not load</AlertTitle>
          <AlertDescription>{googleConnectionState.message}</AlertDescription>
        </Alert>
      ) : null}

      {actionState.status === "saving" ? (
        <Alert
          role="status"
          aria-live="polite"
          className="workflow-celebration-alert"
        >
          <AlertTitle>{planningPendingFeedback(actionState).title}</AlertTitle>
          <AlertDescription>
            {planningPendingFeedback(actionState).description}
          </AlertDescription>
          <div className="workflow-celebration-meta">
            <span className="workflow-celebration-chip">Planning in progress</span>
            <span className="workflow-celebration-chip">
              {actionState.label}
            </span>
          </div>
        </Alert>
      ) : null}

      {actionState.status === "saved"
        ? (() => {
            const feedback = planningSuccessFeedback(actionState);

            return (
              <Alert
                role="status"
                aria-live="polite"
                className="workflow-celebration-alert border-border bg-muted text-foreground"
              >
                <AlertTitle className="text-primary">
                  {feedback.title}
                </AlertTitle>
                <AlertDescription>{feedback.description}</AlertDescription>
                <div className="workflow-celebration-meta">
                  <span className="workflow-celebration-chip">
                    {savedViaLabel(actionState.provider)}
                  </span>
                  <span className="workflow-celebration-chip">
                    {actionState.label}
                  </span>
                </div>
                {feedback.primaryLink ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={feedback.primaryLink.href}>
                        {feedback.primaryLink.label}
                      </Link>
                    </Button>
                  </div>
                ) : actionState.label === "Suggested time block created" ||
                  actionState.label.startsWith("Suggested time block ") ||
                  actionState.label === "Calendar availability checked" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleReviewNextProposal}
                    >
                      Review next suggested time block
                    </Button>
                  </div>
                ) : null}
              </Alert>
            );
          })()
        : null}

      {actionState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>{actionState.title}</AlertTitle>
          <AlertDescription>{actionState.message}</AlertDescription>
          <p className="text-sm font-medium text-destructive">
            Next step: {actionState.nextStep}
          </p>
        </Alert>
      ) : null}

      {!hasAny ? (
        <EmptyState
          title="Nothing needs time yet."
          description="Suggest time for a task and it will appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Card
            data-testid="planning-needs-time-card"
            className="workflow-secondary-card workflow-support-card"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Needs a suggested time
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Pick the next task that should get a local suggestion.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {scheduleableTasks.length === 0 ? (
                <EmptyState
                  title={
                    usesPersistedPlanning
                      ? "No saved active tasks."
                      : "No accepted tasks in this browser."
                  }
                  description={
                    usesPersistedPlanning
                      ? "Accept task drafts in Triage before suggesting time."
                      : "Accept a task in Triage, then suggest time here."
                  }
                  action={
                    <Button asChild>
                      <Link href="/triage">Go to Triage</Link>
                    </Button>
                  }
                />
              ) : (
                visibleScheduleableTasks.map((task) => {
                  const area = usesPersistedPlanning
                    ? null
                    : getAreaById(task.area_id);
                  const lifecycle = planningTaskLifecycleDisplay(task.status);

                  return (
                    <div
                      key={task.id}
                      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{task.title}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {area ? (
                            <Badge variant="secondary">Area: {area.name}</Badge>
                          ) : null}
                          <Badge variant={lifecycle.variant}>
                            {lifecycle.label}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          Estimate: {task.estimated_minutes_low ?? "?"}-
                          {task.estimated_minutes_high ?? "?"} min
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleCreateProposal(task)}
                        disabled={actionState.status === "saving"}
                      >
                        Suggest a time
                      </Button>
                    </div>
                  );
                })
              )}
              {overflowScheduleableTasks.length > 0 ? (
                <DiagnosticsDisclosure
                  title={`${overflowScheduleableTasks.length} more task${overflowScheduleableTasks.length === 1 ? "" : "s"} needing time`}
                  contentClassName="mt-4 grid gap-2"
                >
                    {overflowScheduleableTasks.map((task) => {
                      const area = usesPersistedPlanning
                        ? null
                        : getAreaById(task.area_id);
                      const lifecycle = planningTaskLifecycleDisplay(
                        task.status,
                      );

                      return (
                        <div
                          key={task.id}
                          className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="space-y-1">
                            <div className="font-medium">{task.title}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              {area ? (
                                <Badge variant="secondary">
                                  Area: {area.name}
                                </Badge>
                              ) : null}
                              <Badge variant={lifecycle.variant}>
                                {lifecycle.label}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground">
                              Estimate: {task.estimated_minutes_low ?? "?"}-
                              {task.estimated_minutes_high ?? "?"} min
                            </div>
                          </div>
                          <Button
                            type="button"
                            onClick={() => void handleCreateProposal(task)}
                            disabled={actionState.status === "saving"}
                          >
                            Suggest a time
                          </Button>
                        </div>
                      );
                    })}
                </DiagnosticsDisclosure>
              ) : null}
            </CardContent>
          </Card>

          <Card
            data-testid="planning-queue-summary-card"
            className="workflow-secondary-card workflow-support-card workflow-quiet-card"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Planning snapshot</CardTitle>
            </CardHeader>
            <CardContent className="workflow-metric-grid">
              <div className="workflow-metric-card">
                <p className="workflow-metric-label">Needs time</p>
                <p className="workflow-metric-value">
                  {scheduleableTasks.length}
                </p>
                <p className="workflow-metric-context">
                  Active tasks waiting for a first slot.
                </p>
              </div>
              <div className="workflow-metric-card">
                <p className="workflow-metric-label">Ready to review</p>
                <p className="workflow-metric-value">{proposals.length}</p>
                <p className="workflow-metric-context">
                  Suggested times still waiting for your decision.
                </p>
              </div>
              <div className="workflow-metric-card">
                <p className="workflow-metric-label">Already planned</p>
                <p className="workflow-metric-value">{blocks.length}</p>
                <p className="workflow-metric-context">
                  Ready to start in Execute.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card
            data-testid="planning-ready-review-card"
            className="workflow-secondary-card workflow-support-card"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ready to review</CardTitle>
              <p className="text-sm text-muted-foreground">
                Adjust it, plan it, or check Google Calendar before any real
                write.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {proposals.length === 0 ? (
                <EmptyState
                  title="No suggested time blocks."
                  description="Suggest a time from a task that still needs one."
                />
              ) : (
                visibleProposals.map((proposal) => {
                  const area =
                    resolveAreaById(state.areas, proposal.area_id) ??
                    getAreaById(proposal.area_id);
                  const accentArea = area ?? selectedArea;
                  const conflictSummary = proposalConflictSummary(proposal);
                  const task = usesPersistedPlanning
                    ? scheduleableTasks.find(
                        (item) => item.id === proposal.task_id,
                      )
                    : state.tasks.find((item) => item.id === proposal.task_id);
                  const googleBlock = usesPersistedPlanning
                    ? blocks.find(
                        (item) =>
                          item.proposal_id === proposal.id &&
                          item.google_event_id,
                      )
                    : null;
                  const lifecycle = proposalLifecycleDisplay(proposal.status);
                  const googleWriteState = !usesPersistedPlanning
                    ? "Save planning to your account to use Google Calendar"
                    : googleBlock
                      ? "Added to Google Calendar"
                      : googleConnectionState.status === "loading"
                        ? "Checking connection"
                        : googleConnectionState.status === "error"
                          ? "Connection status unavailable"
                          : !googleConnectionState.connected
                            ? "Calendar disconnected"
                            : proposal.status !== "proposed" &&
                                proposal.status !== "edited" &&
                                proposal.status !== "accepted"
                              ? "Finish local planning first"
                              : "Ready if you approve";
                  const canCheckConflictStatus =
                    proposal.status === "proposed" ||
                    proposal.status === "edited";
                  const hasConflictCheck = proposalHasConflictCheck(proposal);
                  const checkConflictDisabledReason = !usesPersistedPlanning
                    ? "Save planning to your account first."
                    : actionState.status === "saving"
                      ? "Another planning action is already in progress."
                      : googleConnectionState.status === "loading"
                        ? "Google Calendar status is still loading."
                        : googleConnectionState.status === "error"
                          ? "Google Calendar status is unavailable right now."
                          : !googleConnectionState.connected
                            ? "Connect Google Calendar first."
                            : !canCheckConflictStatus
                              ? "Only suggested time blocks can be checked."
                              : null;
                  const checkConflictAllowed =
                    checkConflictDisabledReason === null;
                  const createGoogleDisabledReason = !usesPersistedPlanning
                    ? "Save planning to your account first."
                    : actionState.status === "saving"
                      ? "Another planning action is already in progress."
                      : googleBlock
                        ? "Google event already created for this block."
                        : googleConnectionState.status === "loading"
                          ? "Google Calendar status is still loading."
                          : googleConnectionState.status === "error"
                            ? "Google Calendar status is unavailable right now."
                            : !googleConnectionState.connected
                              ? "Connect Google Calendar first."
                              : !hasConflictCheck
                                ? "Check calendar availability first."
                                : !(
                                      googleConnectionState.firstWriteWarningAcknowledged ||
                                      acknowledgeFirstWriteWarning
                                    )
                                  ? "Confirm first-write approval before creating."
                                  : !(
                                        proposal.status === "proposed" ||
                                        proposal.status === "edited" ||
                                        proposal.status === "accepted"
                                      )
                                    ? "Only suggested or planned blocks can be added."
                                    : null;
                  const createGoogleAllowed =
                    createGoogleDisabledReason === null;
                  const googleActionsRelevant =
                    usesPersistedPlanning &&
                    (Boolean(googleBlock) ||
                      hasConflictCheck ||
                      googleConnectionState.status === "error" ||
                      (googleConnectionState.status === "ready" &&
                        googleConnectionState.connected));

                  return (
                    <div
                      key={proposal.id}
                      data-testid="planning-proposal-card"
                      id={
                        proposal.id === proposals[0]?.id
                          ? "planning-next-proposal"
                          : undefined
                      }
                      data-accent-strength="subtle"
                      style={buildAreaAccentStyle(accentArea?.color)}
                      className="area-accent-card workflow-secondary-card workflow-support-card flex flex-col gap-2 rounded-lg p-3 text-sm"
                    >
                      <div className="font-medium">
                        {task?.title ?? "Unassigned block"}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {area ? (
                          <Badge
                            variant="secondary"
                            className="area-accent-chip w-fit rounded-full"
                          >
                            Area: {area.name}
                          </Badge>
                        ) : selectedArea ? (
                          <Badge
                            variant="secondary"
                            className="area-accent-chip w-fit rounded-full"
                          >
                            Current area: {selectedArea.name}
                          </Badge>
                        ) : null}
                        <Badge variant={lifecycle.variant}>
                          {lifecycle.label}
                        </Badge>
                        <Badge
                          variant={conflictSummary.variant}
                          className={cn(
                            "text-[0.7rem]",
                            conflictSummary.className,
                          )}
                        >
                          {conflictSummary.label}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(proposal.proposed_start).toLocaleTimeString()}{" "}
                        - {new Date(proposal.proposed_end).toLocaleTimeString()}
                      </div>
                      <div className="text-muted-foreground">
                        {proposalRationale(proposal)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Google Calendar: {googleWriteState}
                      </div>
                      <Separator />
                      <div className="workflow-action-tray flex flex-col gap-2">
                        <p className="text-xs font-medium text-foreground">
                          Local planning actions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() =>
                              usesPersistedPlanning
                                ? void handleAcceptProposal(proposal.id)
                                : handleAcceptLocalProposal(proposal.id)
                            }
                            disabled={
                              actionState.status === "saving" ||
                              proposal.status === "accepted"
                            }
                          >
                            Plan this time
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setAdjustingProposalId((current) =>
                                current === proposal.id ? null : proposal.id,
                              )
                            }
                            disabled={
                              actionState.status === "saving" ||
                              proposal.status === "accepted" ||
                              proposal.status === "rejected"
                            }
                          >
                            Adjust time
                          </Button>
                        </div>
                        {adjustingProposalId === proposal.id ? (
                          <div className="workflow-admin-card rounded-md p-2">
                            <p className="text-xs text-muted-foreground">
                              Quick adjustments update the suggestion directly.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  usesPersistedPlanning
                                    ? void handleAdjustPersistedProposal(
                                        proposal,
                                        "move_later",
                                      )
                                    : handleAdjustLocalProposal(
                                        proposal,
                                        "move_later",
                                      )
                                }
                                disabled={actionState.status === "saving"}
                              >
                                Move 30 min later
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  usesPersistedPlanning
                                    ? void handleAdjustPersistedProposal(
                                        proposal,
                                        "shorten",
                                      )
                                    : handleAdjustLocalProposal(
                                        proposal,
                                        "shorten",
                                      )
                                }
                                disabled={actionState.status === "saving"}
                              >
                                Shorten
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  usesPersistedPlanning
                                    ? void handleAdjustPersistedProposal(
                                        proposal,
                                        "extend",
                                      )
                                    : handleAdjustLocalProposal(
                                        proposal,
                                        "extend",
                                      )
                                }
                                disabled={actionState.status === "saving"}
                              >
                                Extend
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <Separator />
                      <DiagnosticsDisclosure
                        title="Google write approval"
                        open={googleActionsRelevant}
                        className="workflow-admin-card rounded-md p-2"
                        summaryClassName="cursor-pointer select-none text-xs font-medium text-foreground"
                        contentClassName="mt-2 flex flex-col gap-2 text-sm text-muted-foreground"
                      >
                          <p className="text-xs text-muted-foreground">
                            {usesPersistedPlanning
                              ? "Google write only happens after you approve it."
                              : "Save planning to your account before Google write approval is available."}
                          </p>
                          {usesPersistedPlanning &&
                          googleConnectionState.status === "ready" &&
                          googleConnectionState.connected &&
                          !googleConnectionState.firstWriteWarningAcknowledged ? (
                            <Label className="workflow-admin-card flex items-start gap-2 rounded-md p-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                className="mt-0.5 size-4 rounded border-input bg-background text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                checked={acknowledgeFirstWriteWarning}
                                onChange={(event) =>
                                  setAcknowledgeFirstWriteWarning(
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                              <span>
                                First Google write approval: I understand this
                                button creates a real Google Calendar event only
                                after explicit user approval. If the write
                                fails, the suggested time stays unchanged.
                              </span>
                            </Label>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                void handleCheckConflict(proposal.id)
                              }
                              disabled={!checkConflictAllowed}
                            >
                              Check calendar availability
                            </Button>
                            <Button
                              type="button"
                              variant={
                                createGoogleAllowed ? "default" : "outline"
                              }
                              onClick={() =>
                                void handleCreateGoogleEvent(proposal.id)
                              }
                              disabled={!createGoogleAllowed}
                            >
                              {googleBlock
                                ? "Added to Google Calendar"
                                : "Create Google Calendar event"}
                            </Button>
                          </div>
                          {!checkConflictAllowed ? (
                            <p className="text-xs text-muted-foreground">
                              Check calendar availability disabled:{" "}
                              {checkConflictDisabledReason}
                            </p>
                          ) : null}
                          {!createGoogleAllowed ? (
                            <p className="text-xs text-muted-foreground">
                              Create Google Calendar event disabled:{" "}
                              {createGoogleDisabledReason}
                            </p>
                          ) : null}
                      </DiagnosticsDisclosure>
                      <DiagnosticsDisclosure
                        title="More options"
                        contentClassName="mt-4 flex flex-wrap gap-2 workflow-admin-card rounded-xl p-3"
                      >
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() =>
                              usesPersistedPlanning
                                ? void handleRejectProposal(proposal.id)
                                : handleRejectLocalPlanningProposal(proposal.id)
                            }
                            disabled={
                              actionState.status === "saving" ||
                              proposal.status === "accepted" ||
                              proposal.status === "rejected"
                            }
                          >
                            Reject
                          </Button>
                      </DiagnosticsDisclosure>
                    </div>
                  );
                })
              )}
              {overflowProposals.length > 0 ? (
                <DiagnosticsDisclosure
                  title={`${overflowProposals.length} more suggested time block${overflowProposals.length === 1 ? "" : "s"}`}
                  contentClassName="mt-4 grid gap-3"
                >
                    {overflowProposals.map((proposal) => {
                      const task = usesPersistedPlanning
                        ? scheduleableTasks.find(
                            (item) => item.id === proposal.task_id,
                          )
                        : state.tasks.find(
                            (item) => item.id === proposal.task_id,
                          );
                      const conflictSummary = proposalConflictSummary(proposal);
                      const lifecycle = proposalLifecycleDisplay(
                        proposal.status,
                      );
                      return (
                        <div
                          key={proposal.id}
                          className="workflow-admin-card rounded-lg p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {task?.title ?? "Unassigned block"}
                            </p>
                            <Badge variant={lifecycle.variant}>
                              {lifecycle.label}
                            </Badge>
                            <Badge
                              variant={conflictSummary.variant}
                              className={cn(
                                "text-[0.7rem]",
                                conflictSummary.className,
                              )}
                            >
                              {conflictSummary.label}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {new Date(
                              proposal.proposed_start,
                            ).toLocaleTimeString()}{" "}
                            -{" "}
                            {new Date(
                              proposal.proposed_end,
                            ).toLocaleTimeString()}
                          </p>
                        </div>
                        );
                      })}
                </DiagnosticsDisclosure>
              ) : null}
            </CardContent>
          </Card>

          <Card
            data-testid="planning-planned-blocks-card"
            className="workflow-secondary-card workflow-support-card"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Already planned</CardTitle>
              <p className="text-sm text-muted-foreground">
                Ready for Execute. A linked Google event does not move them
                somewhere else.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {blocks.length === 0 ? (
                <EmptyState
                  title="No scheduled blocks."
                  description="Blocks appear here after you plan a suggested time."
                />
              ) : (
                visibleBlocks.map((block) => {
                  const area =
                    resolveAreaById(state.areas, block.area_id) ??
                    getAreaById(block.area_id);
                  const accentArea = area ?? selectedArea;
                  const task = usesPersistedPlanning
                    ? scheduleableTasks.find(
                        (item) => item.id === block.task_id,
                      )
                    : state.tasks.find((item) => item.id === block.task_id);
                  const lifecycle = blockLifecycleDisplay(block.status);

                  return (
                    <div
                      key={block.id}
                      data-testid="planning-scheduled-block-card"
                      data-accent-strength="subtle"
                      style={buildAreaAccentStyle(accentArea?.color)}
                      className="area-accent-card workflow-secondary-card workflow-support-card flex flex-col gap-1 rounded-lg p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">
                          {task?.title ?? "Block without specific task"}
                        </div>
                        <Badge variant={lifecycle.variant}>
                          {lifecycle.label}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(block.start_at).toLocaleTimeString()} -{" "}
                        {new Date(block.end_at).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <Badge
                          variant="secondary"
                          className="area-accent-chip w-fit rounded-full"
                        >
                          Area: {area.name}
                        </Badge>
                      ) : selectedArea ? (
                        <Badge
                          variant="secondary"
                          className="area-accent-chip w-fit rounded-full"
                        >
                          Current area: {selectedArea.name}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        Status: {block.status}
                      </span>
                    </div>
                  );
                })
              )}
              {overflowBlocks.length > 0 ? (
                <DiagnosticsDisclosure
                  title={`${overflowBlocks.length} more planned block${overflowBlocks.length === 1 ? "" : "s"}`}
                  contentClassName="mt-4 grid gap-2"
                >
                    {overflowBlocks.map((block) => {
                      const area =
                        resolveAreaById(state.areas, block.area_id) ??
                        getAreaById(block.area_id);
                      const task = usesPersistedPlanning
                        ? scheduleableTasks.find(
                            (item) => item.id === block.task_id,
                          )
                        : state.tasks.find((item) => item.id === block.task_id);
                      const lifecycle = blockLifecycleDisplay(block.status);

                      return (
                        <div
                          key={block.id}
                          className="workflow-admin-card rounded-lg p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {task?.title ?? "Block without specific task"}
                            </p>
                            <Badge variant={lifecycle.variant}>
                              {lifecycle.label}
                            </Badge>
                            {area ? (
                              <Badge variant="secondary">
                                Area: {area.name}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {new Date(block.start_at).toLocaleTimeString()} -{" "}
                            {new Date(block.end_at).toLocaleTimeString()}
                          </p>
                        </div>
                      );
                    })}
                </DiagnosticsDisclosure>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      <section className="mt-2 text-xs text-muted-foreground">
        <p>
          Local suggestions stay here until you approve a real Google event.
          Free/busy checks are manual only. No autonomous rescheduling or
          background calendar changes happen here.
        </p>
        <p className="mt-2">
          Next: start focus in Execute, then close the loop in Review.
        </p>
      </section>
    </div>
  );
}
