"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import {
  Phase2AmbiguityAssessmentResponseSchema,
  Phase2CaptureItemSchema,
  Phase2ProjectDraftSchema,
  Phase2TaskDraftSchema,
  Phase2TimeBlockProposalDraftSchema,
  Phase2TimeBlockProposalSchema,
  type Phase2TaskDraft,
  type Phase2TimeBlockProposal,
} from "@lifeos/schemas";
import {
  acceptDraft,
  acceptProjectDraft,
  appendParsedWorkflowResult,
  acceptProposal,
  createInitialWorkflowState,
  editDraft,
  markCurrentSession,
  rejectDraft,
  rejectProjectDraft,
  rejectProposal,
  startExecutionSession,
  submitCapture,
  syncWorkflowIdCounterFromState,
  updateProposal,
  type WorkflowState,
} from "./workflow";
import type { Phase2MockExecutionSession } from "./types";
import type { ParsedWorkflowResult } from "./ai/parseCaptureWorkflow";

const STORAGE_KEY = "lifeos.phase2.workflow";

type WorkflowAction =
  | {
      type: "hydrate";
      state: WorkflowState;
    }
  | {
      type: "submitCapture";
      rawText: string;
      areaId: string | null;
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
      changes: Pick<Phase2TaskDraft, "title" | "description">;
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
      type: "startSession";
      taskId: string;
    }
  | {
      type: "markSession";
      status: Phase2MockExecutionSession["status"];
    }
  | {
      type: "reset";
    };

interface WorkflowContextValue {
  state: WorkflowState;
  selectedAreaId: string | null;
  setSelectedAreaId: (areaId: string | null) => void;
  submitCaptureText: (rawText: string, areaId: string | null) => void;
  addParsedWorkflowResult: (parsed: ParsedWorkflowResult) => void;
  acceptTaskDraft: (draftId: string) => void;
  acceptProjectDraft: (draftId: string) => void;
  rejectTaskDraft: (draftId: string) => void;
  rejectProjectDraft: (draftId: string) => void;
  editTaskDraft: (
    draftId: string,
    changes: Pick<Phase2TaskDraft, "title" | "description">,
  ) => void;
  acceptLocalProposal: (proposalId: string) => void;
  rejectLocalProposal: (proposalId: string) => void;
  editLocalProposal: (
    proposalId: string,
    changes: Pick<
      Phase2TimeBlockProposal,
      "proposed_start" | "proposed_end" | "rationale"
    >,
  ) => void;
  startTaskSession: (taskId: string) => void;
  markSession: (status: Phase2MockExecutionSession["status"]) => void;
  resetWorkflow: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function createSyncedInitialState() {
  const initial = createInitialWorkflowState();
  syncWorkflowIdCounterFromState(initial);
  return initial;
}

const TASK_STATUSES = new Set([
  "draft",
  "active",
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
    case "submitCapture":
      return submitCapture(state, {
        rawText: action.rawText,
        areaId: action.areaId,
      });
    case "appendParsedWorkflowResult":
      return appendParsedWorkflowResult(state, action.parsed);
    case "acceptDraft":
      return acceptDraft(state, action.draftId);
    case "acceptProjectDraft":
      return acceptProjectDraft(state, action.draftId);
    case "rejectDraft":
      return rejectDraft(state, action.draftId);
    case "rejectProjectDraft":
      return rejectProjectDraft(state, action.draftId);
    case "editDraft":
      return editDraft(state, action.draftId, action.changes);
    case "acceptProposal":
      return acceptProposal(state, action.proposalId);
    case "rejectProposal":
      return rejectProposal(state, action.proposalId);
    case "updateProposal":
      return updateProposal(state, action.proposalId, action.changes);
    case "startSession":
      return startExecutionSession(state, action.taskId);
    case "markSession":
      return markCurrentSession(state, action.status);
    case "reset":
      return createSyncedInitialState();
    default:
      return state;
  }
}

function loadStoredStateFromSession(): WorkflowState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = normalizeStoredWorkflowState(JSON.parse(stored));
    if (!isStoredWorkflowState(parsed)) {
      return null;
    }

    syncWorkflowIdCounterFromState(parsed);
    return parsed;
  } catch {
    return null;
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

  useEffect(() => {
    const restoredState = loadStoredStateFromSession();
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
    if (!hasHydratedFromStorage) {
      return;
    }

    syncWorkflowIdCounterFromState(state);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Workflow state must remain usable when browser storage is blocked.
    }
  }, [hasHydratedFromStorage, state]);

  const value: WorkflowContextValue = {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText: (rawText, areaId) =>
      dispatch({ type: "submitCapture", rawText, areaId }),
    addParsedWorkflowResult: (parsed) =>
      dispatch({ type: "appendParsedWorkflowResult", parsed }),
    acceptTaskDraft: (draftId) => dispatch({ type: "acceptDraft", draftId }),
    acceptProjectDraft: (draftId) =>
      dispatch({ type: "acceptProjectDraft", draftId }),
    rejectTaskDraft: (draftId) => dispatch({ type: "rejectDraft", draftId }),
    rejectProjectDraft: (draftId) =>
      dispatch({ type: "rejectProjectDraft", draftId }),
    editTaskDraft: (draftId, changes) =>
      dispatch({ type: "editDraft", draftId, changes }),
    acceptLocalProposal: (proposalId) =>
      dispatch({ type: "acceptProposal", proposalId }),
    rejectLocalProposal: (proposalId) =>
      dispatch({ type: "rejectProposal", proposalId }),
    editLocalProposal: (proposalId, changes) =>
      dispatch({ type: "updateProposal", proposalId, changes }),
    startTaskSession: (taskId) => dispatch({ type: "startSession", taskId }),
    markSession: (status) => dispatch({ type: "markSession", status }),
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
