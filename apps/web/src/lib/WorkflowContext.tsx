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
  type Area,
  type RollupSummary,
  type RollupSummaryContent,
} from "@lifeos/schemas";
import {
  acceptDraft,
  acceptProposal,
  backlogDraft,
  carryForwardTask,
  createLocalProposalFromTask,
  deferTask,
  dropTask,
  markCurrentSession,
  planTaskAtHour,
  promoteBacklogTask,
  rejectProposal,
  saveReview,
  startExecutionSession,
  findLiveSession,
  swapWipSlot,
  syncWorkflowIdCounterFromState,
  unplanTask,
  updateTaskFirstTinyStep,
  updateProposal,
  clearWipRefusal,
  type WipRefusal,
  type WorkflowState,
} from "./workflow";
import type { SessionSaveResult } from "./workflowContext/persistenceSync";
import {
  ACCOUNT_UNREACHABLE_NOW,
  DEVICE_STORAGE_BLOCKED,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  SOME_WORK_ON_THIS_DEVICE,
  savedOnThisDeviceAndSendingBanner,
  savedOnThisDeviceBanner,
} from "./statusVocabulary";
import {
  applyTaskReviewTransition,
  syncJournaledRollup,
  syncJournaledWin,
  syncJournaledReviewEntry,
  syncJournaledExecutionSession,
  placeTimeBlock,
  syncJournaledTaskDraftAccept,
  listAreas,
  listOverrideRecords,
  listRollupSummaries,
  listDurationProfiles,
  upsertDurationProfile,
  listPlanningItems,
  listCaptureItems,
  listExecutionReviewItems,
  listSuggestionRecords,
  recordDurationRecalibrationDecision,
  recordPolicyProposalDecision,
  recordRejectedTaskDraft,
  recordPersonLinkRejection,
  recordWipEnforcementEvent,
  syncQueuedCapture,
  unplanCalendarBlock,
  type MinimalSupabaseClient,
} from "./data/workflow";
import {
  AREA_DURATION_TASK_TYPE,
  applyStoredDuration,
  buildPolicyProposals,
  buildProposalRecalibration,
  durationProfileForArea,
  type ProposalRecalibrationVM,
} from "./learning/learningSurface";
import type { PolicyChangeCandidate } from "./learning/overrideScan";
import type { DurationProfile, OverrideRecord } from "@lifeos/schemas";
import {
  reviewEntryLine,
  toWorkflowBlock,
  toWorkflowCapture,
  toWorkflowProposal,
  toWorkflowSession,
  toWorkflowTask,
  workflowAreaIdForPersistedAreaId,
} from "./data/workflowPersistedNormalization";
import { createSupabaseBrowserClient } from "./supabase/browser";
import {
  clearQueue,
  listPendingCaptures,
  markCaptureSynced,
  pendingCaptureCount,
} from "./capture/offlineQueue";
import type { Phase2MockExecutionSession } from "./types";
import { workflowAreaIdForPersistedArea } from "./workflowAreaMapping";
import {
  STORAGE_KEY,
  createSyncedInitialState,
  decidedPolicyKeysFromSuggestionRecords,
  isUuid,
  loadStoredSelectedAreaId,
  loadStoredStateFromSession,
  mergePersistedCalendarBlocks,
  NIL_UUID,
  persistedAreaIdForWorkflowId,
  persistedIdForLocalId,
  isSignedOutError,
  persistedLoadFailureMessage,
  persistedSaveFailureMessage,
  persistedSyncFailureMessage,
  policyDecisionKey,
  storeSelectedAreaId,
  workflowReducer,
  type PersistedWorkflowPayload,
} from "./workflowContext/reducerCore";
import { createApplyWorkflowState } from "./workflowContext/applyWorkflowState";
import {
  createPersistenceSync,
  type PersistenceSyncOps,
} from "./workflowContext/persistenceSync";
import { createCalendarApproval } from "./workflowContext/calendarApproval";
import { createCaptureParseOps } from "./workflowContext/captureParse";
import { useTaskMapDraftActions } from "./workflowContext/taskMapDraft";
import {
  initialSyncStatus,
  type CaptureParseState,
  type DeferTaskWithSessionResult,
  type GoogleCalendarBridgeResult,
  type ReviewSaveResult,
  type TaskMapDraftState,
  type WinConfirmResult,
  type WorkflowContextValue,
  type WorkflowSyncStatus,
} from "./workflowContext/types";
// #737-A slice 2: wins and reviews are journalled to the device before any
// network call, then replayed to the account idempotently.
import {
  hasPendingWrite,
  journalRollupWrite,
  journalWinWrite,
  replayDurableWrites,
  resolveSupersededWrites,
} from "./durability/durableWrites";
import {
  listPendingWrites,
  pendingWriteCount,
  type ReplaySummary,
} from "./durability/pendingWriteJournal";
// Final UX Loop C1, Target Cards 1+7 (audit P0#4): one definition of which
// calendar day a close belongs to, and one answer to "is it closed already?".
import { localIsoDate, resolveDayClose } from "./review/dayClose";

// Slice 4 (#590) re-exports — same public names, new homes. Every existing
// `import { X } from "@/lib/WorkflowContext"` site keeps compiling unchanged.
export type {
  CaptureParseState,
  GoogleCalendarBridgeResult,
  TaskMapDraftState,
  WorkflowContextValue,
  WorkflowSyncStatus,
};
export { decidedPolicyKeysFromSuggestionRecords, mergePersistedCalendarBlocks };

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

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
  const [captureParse, setCaptureParse] = useState<CaptureParseState>({
    phase: "idle",
  });
  const [taskMapDraft, setTaskMapDraft] = useState<TaskMapDraftState>({
    phase: "idle",
  });
  // S9 (#261): loaded override_records (learning history) + the set of policy
  // proposals the user has already decided this session (so a decided proposal
  // leaves the review surface without needing a reload).
  const [unsyncedCaptureCount, setUnsyncedCaptureCount] = useState(0);
  const [overrideRecords, setOverrideRecords] = useState<OverrideRecord[]>([]);
  // E1 (#456): accepted per-area duration profiles. Once the user accepts a
  // recalibration, its multiplier is stored here and future proposals in that
  // area default to the adjusted duration. Supabase-only (mock/demo defaults to
  // an empty list); loaded failure-isolated below.
  const [durationProfiles, setDurationProfiles] = useState<DurationProfile[]>(
    [],
  );
  const [decidedPolicyKeys, setDecidedPolicyKeys] = useState<Set<string>>(
    () => new Set(),
  );
  // Final UX Loop C1, Target Cards 1+7 (audit P0#4) — the two tiers that can
  // hold "this day is closed", kept apart because they mean different things
  // to the user and the copy differs:
  //
  //  - ACCOUNT: `period_start` of every daily `review_entries` row loaded for
  //    this user. Outlives the device; this is what a second machine sees.
  //  - DEVICE: `period_start` of every daily review still sitting in the
  //    pending-write journal. Durable (IndexedDB survives a reload and is
  //    visible to a new tab) but the account does not have it yet.
  //
  // Provider state rather than reducer state on purpose: both are FETCHED
  // (one from Supabase, one from IndexedDB), the same tier as
  // `overrideRecords` and `durationProfiles` beside them, and neither belongs
  // in the session-storage mirror of the workflow.
  const [accountClosedDays, setAccountClosedDays] = useState<string[]>([]);
  const [journalledClosedDays, setJournalledClosedDays] = useState<string[]>(
    [],
  );
  // Audit P0#4: the close for the day currently being written, if any. A ref
  // rather than state because it must be readable and writable WITHIN one
  // render — its whole job is to catch the second press that lands before the
  // first has re-rendered anything.
  const inFlightDayCloseRef = useRef<{
    day: string;
    promise: Promise<ReviewSaveResult>;
  } | null>(null);
  const activeParseCaptureIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const persistedAreasRef = useRef<Area[]>([]);
  const persistedCaptureIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedTaskIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedProposalIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedBlockIdByLocalIdRef = useRef(new Map<string, string>());
  const persistedSessionIdByLocalIdRef = useRef(new Map<string, string>());
  // FR-031 slice 5: mirrors `taskMapDraft` state so the approve action can
  // read the AI draft/suggestion id synchronously (for override diffing)
  // without a stale closure over the useState value.
  const taskMapDraftRef = useRef<TaskMapDraftState>({ phase: "idle" });

  const markLocalOnly = useCallback((message: string) => {
    setSyncStatus((current) => ({
      ...current,
      account:
        current.account === "sync-error" ? current.account : "local-only",
      message,
      // #688: a plain local-only marker keeps an existing signed-out state
      // (the reason hasn't changed); it never invents one.
      signedOut: current.signedOut ?? false,
      pendingLocalChanges: true,
    }));
  }, []);

  // The browser refuses to hold anything on this device (private mode, a
  // storage quota, a blocking extension). Extracted by #737-A slice 2 because
  // the durable-write path needs the same state the storage-restore and
  // state-mirror effects already set, and three hand-copied literals would
  // drift.
  const markDeviceStorageBlocked = useCallback(() => {
    setSyncStatus((current) => ({
      ...current,
      storage: "blocked",
      message: DEVICE_STORAGE_BLOCKED,
      pendingLocalChanges: true,
    }));
  }, []);

  const markAccountSynced = useCallback(() => {
    setSyncStatus((current) => ({
      ...current,
      account: "synced",
      signedOut: false,
      message: current.pendingLocalChanges ? SOME_WORK_ON_THIS_DEVICE : null,
    }));
  }, []);

  const markAccountSyncError = useCallback((message: string) => {
    setSyncStatus((current) => ({
      ...current,
      account: "sync-error",
      message,
      signedOut: false,
      pendingLocalChanges: true,
    }));
  }, []);

  // #688: signed out is not a failure. When the only reason saved data
  // didn't load is that nobody is signed in, report one calm local-only
  // state (with `signedOut` set so banners can offer the sign-in door)
  // instead of the failure-toned load-error message. True failures with a
  // live session keep the failure language below.
  const markSignedOutLocal = useCallback(() => {
    setSyncStatus((current) => ({
      ...current,
      account: "local-only",
      message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
      signedOut: true,
      pendingLocalChanges: true,
    }));
  }, []);

  const markPersistedLoadFailure = useCallback(
    (error: unknown) => {
      if (isSignedOutError(error)) {
        markSignedOutLocal();
        return;
      }
      markAccountSyncError(
        persistedSyncFailureMessage(error, persistedLoadFailureMessage),
      );
    },
    [markAccountSyncError, markSignedOutLocal],
  );

  const markPersistedSaveFailure = useCallback(
    (error: unknown) => {
      markAccountSyncError(
        persistedSyncFailureMessage(error, persistedSaveFailureMessage),
      );
    },
    [markAccountSyncError],
  );

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
      // #691: `null` is the user's explicit All-areas choice, not a missing
      // value — an area sync must never stomp it back to the first area.
      if (current === null) {
        return null;
      }
      if (syncedAreas.some((area) => area.id === current)) {
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

  /**
   * #737 C1 S5 — THE MISSING HALF OF `pendingLocalChanges`, flagged on #736.
   *
   * Nine call sites set this flag to `true`; not one ever set it back. So the
   * moment anything went local-only — a signed-out session, one flaky save —
   * every surface reading it was pinned to "some of your work is on this
   * device" for the rest of the page's life, including long after the work had
   * reached the account. #736's masthead indicator was built on that flag,
   * which is why it could not be trusted and why S5 rebuilds it.
   *
   * ## What makes the recomputation honest rather than merely convenient
   *
   * The flag means "there is work on this device the account does not have".
   * The queues answer that directly: the pending-writes journal and the
   * offline capture queue hold exactly the writes still owed to the account.
   *
   * What the queues do NOT hold are the writes with no server destination at
   * all — a proposal edit, a first-move edit, an approved task map, a draft
   * edit with no accept, a WIP swap. Those also set the flag, and clearing it
   * on an empty queue while one of them was outstanding would be a new
   * falsehood in place of the old one.
   *
   * They are not outstanding here, and the reason is the CALLER, not this
   * function: this runs only after a drain or a completed
   * `syncPersistedWorkflowRows`, and that sync re-reads the account and
   * reconciles local state against it. Anything the account lacked and could
   * never receive has been overwritten by the account's own row by the time
   * this runs — it is no longer on the device to be reported. So after a full
   * sync, "work the account does not have" IS "work still queued".
   *
   * That is also why this is deliberately NOT called from anywhere else. Run
   * mid-session, off the back of no sync, it would clear the flag over exactly
   * the unsendable writes the paragraph above rules out.
   *
   * Best-effort on read failure: the flag is left exactly as it was rather
   * than being cleared on a guess.
   */
  const refreshPendingLocalChanges = useCallback(async () => {
    let queued: number;
    try {
      queued = (await pendingWriteCount()) + (await pendingCaptureCount());
    } catch {
      return;
    }

    setSyncStatus((current) => {
      const pendingLocalChanges = queued > 0;
      if (current.pendingLocalChanges === pendingLocalChanges) return current;
      return {
        ...current,
        pendingLocalChanges,
        // Silence is the resting state (`resolveDeviceSaveNotice`): with
        // nothing owed and the account reached, there is nothing a person
        // needs to know, and a permanent "all synced" marker is furniture.
        // The message is only dropped when the account is genuinely reached —
        // a `local-only` or `sync-error` state keeps its own sentence.
        message:
          !pendingLocalChanges && current.account === "synced"
            ? null
            : current.message,
      };
    });
  }, []);

  const syncPersistedWorkflowRows = useCallback(
    async (
      client: MinimalSupabaseClient | null,
      areas = persistedAreasRef.current,
    ) => {
      if (!client) {
        markLocalOnly(ACCOUNT_UNREACHABLE_NOW);
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
        markLocalOnly(ACCOUNT_UNREACHABLE_NOW);
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
              (proposal): proposal is NonNullable<typeof proposal> =>
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
      // Audit P0#4: `reviewEntryLine` flattens each row to a display string,
      // so the reviewLog above cannot answer "is today closed?". The dates are
      // kept structured here instead — the account tier of that answer.
      setAccountClosedDays(
        executionResult.reviewEntries
          .filter((entry) => entry.review_type === "daily")
          .map((entry) => entry.period_start),
      );
      markAccountSynced();
      // #737 C1 S5: the account has just been re-read and local state
      // reconciled against it, which is the ONLY moment "still queued" and
      // "not in the account" mean the same thing. See
      // `refreshPendingLocalChanges` for why it is called here and nowhere
      // else.
      void refreshPendingLocalChanges();

      // S9 (#261): load learning history for the override-pattern scan. Kept
      // OUT of the strict provider gate above and failure-isolated — a missing
      // override read must never knock the workflow sync into local-only.
      void listOverrideRecords(client)
        .then((result) => {
          if (result.provider === "supabase") {
            setOverrideRecords(result.overrideRecords);
          }
        })
        .catch(() => {
          // Non-fatal: the review surface simply shows no policy proposals.
        });

      // E1 (#456): load accepted duration profiles so planning defaults to the
      // adjusted duration in areas the user has recalibrated. Failure-isolated
      // like the override load — a missing read just means planning falls back
      // to raw estimates.
      void listDurationProfiles(client)
        .then((result) => {
          if (result.provider === "supabase") {
            setDurationProfiles(result.durationProfiles);
          }
        })
        .catch(() => {
          // Non-fatal: proposals default to the raw estimate.
        });

      // E2 (#261 follow-up): seed decidedPolicyKeys from prior-session decisions
      // so an accepted/declined policy proposal stays hidden across reloads, not
      // just within the session that decided it. Merge (never replace) so any
      // decision made this session before the load resolves is preserved.
      void listSuggestionRecords(client)
        .then((result) => {
          if (result.provider !== "supabase") return;
          const decided = decidedPolicyKeysFromSuggestionRecords(
            result.suggestionRecords,
          );
          if (decided.length === 0) return;
          setDecidedPolicyKeys((current) => new Set([...current, ...decided]));
        })
        .catch(() => {
          // Non-fatal: a decided proposal may reappear until it is re-decided.
        });
    },
    [
      buildDropLocalIds,
      markAccountSynced,
      markLocalOnly,
      refreshPendingLocalChanges,
    ],
  );

  // #737-A slice 2: drain the win/review journal to the account, oldest write
  // first. Safe to call on every mount, every reconnect, and right after a
  // user action — an entry already delivered is gone from the journal, and one
  // still queued is retried under its own idempotency key.
  //
  // Returns early with no client exactly like `syncOfflineQueue` does. This is
  // load-bearing, not defensive: `syncJournaledWin(null, ...)` resolves with
  // provider "mock", and the dispatcher's own `requireAccountWrite` guard
  // rejects that so the entry survives. Two guards because losing a write here
  // is the failure this program exists to end.
  const replayJournaledWrites =
    useCallback(async (): Promise<ReplaySummary> => {
      // #737 C1 S5 — BEFORE the client check, deliberately.
      //
      // Cancelling a write the user took back is a DEVICE-tier operation: it
      // involves no account, and it is exactly the signed-out/offline session
      // where the bug it fixes bites (#778's disclosed resurrection needs the
      // placement to be queued, which only happens when the account is
      // unreachable). If this sat after the early return, an undo made in
      // demo mode or while signed out would leave the placement queued until
      // the first replay that found a client — i.e. until the moment it was
      // about to be delivered, which is too late.
      //
      // `replayDurableWrites` runs the same pass again below. That is not a
      // bug: the pass is idempotent (a resolved pair is gone from the
      // journal), and keeping it inside `replayDurableWrites` is what makes
      // that function correct for every OTHER caller, including its tests.
      try {
        await resolveSupersededWrites();
      } catch {
        // Nothing cancelled, nothing lost; both halves stay queued.
      }

      const client = createSupabaseBrowserClient();
      if (!client) return { synced: 0, failed: 0, skipped: 0 };

      return replayDurableWrites({
        syncWin: (args) => syncJournaledWin(client, args),
        syncReview: (args) => syncJournaledReviewEntry(client, args),
        syncExecutionSession: (args) =>
          syncJournaledExecutionSession(client, args),
        // Late id resolution: a win journalled while signed out carries only its
        // workflow-local task id. By replay time the account rows have loaded,
        // so the mapping may now exist. If it still does not, the dispatcher
        // keeps the write queued rather than filing it against a guessed area.
        resolveWinIds: (payload) => {
          const workflowTaskId = String(payload.workflow_task_id);
          const task = stateRef.current.tasks.find(
            (candidate) => candidate.id === workflowTaskId,
          );
          return {
            persistedTaskId: persistedIdForLocalId(
              workflowTaskId,
              persistedTaskIdByLocalIdRef.current,
            ),
            persistedAreaId: task
              ? persistedAreaIdForWorkflowId(
                  task.area_id,
                  persistedAreasRef.current,
                )
              : null,
          };
        },
        // Late resolution for a session outcome journalled before its task
        // and block had account ids. A null BLOCK id is left null on purpose:
        // that is the blockless session (audit P0#2), not a missing mapping —
        // the dispatcher tells the two apart by `workflow_block_id`.
        resolveExecutionSessionIds: (payload) => ({
          persistedTaskId: persistedIdForLocalId(
            String(payload.workflow_task_id),
            persistedTaskIdByLocalIdRef.current,
          ),
          persistedBlockId:
            payload.workflow_block_id === null
              ? null
              : persistedIdForLocalId(
                  String(payload.workflow_block_id),
                  persistedBlockIdByLocalIdRef.current,
                ),
        }),
        // Same late resolution for the review's area. Returning null when the
        // area has still not synced is what keeps the review queued rather
        // than filed under no area (see `reviewHandler`).
        resolveReviewAreaId: (payload) =>
          payload.workflow_area_id === null
            ? null
            : persistedAreaIdForWorkflowId(
                String(payload.workflow_area_id),
                persistedAreasRef.current,
              ),

        // --- #737 C1 S3: plans ------------------------------------------
        syncPlanPlacement: async (args) => {
          const result = await placeTimeBlock(client, args);
          return {
            provider: result.provider,
            persistedProposalId: result.proposal?.id ?? null,
            persistedBlockId: result.block?.id ?? null,
          };
        },
        resolvePlanPlacementIds: (payload) => ({
          persistedTaskId: persistedIdForLocalId(
            String(payload.workflow_task_id),
            persistedTaskIdByLocalIdRef.current,
          ),
          // Null is a legitimate answer, not a missing mapping: it means the
          // account holds no proposal for this placement and `place_time_block`
          // must mint one.
          persistedProposalId:
            payload.workflow_proposal_id === null
              ? null
              : persistedIdForLocalId(
                  String(payload.workflow_proposal_id),
                  persistedProposalIdByLocalIdRef.current,
                ),
        }),
        // Without this the block would be delivered and still look unsynced to
        // this device, so every later edit, unplan, or focus session on it
        // would fall back to its local-only path.
        recordPlanPlacementIds: (payload, result) => {
          if (payload.workflow_proposal_id && result.persistedProposalId) {
            persistedProposalIdByLocalIdRef.current.set(
              String(payload.workflow_proposal_id),
              result.persistedProposalId,
            );
          }
          if (payload.workflow_block_id && result.persistedBlockId) {
            persistedBlockIdByLocalIdRef.current.set(
              String(payload.workflow_block_id),
              result.persistedBlockId,
            );
          }
        },

        // --- #737 C1 S3: triage drafts ----------------------------------
        syncTaskDraftAccept: async (args) => {
          const result = await syncJournaledTaskDraftAccept(client, args);
          return {
            provider: result.provider,
            persistedTaskId: result.task?.id ?? null,
            persistedProposalId: result.proposal?.id ?? null,
          };
        },
        resolveTaskDraftAcceptIds: (payload) => ({
          persistedAreaId: persistedAreaIdForWorkflowId(
            String(payload.workflow_area_id),
            persistedAreasRef.current,
          ),
          // A null capture id is legitimate — the capture may never have
          // reached the account — so it is left null rather than blocking.
          persistedCaptureId:
            payload.workflow_capture_id === null
              ? null
              : persistedIdForLocalId(
                  String(payload.workflow_capture_id),
                  persistedCaptureIdByLocalIdRef.current,
                ),
        }),
        recordTaskDraftAcceptIds: (payload, result) => {
          if (result.persistedTaskId) {
            persistedTaskIdByLocalIdRef.current.set(
              String(payload.workflow_task_id),
              result.persistedTaskId,
            );
          }
          if (payload.workflow_proposal_id && result.persistedProposalId) {
            persistedProposalIdByLocalIdRef.current.set(
              String(payload.workflow_proposal_id),
              result.persistedProposalId,
            );
          }
        },

        // --- #737 C1 S5: rollups ----------------------------------------
        syncRollup: (args) => syncJournaledRollup(client, args),
        // Same late resolution as the review's area, and the same rule: a
        // rollup whose area still has no account id waits rather than being
        // filed against a guess. `rollup_summaries.area_id` is NOT NULL, so
        // "no area" is not even an available answer here.
        resolveRollupAreaId: (payload) =>
          persistedAreaIdForWorkflowId(
            String(payload.workflow_area_id),
            persistedAreasRef.current,
          ),

        // --- #737 C1 S5: the compensating actions -----------------------
        // These only ever run for an undo whose original ALREADY reached the
        // account — a queued original is annulled before dispatch, without a
        // network call. So they are real server undos, not cancellations.
        syncPlanUnplacement: async (args) => {
          const result = await unplanCalendarBlock(client, args.block_id);
          return { provider: result.provider };
        },
        resolvePlanUnplacementBlockId: (payload) =>
          persistedIdForLocalId(
            String(payload.workflow_block_id),
            persistedBlockIdByLocalIdRef.current,
          ),
        syncTaskDrop: async (args) => {
          const result = await applyTaskReviewTransition(
            client,
            args.task_id,
            "dropped",
          );
          return { provider: result.provider };
        },
        resolveTaskDropTaskId: (payload) =>
          persistedIdForLocalId(
            String(payload.workflow_task_id),
            persistedTaskIdByLocalIdRef.current,
          ),
      });
    }, []);

  const applyWorkflowState = createApplyWorkflowState(stateRef, dispatch);

  const persistenceOps: PersistenceSyncOps = createPersistenceSync({
    persistedAreasRef,
    persistedCaptureIdByLocalIdRef,
    persistedTaskIdByLocalIdRef,
    persistedProposalIdByLocalIdRef,
    persistedBlockIdByLocalIdRef,
    persistedSessionIdByLocalIdRef,
    selectedAreaId,
    markLocalOnly,
    markDeviceStorageBlocked,
    replayJournaledWrites,
    syncPersistedWorkflowRows,
  });

  // S7 (#259), made durable by #737-A slice 2. Only ever called on explicit
  // confirm (never on skip).
  //
  // THE ORDER IS THE POINT. This used to open with `if (!client) return;`, so
  // a win confirmed while signed out or in mock mode was written NOWHERE while
  // the UI said "Win logged" and the fallback banner said it was "saved on
  // this device". Now the device journal is written FIRST and the account
  // write is a replay of it, so:
  //
  //  - "saved on this device" is true before the user is told it, and a new
  //    tab can read the win back out of the journal;
  //  - a win confirmed offline reaches the account on the next replay;
  //  - if the device itself refuses to hold it, the caller learns the write
  //    failed instead of being told a comforting lie.
  const confirmWin = useCallback(
    async (input: {
      taskId: string;
      title: string;
      detail?: string | null;
    }): Promise<WinConfirmResult> => {
      const title = input.title.trim();
      if (title.length === 0) return "failure";

      const task = stateRef.current.tasks.find((t) => t.id === input.taskId);
      const persistedTaskId = persistedIdForLocalId(
        input.taskId,
        persistedTaskIdByLocalIdRef.current,
      );
      const persistedAreaId = task
        ? persistedAreaIdForWorkflowId(task.area_id, persistedAreasRef.current)
        : null;
      // Pinned here, at the moment the user confirmed. Replay may not run
      // until tomorrow; a win confirmed at 23:50 must not be filed under the
      // following day.
      //
      // #737 C1 S5: and pinned to the user's LOCAL calendar day. This was
      // `new Date().toISOString().slice(0, 10)` — the UTC day — which is the
      // same defect #775 fixed for `period_start` and #778 flagged here as the
      // next instance of the pattern. It matters precisely where wins are
      // harvested: the Close moment counts its day with `localIsoDate`, so
      // west of Greenwich every evening win was filed under TOMORROW and
      // vanished from the very surface that logged it.
      const occurredAt = localIsoDate(new Date());

      let journalled;
      try {
        journalled = await journalWinWrite({
          workflowTaskId: input.taskId,
          persistedTaskId,
          persistedAreaId,
          title,
          detail: input.detail ?? null,
          occurredAt,
        });
      } catch {
        // No IndexedDB. The win is genuinely nowhere; say so and let the
        // caller withhold its success copy.
        markDeviceStorageBlocked();
        return "failure";
      }

      try {
        await replayJournaledWrites();
      } catch {
        // Best-effort: the win stays journalled and the next replay retries.
      }

      if (await hasPendingWrite(journalled.client_write_id)) {
        markLocalOnly(savedOnThisDeviceAndSendingBanner("Your win"));
        return "device-only";
      }

      markAccountSynced();
      return "persisted";
    },
    [
      markAccountSynced,
      markDeviceStorageBlocked,
      markLocalOnly,
      replayJournaledWrites,
    ],
  );

  // FR-031 slice 5 — task-map draft generation/approve/completion actions.
  // Extracted to workflowContext/taskMapDraft.ts (issue #590 slice 4); this
  // custom hook is a contiguous run of the same four useCallback hooks that
  // used to live inline here, called unconditionally at this same position
  // so the flattened hook order is unchanged.
  const {
    requestTaskMapDraftAction,
    dismissTaskMapDraftAction,
    approveTaskMapDraftAction,
    toggleTaskMapNodeCompletionAction,
  } = useTaskMapDraftActions({
    dispatch,
    taskMapDraftRef,
    setTaskMapDraft,
    stateRef,
    persistedAreasRef,
    persistedTaskIdByLocalIdRef,
    markLocalOnly,
    syncPersistedWorkflowRows,
  });

  // S8 (#260, extended #486): persist a user-APPROVED rollup (NS-INV-4 —
  // dismissed drafts never reach here). `periodType` is caller-supplied
  // (weekly and monthly rollups share this exact persistence path — no new
  // write path per #486).
  //
  // #737 C1 S5 — MADE TRUE. This was the last member of the wins/reviews
  // family still opening with `if (!client) return;` and still ending in a
  // `markLocalOnly(savedOnThisDeviceBanner("Your rollup"))` over a write that
  // had happened NOWHERE: not on the device, not in the account. S2's report
  // flagged it as a standing falsehood and this closes it on S2's own
  // pattern — the device journal first, the account write as a replay of it —
  // so "saved on this device" is true before the user is told it, another tab
  // can read the rollup back, and a rollup approved offline reaches the
  // account on the next replay.
  const confirmRollup = useCallback(
    async (input: {
      areaId: string;
      periodType: "week" | "month";
      periodStart: string;
      periodEnd: string;
      summary: RollupSummaryContent;
    }) => {
      // Resolved if known, left to replay if not — the win/review rule. It is
      // no longer a reason to give up on the write: `rollupHandler` re-resolves
      // it and keeps the entry queued until the area has an account id.
      const persistedAreaId = persistedAreaIdForWorkflowId(
        input.areaId,
        persistedAreasRef.current,
      );

      let journalled;
      try {
        journalled = await journalRollupWrite({
          workflowAreaId: input.areaId,
          persistedAreaId,
          periodType: input.periodType,
          // Period bounds come from the caller's rollup draft and are already
          // pinned to the period they summarise; nothing here re-derives a day
          // from the replay clock.
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          summary: input.summary,
        });
      } catch {
        // No IndexedDB. The rollup is genuinely nowhere — say so rather than
        // claiming the device has it.
        markDeviceStorageBlocked();
        return;
      }

      try {
        await replayJournaledWrites();
      } catch {
        // Best-effort: the rollup stays journalled and the next replay retries.
      }

      if (await hasPendingWrite(journalled.client_write_id)) {
        markLocalOnly(savedOnThisDeviceAndSendingBanner("Your rollup"));
        return;
      }

      markAccountSynced();
    },
    [
      markAccountSynced,
      markDeviceStorageBlocked,
      markLocalOnly,
      replayJournaledWrites,
    ],
  );

  // #486: read-only fetch of this user's already-APPROVED rollups, resolved
  // to workflow-scoped area ids (same mapping `confirmRollup` writes through)
  // so callers can group/compare without knowing about persisted area ids.
  // Reuses `listRollupSummaries` (S8, previously unused outside tests) — no
  // new persistence path. Mock/preview (no client) returns an empty list, the
  // same "nothing to show" the rest of the rollup surface already treats as
  // honest, not degraded.
  const listApprovedRollups = useCallback(async (): Promise<
    RollupSummary[]
  > => {
    const client = createSupabaseBrowserClient();
    if (!client) return [];

    try {
      const result = await listRollupSummaries(client);
      return result.rollupSummaries.map((row) => ({
        ...row,
        area_id:
          workflowAreaIdForPersistedAreaId(
            row.area_id,
            persistedAreasRef.current,
          ) ?? row.area_id,
      }));
    } catch {
      return [];
    }
  }, []);

  // S9 (#261): a stable key for a (policy, area) proposal so a decided proposal
  // is hidden without a reload. Mirrors the scan's grouping.
  const policyProposalKey = (candidate: PolicyChangeCandidate) =>
    policyDecisionKey(candidate.policyIdentifier, candidate.areaId);

  // Override-pattern proposals still awaiting the user's decision this session.
  const overridePolicyProposals = buildPolicyProposals(overrideRecords).filter(
    (candidate) => !decidedPolicyKeys.has(policyProposalKey(candidate)),
  );

  // Record the user's decision on a policy proposal (propose->approve). Nothing
  // mutates a default — the suggestion_record IS the recorded decision — and the
  // proposal leaves the surface. Fire-and-forget write (NS-INV-3).
  const decideOverridePolicyProposal = useCallback(
    (candidate: PolicyChangeCandidate, decision: "accepted" | "declined") => {
      recordPolicyProposalDecision(createSupabaseBrowserClient(), {
        area_id: candidate.areaId,
        policy_identifier: candidate.policyIdentifier,
        decision,
        evidence: candidate.evidence,
        examined: candidate.examined,
        override_count: candidate.overrideCount,
        latest_override_type: candidate.latestOverrideType,
        resolved_at: new Date().toISOString(),
      });
      setDecidedPolicyKeys((current) => {
        const next = new Set(current);
        next.add(policyProposalKey(candidate));
        return next;
      });
    },
    [],
  );

  // The adjusted default duration for a task in `areaId`, once the user has
  // accepted a recalibration for that area — else null (planning uses the raw
  // estimate). Maps the workflow area id to its persisted id (profiles are keyed
  // by the persisted area) before the lookup. This is the read side of
  // apply-on-accept: proposals default to this value.
  const appliedDurationForArea = useCallback(
    (areaId: string | null, estimateMinutes: number) =>
      applyStoredDuration(
        durationProfiles,
        areaId
          ? persistedAreaIdForWorkflowId(areaId, persistedAreasRef.current)
          : null,
        estimateMinutes,
      ),
    [durationProfiles],
  );

  // The sourced duration recalibration for a proposal in `areaId`, or null when
  // the area's actuals don't justify one — OR when the user has already accepted
  // a recalibration for this area (the multiplier is applied now, so the card
  // stops nagging; E2-style suppression). Reads the live reducer state (not
  // stateRef, which lags a render behind) because this is called during render.
  const recalibrationForProposal = useCallback(
    (areaId: string | null, estimateMinutes: number) => {
      const persistedAreaId = areaId
        ? persistedAreaIdForWorkflowId(areaId, persistedAreasRef.current)
        : null;
      if (durationProfileForArea(durationProfiles, persistedAreaId))
        return null;
      return buildProposalRecalibration(
        state.executionSessions,
        areaId,
        estimateMinutes,
      );
    },
    [state.executionSessions, durationProfiles],
  );

  // Decide a shown recalibration. On accept it ACTS: (1) records the decision
  // (NS-INV-3), (2) persists a per-area duration profile so future proposals in
  // the area default to the adjusted duration, and (3) retimes THIS pending
  // proposal to the adjusted duration immediately (it has no block yet — the
  // card only renders on proposed/edited proposals — so this is a purely local
  // timing edit, no scheduled/Google-backed block to touch). Dismiss records the
  // decision and changes nothing. A plain handler (not useCallback) — it fires on
  // click, never during render, and reuses the render-recreated persist helpers.
  const decideDurationRecalibration = (
    input: {
      proposalId: string;
      proposedStart: string;
      areaId: string | null;
      recalibration: ProposalRecalibrationVM;
    },
    decision: "accepted" | "dismissed",
  ) => {
    const client = createSupabaseBrowserClient();
    recordDurationRecalibrationDecision(client, {
      area_id: input.areaId,
      decision,
      multiplier: input.recalibration.recalibration.multiplier,
      sample_count: input.recalibration.recalibration.sampleCount,
      estimate_minutes: input.recalibration.estimateMinutes,
      adjusted_minutes: input.recalibration.adjustedMinutes,
      resolved_at: new Date().toISOString(),
    });

    if (decision !== "accepted") return;

    const multiplier = input.recalibration.recalibration.multiplier;
    const sampleCount = input.recalibration.recalibration.sampleCount;
    const persistedAreaId = input.areaId
      ? persistedAreaIdForWorkflowId(input.areaId, persistedAreasRef.current)
      : null;

    // Persist + optimistically apply the area profile so the suppression and
    // future-proposal default take effect immediately. Only a real persisted
    // area id can back the FK; demo/unmapped areas still retime locally below.
    if (persistedAreaId && isUuid(persistedAreaId)) {
      setDurationProfiles((current) => {
        const rest = current.filter(
          (profile) =>
            !(
              profile.area_id === persistedAreaId &&
              profile.task_type === AREA_DURATION_TASK_TYPE
            ),
        );
        return [
          ...rest,
          {
            id: crypto.randomUUID(),
            user_id: NIL_UUID,
            area_id: persistedAreaId,
            task_type: AREA_DURATION_TASK_TYPE,
            estimate_stats_json: { multiplier, sample_count: sampleCount },
            sample_count: sampleCount,
            last_updated_at: new Date().toISOString(),
          },
        ];
      });
      if (client) {
        void upsertDurationProfile(client, {
          area_id: persistedAreaId,
          task_type: AREA_DURATION_TASK_TYPE,
          estimate_stats: { multiplier, sample_count: sampleCount },
          sample_count: sampleCount,
        }).catch(() => {
          // Non-fatal: the profile stays applied locally this session and is
          // re-derived from actuals next time; a write failure never blocks.
        });
      }
    }

    // Retime this pending proposal to the adjusted duration now (immediate
    // "act for me"), reusing the proven edit-timing path.
    const previous = stateRef.current;
    const proposedEnd = new Date(
      new Date(input.proposedStart).getTime() +
        input.recalibration.adjustedMinutes * 60 * 1000,
    ).toISOString();
    const next = updateProposal(previous, input.proposalId, {
      proposed_start: input.proposedStart,
      proposed_end: proposedEnd,
      rationale: `Sized to your area actuals (${multiplier}x).`,
    });
    if (next === previous) return;
    applyWorkflowState(next);
    const editedProposal =
      next.timeBlockProposals.find(
        (proposal) => proposal.id === input.proposalId,
      ) ?? null;
    if (editedProposal) {
      void persistenceOps
        .persistEditedLocalProposal(editedProposal)
        .catch((error) => {
          markPersistedSaveFailure(error);
        });
    }
  };

  // Extracted to workflowContext/calendarApproval.ts (issue #590 slice 4) —
  // these are plain functions (no hooks), so this factory call can sit here
  // without affecting hook order. Binding invariant preserved unchanged: no
  // external calendar write without explicit UI approval.
  const calendarApprovalOps = createCalendarApproval({
    stateRef,
    persistedProposalIdByLocalIdRef,
    persistedBlockIdByLocalIdRef,
    applyWorkflowState,
    syncPersistedWorkflowRows,
    markPersistedLoadFailure,
  });

  useEffect(() => {
    const restored = loadStoredStateFromSession();
    const restoredState = restored.state;
    if (restored.storageBlocked) {
      setSyncStatus((current) => ({
        ...current,
        storage: "blocked",
        message: DEVICE_STORAGE_BLOCKED,
        pendingLocalChanges: true,
      }));
    }
    if (restoredState) {
      dispatch({ type: "hydrate", state: restoredState });
      setSelectedAreaId((current) => {
        // #691: `null` = explicit All-areas choice; keep it (see
        // applyPersistedAreas).
        if (
          current === null ||
          restoredState.areas.some((area) => area.id === current)
        ) {
          return current;
        }
        return restoredState.areas[0]?.id ?? null;
      });
    }
    // #691: restore the persisted area selection (single persistence point —
    // LifeOSCockpit's own localStorage copy is retired). Runs after the
    // state reconcile above so the stored selection wins; an id no longer in
    // the area list is ignored (the default/reconciled value stands).
    const storedSelection = loadStoredSelectedAreaId();
    if (storedSelection === null) {
      setSelectedAreaId(null);
    } else if (typeof storedSelection === "string") {
      const areas = restoredState?.areas ?? stateRef.current.areas;
      if (areas.some((area) => area.id === storedSelection)) {
        setSelectedAreaId(storedSelection);
      }
    }
    setHasHydratedFromStorage(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncPersistedAreas() {
      const client = createSupabaseBrowserClient();
      if (!client) {
        markLocalOnly(ACCOUNT_UNREACHABLE_NOW);
        return;
      }

      try {
        const result = await listAreas(client);
        if (cancelled || result.provider !== "supabase") {
          markLocalOnly(ACCOUNT_UNREACHABLE_NOW);
          return;
        }
        applyPersistedAreas(result.areas);
        await syncPersistedWorkflowRows(client, result.areas);
        markAccountSynced();
      } catch (error) {
        markPersistedLoadFailure(error);
      }
    }

    void syncPersistedAreas();

    return () => {
      cancelled = true;
    };
  }, [
    applyPersistedAreas,
    markAccountSynced,
    markPersistedLoadFailure,
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
        message: DEVICE_STORAGE_BLOCKED,
        pendingLocalChanges: true,
      }));
    }
  }, [hasHydratedFromStorage, state]);

  // #691: persist the area selection whenever it changes, gated on hydration
  // (like the state save above) so the pre-restore default never overwrites
  // the stored choice.
  useEffect(() => {
    if (!hasHydratedFromStorage) {
      return;
    }
    storeSelectedAreaId(selectedAreaId);
  }, [hasHydratedFromStorage, selectedAreaId]);

  // FR-027 (F-G1a): refresh the unsynced-count signal from the device queue.
  const refreshUnsyncedCount = useCallback(async () => {
    try {
      setUnsyncedCaptureCount(await pendingCaptureCount());
    } catch {
      // best-effort signal; a queue read failure must not break capture
    }
  }, []);

  /**
   * Audit P0#4 — read the DEVICE tier of "which days are closed" back out of
   * the pending-write journal.
   *
   * This is the tier that makes the verdict honest offline and signed out. A
   * close made with no account reachable is journalled, never sent, and stays
   * in IndexedDB; without this read the Close moment would show its verdict
   * once and then forget it on the next reload — the audit's finding again,
   * one reload later. Reading the journal (rather than remembering in React)
   * also means the verdict and the write agree by construction: if the entry
   * is gone the account took it, and the account tier answers instead.
   *
   * Best-effort, like `refreshUnsyncedCount`: a device that cannot hold the
   * journal at all has already told the user so via `markDeviceStorageBlocked`.
   */
  const refreshJournalledClosedDays = useCallback(async () => {
    try {
      const pending = await listPendingWrites();
      setJournalledClosedDays(
        pending
          .filter((write) => write.entity === "review")
          .map(
            (write) =>
              (write.payload as { period_start?: unknown }).period_start,
          )
          .filter((day): day is string => typeof day === "string"),
      );
    } catch {
      // best-effort signal; a journal read failure must not break the shell
    }
  }, []);

  // Drain the offline queue to the spine when online. Idempotent (upsert on the
  // client_capture_id unique index), fault-isolated per item, and a failed item
  // stays queued for the next reconnect. Refreshes local rows after any sync so
  // the newly-synced captures reach triage.
  const syncOfflineQueue = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const client = createSupabaseBrowserClient();
    if (!client) return;

    let pending;
    try {
      pending = await listPendingCaptures();
    } catch {
      return;
    }
    if (!pending.length) return;

    let syncedAny = false;
    for (const queued of pending) {
      try {
        await syncQueuedCapture(client, {
          raw_text: queued.raw_text,
          area_id: queued.area_id
            ? persistedAreaIdForWorkflowId(
                queued.area_id,
                persistedAreasRef.current,
              )
            : null,
          return_hook: queued.return_hook,
          client_capture_id: queued.client_capture_id,
        });
        await markCaptureSynced(queued.client_capture_id);
        syncedAny = true;
      } catch (error) {
        // Leave it queued; the next reconnect retries. The idempotent upsert
        // means a partially-applied drain never creates a duplicate.
        //
        // #759: this used to swallow the error with no trace at all, which is
        // how a schema bug (the capture_items unique index rejecting every
        // upsert with Postgres 42P10) went undetected in production for
        // every offline capture, forever. Logging the real message is the
        // NFR-004 ("external write failures must be visible") floor. The
        // count badge (`CaptureAffordance`'s `unsyncedCount`, sourced from
        // `unsyncedCaptureCount` below) already tells the user this item is
        // still waiting — it stays truthful once #759's migration fix makes
        // the retry actually succeed. Distinguishing "waiting, about to
        // sync" from "stuck, failing every attempt" in that same badge would
        // need a per-item status the device queue does not currently keep;
        // that is real UI/schema surgery, out of scope for this fix.
        // AGENT-TODO: give the offline queue a per-item last-error/attempt
        // count (`lib/capture/offlineQueue.ts`) and surface a "couldn't
        // sync" state through the existing capture status vocabulary
        // (`lib/statusVocabulary.ts`) once a real failure mode exists that
        // isn't this one.
        console.error(
          "[WorkflowContext] offline capture sync failed, leaving item queued",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    await refreshUnsyncedCount();
    if (syncedAny) {
      await syncPersistedWorkflowRows(client);
    }
  }, [refreshUnsyncedCount, syncPersistedWorkflowRows]);

  // Purge the device-local queue (logout — High-sensitivity raw captures).
  const clearOfflineCaptures = useCallback(async () => {
    await clearQueue();
    await refreshUnsyncedCount();
  }, [refreshUnsyncedCount]);

  // Sync on mount and whenever connectivity returns.
  //
  // #737-A slice 2 arms the win/review journal on the SAME two moments as the
  // offline capture queue, deliberately: one lifecycle to reason about, and
  // the capture queue's is the one already proven in use. The two drains are
  // independent — a failing capture sync must not hold back a queued win — so
  // each is fired on its own and neither awaits the other.
  useEffect(() => {
    void refreshUnsyncedCount();
    void refreshJournalledClosedDays();
    void syncOfflineQueue();
    // Audit P0#4: the replay may DELETE the day's journal entry (the account
    // took it), so the device tier is re-read after every drain — otherwise a
    // synced close would keep showing the device-only sentence.
    void replayJournaledWrites().finally(() => {
      void refreshJournalledClosedDays();
      // #737 C1 S5: a drain that emptied the journal must be able to CLEAR
      // the device-only indicator, not only ever raise it.
      void refreshPendingLocalChanges();
    });
    if (typeof window === "undefined") return;
    const onOnline = () => {
      void syncOfflineQueue();
      void replayJournaledWrites().finally(() => {
        void refreshJournalledClosedDays();
        void refreshPendingLocalChanges();
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [
    refreshUnsyncedCount,
    refreshJournalledClosedDays,
    refreshPendingLocalChanges,
    replayJournaledWrites,
    syncOfflineQueue,
  ]);

  // Extracted to workflowContext/captureParse.ts (issue #590 slice 4) — plain
  // functions (no hooks), so this factory call is positioned after
  // refreshUnsyncedCount (one of its dependencies) without affecting hook
  // order (only actual hook calls above are order-sensitive).
  const captureParseOps = createCaptureParseOps({
    activeParseCaptureIdRef,
    setCaptureParse,
    captureParse,
    stateRef,
    persistedAreasRef,
    applyWorkflowState,
    persistCapture: persistenceOps.persistCapture,
    markLocalOnly,
    markPersistedSaveFailure,
    refreshUnsyncedCount,
  });

  function persistedAreaIdForWipRefusal(refusal: WipRefusal) {
    const task = stateRef.current.tasks.find(
      (item) => item.id === refusal.refused_task_id,
    );
    const draft = stateRef.current.taskDrafts.find(
      (item) => item.id === refusal.refused_task_id,
    );
    const workflowAreaId = task?.area_id ?? draft?.area_id ?? null;
    return workflowAreaId
      ? persistedAreaIdForWorkflowId(workflowAreaId, persistedAreasRef.current)
      : null;
  }

  function recordWipRefusalIfNew(previous: WorkflowState, next: WorkflowState) {
    if (!next.wipRefusal || next.wipRefusal === previous.wipRefusal) {
      return;
    }

    const refusal = next.wipRefusal;
    recordWipEnforcementEvent(createSupabaseBrowserClient(), {
      area_id: persistedAreaIdForWipRefusal(refusal),
      subject_id: refusal.refused_task_id,
      subject_type:
        refusal.activation_path === "triage_accept_to_today"
          ? "task_draft"
          : "task",
      action: "wip_refused",
      refused_task_id: refusal.refused_task_id,
      refused_task_title: refusal.refused_task_title,
      slot_holders: refusal.slot_holders,
      activation_path: refusal.activation_path,
    });
  }

  // FR-031 slice F3 (#664): the triage-accept "map it" offer needs the
  // freshly-created task's id to call `requestTaskMapDraft` — the reducer
  // mints it internally (`nextId("task")`), so it's surfaced back to the
  // caller here rather than re-derived from a lagging `stateRef` read.
  // Returns null when the accept was refused/no-opped (e.g. WIP refusal)
  // so callers never offer a map for a task that was never created.
  function acceptTaskDraftWithPersistence(
    draftId: string,
    status: "active" | "backlog",
  ): string | null {
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
    recordWipRefusalIfNew(previous, next);

    if (draft && localTask) {
      void persistenceOps
        .persistAcceptedTaskDraft(draft, localTask, localProposal, status)
        .catch((error) => {
          markPersistedSaveFailure(error);
        });
    }

    return localTask?.id ?? null;
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
    recordWipRefusalIfNew(previous, next);

    if (localProposal && localBlock) {
      void persistenceOps
        .persistPlannedTask(taskId, localProposal, localBlock)
        .catch((error) => {
          markPersistedSaveFailure(error);
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
    recordWipRefusalIfNew(previous, next);

    if (localSession) {
      void persistenceOps.persistStartedSession(localSession).catch((error) => {
        markPersistedSaveFailure(error);
      });
    }
  }

  async function markSessionWithPersistence(
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
    notes?: string | null,
    capOutcome?: Phase2MockExecutionSession["cap_outcome"],
  ): Promise<SessionSaveResult> {
    const previous = stateRef.current;
    const localSession = findLiveSession(previous);
    const next = markCurrentSession(previous, status, {
      actualMinutes,
      notes,
      capOutcome,
    });

    applyWorkflowState(next);
    recordWipRefusalIfNew(previous, next);

    if (!localSession) {
      // Nothing was running, so nothing was recorded. Saying otherwise is the
      // exact class of claim card 1 exists to end.
      return "not-an-outcome";
    }

    // #572: the caller awaits this so it never shows "closed"/verdict copy
    // before the save attempt has resolved. A persistence failure still
    // resolves (not rejects) — it is a truthful terminal state (recorded via
    // markPersistedSaveFailure), same as the local-only fallback inside
    // persistMarkedSession. #737 C1 adds the RESULT to that contract: the
    // caller now picks its copy from what actually happened.
    try {
      return await persistenceOps.persistMarkedSession(
        localSession,
        status,
        actualMinutes,
        notes,
        capOutcome,
      );
    } catch (error) {
      markPersistedSaveFailure(error);
      return "local-only";
    }
  }

  // #613: atomic cap-DEFER — one transactional boundary for the session
  // outcome AND the task deferral, replacing the prior two-call split
  // (markSessionWithPersistence("stuck", ..., "deferred") awaited, then a
  // separate fire-and-forget deferTask persistence) that could commit the
  // session while the task deferral failed. Local state still updates
  // synchronously/optimistically (session mark + task defer reducers), then
  // ONE persistence call carries both writes atomically via
  // apply_execution_session_defer.
  async function deferTaskWithSessionWithPersistence(
    taskId: string,
    actualMinutes: number,
    notes: string | null,
  ): Promise<DeferTaskWithSessionResult> {
    const previous = stateRef.current;
    const localSession = findLiveSession(previous);
    const sessionApplied = markCurrentSession(previous, "stuck", {
      actualMinutes,
      notes,
      capOutcome: "deferred",
    });
    const next = deferTask(sessionApplied, taskId);

    applyWorkflowState(next);
    recordWipRefusalIfNew(previous, next);

    try {
      return await persistenceOps.persistDeferredTaskWithSession(
        localSession ?? undefined,
        taskId,
        actualMinutes,
        notes,
      );
    } catch (error) {
      markPersistedSaveFailure(error);
      return "failure";
    }
  }

  const value: WorkflowContextValue = {
    state,
    selectedAreaId,
    setSelectedAreaId,
    syncStatus,
    syncPersistedAreas: applyPersistedAreas,
    refreshPersistedWorkflow: async () => {
      await syncPersistedWorkflowRows(createSupabaseBrowserClient());
    },
    addArea: (name, color) => dispatch({ type: "addArea", name, color }),
    updateAreaColor: (areaId, color) =>
      dispatch({ type: "updateAreaColor", areaId, color }),
    submitCaptureText: captureParseOps.submitCaptureText,
    sortCaptureIntoDrafts: captureParseOps.sortCaptureIntoDrafts,
    captureParse,
    retryCaptureParseWithMock: captureParseOps.retryCaptureParseWithMock,
    taskMapDraft,
    requestTaskMapDraft: requestTaskMapDraftAction,
    dismissTaskMapDraft: dismissTaskMapDraftAction,
    approveTaskMapDraft: approveTaskMapDraftAction,
    toggleTaskMapNodeCompletion: toggleTaskMapNodeCompletionAction,
    unsyncedCaptureCount,
    accountClosedDays,
    journalledClosedDays,
    clearOfflineCaptures,
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
      recordWipRefusalIfNew(previous, next);

      if (next !== previous && !next.wipRefusal) {
        void persistenceOps
          .persistTaskReviewTransition(taskId, "active")
          .catch((error) => {
            markPersistedSaveFailure(error);
          });
      }
    },
    acceptProjectDraft: (draftId) =>
      dispatch({ type: "acceptProjectDraft", draftId }),
    rejectTaskDraft: (draftId) => {
      const draft = stateRef.current.taskDrafts.find(
        (item) => item.id === draftId,
      );
      dispatch({ type: "rejectDraft", draftId });
      markLocalOnly(savedOnThisDeviceBanner("Your dropped draft"));

      if (draft) {
        recordRejectedTaskDraft(createSupabaseBrowserClient(), {
          area_id: persistedAreaIdForWorkflowId(
            draft.area_id,
            persistedAreasRef.current,
          ),
          draft_id: draft.id,
          title: draft.title,
          confidence: draft.confidence,
        });
      }
    },
    rejectProjectDraft: (draftId) =>
      dispatch({ type: "rejectProjectDraft", draftId }),
    editTaskDraft: (draftId, changes) => {
      dispatch({ type: "editDraft", draftId, changes });
      markLocalOnly(savedOnThisDeviceBanner("Your draft edit"));
    },
    rejectPersonLink: (draftId, mentionIndex) => {
      const draft = stateRef.current.taskDrafts.find(
        (item) => item.id === draftId,
      );
      const mention = draft?.person_mentions[mentionIndex] ?? null;
      dispatch({ type: "rejectPersonMention", draftId, mentionIndex });
      markLocalOnly(
        "Removed proposed person link locally; the task stays a plain task.",
      );

      // Fire-and-forget override: the user rejected the proposed link. A failed
      // learning write must never affect the triage flow (NS-INV-3).
      if (draft && mention) {
        recordPersonLinkRejection(createSupabaseBrowserClient(), {
          area_id: persistedAreaIdForWorkflowId(
            draft.area_id,
            persistedAreasRef.current,
          ),
          draft_id: draft.id,
          name: mention.name,
          role: mention.role,
        });
      }
    },
    splitTaskDraft: (draftId, titles) => {
      dispatch({ type: "splitDraft", draftId, titles });
      markLocalOnly(savedOnThisDeviceBanner("Your draft split"));
    },
    mergeTaskDrafts: (primaryDraftId, secondaryDraftId) => {
      dispatch({ type: "mergeDrafts", primaryDraftId, secondaryDraftId });
      markLocalOnly(savedOnThisDeviceBanner("Your draft merge"));
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
      recordWipRefusalIfNew(previous, next);

      if (proposal && next !== previous && !next.wipRefusal) {
        void persistenceOps
          .persistAcceptedLocalProposal(proposal, localBlock)
          .catch((error) => {
            markPersistedSaveFailure(error);
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
      recordWipRefusalIfNew(previous, next);

      if (proposal && next !== previous && !next.wipRefusal) {
        void persistenceOps
          .persistRejectedLocalProposal(proposal)
          .catch((error) => {
            markPersistedSaveFailure(error);
          });
      }
    },
    editLocalProposal: (proposalId, changes) => {
      const previous = stateRef.current;
      const next = updateProposal(previous, proposalId, changes);
      const proposal =
        next.timeBlockProposals.find((item) => item.id === proposalId) ?? null;
      applyWorkflowState(next);
      recordWipRefusalIfNew(previous, next);

      if (proposal && next !== previous && !next.wipRefusal) {
        void persistenceOps
          .persistEditedLocalProposal(proposal)
          .catch((error) => {
            markPersistedSaveFailure(error);
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
        void persistenceOps
          .persistCreatedLocalProposal(localProposal)
          .catch((error) => {
            markPersistedSaveFailure(error);
          });
      }
    },
    planTaskAtHour: planTaskAtHourWithPersistence,
    updateTaskFirstTinyStep: (taskId, firstTinyStep) => {
      const previous = stateRef.current;
      const next = updateTaskFirstTinyStep(previous, taskId, firstTinyStep);
      applyWorkflowState(next);

      if (next !== previous) {
        markLocalOnly(savedOnThisDeviceBanner("Your first move"));
      }
    },
    unplanTask: (blockId) => {
      const previous = stateRef.current;
      const next = unplanTask(previous, blockId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistenceOps.persistUnplannedBlock(blockId).catch((error) => {
          markPersistedSaveFailure(error);
        });
      }
    },
    startTaskSession: startTaskSessionWithPersistence,
    markSession: markSessionWithPersistence,
    carryForwardTask: (taskId) => {
      const previous = stateRef.current;
      const next = carryForwardTask(previous, taskId);
      applyWorkflowState(next);
      recordWipRefusalIfNew(previous, next);

      if (next !== previous && !next.wipRefusal) {
        void persistenceOps
          .persistTaskReviewTransition(taskId, "active")
          .catch((error) => {
            markPersistedSaveFailure(error);
          });
      }
    },
    deferTask: (taskId) => {
      const previous = stateRef.current;
      const next = deferTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistenceOps
          .persistTaskReviewTransition(taskId, "backlog")
          .catch((error) => {
            markPersistedSaveFailure(error);
          });
      }
    },
    deferTaskWithSession: deferTaskWithSessionWithPersistence,
    dropTask: (taskId) => {
      const previous = stateRef.current;
      const next = dropTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        // #737 C1 S5: routed through `persistDroppedTask`, not the generic
        // transition, because a drop can be a COMPENSATING action — it may
        // annul a triage accept that is still queued (#778's accept-then-drop
        // resurrection). Defer and carry-forward deliberately keep the generic
        // path: they move a task the user still wants.
        void persistenceOps.persistDroppedTask(taskId).catch((error) => {
          markPersistedSaveFailure(error);
        });
      }
    },
    saveReview: () => {
      // Audit P0#4 — THE choke point for "one close per day".
      //
      // Pinned once, here, from the LOCAL calendar day, and then used for
      // both the guard below and the write: two reads of the clock either
      // side of a network round trip could straddle midnight and file the
      // close under a day the verdict is not looking at.
      const day = localIsoDate(new Date());

      // GUARD 1 — a close for this day already IN FLIGHT.
      //
      // The state guard below reads `accountClosedDays`/`journalledClosedDays`
      // out of the render closure, so two presses landing inside the same
      // render both see an open day and both journal an entry. The database
      // converges that (the second replay raises 23505 and the terminal-success
      // branch drops it) but OFFLINE nothing converges it, and the journal
      // would hold two entries for one day while the card says "once".
      //
      // Returning the in-flight promise is better than refusing: both callers
      // get the same, true answer about the same close. Deliberately not
      // cleared on settle — a later press of the SAME day is answered by the
      // state guard, and a genuinely new day has a different key.
      const inFlight = inFlightDayCloseRef.current;
      if (inFlight && inFlight.day === day) {
        return inFlight.promise;
      }

      // GUARD 2 — already closed. Report where it lives and write NOTHING.
      // The Close moment no longer offers the action at all, so this is the
      // backstop for the callers it cannot see (the cockpit review shell, the
      // keyboard primary, a second tab). The database has its own backstop
      // under this one; neither is a substitute for the other.
      const alreadyClosed = resolveDayClose(
        accountClosedDays,
        journalledClosedDays,
        day,
      );
      if (alreadyClosed) {
        return Promise.resolve(
          alreadyClosed.savedToAccount ? "persisted" : "local-only",
        );
      }

      const promise = (async () => {
        const previous = stateRef.current;
        const next = saveReview(previous);
        applyWorkflowState(next);

        // #588: local state updates optimistically above, but the RESULT is
        // the truth callers gate "day closed" copy on — resolved only after
        // the persisted write settles (or truthfully reports
        // local-only/failure).
        try {
          const outcome = await persistenceOps.persistReviewEntry(next, day);
          // Audit P0#4: refresh the device tier before resolving, so the
          // caller that awaits this promise renders the verdict in the SAME
          // turn the toast appears. A close that is only on the device is
          // still a close, and the user sees it land.
          await refreshJournalledClosedDays();
          if (outcome === "persisted") {
            setAccountClosedDays((days) =>
              days.includes(day) ? days : [...days, day],
            );
          }
          // #737-A slice 2: "device-blocked" is a failure to the caller, but
          // its banner was already set by `markDeviceStorageBlocked` and must
          // NOT be overwritten with the account-failure sentence below — the
          // account was never the problem.
          return outcome === "device-blocked" ? "failure" : outcome;
        } catch (error) {
          markPersistedSaveFailure(error);
          // A failed close is not a close: release the latch so the user can
          // genuinely try again.
          inFlightDayCloseRef.current = null;
          return "failure";
        }
      })();

      inFlightDayCloseRef.current = { day, promise };
      return promise;
    },
    confirmWin,
    confirmRollup,
    listApprovedRollups,
    overridePolicyProposals,
    decideOverridePolicyProposal,
    recalibrationForProposal,
    appliedDurationForArea,
    decideDurationRecalibration,
    clearWipRefusal: () =>
      applyWorkflowState(clearWipRefusal(stateRef.current)),
    swapWipSlot: (slotTaskId) => {
      const previous = stateRef.current;
      const refusal = previous.wipRefusal;
      const next = swapWipSlot(previous, slotTaskId);
      applyWorkflowState(next);
      if (refusal && next !== previous) {
        recordWipEnforcementEvent(createSupabaseBrowserClient(), {
          area_id: persistedAreaIdForWipRefusal(refusal),
          subject_id: refusal.refused_task_id,
          subject_type:
            refusal.activation_path === "triage_accept_to_today"
              ? "task_draft"
              : "task",
          action: "wip_swapped",
          refused_task_id: refusal.refused_task_id,
          refused_task_title: refusal.refused_task_title,
          slot_holders: refusal.slot_holders,
          released_task_id: slotTaskId,
          activation_path: refusal.activation_path,
        });
        markLocalOnly(savedOnThisDeviceBanner("Your swap"));
      }
    },
    resetWorkflow: () => dispatch({ type: "reset" }),
    approveProposalGoogleWrite: calendarApprovalOps.approveProposalGoogleWrite,
    cancelGoogleCalendarBlock: calendarApprovalOps.cancelGoogleCalendarBlock,
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
