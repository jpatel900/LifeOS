/** Aligned with DATA_MODEL.md — use these literals in Zod enums and guards. */

export const AREA_CAPTURE_MODES = ["text", "audio", "import"] as const;

export const CAPTURE_ITEM_STATUSES = [
  "new",
  "parsed",
  "triage_required",
  "resolved",
  "archived",
] as const;

export const PROJECT_STATUSES = [
  "active",
  "paused",
  "done",
  "dropped",
  "archived",
] as const;

export const TASK_STATUSES = [
  "draft",
  "active",
  "scheduled",
  "blocked",
  "done",
  "dropped",
  "archived",
] as const;

export const TIME_BLOCK_PROPOSAL_STATUSES = [
  "proposed",
  "edited",
  "accepted",
  "rejected",
  "superseded",
] as const;

export const CALENDAR_BLOCK_STATUSES = [
  "scheduled",
  "running",
  "completed",
  "missed",
  "cancelled",
] as const;

export const EXECUTION_SESSION_OUTCOMES = [
  "completed",
  "partial",
  "stopped",
  "distracted",
  "blocked",
  "skipped",
] as const;

export const REVIEW_TYPES = ["daily", "weekly"] as const;

export const HEALTH_CHECK_STATUSES = ["healthy", "watch", "critical"] as const;
