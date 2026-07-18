// WorkflowContext domain module — public value-shape types.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only). These types close over nothing and are re-exported from
// WorkflowContext.tsx unchanged, so every existing `import { ... } from
// "@/lib/WorkflowContext"` site keeps compiling.
import type {
  Area,
  Phase2TaskDraft,
  Phase2TimeBlockProposal,
  RollupSummary,
  RollupSummaryContent,
} from "@lifeos/schemas";
import type { WorkflowState } from "../workflow";
import type { TaskMapGraph } from "../taskmap/graph";
import type { ProposalRecalibrationVM } from "../learning/learningSurface";
import type { PolicyChangeCandidate } from "../learning/overrideScan";
import type { Phase2MockExecutionSession } from "../types";
import type {
  ParseCaptureClientStatus,
  ParseCaptureParserMode,
} from "../ai/parseCaptureClient";
import type { ParsedWorkflowResult } from "../ai/parseCaptureWorkflow";

/**
 * UI-facing status of the async capture parse round-trip. The raw capture is
 * already saved before this leaves "idle", so a failure never loses input.
 */
export type CaptureParseState =
  | { phase: "idle" }
  | {
      phase: "parsing";
      captureId: string;
      parserMode: ParseCaptureParserMode;
    }
  | {
      phase: "parsed";
      captureId: string;
      parser: "ai" | "mock";
      status: ParseCaptureClientStatus;
    }
  | {
      phase: "failed";
      captureId: string;
      status: ParseCaptureClientStatus;
      message: string;
      canRetryWithMock: boolean;
    };

/**
 * FR-031 slice 5 — UI-facing status of the on-demand task-map draft
 * round-trip, keyed to the task it was drafted for so switching the
 * focused task never shows a stale draft. Generation is on-demand only
 * (NFR-001/NFR-005): entering "pending" always follows an explicit
 * `requestTaskMapDraft` call, never a background effect.
 */
export type TaskMapDraftState =
  | { phase: "idle" }
  | { phase: "pending"; taskId: string }
  | {
      phase: "ready";
      taskId: string;
      draft: TaskMapGraph & { schema_version: "1.0" | "1.1" };
      suggestionRecordId: string | null;
    }
  | { phase: "failed"; taskId: string; message: string };

export const SAFE_TASK_MAP_FAILURE_MESSAGE =
  "Couldn't draft a map right now. Staying on the step list.";

export interface WorkflowContextValue {
  state: WorkflowState;
  selectedAreaId: string | null;
  setSelectedAreaId: (areaId: string | null) => void;
  syncStatus: WorkflowSyncStatus;
  syncPersistedAreas: (areas: Area[]) => void;
  refreshPersistedWorkflow: () => Promise<void>;
  addArea: (name: string, color: string) => void;
  updateAreaColor: (areaId: string, color: string) => void;
  submitCaptureText: (
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) => void;
  // G1 floor follow-up: persist the thought verbatim, skipping the AI parse
  // (parsed later at triage). Same offline behavior as submitCaptureText.
  submitCaptureRaw: (
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) => void;
  captureParse: CaptureParseState;
  retryCaptureParseWithMock: () => void;
  // FR-031 slice 5: on-demand task-map draft + one-pass approve.
  taskMapDraft: TaskMapDraftState;
  requestTaskMapDraft: (taskId: string) => Promise<void>;
  dismissTaskMapDraft: () => void;
  approveTaskMapDraft: (
    taskId: string,
    graph: TaskMapGraph & { schema_version: "1.0" | "1.1" },
  ) => Promise<void>;
  // FR-031 slice 6: user-action-only, reversible node-completion toggle on
  // an already-approved map. Never AI-invoked; not instrumented (a
  // completion tap is not an AI suggestion resolution).
  toggleTaskMapNodeCompletion: (
    taskId: string,
    nodeId: string,
  ) => Promise<void>;
  // FR-027 (F-G1a): number of raw captures saved offline and not yet synced to
  // the spine (the queue-badge signal). Drains automatically on reconnect.
  unsyncedCaptureCount: number;
  // Purge device-local queued raw captures (call on logout — they are
  // High-sensitivity and must not outlive the session on a shared device).
  clearOfflineCaptures: () => Promise<void>;
  addParsedWorkflowResult: (parsed: ParsedWorkflowResult) => void;
  // FR-031 slice F3 (#664): returns the newly-created task's id (or null if
  // the accept was refused/no-opped) so the triage-accept surface can offer
  // an on-demand task-map draft for exactly the task that was just created —
  // never a background call.
  acceptTaskDraft: (draftId: string) => string | null;
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
  rejectPersonLink: (draftId: string, mentionIndex: number) => void;
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
  updateTaskFirstTinyStep: (taskId: string, firstTinyStep: string) => void;
  unplanTask: (blockId: string) => void;
  startTaskSession: (taskId: string) => void;
  /**
   * #572 (state truth, execute/review contract): resolves only once the
   * outcome is persisted (or truthfully falls back to local-only). Local
   * state updates synchronously/optimistically as before; callers that show
   * a "closed"/verdict copy or navigate away MUST await this so that copy
   * never claims a save that hasn't resolved.
   */
  markSession: (
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
    notes?: string | null,
    capOutcome?: Phase2MockExecutionSession["cap_outcome"],
  ) => Promise<void>;
  carryForwardTask: (taskId: string) => void;
  deferTask: (taskId: string) => void;
  /**
   * #613 (atomic cap-DEFER, upgrades #587's interim split): persists the
   * execution session outcome (blocked/deferred) AND the task deferral
   * (status=backlog) as ONE transaction via apply_execution_session_defer,
   * so a "persisted" result is a truthful unified close — never a state
   * where the session committed but the task didn't. Local state still
   * updates synchronously/optimistically first. Additive to `deferTask`
   * (kept for non-cap deferral call sites, e.g. the review recovery
   * action) — this is the cap-DEFER-specific path.
   */
  deferTaskWithSession: (
    taskId: string,
    actualMinutes: number,
    notes: string | null,
  ) => Promise<DeferTaskWithSessionResult>;
  dropTask: (taskId: string) => void;
  /**
   * #588 (review closure truth): resolves with the actual persistence
   * outcome. Local state still updates synchronously/optimistically, but any
   * caller that reports a "day closed" verdict MUST await this and gate the
   * copy on the result — "persisted" is the only outcome that may claim
   * closure; "local-only" keeps the recovery-oriented local-fallback truth;
   * "failure" must show recovery copy, never a closure claim.
   */
  saveReview: () => Promise<ReviewSaveResult>;
  confirmWin: (input: {
    taskId: string;
    title: string;
    detail?: string | null;
  }) => Promise<void>;
  confirmRollup: (input: {
    areaId: string;
    periodType: "week" | "month";
    periodStart: string;
    periodEnd: string;
    summary: RollupSummaryContent;
  }) => Promise<void>;
  // #486: read-only, workflow-area-scoped fetch of already-approved rollups
  // (weekly and monthly), used for the monthly composer and month-over-month
  // readback. See `listApprovedRollups` for the mapping/fallback details.
  listApprovedRollups: () => Promise<RollupSummary[]>;
  // S9 (#261) learning-loop consumer. Reads are derived from loaded
  // override_records + execution-session actuals; decisions are propose->approve
  // and NEVER auto-apply a default (the recorded decision is the only mutation).
  overridePolicyProposals: PolicyChangeCandidate[];
  decideOverridePolicyProposal: (
    candidate: PolicyChangeCandidate,
    decision: "accepted" | "declined",
  ) => void;
  recalibrationForProposal: (
    areaId: string | null,
    estimateMinutes: number,
  ) => ProposalRecalibrationVM | null;
  // The adjusted default duration for a task in `areaId` once its recalibration
  // has been accepted, or null (planning uses the raw estimate). Apply-on-accept
  // read side.
  appliedDurationForArea: (
    areaId: string | null,
    estimateMinutes: number,
  ) => number | null;
  decideDurationRecalibration: (
    input: {
      proposalId: string;
      proposedStart: string;
      areaId: string | null;
      recalibration: ProposalRecalibrationVM;
    },
    decision: "accepted" | "dismissed",
  ) => void;
  clearWipRefusal: () => void;
  swapWipSlot: (slotTaskId: string) => void;
  resetWorkflow: () => void;
  approveProposalGoogleWrite: (
    proposalId: string,
    options?: { acknowledgeFirstWriteWarning?: boolean },
  ) => Promise<GoogleCalendarBridgeResult>;
  cancelGoogleCalendarBlock: (
    blockId: string,
  ) => Promise<GoogleCalendarBridgeResult>;
}

/**
 * #588: how a review save actually resolved.
 * - "persisted": the review entry reached the account (Supabase row created).
 * - "local-only": no real client/persisted area — saved locally, sync pending.
 * - "failure": the persisted write threw; local state kept, nothing synced.
 */
export type ReviewSaveResult = "persisted" | "local-only" | "failure";

/**
 * #613: how the atomic cap-DEFER transaction actually resolved.
 * - "persisted": the session + task deferral committed together (Supabase
 *   RPC succeeded) — the only outcome that may claim a unified "closed".
 * - "local-only": no real client/persisted session or task yet — saved
 *   locally, sync pending; report the split (unconfirmed) truth.
 * - "failure": the RPC threw; local state kept, nothing synced; report the
 *   split (failed) truth.
 */
export type DeferTaskWithSessionResult = "persisted" | "local-only" | "failure";

export interface GoogleCalendarBridgeResult {
  outcome:
    | "created"
    | "cancelled"
    | "first-write-warning"
    | "unavailable"
    | "failed";
  message: string;
}

export interface GoogleCalendarWriteRoutePayload {
  ok?: boolean;
  error?: string;
  first_write_warning_required?: boolean;
  google_event_id?: string;
  block?: { id?: string };
  event_already_gone?: boolean;
}

export interface WorkflowSyncStatus {
  storage: "available" | "blocked";
  account: "checking" | "synced" | "local-only" | "sync-error";
  message: string | null;
  pendingLocalChanges: boolean;
}

export const initialSyncStatus: WorkflowSyncStatus = {
  storage: "available",
  account: "checking",
  message: null,
  pendingLocalChanges: false,
};
