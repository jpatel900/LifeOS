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
  swapWipSlot,
  syncWorkflowIdCounterFromState,
  unplanTask,
  updateTaskFirstTinyStep,
  updateProposal,
  clearWipRefusal,
  type WipRefusal,
  type WorkflowState,
} from "./workflow";
import {
  createRollupSummary,
  createWinRecord,
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
  loadStoredStateFromSession,
  mergePersistedCalendarBlocks,
  NIL_UUID,
  persistedAreaIdForWorkflowId,
  persistedIdForLocalId,
  persistedLoadFailureMessage,
  persistedSaveFailureMessage,
  persistedSyncFailureMessage,
  policyDecisionKey,
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
  type GoogleCalendarBridgeResult,
  type TaskMapDraftState,
  type WorkflowContextValue,
  type WorkflowSyncStatus,
} from "./workflowContext/types";

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

  const markPersistedLoadFailure = useCallback(
    (error: unknown) => {
      markAccountSyncError(
        persistedSyncFailureMessage(error, persistedLoadFailureMessage),
      );
    },
    [markAccountSyncError],
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
      markAccountSynced();

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
    [buildDropLocalIds, markAccountSynced, markLocalOnly],
  );

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
    syncPersistedWorkflowRows,
  });

  // S7 (#259): persist a user-confirmed win. Only ever called on explicit
  // confirm (never on skip). Mirrors persistReviewEntry's local↔persisted id
  // mapping and markLocalOnly fallback; in mock/preview mode the harvest UI
  // holds the win locally and there is nothing to persist.
  const confirmWin = useCallback(
    async (input: {
      taskId: string;
      title: string;
      detail?: string | null;
    }) => {
      const title = input.title.trim();
      if (title.length === 0) return;

      const client = createSupabaseBrowserClient();
      if (!client) return;

      const task = stateRef.current.tasks.find((t) => t.id === input.taskId);
      const persistedTaskId = persistedIdForLocalId(
        input.taskId,
        persistedTaskIdByLocalIdRef.current,
      );
      const persistedAreaId = task
        ? persistedAreaIdForWorkflowId(task.area_id, persistedAreasRef.current)
        : null;

      if (!persistedTaskId || !persistedAreaId) {
        markLocalOnly("Win saved locally; account sync is pending.");
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      try {
        await createWinRecord(client, {
          area_id: persistedAreaId,
          source_task_id: persistedTaskId,
          title,
          detail: input.detail ?? null,
          occurred_at: today,
        });
      } catch {
        markLocalOnly("Win saved locally; account sync is pending.");
      }
    },
    [markLocalOnly],
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
  // write path per #486); same local↔persisted area mapping + markLocalOnly
  // fallback as confirmWin. Mock/preview keeps the approval local.
  const confirmRollup = useCallback(
    async (input: {
      areaId: string;
      periodType: "week" | "month";
      periodStart: string;
      periodEnd: string;
      summary: RollupSummaryContent;
    }) => {
      const client = createSupabaseBrowserClient();
      if (!client) return;

      const persistedAreaId = persistedAreaIdForWorkflowId(
        input.areaId,
        persistedAreasRef.current,
      );
      if (!persistedAreaId) {
        markLocalOnly("Rollup saved locally; account sync is pending.");
        return;
      }

      try {
        await createRollupSummary(client, {
          area_id: persistedAreaId,
          period_type: input.periodType,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          summary: input.summary,
        });
      } catch {
        markLocalOnly("Rollup saved locally; account sync is pending.");
      }
    },
    [markLocalOnly],
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
        message:
          "Browser storage is blocked; this session will not reliably restore after reload.",
        pendingLocalChanges: true,
      }));
    }
  }, [hasHydratedFromStorage, state]);

  // FR-027 (F-G1a): refresh the unsynced-count signal from the device queue.
  const refreshUnsyncedCount = useCallback(async () => {
    try {
      setUnsyncedCaptureCount(await pendingCaptureCount());
    } catch {
      // best-effort signal; a queue read failure must not break capture
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
      } catch {
        // Leave it queued; the next reconnect retries. The idempotent upsert
        // means a partially-applied drain never creates a duplicate.
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
  useEffect(() => {
    void refreshUnsyncedCount();
    void syncOfflineQueue();
    if (typeof window === "undefined") return;
    const onOnline = () => void syncOfflineQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshUnsyncedCount, syncOfflineQueue]);

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
    recordWipRefusalIfNew(previous, next);

    if (draft && localTask) {
      void persistenceOps
        .persistAcceptedTaskDraft(draft, localTask, localProposal, status)
        .catch((error) => {
          markPersistedSaveFailure(error);
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
  ): Promise<void> {
    const previous = stateRef.current;
    const localSession = previous.executionSessions[0];
    const next = markCurrentSession(previous, status, {
      actualMinutes,
      notes,
      capOutcome,
    });

    applyWorkflowState(next);
    recordWipRefusalIfNew(previous, next);

    if (localSession) {
      // #572: the caller awaits this so it never shows "closed"/verdict
      // copy before the save attempt has resolved. A persistence failure
      // still resolves (not rejects) — it is a truthful terminal state
      // (recorded via markPersistedSaveFailure), same as the local-only
      // fallback inside persistMarkedSession.
      try {
        await persistenceOps.persistMarkedSession(
          localSession,
          status,
          actualMinutes,
          notes,
          capOutcome,
        );
      } catch (error) {
        markPersistedSaveFailure(error);
      }
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
    submitCaptureRaw: captureParseOps.submitCaptureRaw,
    captureParse,
    retryCaptureParseWithMock: captureParseOps.retryCaptureParseWithMock,
    taskMapDraft,
    requestTaskMapDraft: requestTaskMapDraftAction,
    dismissTaskMapDraft: dismissTaskMapDraftAction,
    approveTaskMapDraft: approveTaskMapDraftAction,
    toggleTaskMapNodeCompletion: toggleTaskMapNodeCompletionAction,
    unsyncedCaptureCount,
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
      markLocalOnly("Dropped draft locally; account sync is pending.");

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
      markLocalOnly("Draft edit saved locally; account sync is pending.");
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
        markLocalOnly("First move saved locally; account sync is pending.");
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
    dropTask: (taskId) => {
      const previous = stateRef.current;
      const next = dropTask(previous, taskId);
      applyWorkflowState(next);

      if (next !== previous) {
        void persistenceOps
          .persistTaskReviewTransition(taskId, "dropped")
          .catch((error) => {
            markPersistedSaveFailure(error);
          });
      }
    },
    saveReview: () => {
      const previous = stateRef.current;
      const next = saveReview(previous);
      applyWorkflowState(next);

      void persistenceOps.persistReviewEntry(next).catch((error) => {
        markPersistedSaveFailure(error);
      });
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
        markLocalOnly("WIP swap saved locally; account sync is pending.");
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
