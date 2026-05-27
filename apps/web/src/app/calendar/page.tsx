"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CalendarBlock, Task, TimeBlockProposal } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "../components/EmptyState";
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
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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

function storageModeLabel(mode: DataProvider) {
  return mode === "supabase" ? "Saved workspace" : "Demo mode";
}

function nextLocalSlot(task: Task) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const minutes =
    task.estimated_minutes_high ?? task.estimated_minutes_low ?? 45;
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  return {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
  };
}

const QUICK_PROPOSAL_RATIONALE =
  "Quick proposal: next available hour. You can adjust this before approving.";

type ProposalAdjustment = "move_later" | "shorten" | "extend";

function adjustmentLabel(adjustment: ProposalAdjustment) {
  switch (adjustment) {
    case "move_later":
      return "moved 30 minutes later";
    case "shorten":
      return "shortened";
    case "extend":
      return "extended";
  }
}

function adjustedProposalTimes(
  proposal: Pick<TimeBlockProposal, "proposed_start" | "proposed_end">,
  adjustment: ProposalAdjustment,
) {
  const start = new Date(proposal.proposed_start);
  const end = new Date(proposal.proposed_end);
  const currentDurationMs = Math.max(end.getTime() - start.getTime(), 0);
  const fiveMinutesMs = 5 * 60 * 1000;
  const thirtyMinutesMs = 30 * 60 * 1000;

  if (adjustment === "move_later") {
    start.setMinutes(start.getMinutes() + 30);
    end.setMinutes(end.getMinutes() + 30);
  }

  if (adjustment === "extend") {
    end.setMinutes(end.getMinutes() + 30);
  }

  if (adjustment === "shorten") {
    const shortenByMs = Math.min(
      15 * 60 * 1000,
      Math.max(fiveMinutesMs, currentDurationMs - fiveMinutesMs),
    );
    end.setTime(end.getTime() - shortenByMs);
    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + fiveMinutesMs);
    }
  }

  return {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
  };
}

function proposalRationale(
  proposal: TimeBlockProposal | { rationale: string },
) {
  if ("rationale" in proposal) {
    return proposal.rationale;
  }

  const payload = proposal.rationale_json;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "note" in payload
  ) {
    return String(payload.note);
  }

  return "Local planning proposal.";
}

function proposalHasConflictCheck(proposal: TimeBlockProposal) {
  const details = proposal.conflict_details_json;
  return Boolean(
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    typeof (details as Record<string, unknown>).checked_at === "string",
  );
}

function proposalConflictSummary(proposal: TimeBlockProposal) {
  const hasCheckedConflict = proposalHasConflictCheck(proposal);

  if (proposal.conflict_flag) {
    return {
      label: "Conflict flagged",
      variant: "destructive" as const,
      className: "",
    };
  }

  if (hasCheckedConflict) {
    return {
      label: "No conflict detected",
      variant: "outline" as const,
      className: "border-border bg-muted text-primary",
    };
  }

  return {
    label: "Conflict not checked",
    variant: "secondary" as const,
    className: "",
  };
}

type CalendarActionKind =
  | "proposal_mutation"
  | "conflict_check"
  | "google_write";

function normalizeCalendarFailure(
  rawMessage: string,
  action: CalendarActionKind,
) {
  const message = rawMessage.toLowerCase();

  if (
    message.includes("requires supabase configuration") ||
    message.includes("not configured")
  ) {
    return {
      title: "Google Calendar is not configured",
      message: "Google Calendar features are unavailable in this environment.",
      nextStep:
        "Keep local planning in this view or configure Google Calendar server env vars.",
    };
  }

  if (
    message.includes("sign in before") ||
    message.includes("auth is unavailable") ||
    message.includes("jwt")
  ) {
    return {
      title: "Sign-in required",
      message: "This action requires an authenticated Supabase session.",
      nextStep: "Sign in again, then retry the action.",
    };
  }

  if (
    message.includes("connect google calendar") ||
    message.includes("is not connected") ||
    message.includes("ready to connect") ||
    message.includes("reconnect google calendar")
  ) {
    return {
      title: "Google Calendar is disconnected",
      message:
        "A calendar connection is required before this Google Calendar action can run.",
      nextStep: "Connect Google Calendar in Settings, then retry.",
    };
  }

  if (
    message.includes("already has a google calendar event") ||
    message.includes("duplicate")
  ) {
    return {
      title: "Duplicate Google event blocked",
      message:
        "This local proposal already has a linked Google Calendar event.",
      nextStep:
        "Use the existing scheduled block or create a new local proposal instead.",
    };
  }

  if (action === "conflict_check") {
    return {
      title: "Calendar conflict check failed",
      message:
        "LifeOS could not confirm Google Calendar availability for this proposal.",
      nextStep:
        "Keep the local proposal, review connection status, and retry Check calendar conflicts.",
    };
  }

  if (action === "google_write") {
    return {
      title: "Google Calendar write failed",
      message: "No Google Calendar event was confirmed for this action.",
      nextStep:
        "Your local proposal is unchanged. Review connection/approval state and retry.",
    };
  }

  return {
    title: "Planning change was not saved",
    message: "LifeOS could not confirm this local planning update.",
    nextStep: "Review state and retry.",
  };
}

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
        label: "Proposal drafted in",
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
        label: "Proposal saved through",
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
        label: `Proposal ${adjustmentLabel(adjustment)} through`,
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
      label: `Proposal ${adjustmentLabel(adjustment)} through`,
      provider: "mock",
    });
    setAdjustingProposalId(null);
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
        label: "Proposal rejected through",
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
    setActionState({ status: "saving", label: "local block" });
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
        label: "Local block created through",
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
            "LifeOS could not confirm the local proposal update after checking conflict status.",
          nextStep: "Refresh this page and retry Check calendar conflicts.",
        });
        return;
      }
      setActionState({
        status: "saved",
        label: "Calendar conflict checked in",
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

      let storedProposalUpdate = false;
      let storedGoogleBlock = false;
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

              storedProposalUpdate = nextProposals.some(
                (item) =>
                  item.id === result.proposal.id &&
                  item.status === result.proposal.status,
              );
              storedGoogleBlock = nextBlocks.some(
                (item) =>
                  item.id === result.block.id &&
                  item.google_event_id === result.googleEventId,
              );

              return {
                ...current,
                proposals: nextProposals,
                blocks: nextBlocks,
              };
            })()
          : current,
      );
      if (!storedProposalUpdate || !storedGoogleBlock) {
        setActionState({
          status: "error",
          title: "Google write result could not be confirmed",
          message: "LifeOS could not confirm the local post-write state.",
          nextStep:
            "Refresh this page, verify local proposal and block state, then retry if needed.",
        });
        return;
      }
      setGoogleConnectionState((current) =>
        current.status === "ready"
          ? { ...current, firstWriteWarningAcknowledged: true }
          : current,
      );
      setAcknowledgeFirstWriteWarning(false);
      setActionState({
        status: "saved",
        label: "Google Calendar event created through",
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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1>Planning</h1>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">
          Stage one local block here first. Nothing goes to Google Calendar
          until you approve a real write.
        </p>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Next action</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {nextTaskForProposal ? (
            <Button
              type="button"
              onClick={() => void handleCreateProposal(nextTaskForProposal)}
              disabled={actionState.status === "saving"}
            >
              Draft a time block for next task
            </Button>
          ) : proposals.length > 0 ? (
            <Button type="button" onClick={handleReviewNextProposal}>
              Review next planned time block
            </Button>
          ) : (
            <Button asChild>
              <Link href="/triage">Get a task ready in Triage</Link>
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Quick proposals start with the next available hour. You can adjust
            time before approving, then move to Execute when you are ready to
            start.
          </p>
        </CardContent>
      </Card>

      {planningState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved planning rows. Local planning view is still available.
        </p>
      ) : null}

      <details className="text-sm text-muted-foreground">
        <summary>System details</summary>
        {planningState.status === "ready" ? (
          <p className="mt-2">
            Storage mode:{" "}
            <strong>{storageModeLabel(planningState.provider)}</strong>
          </p>
        ) : null}
      </details>

      <details className="text-sm text-muted-foreground">
        <summary>Developer details</summary>
        {planningState.status === "ready" ? (
          <p className="mt-2">
            Storage mode id: <strong>{planningState.provider}</strong>
          </p>
        ) : null}
      </details>

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
        <p role="status" className="text-sm text-muted-foreground">
          Saving {actionState.label}...
        </p>
      ) : null}

      {actionState.status === "saved" ? (
        <Alert role="status" className="border-border bg-muted text-foreground">
          <AlertTitle className="text-primary">Saved</AlertTitle>
          <AlertDescription>
            {actionState.label}{" "}
            <strong>{storageModeLabel(actionState.provider)}</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

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
          title="No planned time blocks yet."
          description="Planned time blocks will appear here after you draft a time block for a task. Checking calendar conflicts is optional and does not create events."
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unplanned tasks</CardTitle>
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
                      ? "Accept task drafts in triage before drafting local time blocks."
                      : "Accept a task in Triage, then draft a local time block here."
                  }
                />
              ) : (
                scheduleableTasks.map((task) => {
                  const area = usesPersistedPlanning
                    ? null
                    : getAreaById(task.area_id);

                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-muted-foreground">
                          Estimate: {task.estimated_minutes_low ?? "?"}-
                          {task.estimated_minutes_high ?? "?"} min
                        </div>
                        {area ? (
                          <div className="text-muted-foreground">
                            Area: {area.name}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleCreateProposal(task)}
                        disabled={actionState.status === "saving"}
                      >
                        Draft a time block
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Planned time blocks (local first)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {proposals.length === 0 ? (
                <EmptyState
                  title="No planned time blocks."
                  description="Draft a time block from an unplanned task to stage a local block."
                />
              ) : (
                proposals.map((proposal) => {
                  const area = usesPersistedPlanning
                    ? null
                    : getAreaById(proposal.area_id);
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
                  const googleWriteState = !usesPersistedPlanning
                    ? "Unavailable in Demo mode (This browser only)"
                    : googleBlock
                      ? "Google event created"
                      : googleConnectionState.status === "loading"
                        ? "Connection status loading"
                        : googleConnectionState.status === "error"
                          ? "Connection status unavailable"
                          : !googleConnectionState.connected
                            ? "Disconnected"
                            : proposal.status !== "proposed" &&
                                proposal.status !== "edited" &&
                                proposal.status !== "accepted"
                              ? "Not eligible from this proposal status"
                              : "Ready after explicit approval";
                  const canCheckConflictStatus =
                    proposal.status === "proposed" ||
                    proposal.status === "edited";
                  const hasConflictCheck = proposalHasConflictCheck(proposal);
                  const checkConflictDisabledReason = !usesPersistedPlanning
                    ? "This block is local only. Supabase setup is required."
                    : actionState.status === "saving"
                      ? "Another planning action is already in progress."
                      : googleConnectionState.status === "loading"
                        ? "Google Calendar status is still loading."
                        : googleConnectionState.status === "error"
                          ? "Google Calendar status is unavailable right now."
                          : !googleConnectionState.connected
                            ? "Connect Google Calendar first."
                            : !canCheckConflictStatus
                              ? "Only proposed or adjusted blocks can be checked."
                              : null;
                  const checkConflictAllowed =
                    checkConflictDisabledReason === null;
                  const createGoogleDisabledReason = !usesPersistedPlanning
                    ? "This block is local only. Supabase setup is required."
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
                                ? "Check conflicts before creating."
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
                                    ? "This proposal status cannot create a Google event."
                                    : null;
                  const createGoogleAllowed =
                    createGoogleDisabledReason === null;

                  return (
                    <div
                      key={proposal.id}
                      id={
                        proposal.id === proposals[0]?.id
                          ? "planning-next-proposal"
                          : undefined
                      }
                      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <div className="font-medium">
                        {task?.title ?? "Unassigned block"}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(proposal.proposed_start).toLocaleTimeString()}{" "}
                        - {new Date(proposal.proposed_end).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <div className="text-muted-foreground">
                          Area: {area.name}
                        </div>
                      ) : null}
                      <div className="text-muted-foreground">
                        {proposalRationale(proposal)}
                      </div>
                      {usesPersistedPlanning &&
                      googleConnectionState.status === "ready" &&
                      googleConnectionState.connected &&
                      !googleConnectionState.firstWriteWarningAcknowledged ? (
                        <label className="flex items-start gap-2 rounded-md border border-border bg-muted p-2 text-sm text-foreground">
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
                            after explicit user approval. If the write fails,
                            the local proposal stays unchanged.
                          </span>
                        </label>
                      ) : null}
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Local proposal: {proposal.status}
                        </span>
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
                      <div className="text-xs text-muted-foreground">
                        Google write: {googleWriteState}
                      </div>
                      {usesPersistedPlanning ? (
                        <div className="text-xs text-muted-foreground">
                          Approval gate: Nothing goes to Google Calendar until
                          you approve it.
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Approval gate: Not applicable in Demo mode (This
                          browser only).
                        </div>
                      )}
                      <Separator />
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-foreground">
                          Local planning actions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() =>
                              usesPersistedPlanning
                                ? void handleAcceptProposal(proposal.id)
                                : acceptLocalProposal(proposal.id)
                            }
                            disabled={
                              actionState.status === "saving" ||
                              proposal.status === "accepted"
                            }
                          >
                            Accept local block
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
                          <div className="rounded-md border border-border bg-muted/40 p-2">
                            <p className="text-xs text-muted-foreground">
                              Limited adjustments update this proposal directly.
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
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-foreground">
                          Google Calendar actions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void handleCheckConflict(proposal.id)
                            }
                            disabled={!checkConflictAllowed}
                          >
                            Check calendar conflicts
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
                              ? "Google event created"
                              : "Create Google Calendar event"}
                          </Button>
                        </div>
                        {!checkConflictAllowed ? (
                          <p className="text-xs text-muted-foreground">
                            Check calendar conflicts disabled:{" "}
                            {checkConflictDisabledReason}
                          </p>
                        ) : null}
                        {!createGoogleAllowed ? (
                          <p className="text-xs text-muted-foreground">
                            Create Google Calendar event disabled:{" "}
                            {createGoogleDisabledReason}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Nothing goes to Google Calendar until you approve it.
                        </p>
                      </div>
                      <Separator />
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-foreground">
                          Admin action
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() =>
                              usesPersistedPlanning
                                ? void handleRejectProposal(proposal.id)
                                : rejectLocalProposal(proposal.id)
                            }
                            disabled={
                              actionState.status === "saving" ||
                              proposal.status === "accepted" ||
                              proposal.status === "rejected"
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled
                        >
                          Primary next step: accept local block
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Scheduled blocks (local)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {blocks.length === 0 ? (
                <EmptyState
                  title="No scheduled blocks."
                  description="Blocks appear here after local proposal acceptance."
                />
              ) : (
                blocks.map((block) => {
                  const area = usesPersistedPlanning
                    ? null
                    : getAreaById(block.area_id);
                  const task = usesPersistedPlanning
                    ? scheduleableTasks.find(
                        (item) => item.id === block.task_id,
                      )
                    : state.tasks.find((item) => item.id === block.task_id);

                  return (
                    <div
                      key={block.id}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <div className="font-medium">
                        {task?.title ?? "Block without specific task"}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(block.start_at).toLocaleTimeString()} -{" "}
                        {new Date(block.end_at).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <div className="text-muted-foreground">
                          Area: {area.name}
                        </div>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        Status: {block.status}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <section className="mt-2 text-xs text-muted-foreground">
        <p>
          Time proposals stay local first. Free/busy checks are manual and
          advisory only. No Google Calendar events, OpenAI scheduling,
          autonomous rescheduling, or background calendar changes happen here.
        </p>
        <p className="mt-2">
          After you accept a local block, start focus from Execute and close the
          loop in Review when the session ends.
        </p>
      </section>
    </div>
  );
}
