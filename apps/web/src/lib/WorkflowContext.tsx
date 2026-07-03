"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Phase2AmbiguityAssessmentResponseSchema,
  Phase2CaptureItemSchema,
  Phase2ProjectDraftSchema,
  Phase2TaskDraftSchema,
  Phase2TimeBlockProposalDraftSchema,
  ParseCaptureResponseSchema,
  Phase2TimeBlockProposalSchema,
  type Area,
  type CalendarBlock,
  type CaptureItem,
  type ExecutionSession,
  type Phase2TaskDraft,
  type Phase2TimeBlockProposal,
  type ReviewEntry,
  type Task,
  type TimeBlockProposal as PersistedTimeBlockProposal,
} from "@lifeos/schemas";
import {
  acceptDraft,
  acceptProjectDraft,
  appendParsedWorkflowResult,
  appendRawCapture,
  acceptProposal,
  addWorkflowArea,
  backlogDraft,
  carryForwardTask,
  createLocalProposalFromTask,
  createInitialWorkflowState,
  createRawCaptureItem,
  deferTask,
  dropTask,
  editDraft,
  markCurrentSession,
  mergeDrafts,
  planTaskAtHour,
  promoteBacklogTask,
  rejectDraft,
  rejectProjectDraft,
  rejectProposal,
  splitDraft,
  startExecutionSession,
  submitCapture,
  syncWorkflowIdCounterFromState,
  unplanTask,
  updateWorkflowAreaColor,
  updateProposal,
  saveReview,
  type WorkflowState,
} from "./workflow";
import {
  acceptTimeBlockProposal,
  applyTaskReviewTransition,
  createCaptureItem,
  createExecutionSession,
  createReviewEntry,
  createTask,
  createTimeBlockProposal,
  editTimeBlockProposal,
  listAreas,
  listCaptureItems,
  listExecutionReviewItems,
  listPlanningItems,
  markExecutionSession,
  rejectTimeBlockProposal,
  unplanCalendarBlock,
  type MinimalSupabaseClient,
  type ReviewTaskTargetStatus,
} from "./data/workflow";
import { createSupabaseBrowserClient } from "./supabase/browser";
import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "./types";
import {
  buildParsedWorkflowResult,
  type ParsedWorkflowResult,
} from "./ai/parseCaptureWorkflow";
import {
  persistedAreaIdForWorkflowAreaId,
  workflowAreaIdForPersistedArea,
} from "./workflowAreaMapping";

const STORAGE_KEY = "lifeos.phase2.workflow";

type WorkflowAction =
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
      type: "submitCapture";
      rawText: string;
      areaId: string | null;
    }
  | {
      type: "appendRawCapture";
      capture: WorkflowState["captureItems"][number];
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

interface WorkflowContextValue {
  state: WorkflowState;
  selectedAreaId: string | null;
  setSelectedAreaId: (areaId: string | null) => void;
  syncStatus: WorkflowSyncStatus;
  syncPersistedAreas: (areas: Area[]) => void;
  addArea: (name: string, color: string) => void;
  updateAreaColor: (areaId: string, color: string) => void;
  submitCaptureText: (rawText: string, areaId: string | null) => void;
  addParsedWorkflowResult: (parsed: ParsedWorkflowResult) => void;
  acceptTaskDraft: (draftId: string) => void;
  backlogTaskDraft: (draftId: string) => void;
  promoteBacklogTask: (taskId: string) => void;
  acceptProjectDraft: (draftId: string) => void;
  rejectTaskDraft: (draftId: string) => void;
  rejectProjectDraft: (draftId: string) => void;
  editTaskDraft: (
    draftId: string,
    changes: Partial<
      Pick<
        Phase2TaskDraft,
        "title" | "description" | "area_id" | "first_tiny_step"
      >
    >,
  ) => void;
  splitTaskDraft: (draftId: string, titles: [string, string]) => void;
  mergeTaskDrafts: (primaryDraftId: string, secondaryDraftId: string) => void;
  acceptLocalProposal: (proposalId: string) => void;
  rejectLocalProposal: (proposalId: string) => void;
  editLocalProposal: (
    proposalId: string,
    changes: Pick<
      Phase2TimeBlockProposal,
      "proposed_start" | "proposed_end" | "rationale"
    >,
  ) => void;
  createLocalProposalForTask: (input: {
    taskId: string;
    proposedStart: string;
    proposedEnd: string;
    rationale: string;
  }) => void;
  planTaskAtHour: (taskId: string, hour: number) => void;
  unplanTask: (blockId: string) => void;
  startTaskSession: (taskId: string) => void;
  markSession: (
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
  ) => void;
  carryForwardTask: (taskId: string) => void;
  deferTask: (taskId: string) => void;
  dropTask: (taskId: string) => void;
  saveReview: () => void;
  resetWorkflow: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export interface WorkflowSyncStatus {
  storage: "available" | "blocked";
  account: "checking" | "synced" | "local-only" | "sync-error";
  message: string | null;
  pendingLocalChanges: boolean;
}

const initialSyncStatus: WorkflowSyncStatus = {
  storage: "available",
  account: "checking",
  message: null,
  pendingLocalChanges: false,
};

interface PersistedWorkflowPayload {
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

function createSyncedInitialState() {
  const initial = createInitialWorkflowState();
  syncWorkflowIdCounterFromState(initial);
  return initial;
}

function isUuid(value: string | null | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function mergePersistedRows<T extends { id: string }>(
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

function workflowAreaIdForPersistedAreaId(
  persistedAreaId: string | null,
  persistedAreas: Area[],
) {
  if (!persistedAreaId) return null;
  const area = persistedAreas.find((item) => item.id === persistedAreaId);
  return area ? workflowAreaIdForPersistedArea(area) : persistedAreaId;
}

function persistedAreaIdForWorkflowId(
  workflowAreaId: string,
  persistedAreas: Area[],
) {
  return persistedAreaIdForWorkflowAreaId(workflowAreaId, persistedAreas);
}

function persistedIdForLocalId(
  id: string,
  idMap: Map<string, string>,
): string | null {
  if (isUuid(id)) return id;
  return idMap.get(id) ?? null;
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

function toWorkflowCapture(
  capture: CaptureItem,
  persistedAreas: Area[],
): WorkflowState["captureItems"][number] {
  return {
    id: capture.id,
    user_id: capture.user_id,
    area_id: workflowAreaIdForPersistedAreaId(capture.area_id, persistedAreas),
    raw_text: capture.raw_text,
    capture_mode: "text",
    inferred_area_confidence: capture.inferred_area_confidence,
    status: capture.status,
    created_at: capture.created_at,
  };
}

function toWorkflowTask(task: Task, persistedAreas: Area[]): Phase2MockTask {
  return {
    ...task,
    area_id:
      workflowAreaIdForPersistedAreaId(task.area_id, persistedAreas) ??
      task.area_id,
  };
}

function toWorkflowProposal(
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

function toWorkflowBlock(
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

function toWorkflowSession(
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
    notes: session.notes,
  };
}

function reviewEntryLine(entry: ReviewEntry) {
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
    isArrayOf(state.reviewLog, isString)
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
  };
}

function workflowReducer(
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
        calendarBlocks: mergePersistedRows(
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
    case "submitCapture":
      return submitCapture(state, {
        rawText: action.rawText,
        areaId: action.areaId,
      });
    case "appendRawCapture":
      return appendRawCapture(state, action.capture);
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
    case "unplanTask":
      return unplanTask(state, action.blockId);
    case "startSession":
      return startExecutionSession(state, action.taskId);
    case "markSession":
      return markCurrentSession(state, action.status, {
        actualMinutes: action.actualMinutes,
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

function loadStoredStateFromSession(): {
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

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    workflowReducer,
    undefined,
    createSyncedInitialState,
  );
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(
    state.areas[0]?.id ?? null,
  );
  const [hasHydratedFromStorage, setHasHydratedFromStorage] = useState(false);
  const [syncStatus, setSyncStatus] =
    useState<WorkflowSyncStatus>(initialSyncStatus);
  const stateRef = useRef(state);
  const persistedAreasRef = useRef<Area[]>([]);
  const persistedCaptureIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedTaskIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedProposalIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedBlockIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedSessionIdByLocalIdRef = useRef(new Map<string, string>());

  const markLocalOnly = useCallback((message: string) => {
    setSyncStatus((current) => ({
      ...current,
      account:
        current.account === "sync-error" ? current.account : "local-only",
      message,
      pendingLocalChanges: true,
    }));
  }, []);

  const markAccountSynced = useCallback(() => {
    setSyncStatus((current) => ({
      ...current,
      account: "synced",
      message: current.pendingLocalChanges
        ? "Some local changes still need account sync."
        : null,
    }));
  }, []);

  const markAccountSyncError = useCallback((message: string) => {
    setSyncStatus((current) => ({
      ...current,
      account: "sync-error",
      message,
      pendingLocalChanges: true,
    }));
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const applyPersistedAreas = useCallback((areas: Area[]) => {
    persistedAreasRef.current = areas;
    const syncedAreas = areas.map((area) => ({
      id: workflowAreaIdForPersistedArea(area),
      user_id: area.user_id,
      name: area.name,
      color: area.color ?? "#64748b",
      created_at: area.created_at,
    }));

    dispatch({ type: "syncAreas", areas: syncedAreas });
    setSelectedAreaId((current) => {
      if (current && syncedAreas.some((area) => area.id === current)) {
        return current;
      }
      return syncedAreas[0]?.id ?? null;
    });
  }, []);

  const buildDropLocalIds =
    useCallback((): PersistedWorkflowPayload["dropLocalIds"] => {
      return {
        captures: new Set(persistedCaptureIdByLocalIdRef.current.keys()),
        tasks: new Set(persistedTaskIdByLocalIdRef.current.keys()),
        proposals: new Set(persistedProposalIdByLocalIdRef.current.keys()),
        blocks: new Set(persistedBlockIdByLocalIdRef.current.keys()),
        sessions: new Set(persistedSessionIdByLocalIdRef.current.keys()),
      };
    }, []);

  const syncPersistedWorkflowRows = useCallback(
    async (
      client: MinimalSupabaseClient | null,
      areas = persistedAreasRef.current,
    ) => {
      if (!client) {
        markLocalOnly("Account sync is unavailable; work is staying local.");
        return;
      }
      if (!areas.length) {
        return;
      }

      const [capturesResult, planningResult, executionResult] =
        await Promise.all([
          listCaptureItems(client),
          listPlanningItems(client),
          listExecutionReviewItems(client),
        ]);

      if (
        capturesResult.provider !== "supabase" ||
        planningResult.provider !== "supabase" ||
        executionResult.provider !== "supabase"
      ) {
        markLocalOnly("Account sync is unavailable; work is staying local.");
        return;
      }

      dispatch({
        type: "syncPersistedWorkflow",
        payload: {
          captures: capturesResult.captures.map((capture) =>
            toWorkflowCapture(capture, areas),
          ),
          tasks: executionResult.tasks.map((task) =>
            toWorkflowTask(task, areas),
          ),
          proposals: planningResult.proposals
            .map((proposal) => toWorkflowProposal(proposal, areas))
            .filter(
              (proposal): proposal is Phase2TimeBlockProposal =>
                proposal !== null,
            ),
          blocks: executionResult.blocks.map((block) =>
            toWorkflowBlock(block, areas),
          ),
          sessions: executionResult.sessions.map((session) =>
            toWorkflowSession(session, areas),
          ),
          reviewLog: executionResult.reviewEntries.map(reviewEntryLine),
          dropLocalIds: buildDropLocalIds(),
        },
      });
      markAccountSynced();
    },
    [buildDropLocalIds, markAccountSynced, markLocalOnly],
  );

  async function persistCapture(
    localCapture: WorkflowState["captureItems"][number],
  ) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = localCapture.area_id
      ? persistedAreaIdForWorkflowId(
          localCapture.area_id,
          persistedAreasRef.current,
        )
      : null;

    if (!client || (localCapture.area_id && !persistedAreaId)) {
      markLocalOnly("Capture saved locally; account sync is not available.");
      return;
    }

    const result = await createCaptureItem(client, {
      raw_text: localCapture.raw_text,
      area_id: persistedAreaId,
    });
    if (result.provider !== "supabase") {
      return;
    }

    persistedCaptureIdByLocalIdRef.current.set(
      localCapture.id,
      result.capture.id,
    );
    await syncPersistedWorkflowRows(client);
  }

  async function persistAcceptedTaskDraft(
    draft: Phase2TaskDraft,
    localTask: Phase2MockTask,
    localProposal: Phase2TimeBlockProposal | null,
    status: "active" | "backlog",
  ) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = persistedAreaIdForWorkflowId(
      draft.area_id,
      persistedAreasRef.current,
    );

    if (!client || !persistedAreaId) {
      markLocalOnly("Triage decision saved locally; account sync is pending.");
      return;
    }

    const sourceCaptureId = persistedIdForLocalId(
      draft.capture_item_id,
      persistedCaptureIdByLocalIdRef.current,
    );
    const taskResult = await createTask(client, {
      area_id: persistedAreaId,
      source_capture_item_id: sourceCaptureId,
      title: draft.title,
      description: draft.description,
      status,
      priority_confidence: draft.confidence,
      estimated_minutes_low: draft.estimated_minutes_low,
      estimated_minutes_high: draft.estimated_minutes_high,
      first_tiny_step: draft.first_tiny_step,
    });

    if (taskResult.provider !== "supabase") {
      return;
    }

    persistedTaskIdByLocalIdRef.current.set(localTask.id, taskResult.task.id);

    if (localProposal && status === "active") {
      const proposalResult = await createTimeBlockProposal(client, {
        task_id: taskResult.task.id,
        proposed_start: localProposal.proposed_start,
        proposed_end: localProposal.proposed_end,
        rationale_note: localProposal.rationale,
      });
      if (proposalResult.provider === "supabase") {
        persistedProposalIdByLocalIdRef.current.set(
          localProposal.id,
          proposalResult.proposal.id,
        );
      }
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistPlannedTask(
    localTaskId: string,
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly("Plan saved locally; account sync is pending.");
      return;
    }

    const proposalResult = await createTimeBlockProposal(client, {
      task_id: persistedTaskId,
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
      rationale_note: localProposal.rationale,
    });
    if (proposalResult.provider !== "supabase") {
      return;
    }

    persistedProposalIdByLocalIdRef.current.set(
      localProposal.id,
      proposalResult.proposal.id,
    );

    const acceptResult = await acceptTimeBlockProposal(
      client,
      proposalResult.proposal.id,
    );
    if (acceptResult.provider === "supabase") {
      persistedBlockIdByLocalIdRef.current.set(
        localBlock.id,
        acceptResult.block.id,
      );
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistCreatedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localProposal.task_id,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly("Proposal created locally; account sync is pending.");
      return;
    }

    const proposalResult = await createTimeBlockProposal(client, {
      task_id: persistedTaskId,
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
      rationale_note: localProposal.rationale,
    });
    if (proposalResult.provider !== "supabase") {
      return;
    }

    persistedProposalIdByLocalIdRef.current.set(
      localProposal.id,
      proposalResult.proposal.id,
    );

    await syncPersistedWorkflowRows(client);
  }

  async function persistEditedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client || !persistedProposalId) {
      markLocalOnly("Proposal edit saved locally; account sync is pending.");
      return;
    }

    await editTimeBlockProposal(client, persistedProposalId, {
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
    });

    await syncPersistedWorkflowRows(client);
  }

  async function persistRejectedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client || !persistedProposalId) {
      markLocalOnly("Proposal rejected locally; account sync is pending.");
      return;
    }

    await rejectTimeBlockProposal(client, persistedProposalId);
    await syncPersistedWorkflowRows(client);
  }

  async function persistAcceptedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock | null,
  ) {
    const client = createSupabaseBrowserClient();
    let persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client) {
      markLocalOnly("Proposal accepted locally; account sync is pending.");
      return;
    }

    if (!persistedProposalId) {
      const persistedTaskId = persistedIdForLocalId(
        localProposal.task_id,
        persistedTaskIdByLocalIdRef.current,
      );

      if (!persistedTaskId) {
        markLocalOnly("Proposal accepted locally; account sync is pending.");
        return;
      }

      const proposalResult = await createTimeBlockProposal(client, {
        task_id: persistedTaskId,
        proposed_start: localProposal.proposed_start,
        proposed_end: localProposal.proposed_end,
        rationale_note: localProposal.rationale,
      });
      if (proposalResult.provider !== "supabase") {
        return;
      }
      persistedProposalId = proposalResult.proposal.id;
      persistedProposalIdByLocalIdRef.current.set(
        localProposal.id,
        proposalResult.proposal.id,
      );
    }

    const acceptResult = await acceptTimeBlockProposal(
      client,
      persistedProposalId,
    );
    if (acceptResult.provider === "supabase" && localBlock) {
      persistedBlockIdByLocalIdRef.current.set(
        localBlock.id,
        acceptResult.block.id,
      );
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistUnplannedBlock(localBlockId: string) {
    const client = createSupabaseBrowserClient();
    const persistedBlockId = persistedIdForLocalId(
      localBlockId,
      persistedBlockIdByLocalIdRef.current,
    );

    if (!client || !persistedBlockId) {
      markLocalOnly("Unplanned locally; account sync is pending.");
      return;
    }

    await unplanCalendarBlock(client, persistedBlockId);
    await syncPersistedWorkflowRows(client);
  }

  async function persistTaskReviewTransition(
    localTaskId: string,
    targetStatus: ReviewTaskTargetStatus,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly("Recovery choice saved locally; account sync is pending.");
      return;
    }

    await applyTaskReviewTransition(client, persistedTaskId, targetStatus);
    await syncPersistedWorkflowRows(client);
  }

  async function persistReviewEntry(next: WorkflowState) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = selectedAreaId
      ? persistedAreaIdForWorkflowId(selectedAreaId, persistedAreasRef.current)
      : null;

    if (!client || (selectedAreaId && !persistedAreaId)) {
      markLocalOnly("Review saved locally; account sync is pending.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    await createReviewEntry(client, {
      review_type: "daily",
      period_start: today,
      period_end: today,
      area_id: persistedAreaId,
      summary_json: {
        verdict: "saved",
        completed_sessions: next.executionSessions.filter(
          (session) => session.status === "completed",
        ).length,
        missed_sessions: next.executionSessions.filter(
          (session) => session.status === "missed",
        ).length,
        distracted_sessions: next.executionSessions.filter(
          (session) => session.status === "distracted",
        ).length,
        open_tasks: next.tasks.filter((task) =>
          ["active", "backlog", "scheduled", "blocked"].includes(task.status),
        ).length,
        scheduled_blocks: next.calendarBlocks.filter((block) =>
          ["scheduled", "running"].includes(block.status),
        ).length,
        recent_log: next.reviewLog.slice(0, 8),
      },
    });

    await syncPersistedWorkflowRows(client);
  }

  async function persistStartedSession(
    localSession: Phase2MockExecutionSession,
  ) {
    if (!localSession.task_id) {
      return;
    }

    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localSession.task_id,
      persistedTaskIdByLocalIdRef.current,
    );
    const persistedBlockId = localSession.calendar_block_id
      ? persistedIdForLocalId(
          localSession.calendar_block_id,
          persistedBlockIdByLocalIdRef.current,
        )
      : null;

    if (!client || !persistedTaskId) {
      markLocalOnly(
        "Execution session saved locally; account sync is pending.",
      );
      return;
    }

    const result = await createExecutionSession(client, {
      task_id: persistedTaskId,
      calendar_block_id: persistedBlockId,
    });
    if (result.provider !== "supabase") {
      return;
    }

    persistedSessionIdByLocalIdRef.current.set(
      localSession.id,
      result.session.id,
    );
    if (result.block && localSession.calendar_block_id) {
      persistedBlockIdByLocalIdRef.current.set(
        localSession.calendar_block_id,
        result.block.id,
      );
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistMarkedSession(
    localSession: Phase2MockExecutionSession,
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedSessionId = persistedIdForLocalId(
      localSession.id,
      persistedSessionIdByLocalIdRef.current,
    );

    if (!client || !persistedSessionId) {
      markLocalOnly("Session outcome saved locally; account sync is pending.");
      return;
    }

    await markExecutionSession(client, persistedSessionId, {
      status:
        status === "completed"
          ? "completed"
          : status === "missed"
            ? "missed"
            : status === "distracted"
              ? "distracted"
              : status === "paused"
                ? "paused"
                : "stuck",
      outcome:
        status === "completed"
          ? "completed"
          : status === "missed"
            ? "skipped"
            : status === "distracted"
              ? "distracted"
              : status === "stuck"
                ? "blocked"
                : null,
      actual_minutes:
        status === "paused"
          ? null
          : (actualMinutes ?? localSession.actual_minutes ?? 0),
      productivity_rating:
        status === "paused" ? null : status === "completed" ? 4 : 1,
      notes: status === "stuck" ? "Need a smaller next step." : null,
    });

    await syncPersistedWorkflowRows(client);
  }

  useEffect(() => {
    const restored = loadStoredStateFromSession();
    const restoredState = restored.state;
    if (restored.storageBlocked) {
      setSyncStatus((current) => ({
        ...current,
        storage: "blocked",
        message:
          "Browser storage is blocked; this session will not reliably restore after reload.",
        pendingLocalChanges: true,
      }));
    }
    if (restoredState) {
      dispatch({ type: "hydrate", state: restoredState });
      setSelectedAreaId((current) => {
        if (
          current &&
          restoredState.areas.some((area) => area.id === current)
        ) {
          return current;
        }
        return restoredState.areas[0]?.id ?? null;
      });
    }
    setHasHydratedFromStorage(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncPersistedAreas() {
      const client = createSupabaseBrowserClient();
      if (!client) {
        markLocalOnly("Account sync is unavailable; work is staying local.");
        return;
      }

      try {
        const result = await listAreas(client);
        if (cancelled || result.provider !== "supabase") {
          markLocalOnly("Account sync is unavailable; work is staying local.");
          return;
        }
        applyPersistedAreas(result.areas);
        await syncPersistedWorkflowRows(client, result.areas);
        markAccountSynced();
      } catch {
        markAccountSyncError(
          "Account sync failed; local workflow remains usable.",
        );
      }
    }

    void syncPersistedAreas();

    return () => {
      cancelled = true;
    };
  }, [
    applyPersistedAreas,
    markAccountSynced,
    markAccountSyncError,
    markLocalOnly,
    syncPersistedWorkflowRows,
  ]);

  useEffect(() => {
    if (!hasHydratedFromStorage) {
      return;
    }

    syncWorkflowIdCounterFromState(state);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setSyncStatus((current) => ({
        ...current,
        storage: "blocked",
        message:
          "Browser storage is blocked; this session will not reliably restore after reload.",
        pendingLocalChanges: true,
      }));
    }
  }, [hasHydratedFromStorage, state]);

  function applyWorkflowState(nextState: WorkflowState) {
    stateRef.current = nextState;
    syncWorkflowIdCounterFromState(nextState);
    dispatch({ type: "hydrate", state: nextState });
  }

  async function submitCaptureText(rawText: string, areaId: string | null) {
    const localCapture = createRawCaptureItem({ rawText, areaId });
    const rawSavedState = appendRawCapture(stateRef.current, localCapture);

    applyWorkflowState(rawSavedState);

    void persistCapture(localCapture).catch(() => {
      markAccountSyncError(
        "Capture saved locally; account sync failed and can recover later.",
      );
    });

    let routeResponded = false;

    try {
      const response = await fetch("/api/parse-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: localCapture.raw_text,
          areaContext: stateRef.current.areas.map((area) => ({
            slug: area.id.replace(/^area-/, ""),
            name: area.name,
          })),
          parserMode: "auto",
        }),
      });
      routeResponded = true;
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        !("response" in payload)
      ) {
        throw new Error("Parse capture route returned a safe failure.");
      }

      const parsedResponse = ParseCaptureResponseSchema.parse(
        (payload as { response: unknown }).response,
      );
      const parsed = buildParsedWorkflowResult({
        response: parsedResponse,
        capture: {
          id: localCapture.id,
          user_id: localCapture.user_id,
          area_id: localCapture.area_id,
          raw_text: localCapture.raw_text,
          raw_audio_ref: null,
          capture_mode: "text",
          inferred_area_confidence: localCapture.inferred_area_confidence,
          status: localCapture.status,
          created_at: localCapture.created_at,
        },
        workflowAreaId: areaId,
      });

      applyWorkflowState(appendParsedWorkflowResult(stateRef.current, parsed));
    } catch (error) {
      if (
        (error instanceof ReferenceError ||
          error instanceof TypeError ||
          typeof fetch === "undefined") &&
        !routeResponded
      ) {
        applyWorkflowState(
          submitCapture(stateRef.current, {
            rawText: localCapture.raw_text,
            areaId,
            existingCapture: localCapture,
          }),
        );
        return;
      }

      markLocalOnly(
        "Capture saved for manual triage. AI parsing failed safely, so no unvalidated drafts were added.",
      );
    }
  }

  function acceptTaskDraftWithPersistence(
    draftId: string,
    status: "active" | "backlog",
  ) {
    const previous = stateRef.current;
    const draft = previous.taskDrafts.find((item) => item.id === draftId);
    const next =
      status === "backlog"
        ? backlogDraft(previous, draftId)
        : acceptDraft(previous, draftId);
    const localTask = next.tasks.find(
      (task) => !previous.tasks.some((item) => item.id === task.id),
    );
    const localProposal =
      localTask && status === "active"
        ? (next.timeBlockProposals.find(
            (proposal) =>
              proposal.task_id === localTask.id &&
              !previous.timeBlockProposals.some(
                (item) => item.id === proposal.id,
              ),
          ) ?? null)
        : null;

    applyWorkflowState(next);

    if (draft && localTask) {
      void persistAcceptedTaskDraft(
        draft,
        localTask,
        localProposal,
        status,
      ).catch(() => {
        markAccountSyncError(
          "Triage decision saved locally; account sync failed.",
        );
      });
    }
  }

  function planTaskAtHourWithPersistence(taskId: string, hour: number) {
    const previous = stateRef.current;
    const next = planTaskAtHour(previous, taskId, hour);
    const localProposal = next.timeBlockProposals.find(
      (proposal) =>
        !previous.timeBlockProposals.some((item) => item.id === proposal.id),
    );
    const localBlock = next.calendarBlocks.find(
      (block) => !previous.calendarBlocks.some((item) => item.id === block.id),
    );

    applyWorkflowState(next);

    if (localProposal && localBlock) {
      void persistPlannedTask(taskId, localProposal, localBlock).catch(() => {
        markAccountSyncError("Plan saved locally; account sync failed.");
      });
    }
  }

  function startTaskSessionWithPersistence(taskId: string) {
    const previous = stateRef.current;
    const next = startExecutionSession(previous, taskId);
    const localSession = next.executionSessions.find(
      (session) =>
        !previous.executionSessions.some((item) => item.id === session.id),
    );

    applyWorkflowState(next);

    if (localSession) {
      void persistStartedSession(localSession).catch(() => {
        markAccountSyncError(
          "Execution session saved locally; account sync failed.",
        );
      });
    }
  }

  function markSessionWithPersistence(
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
  ) {
    const previous = stateRef.current;
    const localSession = previous.executionSessions[0];
    const next = markCurrentSession(previous, status, { actualMinutes });

    applyWorkflowState(next);

    if (localSession) {
      void persistMarkedSession(localSession, status, actualMinutes).catch(
        () => {
          markAccountSyncError(
            "Session outcome saved locally; account sync failed.",
          );
        },
      );
    }
  }

  const value: WorkflowContextValue = {
    state,
    selectedAreaId,
    setSelectedAreaId,
    syncStatus,
    syncPersistedAreas: applyPersistedAreas,
    addArea: (name, color) => dispatch({ type: "addArea", name, color }),
    updateAreaColor: (areaId, color) =>
      dispatch({ type: "updateAreaColor", areaId, color }),
    submitCaptureText,
    addParsedWorkflowResult: (parsed) =>
      dispatch({ type: "appendParsedWorkflowResult", parsed }),
    acceptTaskDraft: (draftId) =>
      acceptTaskDraftWithPersistence(draftId, "active"),
    backlogTaskDraft: (draftId) =>
      acceptTaskDraftWithPersistence(draftId, "backlog"),
    promoteBacklogTask: (taskId) => {
      const previous = stateRef.current;
      const next = promoteBacklogTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistTaskReviewTransition(taskId, "active").catch(() => {
          markAccountSyncError("Moved to today locally; account sync failed.");
        });
      }
    },
    acceptProjectDraft: (draftId) =>
      dispatch({ type: "acceptProjectDraft", draftId }),
    rejectTaskDraft: (draftId) => {
      dispatch({ type: "rejectDraft", draftId });
      markLocalOnly("Dropped draft locally; account sync is pending.");
    },
    rejectProjectDraft: (draftId) =>
      dispatch({ type: "rejectProjectDraft", draftId }),
    editTaskDraft: (draftId, changes) => {
      dispatch({ type: "editDraft", draftId, changes });
      markLocalOnly("Draft edit saved locally; account sync is pending.");
    },
    splitTaskDraft: (draftId, titles) => {
      dispatch({ type: "splitDraft", draftId, titles });
      markLocalOnly("Draft split saved locally; account sync is pending.");
    },
    mergeTaskDrafts: (primaryDraftId, secondaryDraftId) => {
      dispatch({ type: "mergeDrafts", primaryDraftId, secondaryDraftId });
      markLocalOnly("Draft merge saved locally; account sync is pending.");
    },
    acceptLocalProposal: (proposalId) => {
      const previous = stateRef.current;
      const proposal =
        previous.timeBlockProposals.find((item) => item.id === proposalId) ??
        null;
      const next = acceptProposal(previous, proposalId);
      const localBlock =
        next.calendarBlocks.find(
          (block) =>
            !previous.calendarBlocks.some((item) => item.id === block.id),
        ) ?? null;
      applyWorkflowState(next);

      if (proposal && next !== previous) {
        void persistAcceptedLocalProposal(proposal, localBlock).catch(() => {
          markAccountSyncError(
            "Proposal accepted locally; account sync failed.",
          );
        });
      }
    },
    rejectLocalProposal: (proposalId) => {
      const previous = stateRef.current;
      const proposal =
        previous.timeBlockProposals.find((item) => item.id === proposalId) ??
        null;
      const next = rejectProposal(previous, proposalId);
      applyWorkflowState(next);

      if (proposal && next !== previous) {
        void persistRejectedLocalProposal(proposal).catch(() => {
          markAccountSyncError(
            "Proposal rejected locally; account sync failed.",
          );
        });
      }
    },
    editLocalProposal: (proposalId, changes) => {
      const previous = stateRef.current;
      const next = updateProposal(previous, proposalId, changes);
      const proposal =
        next.timeBlockProposals.find((item) => item.id === proposalId) ?? null;
      applyWorkflowState(next);

      if (proposal && next !== previous) {
        void persistEditedLocalProposal(proposal).catch(() => {
          markAccountSyncError(
            "Proposal edit saved locally; account sync failed.",
          );
        });
      }
    },
    createLocalProposalForTask: ({
      taskId,
      proposedStart,
      proposedEnd,
      rationale,
    }) => {
      const previous = stateRef.current;
      const next = createLocalProposalFromTask(previous, taskId, {
        proposed_start: proposedStart,
        proposed_end: proposedEnd,
        rationale,
      });
      const localProposal =
        next.timeBlockProposals.find(
          (proposal) =>
            !previous.timeBlockProposals.some(
              (item) => item.id === proposal.id,
            ),
        ) ?? null;
      applyWorkflowState(next);

      if (localProposal) {
        void persistCreatedLocalProposal(localProposal).catch(() => {
          markAccountSyncError(
            "Proposal created locally; account sync failed.",
          );
        });
      }
    },
    planTaskAtHour: planTaskAtHourWithPersistence,
    unplanTask: (blockId) => {
      const previous = stateRef.current;
      const next = unplanTask(previous, blockId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistUnplannedBlock(blockId).catch(() => {
          markAccountSyncError("Unplanned locally; account sync failed.");
        });
      }
    },
    startTaskSession: startTaskSessionWithPersistence,
    markSession: markSessionWithPersistence,
    carryForwardTask: (taskId) => {
      const previous = stateRef.current;
      const next = carryForwardTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistTaskReviewTransition(taskId, "active").catch(() => {
          markAccountSyncError(
            "Recovery choice saved locally; account sync failed.",
          );
        });
      }
    },
    deferTask: (taskId) => {
      const previous = stateRef.current;
      const next = deferTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistTaskReviewTransition(taskId, "backlog").catch(() => {
          markAccountSyncError(
            "Recovery choice saved locally; account sync failed.",
          );
        });
      }
    },
    dropTask: (taskId) => {
      const previous = stateRef.current;
      const next = dropTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistTaskReviewTransition(taskId, "dropped").catch(() => {
          markAccountSyncError(
            "Recovery choice saved locally; account sync failed.",
          );
        });
      }
    },
    saveReview: () => {
      const previous = stateRef.current;
      const next = saveReview(previous);
      applyWorkflowState(next);

      void persistReviewEntry(next).catch(() => {
        markAccountSyncError("Review saved locally; account sync failed.");
      });
    },
    resetWorkflow: () => dispatch({ type: "reset" }),
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) {
    throw new Error("useWorkflow must be used inside WorkflowProvider.");
  }
  return value;
}
