// WorkflowContext domain module — state core.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only — no logic/behavior changes). Holds every closure-free piece of
// the workflow state layer: the action type, session-storage validators, the
// pure reducer, persisted/local row merge helpers, and the policy-decision
// key helpers. None of this closes over WorkflowProvider's hooks/refs, so it
// is safe to import from anywhere.
import {
  Phase2AmbiguityAssessmentResponseSchema,
  Phase2CaptureItemSchema,
  Phase2ProjectDraftSchema,
  Phase2TaskDraftSchema,
  Phase2TimeBlockProposalDraftSchema,
  Phase2TimeBlockProposalSchema,
  type Area,
  type Phase2TaskDraft,
  type Phase2TimeBlockProposal,
  type SuggestionRecord,
} from "@lifeos/schemas";
import {
  acceptDraft,
  acceptProjectDraft,
  appendParsedWorkflowResult,
  acceptProposal,
  addWorkflowArea,
  backlogDraft,
  carryForwardTask,
  createLocalProposalFromTask,
  createInitialWorkflowState,
  deferTask,
  dropTask,
  editDraft,
  markCurrentSession,
  mergeDrafts,
  planTaskAtHour,
  promoteBacklogTask,
  rejectDraft,
  rejectPersonMention,
  rejectProjectDraft,
  rejectProposal,
  splitDraft,
  startExecutionSession,
  syncWorkflowIdCounterFromState,
  unplanTask,
  updateTaskFirstTinyStep,
  updateWorkflowAreaColor,
  updateProposal,
  saveReview,
  approveTaskMapLocal,
  toggleTaskMapNodeCompletionLocal,
  type WorkflowState,
} from "../workflow";
import type { TaskMapGraph } from "../taskmap/graph";
import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "../types";
import { persistedAreaIdForWorkflowAreaId } from "../workflowAreaMapping";
import type { ParsedWorkflowResult } from "../ai/parseCaptureWorkflow";

export const STORAGE_KEY = "lifeos.phase2.workflow";

export type WorkflowAction =
  | {
      type: "hydrate";
      state: WorkflowState;
    }
  | {
      type: "syncAreas";
      areas: WorkflowState["areas"];
    }
  | {
      type: "syncPersistedWorkflow";
      payload: PersistedWorkflowPayload;
    }
  | {
      type: "addArea";
      name: string;
      color: string;
    }
  | {
      type: "updateAreaColor";
      areaId: string;
      color: string;
    }
  | {
      type: "appendParsedWorkflowResult";
      parsed: ParsedWorkflowResult;
    }
  | {
      type: "acceptDraft";
      draftId: string;
    }
  | {
      type: "backlogDraft";
      draftId: string;
    }
  | {
      type: "promoteBacklogTask";
      taskId: string;
    }
  | {
      type: "acceptProjectDraft";
      draftId: string;
    }
  | {
      type: "rejectDraft";
      draftId: string;
    }
  | {
      type: "rejectProjectDraft";
      draftId: string;
    }
  | {
      type: "editDraft";
      draftId: string;
      changes: Partial<
        Pick<
          Phase2TaskDraft,
          "title" | "description" | "area_id" | "first_tiny_step"
        >
      >;
    }
  | {
      type: "rejectPersonMention";
      draftId: string;
      mentionIndex: number;
    }
  | {
      type: "splitDraft";
      draftId: string;
      titles: [string, string];
    }
  | {
      type: "mergeDrafts";
      primaryDraftId: string;
      secondaryDraftId: string;
    }
  | {
      type: "acceptProposal";
      proposalId: string;
    }
  | {
      type: "rejectProposal";
      proposalId: string;
    }
  | {
      type: "updateProposal";
      proposalId: string;
      changes: Pick<
        Phase2TimeBlockProposal,
        "proposed_start" | "proposed_end" | "rationale"
      >;
    }
  | {
      type: "createProposalFromTask";
      taskId: string;
      proposedStart: string;
      proposedEnd: string;
      rationale: string;
    }
  | {
      type: "planTaskAtHour";
      taskId: string;
      hour: number;
    }
  | {
      type: "updateTaskFirstTinyStep";
      taskId: string;
      firstTinyStep: string;
    }
  | {
      type: "approveTaskMapLocal";
      taskId: string;
      graph: TaskMapGraph & { schema_version: string };
    }
  | {
      type: "toggleTaskMapNodeCompletionLocal";
      taskId: string;
      nodeId: string;
      nowIso: string;
    }
  | {
      type: "unplanTask";
      blockId: string;
    }
  | {
      type: "startSession";
      taskId: string;
    }
  | {
      type: "markSession";
      status: Phase2MockExecutionSession["status"];
      actualMinutes?: number;
      notes?: string | null;
      capOutcome?: Phase2MockExecutionSession["cap_outcome"];
    }
  | {
      type: "carryForwardTask";
      taskId: string;
    }
  | {
      type: "deferTask";
      taskId: string;
    }
  | {
      type: "dropTask";
      taskId: string;
    }
  | {
      type: "saveReview";
    }
  | {
      type: "reset";
    };

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasServerCapabilityMissingSignal(error: unknown): boolean {
  if (!isRecordValue(error)) {
    return false;
  }

  const code = error.code;
  if (code === "PGRST202" || code === "42883" || code === "42703") {
    return true;
  }

  const status = error.status;
  if (status === 404) {
    return true;
  }

  const message = error.message;
  return (
    typeof message === "string" &&
    (message.includes("PGRST202") ||
      message.includes("42883") ||
      message.includes("42703") ||
      message.includes("function") ||
      message.includes("column"))
  );
}

export const persistedLoadFailureMessage =
  "Saved workspace data could not load; local workflow remains usable, but saved account data may be missing from view.";
export const persistedSaveFailureMessage =
  "Change saved locally, but account sync failed; it will stay local until sync recovers.";
export const serverCapabilityMissingMessage =
  "Account sync needs a server update; the app and database look out of step. Check Health for the next step.";

export function persistedSyncFailureMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  return hasServerCapabilityMissingSignal(error)
    ? serverCapabilityMissingMessage
    : fallbackMessage;
}

export interface PersistedWorkflowPayload {
  captures: WorkflowState["captureItems"];
  tasks: WorkflowState["tasks"];
  proposals: WorkflowState["timeBlockProposals"];
  blocks: WorkflowState["calendarBlocks"];
  sessions: WorkflowState["executionSessions"];
  reviewLog: string[];
  dropLocalIds: {
    captures: Set<string>;
    tasks: Set<string>;
    proposals: Set<string>;
    blocks: Set<string>;
    sessions: Set<string>;
  };
}

export function createSyncedInitialState() {
  const initial = createInitialWorkflowState();
  syncWorkflowIdCounterFromState(initial);
  return initial;
}

export function isUuid(value: string | null | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

// Placeholder user id for an optimistically-constructed local duration profile;
// the real row's user_id is set server-side from auth (never sent from the
// client), so this value is never persisted.
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function mergePersistedRows<T extends { id: string }>(
  persistedRows: T[],
  localRows: T[],
  dropLocalIds: Set<string>,
) {
  const persistedIds = new Set(persistedRows.map((row) => row.id));
  return [
    ...persistedRows,
    ...localRows.filter(
      (row) =>
        !persistedIds.has(row.id) &&
        !dropLocalIds.has(row.id) &&
        !isUuid(row.id),
    ),
  ];
}

/**
 * A local (optimistic) calendar block and its freshly persisted counterpart
 * briefly coexist: the local id map only catches up after the next sync
 * round-trip. Without this, the Today "Scheduled" band and Plan hour rail
 * double-count the same block for one request/response window.
 *
 * This drops a LOCAL block (non-UUID id) once a persisted row for the same
 * task_id arrives at the same start_at. It never dedups two persisted rows —
 * the DB is the source of truth and legitimate multiple blocks per task stay
 * allowed (see docs/KNOWN_ISSUES.md row 12 / issue #324).
 */
export function mergePersistedCalendarBlocks(
  persistedRows: Phase2MockCalendarBlock[],
  localRows: Phase2MockCalendarBlock[],
  dropLocalIds: Set<string>,
): Phase2MockCalendarBlock[] {
  const persistedIds = new Set(persistedRows.map((row) => row.id));
  const isEchoOfPersisted = (localRow: Phase2MockCalendarBlock) =>
    persistedRows.some(
      (persistedRow) =>
        persistedRow.task_id !== null &&
        persistedRow.task_id === localRow.task_id &&
        new Date(persistedRow.start_at).getTime() ===
          new Date(localRow.start_at).getTime(),
    );

  return [
    ...persistedRows,
    ...localRows.filter(
      (row) =>
        !persistedIds.has(row.id) &&
        !dropLocalIds.has(row.id) &&
        !isUuid(row.id) &&
        !isEchoOfPersisted(row),
    ),
  ];
}

export function persistedIdForLocalId(
  id: string,
  idMap: Map<string, string>,
): string | null {
  if (isUuid(id)) return id;
  return idMap.get(id) ?? null;
}

const TASK_STATUSES = new Set([
  "draft",
  "active",
  "backlog",
  "scheduled",
  "blocked",
  "done",
  "dropped",
  "archived",
]);
const PROJECT_STATUSES = new Set([
  "active",
  "paused",
  "done",
  "dropped",
  "archived",
]);
const CALENDAR_BLOCK_STATUSES = new Set([
  "scheduled",
  "running",
  "completed",
  "missed",
  "cancelled",
]);
const EXECUTION_SESSION_STATUSES = new Set([
  "running",
  "paused",
  "completed",
  "missed",
  "distracted",
  "stuck",
  "stopped",
]);
const EXECUTION_OUTCOMES = new Set([
  "completed",
  "partial",
  "stopped",
  "distracted",
  "blocked",
  "skipped",
]);
const HEALTH_SUBSYSTEMS = new Set([
  "auth",
  "database",
  "ai_parsing",
  "calendar_connector",
  "scheduler",
  "priority_model",
  "duration_model",
  "time_preferences",
]);
const HEALTH_STATUSES = new Set(["healthy", "watch", "critical"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isOptionalNullableNumber(
  value: unknown,
): value is number | null | undefined {
  return value === undefined || isNullableNumber(value);
}

function isOneOf(value: unknown, allowed: Set<string>) {
  return isString(value) && allowed.has(value);
}

function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function isPhase2MockArea(
  value: unknown,
): value is WorkflowState["areas"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.user_id) &&
    isString(value.name) &&
    isString(value.color) &&
    isString(value.created_at)
  );
}

function isPhase2MockTask(
  value: unknown,
): value is WorkflowState["tasks"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.user_id) &&
    isString(value.area_id) &&
    isNullableString(value.project_id) &&
    isNullableString(value.source_capture_item_id) &&
    isString(value.title) &&
    isNullableString(value.description) &&
    isOneOf(value.status, TASK_STATUSES) &&
    isNullableNumber(value.priority_score) &&
    isNullableNumber(value.priority_confidence) &&
    isNullableString(value.task_type) &&
    (value.is_reversible === undefined ||
      value.is_reversible === null ||
      typeof value.is_reversible === "boolean") &&
    isNullableString(value.energy_type) &&
    isNullableNumber(value.estimated_minutes_low) &&
    isNullableNumber(value.estimated_minutes_high) &&
    isNullableString(value.due_at) &&
    isNullableString(value.definition_of_done) &&
    isNullableString(value.first_tiny_step) &&
    isString(value.created_at) &&
    isString(value.updated_at)
  );
}

function isPhase2MockProject(
  value: unknown,
): value is WorkflowState["projects"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.user_id) &&
    isString(value.area_id) &&
    isString(value.title) &&
    isNullableString(value.description) &&
    isOneOf(value.status, PROJECT_STATUSES) &&
    isString(value.created_at) &&
    isString(value.updated_at)
  );
}

function isPhase2MockCalendarBlock(
  value: unknown,
): value is WorkflowState["calendarBlocks"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.user_id) &&
    isString(value.area_id) &&
    isNullableString(value.proposal_id) &&
    isNullableString(value.task_id) &&
    isNullableString(value.google_event_id) &&
    isString(value.start_at) &&
    isString(value.end_at) &&
    isOneOf(value.status, CALENDAR_BLOCK_STATUSES) &&
    isString(value.created_at) &&
    isString(value.updated_at)
  );
}

function isPhase2MockExecutionSession(
  value: unknown,
): value is WorkflowState["executionSessions"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.user_id) &&
    isString(value.area_id) &&
    isNullableString(value.task_id) &&
    isNullableString(value.calendar_block_id) &&
    isNullableNumber(value.planned_minutes) &&
    isNullableNumber(value.actual_minutes) &&
    isOptionalNullableNumber(value.paused_minutes) &&
    isOptionalNullableNumber(value.distraction_minutes) &&
    isOptionalNullableNumber(value.productivity_rating) &&
    isOneOf(value.status, EXECUTION_SESSION_STATUSES) &&
    isOneOf(value.outcome, EXECUTION_OUTCOMES) &&
    (value.notes === undefined || isNullableString(value.notes))
  );
}

function isPhase2MockHealthCheck(
  value: unknown,
): value is WorkflowState["healthChecks"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOneOf(value.subsystem, HEALTH_SUBSYSTEMS) &&
    isOneOf(value.status, HEALTH_STATUSES) &&
    typeof value.score === "number" &&
    isString(value.summary)
  );
}

function isStoredWorkflowState(value: unknown): value is WorkflowState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<Record<keyof WorkflowState, unknown>>;
  return (
    isArrayOf(state.areas, isPhase2MockArea) &&
    isArrayOf(
      state.captureItems,
      (item): item is WorkflowState["captureItems"][number] =>
        Phase2CaptureItemSchema.safeParse(item).success,
    ) &&
    isArrayOf(
      state.taskDrafts,
      (item): item is WorkflowState["taskDrafts"][number] =>
        Phase2TaskDraftSchema.safeParse(item).success,
    ) &&
    isArrayOf(
      state.projectDrafts,
      (item): item is WorkflowState["projectDrafts"][number] =>
        Phase2ProjectDraftSchema.safeParse(item).success,
    ) &&
    isArrayOf(
      state.ambiguityAssessments,
      (item): item is WorkflowState["ambiguityAssessments"][number] =>
        Phase2AmbiguityAssessmentResponseSchema.safeParse(item).success,
    ) &&
    isArrayOf(
      state.timeBlockProposalDrafts,
      (item): item is WorkflowState["timeBlockProposalDrafts"][number] =>
        Phase2TimeBlockProposalDraftSchema.safeParse(item).success,
    ) &&
    isArrayOf(state.projects, isPhase2MockProject) &&
    isArrayOf(state.tasks, isPhase2MockTask) &&
    isArrayOf(
      state.timeBlockProposals,
      (item): item is WorkflowState["timeBlockProposals"][number] =>
        Phase2TimeBlockProposalSchema.safeParse(item).success,
    ) &&
    isArrayOf(state.calendarBlocks, isPhase2MockCalendarBlock) &&
    isArrayOf(state.executionSessions, isPhase2MockExecutionSession) &&
    isArrayOf(state.healthChecks, isPhase2MockHealthCheck) &&
    isArrayOf(state.reviewLog, isString) &&
    (state.wipRefusal === null ||
      state.wipRefusal === undefined ||
      isRecord(state.wipRefusal))
  );
}

function normalizeStoredWorkflowState(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    projectDrafts: value.projectDrafts ?? [],
    projects: value.projects ?? [],
    wipRefusal: value.wipRefusal ?? null,
  };
}

export function workflowReducer(
  state: WorkflowState,
  action: WorkflowAction,
): WorkflowState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "syncAreas":
      return {
        ...state,
        areas: action.areas,
      };
    case "syncPersistedWorkflow":
      return {
        ...state,
        captureItems: mergePersistedRows(
          action.payload.captures,
          state.captureItems,
          action.payload.dropLocalIds.captures,
        ),
        tasks: mergePersistedRows(
          action.payload.tasks,
          state.tasks,
          action.payload.dropLocalIds.tasks,
        ),
        timeBlockProposals: mergePersistedRows(
          action.payload.proposals,
          state.timeBlockProposals,
          action.payload.dropLocalIds.proposals,
        ),
        calendarBlocks: mergePersistedCalendarBlocks(
          action.payload.blocks,
          state.calendarBlocks,
          action.payload.dropLocalIds.blocks,
        ),
        executionSessions: mergePersistedRows(
          action.payload.sessions,
          state.executionSessions,
          action.payload.dropLocalIds.sessions,
        ),
        reviewLog: [
          ...action.payload.reviewLog,
          ...state.reviewLog.filter(
            (line) => !action.payload.reviewLog.includes(line),
          ),
        ],
      };
    case "addArea":
      return addWorkflowArea(state, { name: action.name, color: action.color });
    case "updateAreaColor":
      return updateWorkflowAreaColor(state, action.areaId, action.color);
    case "appendParsedWorkflowResult":
      return appendParsedWorkflowResult(state, action.parsed);
    case "acceptDraft":
      return acceptDraft(state, action.draftId);
    case "backlogDraft":
      return backlogDraft(state, action.draftId);
    case "promoteBacklogTask":
      return promoteBacklogTask(state, action.taskId);
    case "acceptProjectDraft":
      return acceptProjectDraft(state, action.draftId);
    case "rejectDraft":
      return rejectDraft(state, action.draftId);
    case "rejectProjectDraft":
      return rejectProjectDraft(state, action.draftId);
    case "editDraft":
      return editDraft(state, action.draftId, action.changes);
    case "rejectPersonMention":
      return rejectPersonMention(state, action.draftId, action.mentionIndex);
    case "splitDraft":
      return splitDraft(state, action.draftId, action.titles);
    case "mergeDrafts":
      return mergeDrafts(state, action.primaryDraftId, action.secondaryDraftId);
    case "acceptProposal":
      return acceptProposal(state, action.proposalId);
    case "rejectProposal":
      return rejectProposal(state, action.proposalId);
    case "updateProposal":
      return updateProposal(state, action.proposalId, action.changes);
    case "createProposalFromTask":
      return createLocalProposalFromTask(state, action.taskId, {
        proposed_start: action.proposedStart,
        proposed_end: action.proposedEnd,
        rationale: action.rationale,
      });
    case "planTaskAtHour":
      return planTaskAtHour(state, action.taskId, action.hour);
    case "updateTaskFirstTinyStep":
      return updateTaskFirstTinyStep(
        state,
        action.taskId,
        action.firstTinyStep,
      );
    case "approveTaskMapLocal":
      return approveTaskMapLocal(state, action.taskId, action.graph);
    case "toggleTaskMapNodeCompletionLocal":
      return toggleTaskMapNodeCompletionLocal(
        state,
        action.taskId,
        action.nodeId,
        action.nowIso,
      );
    case "unplanTask":
      return unplanTask(state, action.blockId);
    case "startSession":
      return startExecutionSession(state, action.taskId);
    case "markSession":
      return markCurrentSession(state, action.status, {
        actualMinutes: action.actualMinutes,
        notes: action.notes,
        capOutcome: action.capOutcome,
      });
    case "carryForwardTask":
      return carryForwardTask(state, action.taskId);
    case "deferTask":
      return deferTask(state, action.taskId);
    case "dropTask":
      return dropTask(state, action.taskId);
    case "saveReview":
      return saveReview(state);
    case "reset":
      return createSyncedInitialState();
    default:
      return state;
  }
}

export function loadStoredStateFromSession(): {
  state: WorkflowState | null;
  storageBlocked: boolean;
} {
  if (typeof window === "undefined") {
    return { state: null, storageBlocked: false };
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { state: null, storageBlocked: false };
    }

    const parsed = normalizeStoredWorkflowState(JSON.parse(stored));
    if (!isStoredWorkflowState(parsed)) {
      return { state: null, storageBlocked: false };
    }

    syncWorkflowIdCounterFromState(parsed);
    return { state: parsed, storageBlocked: false };
  } catch {
    return { state: null, storageBlocked: true };
  }
}

// E2 (#261 follow-up): the stable (policy, area) key for a policy-change
// proposal. Module-level so the persisted-decision seeding (in the load effect)
// and the in-render policyProposalKey share ONE format — they must match or a
// decided proposal would not stay suppressed across reloads.
export function policyDecisionKey(
  policyIdentifier: string,
  areaId: string | null,
): string {
  return `${policyIdentifier}::${areaId ?? ""}`;
}

// E2 (#261 follow-up): the (policy, area) keys the user has already decided,
// derived from persisted `policy_change` suggestion_records. Every such record
// IS a recorded decision (proposals are computed from override_records, never
// persisted), so filtering by suggestion_type alone captures all decisions.
export function decidedPolicyKeysFromSuggestionRecords(
  records: SuggestionRecord[],
): string[] {
  return records
    .filter((record) => record.suggestion_type === "policy_change")
    .map((record) =>
      policyDecisionKey(record.policy_identifier, record.area_id),
    );
}

export function persistedAreaIdForWorkflowId(
  workflowAreaId: string,
  persistedAreas: Area[],
) {
  return persistedAreaIdForWorkflowAreaId(workflowAreaId, persistedAreas);
}

// Re-exported so consumers that only need the mock task/proposal types for
// action payloads don't need a second import path.
export type {
  Phase2MockTask,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
};
