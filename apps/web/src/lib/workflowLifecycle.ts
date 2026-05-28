import type {
  CalendarBlock,
  CaptureItem,
  TimeBlockProposal,
  Task,
} from "@lifeos/schemas";

export type LifecycleVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive";

export type SessionUiState =
  | "not_started"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "stuck"
  | "distracted"
  | "missed";

export type LifecycleDisplay = {
  label: string;
  variant: LifecycleVariant;
  detail?: string;
};

export function captureLifecycleDisplay(
  status: CaptureItem["status"],
): LifecycleDisplay {
  switch (status) {
    case "new":
      return {
        label: "Captured",
        variant: "outline",
        detail: "Saved, but not organized yet.",
      };
    case "parsed":
      return {
        label: "Needs decision",
        variant: "warning",
        detail: "Suggestions were created from this capture.",
      };
    case "triage_required":
      return {
        label: "Needs decision",
        variant: "warning",
        detail: "Review the drafts in Triage before accepting them.",
      };
    case "resolved":
      return {
        label: "Reviewed",
        variant: "success",
        detail: "This capture already led to a reviewed decision.",
      };
    case "archived":
      return {
        label: "Archived",
        variant: "secondary",
        detail: "This capture was archived from the active flow.",
      };
  }
}

export function triageLifecycleDisplay(): LifecycleDisplay {
  return {
    label: "Needs decision",
    variant: "warning",
  };
}

export function planningTaskLifecycleDisplay(
  status: Task["status"],
): LifecycleDisplay {
  switch (status) {
    case "active":
      return { label: "Accepted", variant: "secondary" };
    case "scheduled":
      return { label: "Planned", variant: "outline" };
    case "done":
      return { label: "Completed", variant: "success" };
    case "blocked":
      return { label: "Needs review", variant: "warning" };
    case "dropped":
      return { label: "Dropped", variant: "secondary" };
    case "archived":
      return { label: "Archived", variant: "secondary" };
    case "draft":
      return { label: "Needs decision", variant: "warning" };
  }
}

export function proposalLifecycleDisplay(
  status: TimeBlockProposal["status"],
): LifecycleDisplay {
  switch (status) {
    case "proposed":
    case "edited":
      return { label: "Suggested time", variant: "outline" };
    case "accepted":
      return { label: "Planned", variant: "secondary" };
    case "rejected":
      return { label: "Rejected", variant: "secondary" };
    case "superseded":
      return { label: "Replaced", variant: "secondary" };
  }
}

export function blockLifecycleDisplay(
  status: CalendarBlock["status"],
): LifecycleDisplay {
  switch (status) {
    case "scheduled":
      return { label: "Planned", variant: "secondary" };
    case "running":
      return { label: "In focus", variant: "default" };
    case "completed":
      return { label: "Completed", variant: "success" };
    case "missed":
      return { label: "Needs review", variant: "warning" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
  }
}

export function executeLifecycleDisplay(input: {
  uiState: SessionUiState;
  hasPlannedBlock: boolean;
}): LifecycleDisplay {
  switch (input.uiState) {
    case "not_started":
      return {
        label: input.hasPlannedBlock ? "Planned" : "Accepted",
        variant: input.hasPlannedBlock ? "secondary" : "outline",
      };
    case "running":
      return { label: "In focus", variant: "default" };
    case "paused":
      return { label: "Paused", variant: "outline" };
    case "completed":
      return { label: "Completed", variant: "success" };
    case "stopped":
    case "stuck":
    case "distracted":
    case "missed":
      return { label: "Needs review", variant: "warning" };
  }
}

export function reviewGroupLifecycleDisplay(
  kind: "captured" | "planned" | "completed" | "follow_up" | "carry_forward",
): LifecycleDisplay {
  switch (kind) {
    case "captured":
      return { label: "Captured", variant: "outline" };
    case "planned":
      return { label: "Planned", variant: "secondary" };
    case "completed":
      return { label: "Completed", variant: "success" };
    case "follow_up":
      return { label: "Needs review", variant: "warning" };
    case "carry_forward":
      return { label: "Accepted", variant: "secondary" };
  }
}

export function reviewedLifecycleDisplay(): LifecycleDisplay {
  return { label: "Reviewed", variant: "success" };
}
