"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowState } from "@/lib/workflow";
import { validateTaskMapForPersistence } from "@/lib/taskmap/persistence";
import type { TaskMapGraph } from "@/lib/taskmap/graph";
import {
  buildRevisionEvidence,
  CLOSE_REVISION_OFFER_LIMIT,
  evidenceFingerprint,
  mostActiveMapTaskId,
  revisionEligibility,
  shouldOfferRevision,
  type MostActiveMapCandidate,
  type RevisionSignal,
} from "@/lib/taskmap/revision";
import {
  defaultRevisionOfferStorage,
  readRevisionOfferRecord,
  recordRevisionOfferDismissed,
  recordRevisionOfferShown,
} from "@/lib/taskmap/revisionOfferStore";
import { isSameCalendarDay } from "./momentsViewModel/shared";

/**
 * FR-031 slice F5 (#679) — trigger point 2 of 2 (plan-contract §4.3b): the
 * single map-revision offer at day/session Close.
 *
 * Owner-gate default (#679, restated on the PR): at most ONE offer per
 * Close, for the MOST-ACTIVE approved map — `CLOSE_REVISION_OFFER_LIMIT`
 * in `lib/taskmap/revision.ts` is the flip switch (0 disables the Close
 * offer entirely).
 *
 * The decision latches once per Close visit (a ref guards recomputation)
 * so the card stays stable while the shown-today record it just wrote
 * would otherwise suppress it. Everything here is deterministic kernel +
 * localStorage bookkeeping — NO AI call lives in this hook (a guard test
 * asserts it): tapping the offer is wired by the caller to the existing
 * on-demand draft pipeline.
 */
export interface CloseRevisionOffer {
  taskId: string;
  taskTitle: string;
  signals: RevisionSignal[];
  fingerprint: string;
}

export function useTaskMapCloseRevisionOffer({
  state,
  active,
}: {
  state: WorkflowState;
  /** True while the Close moment is on screen. */
  active: boolean;
}) {
  const [offer, setOffer] = useState<CloseRevisionOffer | null>(null);
  const computedForVisitRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!active) {
      computedForVisitRef.current = false;
      setOffer(null);
      return;
    }
    if (computedForVisitRef.current) {
      return;
    }
    computedForVisitRef.current = true;

    if (CLOSE_REVISION_OFFER_LIMIT < 1) {
      return;
    }

    const current = stateRef.current;
    const now = new Date();
    const todayIsoDate = now.toISOString().slice(0, 10);
    const storage = defaultRevisionOfferStorage();

    const eligibleCandidates: (MostActiveMapCandidate & {
      taskTitle: string;
      signals: RevisionSignal[];
    })[] = [];

    for (const task of current.tasks) {
      if (task.map_status !== "approved" || !task.progression_map) {
        continue;
      }
      const validated = validateTaskMapForPersistence(task.progression_map);
      if (!validated.ok) {
        continue;
      }
      const graph = validated.graph as TaskMapGraph;
      const eligibility = revisionEligibility(
        graph,
        buildRevisionEvidence(
          current.executionSessions
            .filter((session) => session.task_id === task.id)
            .map((session) => ({
              planned_minutes: session.planned_minutes,
              actual_minutes: session.actual_minutes,
              outcome: session.outcome,
              cap_outcome: session.cap_outcome ?? null,
            })),
          [],
          null,
        ),
      );
      if (!eligibility.eligible) {
        continue;
      }
      if (
        !shouldOfferRevision({
          eligibility,
          todayIsoDate,
          record: readRevisionOfferRecord(storage, task.id),
        })
      ) {
        continue;
      }
      eligibleCandidates.push({
        taskId: task.id,
        taskTitle: task.title,
        graph,
        signals: eligibility.signals,
        blocksTodayCount: current.calendarBlocks.filter(
          (block) =>
            block.task_id === task.id &&
            (block.status === "completed" || block.status === "missed") &&
            isSameCalendarDay(block.start_at, now),
        ).length,
      });
    }

    const pickedTaskId = mostActiveMapTaskId(eligibleCandidates, todayIsoDate);
    if (!pickedTaskId) {
      return;
    }
    const picked = eligibleCandidates.find(
      (candidate) => candidate.taskId === pickedTaskId,
    );
    if (!picked) {
      return;
    }

    recordRevisionOfferShown(storage, picked.taskId, todayIsoDate);
    setOffer({
      taskId: picked.taskId,
      taskTitle: picked.taskTitle,
      signals: picked.signals,
      fingerprint: evidenceFingerprint(picked.signals),
    });
  }, [active]);

  /** Clears without suppression — used when the offer is tapped (the tap
   * consumes it; the daily cap already prevents a same-day re-offer). */
  const clearOffer = useCallback(() => {
    setOffer(null);
  }, []);

  /** Dismissal: suppress this evidence fingerprint until it changes. */
  const dismissOffer = useCallback(() => {
    setOffer((current) => {
      if (current) {
        recordRevisionOfferDismissed(
          defaultRevisionOfferStorage(),
          current.taskId,
          current.fingerprint,
        );
      }
      return null;
    });
  }, []);

  return { offer, clearOffer, dismissOffer };
}
