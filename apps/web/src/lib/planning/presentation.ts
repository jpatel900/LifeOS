import type { Task, TimeBlockProposal } from "@lifeos/schemas";
import type { DataProvider } from "@/lib/data/workflow";
import { savedViaLabel } from "@/lib/statusVocabulary";

export function nextLocalSlot(task: Task) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const minutes =
    task.estimated_minutes_high ?? task.estimated_minutes_low ?? 45;
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  return {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
  };
}

export const QUICK_PROPOSAL_RATIONALE =
  "Quick proposal: next available hour. You can adjust this before approving.";

export type ProposalAdjustment = "move_later" | "shorten" | "extend";

export function adjustmentLabel(adjustment: ProposalAdjustment) {
  switch (adjustment) {
    case "move_later":
      return "moved 30 minutes later";
    case "shorten":
      return "shortened";
    case "extend":
      return "extended";
  }
}

export function adjustedProposalTimes(
  proposal: Pick<TimeBlockProposal, "proposed_start" | "proposed_end">,
  adjustment: ProposalAdjustment,
) {
  const start = new Date(proposal.proposed_start);
  const end = new Date(proposal.proposed_end);
  const currentDurationMs = Math.max(end.getTime() - start.getTime(), 0);
  const fiveMinutesMs = 5 * 60 * 1000;

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

export function proposalRationale(
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

export function proposalHasConflictCheck(proposal: TimeBlockProposal) {
  const details = proposal.conflict_details_json;
  return Boolean(
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    typeof (details as Record<string, unknown>).checked_at === "string",
  );
}

export function proposalConflictSummary(proposal: TimeBlockProposal) {
  const hasCheckedConflict = proposalHasConflictCheck(proposal);

  if (proposal.conflict_flag) {
    return {
      label: "Calendar conflict found",
      variant: "destructive" as const,
      className: "",
    };
  }

  if (hasCheckedConflict) {
    return {
      label: "Calendar looks open",
      variant: "outline" as const,
      className: "border-border bg-muted text-primary",
    };
  }

  return {
    label: "Calendar not checked",
    variant: "secondary" as const,
    className: "",
  };
}

export type CalendarActionKind =
  | "proposal_mutation"
  | "conflict_check"
  | "google_write";

export function normalizeCalendarFailure(
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
      message: "This action requires you to sign in.",
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
        "This suggested time already has a linked Google Calendar event.",
      nextStep:
        "Use the existing planned block or create a new suggested time instead.",
    };
  }

  if (action === "conflict_check") {
    return {
      title: "Calendar conflict check failed",
      message:
        "LifeOS could not confirm Google Calendar availability for this proposal.",
      nextStep:
        "Keep this suggested time, review connection status, and retry Check calendar availability.",
    };
  }

  if (action === "google_write") {
    return {
      title: "Google Calendar write failed",
      message: "No Google Calendar event was confirmed for this action.",
      nextStep:
        "Your suggested time is unchanged. Review connection and approval state, then retry.",
    };
  }

  return {
    title: "Planning change was not saved",
    message: "LifeOS could not confirm this local planning update.",
    nextStep: "Review state and retry.",
  };
}

export interface PlanningSavedAction {
  label: string;
  provider: DataProvider;
}

export function planningSuccessFeedback(actionState: PlanningSavedAction) {
  const savedWhere = savedViaLabel(actionState.provider);

  if (actionState.label === "Suggested time block created") {
    return {
      title: "Suggested time ready",
      description: `Suggested time block created. It was ${savedWhere}. Review it below, then plan it or adjust it.`,
      primaryLink: null,
    };
  }

  if (actionState.label.startsWith("Suggested time block ")) {
    return {
      title: "Suggested time updated",
      description: `${actionState.label}. It was ${savedWhere}. Review the updated time below before you plan it.`,
      primaryLink: null,
    };
  }

  if (actionState.label === "Suggested time removed") {
    return {
      title: "Suggested time removed",
      description: `Suggested time removed. It was ${savedWhere}. Pick another task that still needs time.`,
      primaryLink: null,
    };
  }

  if (actionState.label === "Planned block created") {
    return {
      title: "Planned block ready",
      description: `Planned block created. It was ${savedWhere}. Open Execute next when you are ready to focus.`,
      primaryLink: {
        href: "/execute",
        label: "Open Execute",
      },
    };
  }

  if (actionState.label === "Calendar availability checked") {
    return {
      title: "Calendar checked",
      description: `Calendar availability checked. It was ${savedWhere}. Review the conflict badge on this suggested time before you plan it.`,
      primaryLink: null,
    };
  }

  if (actionState.label === "Google Calendar event created") {
    return {
      title: "Google event created",
      description: `Google Calendar event created. It was ${savedWhere}. The planned block stays here and now has a linked Google Calendar event.`,
      primaryLink: {
        href: "/execute",
        label: "Open Execute",
      },
    };
  }

  return {
    title: "Planning updated",
    description: `${actionState.label}. It was ${savedWhere}. Review the updated planning state below.`,
    primaryLink: null,
  };
}

export function planningPendingFeedback(actionState: { label: string }) {
  if (actionState.label === "calendar conflict check") {
    return {
      title: "Checking calendar availability",
      description:
        "The suggested time stays local while LifeOS checks Google Calendar availability.",
    };
  }

  if (actionState.label === "Google Calendar event") {
    return {
      title: "Creating Google Calendar event",
      description:
        "The suggested time stays unchanged until Google confirms the event.",
    };
  }

  if (actionState.label === "planned block") {
    return {
      title: "Creating planned block",
      description:
        "LifeOS is moving this suggested time into your planned blocks now.",
    };
  }

  return {
    title: "Updating planning",
    description:
      "Keep this view open while LifeOS saves the latest planning change.",
  };
}
