import type {
  Area,
  CalendarBlock,
  CaptureItem,
  ExecutionSession,
  ReviewEntry,
  Task,
  TimeBlockProposal as PersistedTimeBlockProposal,
  Phase2TimeBlockProposal,
} from "@lifeos/schemas";
import { Phase2TimeBlockProposalSchema } from "@lifeos/schemas";
import { workflowAreaIdForPersistedArea } from "../workflowAreaMapping";
import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "../types";
import type { WorkflowState } from "../workflow";

/**
 * Pure persisted-row -> workflow-shape normalization, extracted from
 * `WorkflowContext.tsx` (issue #515) so a server-side reader (the Telegram
 * brief route's owner-scoped loader) can rebuild the exact same
 * `WorkflowState` shape the browser client builds from
 * `syncPersistedWorkflowRows`, without re-deriving the mapping rules. Pure
 * extraction: no behavior change, no new logic — these are the same
 * functions, same bodies, just relocated so both call sites can import them.
 */

export function workflowAreaIdForPersistedAreaId(
  persistedAreaId: string | null,
  persistedAreas: Area[],
) {
  if (!persistedAreaId) return null;
  const area = persistedAreas.find((item) => item.id === persistedAreaId);
  return area ? workflowAreaIdForPersistedArea(area) : persistedAreaId;
}

function rationaleTextFromJson(
  value: PersistedTimeBlockProposal["rationale_json"],
) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "note" in value &&
    typeof value.note === "string" &&
    value.note.trim()
  ) {
    return value.note;
  }
  return "Local planning proposal created from persisted row.";
}

function sessionStatusFromOutcome(
  session: ExecutionSession,
): Phase2MockExecutionSession["status"] {
  if (session.outcome === "completed") return "completed";
  if (session.outcome === "skipped") return "missed";
  if (session.outcome === "distracted") return "distracted";
  if (session.outcome === "blocked") return "stuck";
  if (session.outcome === "stopped") return "stopped";
  return session.actual_minutes === null ? "running" : "paused";
}

export function toWorkflowCapture(
  capture: CaptureItem,
  persistedAreas: Area[],
): WorkflowState["captureItems"][number] {
  return {
    id: capture.id,
    user_id: capture.user_id,
    area_id: workflowAreaIdForPersistedAreaId(capture.area_id, persistedAreas),
    raw_text: capture.raw_text,
    return_hook: capture.return_hook ?? null,
    capture_mode: "text",
    inferred_area_confidence: capture.inferred_area_confidence,
    status: capture.status,
    created_at: capture.created_at,
  };
}

export function toWorkflowTask(
  task: Task,
  persistedAreas: Area[],
): Phase2MockTask {
  return {
    ...task,
    area_id:
      workflowAreaIdForPersistedAreaId(task.area_id, persistedAreas) ??
      task.area_id,
  };
}

export function toWorkflowProposal(
  proposal: PersistedTimeBlockProposal,
  persistedAreas: Area[],
): Phase2TimeBlockProposal | null {
  if (!proposal.task_id || proposal.status === "superseded") {
    return null;
  }

  return Phase2TimeBlockProposalSchema.parse({
    id: proposal.id,
    user_id: proposal.user_id,
    area_id:
      workflowAreaIdForPersistedAreaId(proposal.area_id, persistedAreas) ??
      proposal.area_id,
    task_id: proposal.task_id,
    proposed_start: proposal.proposed_start,
    proposed_end: proposal.proposed_end,
    rationale: rationaleTextFromJson(proposal.rationale_json),
    conflict_flag: proposal.conflict_flag,
    status: proposal.status,
    created_at: proposal.created_at,
  });
}

export function toWorkflowBlock(
  block: CalendarBlock,
  persistedAreas: Area[],
): Phase2MockCalendarBlock {
  return {
    ...block,
    area_id:
      workflowAreaIdForPersistedAreaId(block.area_id, persistedAreas) ??
      block.area_id,
  };
}

export function toWorkflowSession(
  session: ExecutionSession,
  persistedAreas: Area[],
): Phase2MockExecutionSession {
  return {
    id: session.id,
    user_id: session.user_id,
    area_id:
      workflowAreaIdForPersistedAreaId(session.area_id, persistedAreas) ??
      session.area_id,
    task_id: session.task_id,
    calendar_block_id: session.calendar_block_id,
    planned_minutes: session.planned_minutes,
    actual_minutes: session.actual_minutes,
    paused_minutes: session.paused_minutes,
    distraction_minutes: session.distraction_minutes,
    productivity_rating: session.productivity_rating,
    status: sessionStatusFromOutcome(session),
    outcome: session.outcome,
    cap_outcome: session.cap_outcome ?? null,
    notes: session.notes,
  };
}

export function reviewEntryLine(entry: ReviewEntry) {
  const summary =
    entry.summary_json &&
    typeof entry.summary_json === "object" &&
    !Array.isArray(entry.summary_json) &&
    "verdict" in entry.summary_json &&
    typeof entry.summary_json.verdict === "string"
      ? entry.summary_json.verdict
      : "Saved review";
  return `${entry.review_type} review: ${summary}`;
}
