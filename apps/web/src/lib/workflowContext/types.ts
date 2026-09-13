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
  RollupSummaryContent,
  Task,
} from "@lifeos/schemas";
import type { WorkflowState } from "../workflow";
// Issue #984: a direct submodule import, not an addition to the frozen
// `workflow.ts` barrel — see that file's own comment.
import type {
  TaskEditFieldErrors,
  TaskEditFormInput,
} from "../workflow/taskEditing";
import type { ApprovedRollupSummary } from "../review/approvedRollups";
import type { LoggedWinRecord } from "../review/loggedWins";
import type { SessionSaveResult } from "./persistenceSync";
import type { TaskMapGraph } from "../taskmap/graph";
import type { RevisionSignal } from "../taskmap/revision";
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
  | { phase: "pending"; taskId: string; origin?: "revision" }
  | {
      phase: "ready";
      taskId: string;
      draft: TaskMapGraph & { schema_version: "1.0" | "1.1" };
      suggestionRecordId: string | null;
      /** FR-031 slice F5 (#679): "revision" when this draft came from a
       * tapped evidence-triggered offer. Dismissing such a draft rejects
       * its suggestion row (the approved map bytes stay untouched);
       * ordinary drafts/regens dismiss exactly as before. */
      origin?: "revision";
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
  // #703: the one capture path. Persists the thought verbatim and never
  // parses — sorting is the separate `sortCaptureIntoDrafts` step below.
  // (Absorbed the former `submitCaptureRaw`, which did exactly this.)
  submitCaptureText: (
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) => void;
  // #703: sort an already-captured item into task/project drafts, on demand
  // from triage. Reuses the existing parse path end to end; reports progress
  // and failure through `captureParse` below, exactly as the capture surface
  // used to. Never called automatically.
  sortCaptureIntoDrafts: (
    captureId: string,
    parserMode?: "auto" | "mock",
  ) => void;
  captureParse: CaptureParseState;
  retryCaptureParseWithMock: () => void;
  // FR-031 slice 5: on-demand task-map draft + one-pass approve.
  taskMapDraft: TaskMapDraftState;
  // FR-031 slice F5 (#679): options.revisionSignals turns the request into
  // an evidence-triggered revision (policy task_map_revision.v1); still
  // only ever called from an explicit user tap.
  requestTaskMapDraft: (
    taskId: string,
    options?: { revisionSignals?: RevisionSignal[] },
  ) => Promise<void>;
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
  // Final UX Loop C1, Target Cards 1+7 (audit P0#4) — the days that already
  // have a close, split by WHERE the close lives. Two lists rather than one
  // because the user is told a different (and equally true) sentence for each:
  // the account has it, or this device has it and the account does not yet.
  // Consumers should not merge them by hand — `resolveDayClose` in
  // `lib/review/dayClose.ts` owns the precedence.
  accountClosedDays: string[];
  journalledClosedDays: string[];
  // #737 C1 re-score GAP 1 — the wins already logged, split by WHERE they live,
  // exactly like the two lists above and for the same reason. Task ids are
  // resolved into WORKFLOW id space by the provider, so consumers compare
  // against `winCandidates` without knowing that account ids exist.
  // `resolveLoggedWinsForDay` in `lib/review/loggedWins.ts` owns the merge —
  // consumers should not union them by hand.
  accountLoggedWins: LoggedWinRecord[];
  journalledLoggedWins: LoggedWinRecord[];
  // #737 C1 re-score GAP 4 — local days of blockless COMPLETED session writes
  // this device holds and has not sent. The ACCOUNT tier of the same question
  // is already in `state.executionSessions` (the uuid-id rows), so only this
  // half is carried; `countCompletedBlocklessSessions` explains why the
  // reducer's own optimistic row belongs to neither tier.
  journalledCompletedSessionDays: string[];
  // #737 C1 re-score GAP 2 — periods this device has an APPROVED rollup for
  // but has not sent yet, keyed `areaId|periodType|periodStart`. The account
  // tier of the same question is fetched on demand by `listApprovedRollups`.
  journalledRollupKeys: string[];
  // #737 C1 re-score ROUND 2 GAP 2 — persisted area uuid -> workflow area id,
  // as REACTIVE state rather than the provider's ref. An account row names its
  // area by uuid and a Close-moment draft names it by workflow id; the bridge
  // arrives with hydration, LATER than the rollup readback usually resolves.
  // Consumers that must recompute when it lands read this. Empty until
  // hydration, and permanently empty in mock/demo — so it is never a proxy for
  // "signed in". See `lib/review/approvedRollups.ts`.
  workflowAreaIdByPersistedId: Readonly<Record<string, string>>;
  // Whether the account-areas load ATTEMPT has finished, in every terminal
  // state (no client, signed out, failure, success). Gates surfaces whose
  // correctness depends on the map above existing; never means "areas exist".
  areasReadbackSettled: boolean;
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
  /**
   * Issue #984 — edit an accepted backlog task's title/description/area.
   * `expected_updated_at` is the task's `updated_at` as of when the editor
   * opened; a mismatch (or the task no longer being backlog) resolves
   * "conflict" rather than overwriting a newer edit. See `TaskEditResult`
   * for what each branch means and what it guarantees about `state.tasks`.
   */
  editBacklogTask: (
    taskId: string,
    changes: TaskEditFormInput & { expected_updated_at: string },
  ) => Promise<TaskEditResult>;
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
    // #737 C1 card 1: resolves with what ACTUALLY happened to the outcome, so
    // the caller's toast can only claim what the browser can back up.
  ) => Promise<SessionSaveResult>;
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
  /**
   * #737-A slice 2 (durable wins): resolves with where the win actually
   * landed, and callers MUST gate their success copy on it. Before this the
   * call returned `void` and fired and forgot, so "Win logged" was shown even
   * when the whole call short-circuited on `if (!client) return;` and wrote
   * nothing anywhere.
   *
   * - "persisted"  — the account has it.
   * - "device-only" — journalled on this device, waiting for the account.
   *   `savedOnThisDeviceBanner("Your win")` is now literally true here: a new
   *   tab can read the win back out of the journal.
   * - "failure"    — the device refused to hold it (no IndexedDB: private
   *   mode, a blocking extension). The win is NOT saved. Never claim it is.
   */
  confirmWin: (input: {
    taskId: string;
    title: string;
    detail?: string | null;
  }) => Promise<WinConfirmResult>;
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
  listApprovedRollups: () => Promise<ApprovedRollupSummary[]>;
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
  resetWorkflow: () => Promise<void>;
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
 * - "local-only": journalled on this device, waiting for the account.
 * - "failure": the device could not hold the review; it is NOT saved.
 *
 * #737-A slice 2 re-anchored the last two values to the new truth rather than
 * changing the vocabulary. Before this slice "local-only" meant the review sat
 * in one tab's `sessionStorage` and closing that tab lost it; now it means the
 * review is in the device journal and a new tab can read it back. "failure"
 * used to mean the network write threw (the review was still in the tab); it
 * now means the strictly worse thing — the device journal write failed, so
 * nothing holds the review. A failed NETWORK write is "local-only" now,
 * because the journal will retry it.
 */
export type ReviewSaveResult = "persisted" | "local-only" | "failure";

/**
 * #737-A slice 2: how a win confirmation actually resolved. Same three states
 * and the same rules as `ReviewSaveResult`; see `confirmWin` above.
 */
export type WinConfirmResult = "persisted" | "device-only" | "failure";

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

/**
 * Issue #984 — how the accepted-backlog task editor actually resolved.
 *
 * Unlike the fire-and-forget review/session actions above, this one is
 * validated and (for a configured account) server-confirmed BEFORE any
 * canonical value changes, so every non-"success" branch below leaves
 * `state.tasks` exactly as it was — the caller's editable form input is the
 * only thing that survives a failure, never a canonical write.
 *
 * - "success": the edit is now canonical (local snapshot confirmed written
 *   for demo, or the account row confirmed updated — `deliveryTier` says
 *   which, since a caller must never blur "your account has this" into
 *   "this tab has this"). `areaChangeBlocked` is true when a requested area
 *   move was dropped because the task's project lives in a different area
 *   — title/description still saved. `savedAreaId` is always the WORKFLOW-
 *   space id of the area actually saved (the task's own area when blocked,
 *   the requested one otherwise): `task.area_id` on the account branch is
 *   the server's PERSISTED-space uuid, not the id `state.areas` is keyed
 *   by, so a caller naming the destination by area must read this field,
 *   not `task.area_id`.
 * - "invalid": normalization/field validation failed; nothing was written.
 * - "conflict": the task changed underneath the editor (no longer backlog,
 *   or edited again since the form opened) — a recoverable, not a failure.
 * - "not-found": the task no longer exists in this device's state.
 * - "failure": auth/network/storage refused the write.
 *
 * `refreshPending`: true for a confirmed account write whose exact fields
 * could NOT be safely reflected into this tab's local state — either the
 * signed-in identity changed since the write started, or this same task
 * changed locally in the meantime (both checked fresh, right before any
 * dispatch). The write is genuinely saved — this is still "success", never
 * "failure" — but the caller must say so explicitly (not the plain "Saved to
 * your account" copy) rather than silently closing over fields the screen
 * never actually received. Always `false`/absent for demo saves and for a
 * fully-reflected account save.
 */
export type TaskEditResult =
  | {
      status: "success";
      task: Task;
      areaChangeBlocked: boolean;
      savedAreaId: string;
      deliveryTier: "account" | "demo";
      refreshPending?: boolean;
    }
  | { status: "invalid"; errors: TaskEditFieldErrors }
  | { status: "conflict" }
  | { status: "not-found" }
  | { status: "failure" };

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
  // #688: true when the ONLY reason account sync is off is that nobody is
  // signed in. Lets banners present one calm signed-out state with a
  // sign-in door instead of failure language. A true auth *failure* with a
  // live session never sets this.
  signedOut?: boolean;
}

export const initialSyncStatus: WorkflowSyncStatus = {
  storage: "available",
  account: "checking",
  message: null,
  pendingLocalChanges: false,
};
