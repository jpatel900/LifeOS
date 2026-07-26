"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkflowState } from "@/lib/workflow";
import type { useWorkflow } from "@/lib/WorkflowContext";
import { buildProgressionNodes } from "./progressionNodes";
import type { TaskMapDraftUiState } from "./TaskMapSection";
import { isNodeComplete, type TaskMapGraph } from "@/lib/taskmap/graph";
import { toggleNodeCompletion } from "@/lib/taskmap/collapse";
import { validateTaskMapForPersistence } from "@/lib/taskmap/persistence";
import {
  buildRevisionEvidence,
  evidenceFingerprint,
  revisionEligibility,
  shouldOfferRevision,
  type RevisionSignal,
} from "@/lib/taskmap/revision";
import {
  defaultRevisionOfferStorage,
  readRevisionOfferRecord,
  recordRevisionOfferDismissed,
  recordRevisionOfferShown,
} from "@/lib/taskmap/revisionOfferStore";
import type { FirstMoveVM, StartVM } from "./momentsViewModel";
import type { MomentValue } from "./MomentSwitcher";
import type { EndSessionOutcome } from "./EndSessionSheet";
import type { ToastAction } from "./toast";
import { runEndSessionPolicy } from "./endSessionPolicy";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 * #590 slice 3: Flow moment's screen logic, extracted out of `TodayMoments.tsx`
 * unchanged — same interim local focus-session state (replaced once packet P0's
 * `useFocusSession` is wired here instead; that hook currently only serves
 * `LifeOSCockpit`, out of scope for this slice), same task-map-draft wiring,
 * same drift reclaim/abandon semantics. `TodayMoments.tsx` stays the thin
 * composition root that owns `moment`/toast state and wires this hook's
 * outputs into `<FlowMoment>`.
 */

export interface FlowSessionState {
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
}

interface UseFlowFocusSessionOptions {
  state: WorkflowState;
  now: Date;
  startVM: StartVM;
  fallbackFocusMinutes: number;
  showToast(message: string, action?: ToastAction): void;
  setMoment(moment: MomentValue): void;
  startTaskSession: ReturnType<typeof useWorkflow>["startTaskSession"];
  markSession: ReturnType<typeof useWorkflow>["markSession"];
  // #613: atomic cap-DEFER path (replaces the interim markSession+deferTask
  // split for this one outcome; see endSessionPolicy.ts).
  deferTaskWithSession: ReturnType<typeof useWorkflow>["deferTaskWithSession"];
  taskMapDraft: ReturnType<typeof useWorkflow>["taskMapDraft"];
  requestTaskMapDraft: ReturnType<typeof useWorkflow>["requestTaskMapDraft"];
  dismissTaskMapDraft: ReturnType<typeof useWorkflow>["dismissTaskMapDraft"];
  approveTaskMapDraft: ReturnType<typeof useWorkflow>["approveTaskMapDraft"];
  toggleTaskMapNodeCompletion: ReturnType<
    typeof useWorkflow
  >["toggleTaskMapNodeCompletion"];
  updateTaskFirstTinyStep: ReturnType<
    typeof useWorkflow
  >["updateTaskFirstTinyStep"];
}

export function useFlowFocusSession({
  state,
  now,
  startVM,
  fallbackFocusMinutes,
  showToast,
  setMoment,
  startTaskSession,
  markSession,
  deferTaskWithSession,
  taskMapDraft,
  requestTaskMapDraft,
  dismissTaskMapDraft,
  approveTaskMapDraft,
  toggleTaskMapNodeCompletion,
  updateTaskFirstTinyStep,
}: UseFlowFocusSessionOptions) {
  // Interim local session state — replaced by useFocusSession when packet
  // P0 extracts it from LifeOSCockpit.
  const [session, setSession] = useState<FlowSessionState>({
    activeTaskId: null,
    running: false,
    remaining: 0,
    total: 0,
  });

  const railTaskId = useMemo(
    () => session.activeTaskId ?? startVM.firstMove?.taskId ?? null,
    [session.activeTaskId, startVM.firstMove],
  );
  const progressionNodes = useMemo(
    () => buildProgressionNodes(state, railTaskId),
    [state, railTaskId],
  );
  // FR-031 slice 5: the same focused-task id the v0 rail derives from, so
  // the map/rail switch and the rail never disagree about which task they
  // describe.
  const focusedTask = useMemo(
    () => state.tasks.find((task) => task.id === railTaskId) ?? null,
    [state.tasks, railTaskId],
  );
  const taskMapDraftForSection = useMemo<TaskMapDraftUiState>(() => {
    if (taskMapDraft.phase === "idle") {
      return { phase: "idle" };
    }
    if (taskMapDraft.taskId !== railTaskId) {
      return { phase: "idle" };
    }
    if (taskMapDraft.phase === "pending") {
      return { phase: "pending" };
    }
    if (taskMapDraft.phase === "ready") {
      return { phase: "ready", draft: taskMapDraft.draft };
    }
    return { phase: "failed", message: taskMapDraft.message };
  }, [taskMapDraft, railTaskId]);
  const handleRequestTaskMapDraft = useCallback(() => {
    if (!railTaskId) return;
    void requestTaskMapDraft(railTaskId);
  }, [railTaskId, requestTaskMapDraft]);
  const handleApproveTaskMapDraft = useCallback(
    (graph: TaskMapGraph & { schema_version: "1.0" | "1.1" }) => {
      if (!railTaskId) return;
      void approveTaskMapDraft(railTaskId, graph);
    },
    [railTaskId, approveTaskMapDraft],
  );
  // FR-031 slice F5 (#679) — the post-node-completion revision offer,
  // latched here so it stays stable while rendered (a live derivation
  // would suppress itself the moment the shown-today record is written).
  // Everything below runs inside USER-ACTION handlers — no useEffect ever
  // fires an offer, and no code path here calls the AI (the tap handler
  // delegates to the same on-demand requestTaskMapDraft the manual button
  // uses). The deterministic kernel + caps decide; localStorage remembers.
  const [revisionOffer, setRevisionOffer] = useState<{
    taskId: string;
    signals: RevisionSignal[];
    fingerprint: string;
  } | null>(null);

  const handleToggleTaskMapNodeCompletion = useCallback(
    (nodeId: string) => {
      if (!railTaskId) return;
      void toggleTaskMapNodeCompletion(railTaskId, nodeId);

      // Trigger point 1 of 2 (plan-contract §4.3a): after a COMPLETION
      // write only — an undo tap is not completion evidence. The post-tap
      // graph is recomputed with the same pure helper the reducer uses.
      const task = state.tasks.find((item) => item.id === railTaskId);
      if (!task || task.map_status !== "approved" || !task.progression_map) {
        return;
      }
      const validated = validateTaskMapForPersistence(task.progression_map);
      if (!validated.ok) {
        return;
      }
      const graph = validated.graph as TaskMapGraph;
      const node = graph.nodes.find((item) => item.id === nodeId);
      if (!node || node.role === "red" || isNodeComplete(node)) {
        return;
      }

      const nowIso = new Date().toISOString();
      const updatedGraph = toggleNodeCompletion(graph, nodeId, nowIso);
      const evidence = buildRevisionEvidence(
        state.executionSessions
          .filter((session) => session.task_id === railTaskId)
          .map((session) => ({
            planned_minutes: session.planned_minutes,
            actual_minutes: session.actual_minutes,
            outcome: session.outcome,
            cap_outcome: session.cap_outcome ?? null,
          })),
        // No duration profiles are plumbed into the moments shell today;
        // the kernel falls back to planned-vs-actual drift.
        [],
        null,
      );
      const eligibility = revisionEligibility(updatedGraph, evidence);
      if (!eligibility.eligible) {
        return;
      }

      const storage = defaultRevisionOfferStorage();
      const todayIsoDate = nowIso.slice(0, 10);
      const decision = shouldOfferRevision({
        eligibility,
        todayIsoDate,
        record: readRevisionOfferRecord(storage, railTaskId),
      });
      if (!decision) {
        return;
      }

      recordRevisionOfferShown(storage, railTaskId, todayIsoDate);
      setRevisionOffer({
        taskId: railTaskId,
        signals: eligibility.signals,
        fingerprint: evidenceFingerprint(eligibility.signals),
      });
    },
    [railTaskId, toggleTaskMapNodeCompletion, state],
  );

  const handleProposeRevision = useCallback(() => {
    if (!revisionOffer) return;
    const offer = revisionOffer;
    setRevisionOffer(null);
    // The ONLY AI spend in the revision loop — an explicit tap, routed
    // through the existing on-demand draft pipeline with evidence attached.
    void requestTaskMapDraft(offer.taskId, {
      revisionSignals: offer.signals,
    });
  }, [revisionOffer, requestTaskMapDraft]);

  const handleDismissRevisionOffer = useCallback(() => {
    if (!revisionOffer) return;
    recordRevisionOfferDismissed(
      defaultRevisionOfferStorage(),
      revisionOffer.taskId,
      revisionOffer.fingerprint,
    );
    setRevisionOffer(null);
  }, [revisionOffer]);

  // Never render an offer against a different focused task.
  const revisionOfferForSection = useMemo(
    () =>
      revisionOffer && revisionOffer.taskId === railTaskId
        ? { signals: revisionOffer.signals }
        : null,
    [revisionOffer, railTaskId],
  );

  useEffect(() => {
    if (!session.running) return undefined;
    const id = setInterval(() => {
      setSession((current) => {
        if (!current.running) return current;
        if (current.remaining <= 0) {
          return { ...current, running: false, remaining: 0 };
        }
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [session.running]);

  const startFocus = useCallback(
    (taskId: string | null, minutes: number) => {
      setSession({
        activeTaskId: taskId,
        running: true,
        remaining: minutes * 60,
        total: minutes * 60,
      });
      if (taskId) {
        startTaskSession(taskId);
      }
    },
    [startTaskSession],
  );

  // #572 (execute/review contract): ending a session no longer closes it
  // instantly. "Done" opens the end sheet (outcome, actual duration,
  // optional note) — the verdict/toast copy below only fires once
  // `handleEndSessionSave` has awaited the save.
  const [endSessionOpen, setEndSessionOpen] = useState(false);

  const finishFocus = useCallback(() => {
    if (session.activeTaskId === null && session.total === 0) return;
    setEndSessionOpen(true);
  }, [session.activeTaskId, session.total]);

  const endSessionElapsedMinutes =
    session.total > 0
      ? Math.round((session.total - session.remaining) / 60)
      : 0;

  const handleEndSessionSave = useCallback(
    async (
      outcome: EndSessionOutcome,
      actualMinutes: number,
      note: string | null,
    ) => {
      // State truth (#551/#563): await the save before resetting the
      // session/closing the sheet, so no verdict copy claims a save that
      // hasn't resolved yet.
      const result = await runEndSessionPolicy(
        {
          outcome,
          actualMinutes,
          note,
          capReached: session.remaining <= 0,
          task: focusedTask
            ? {
                id: focusedTask.id,
                definitionOfDone: focusedTask.definition_of_done,
                taskType: focusedTask.task_type,
              }
            : null,
        },
        {
          prompt: (message, defaultValue) =>
            defaultValue === undefined
              ? window.prompt(message)
              : window.prompt(message, defaultValue),
          markSession,
          deferTaskWithSession,
        },
      );
      if (result.status === "aborted") {
        showToast(
          result.reason === "missing_cut_scope"
            ? "Write the cut scope before closing"
            : result.reason === "missing_carry_note"
              ? "Write a carry note before deferring"
              : result.reason === "missing_decision"
                ? "Decision choice is required before closing"
                : "Choose cut scope or defer at the cap",
        );
        return;
      }
      setSession({
        activeTaskId: null,
        running: false,
        remaining: 0,
        total: 0,
      });
      setEndSessionOpen(false);
      showToast(
        result.status === "split"
          ? result.resolution === "defer_failed"
            ? "Session saved — deferral failed; move it from Review"
            : "Session saved — deferral not yet confirmed"
          : result.resolution === "cut_scope"
            ? "Scope cut and session closed"
            : result.resolution === "deferred"
              ? "Deferred — saved and moved to backlog"
              : outcome === "completed"
                ? "Session complete"
                : outcome === "partial"
                  ? "Partial progress saved"
                  : outcome === "skipped"
                    ? "Skipped — carried to review"
                    : "Stuck — logged for review",
      );
    },
    [
      deferTaskWithSession,
      focusedTask,
      markSession,
      session.remaining,
      showToast,
    ],
  );

  const pauseFocus = useCallback(() => {
    setSession((current) => ({ ...current, running: !current.running }));
  }, []);

  const extendFocus = useCallback((minutes: number) => {
    setSession((current) => ({
      ...current,
      remaining: current.remaining + minutes * 60,
      total: current.total + minutes * 60,
    }));
  }, []);

  const handleStartMove = useCallback(
    (move: FirstMoveVM) => {
      startFocus(move.taskId, move.estMinutes || fallbackFocusMinutes);
      setMoment("flow");
    },
    [startFocus, fallbackFocusMinutes, setMoment],
  );

  const handleReclaimDrift = useCallback(() => {
    const hasSession = session.activeTaskId !== null || session.total > 0;
    if (hasSession) {
      if (!session.running) {
        pauseFocus();
      }
    } else if (startVM.firstMove) {
      startFocus(
        startVM.firstMove.taskId,
        startVM.firstMove.estMinutes || fallbackFocusMinutes,
      );
    }
    showToast("Block reclaimed");
  }, [
    session.activeTaskId,
    session.total,
    session.running,
    pauseFocus,
    startVM.firstMove,
    startFocus,
    fallbackFocusMinutes,
    showToast,
  ]);

  const handleAbandonDrift = useCallback(() => {
    setMoment("start");
    showToast("Fresh start — pick your next move");
  }, [setMoment, showToast]);

  return {
    session,
    railTaskId,
    progressionNodes,
    focusedTask,
    taskMapDraftForSection,
    handleRequestTaskMapDraft,
    handleApproveTaskMapDraft,
    handleToggleTaskMapNodeCompletion,
    revisionOfferForSection,
    handleProposeRevision,
    handleDismissRevisionOffer,
    startFocus,
    finishFocus,
    endSessionOpen,
    setEndSessionOpen,
    endSessionElapsedMinutes,
    handleEndSessionSave,
    pauseFocus,
    extendFocus,
    handleStartMove,
    handleReclaimDrift,
    handleAbandonDrift,
    updateTaskFirstTinyStep,
  };
}
