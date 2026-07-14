"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowState } from "@/lib/workflow";
import type { useWorkflow } from "@/lib/WorkflowContext";
import type {
  ApprovedWeeklyRollupInput,
  CloseVM,
  MonthlyRollupDraftVM,
  PriorMonthRollupInput,
  RollupDraftVM,
} from "./momentsViewModel";
import {
  buildMonthlyRollupDrafts,
  deriveMonthOverMonthReadback,
} from "./momentsViewModel";
import type { RollupSummary, RollupSummaryContent } from "@lifeos/schemas";
import { requestRollupProse } from "@/lib/ai/rollupProseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { CloseWinVM } from "./CloseMoment";
import type { ToastAction } from "./toast";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 * #590 slice 3: Close moment's wins + rollup harvesting, extracted out of
 * `TodayMoments.tsx` unchanged.
 *
 * S7 (#259) wins harvest. Candidate wins come from `closeVM`; confirm/skip
 * decisions live here for the session. Confirm persists through the context
 * (real client only; mock/preview stays local) and moves the candidate into
 * the reading list; skip dismisses it and writes nothing.
 *
 * S8 (#260) rollup approve/dismiss, keyed by area for the session — weekly,
 * composed live from `state.calendarBlocks` via `closeVM.rollupDrafts`, and
 * #486 (S8 follow-up) monthly, composed from this month's already-APPROVED
 * weekly rollups (persisted rows, fetched once via `listApprovedRollups`).
 * Approve persists through the context (real client only; mock/preview stays
 * local); dismiss writes nothing.
 *
 * E3 (#260 follow-up): AI-prose enhancement for pending rollup drafts (weekly
 * and monthly), keyed by area for the session. The server rephrases items 1:1
 * with counts held fixed; `requestRollupProse` falls back to the
 * deterministic draft on any failure, so this is purely additive — the
 * rollup always shows and stays approvable. Skipped entirely in demo/mock (no
 * real account, no server key).
 */

interface UseCloseMomentRollupsOptions {
  state: WorkflowState;
  closeVM: CloseVM;
  now: Date;
  showToast(message: string, action?: ToastAction): void;
  confirmWin: ReturnType<typeof useWorkflow>["confirmWin"];
  confirmRollup: ReturnType<typeof useWorkflow>["confirmRollup"];
  listApprovedRollups: ReturnType<typeof useWorkflow>["listApprovedRollups"];
}

export function useCloseMomentRollups({
  state,
  closeVM,
  now,
  showToast,
  confirmWin,
  confirmRollup,
  listApprovedRollups,
}: UseCloseMomentRollupsOptions) {
  const [confirmedWins, setConfirmedWins] = useState<CloseWinVM[]>([]);
  const [skippedWinIds, setSkippedWinIds] = useState<Set<string>>(
    () => new Set(),
  );
  const confirmedWinIds = useMemo(
    () => new Set(confirmedWins.map((win) => win.taskId)),
    [confirmedWins],
  );
  const pendingWins = useMemo(
    () =>
      closeVM.winCandidates.filter(
        (win) =>
          !skippedWinIds.has(win.taskId) && !confirmedWinIds.has(win.taskId),
      ),
    [closeVM.winCandidates, skippedWinIds, confirmedWinIds],
  );
  const handleConfirmWin = useCallback(
    (taskId: string, title: string) => {
      const candidate = closeVM.winCandidates.find(
        (win) => win.taskId === taskId,
      );
      if (!candidate || title.length === 0) return;
      setConfirmedWins((prev) => [
        ...prev,
        { taskId, title, areaLabel: candidate.areaLabel },
      ]);
      void confirmWin({ taskId, title });
      showToast("Win logged");
    },
    [closeVM.winCandidates, confirmWin, showToast],
  );
  const handleSkipWin = useCallback((taskId: string) => {
    setSkippedWinIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
  }, []);

  const [approvedRollups, setApprovedRollups] = useState<
    {
      areaId: string;
      areaLabel: string;
      periodLabel: string;
      counts: Record<string, number>;
    }[]
  >([]);
  const [dismissedRollupAreaIds, setDismissedRollupAreaIds] = useState<
    Set<string>
  >(() => new Set());
  const approvedRollupAreaIds = useMemo(
    () => new Set(approvedRollups.map((rollup) => rollup.areaId)),
    [approvedRollups],
  );
  const pendingRollups = useMemo(
    () =>
      closeVM.rollupDrafts.filter(
        (draft) =>
          !dismissedRollupAreaIds.has(draft.areaId) &&
          !approvedRollupAreaIds.has(draft.areaId),
      ),
    [closeVM.rollupDrafts, dismissedRollupAreaIds, approvedRollupAreaIds],
  );
  const [enhancedRollupSummaries, setEnhancedRollupSummaries] = useState<
    Record<string, RollupSummaryContent>
  >({});
  // Areas already requested this session — a ref (not the state) so it can't be
  // in the effect deps. Marking BEFORE the await dedupes across effect re-runs
  // and prevents a second in-flight request per area (no duplicate AI calls /
  // ai_call_traces rows).
  const requestedRollupAreaIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) {
      return;
    }
    const toRequest = pendingRollups.filter(
      (draft) => !requestedRollupAreaIdsRef.current.has(draft.areaId),
    );
    if (toRequest.length === 0) {
      return;
    }
    for (const draft of toRequest) {
      requestedRollupAreaIdsRef.current.add(draft.areaId);
    }
    let cancelled = false;
    void (async () => {
      const accessToken =
        (await client.auth.getSession()).data.session?.access_token ?? null;
      for (const draft of toRequest) {
        if (cancelled) {
          return;
        }
        const result = await requestRollupProse(
          {
            areaLabel: draft.areaLabel,
            periodType: "week",
            periodLabel: draft.periodLabel,
            draft: draft.summary,
          },
          { accessToken },
        );
        if (cancelled) {
          return;
        }
        // Only record — and badge as "AI-polished" — a genuinely AI-generated
        // summary. On any deterministic fallback the card stays as-is with no
        // provenance flag (the area is still marked requested, so we don't
        // re-hit a degraded endpoint every render).
        if (!result.enhanced) {
          continue;
        }
        setEnhancedRollupSummaries((prev) =>
          prev[draft.areaId]
            ? prev
            : { ...prev, [draft.areaId]: result.summary },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingRollups]);
  // E3 provenance: areas where the user chose to keep the deterministic wording
  // over the AI-polished version this session. Approve persists exactly what is
  // displayed, so toggling here also decides which version is recorded.
  const [keptOriginalRollupAreaIds, setKeptOriginalRollupAreaIds] = useState<
    Set<string>
  >(() => new Set());
  // Swap in the enhanced prose where it has resolved (unless the user kept the
  // original); the deterministic draft shows until then (and stays if
  // enhancement failed). `enhanced` = the displayed summary is AI-reworded;
  // `hasEnhancement` = an AI alternative exists (a toggle is available). Approve
  // persists exactly what is shown (counts are identical either way).
  const displayedRollups = useMemo(
    () =>
      pendingRollups.map((draft) => {
        const enhanced = enhancedRollupSummaries[draft.areaId];
        const showingProse =
          Boolean(enhanced) && !keptOriginalRollupAreaIds.has(draft.areaId);
        return {
          ...draft,
          summary: showingProse && enhanced ? enhanced : draft.summary,
          enhanced: showingProse,
          hasEnhancement: Boolean(enhanced),
        };
      }),
    [pendingRollups, enhancedRollupSummaries, keptOriginalRollupAreaIds],
  );
  const handleApproveRollup = useCallback(
    (draft: RollupDraftVM) => {
      setApprovedRollups((prev) => [
        {
          areaId: draft.areaId,
          areaLabel: draft.areaLabel,
          periodLabel: draft.periodLabel,
          counts: draft.summary.counts,
        },
        ...prev,
      ]);
      void confirmRollup({
        areaId: draft.areaId,
        periodType: "week",
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        summary: draft.summary,
      });
      showToast("Rollup approved");
    },
    [confirmRollup, showToast],
  );
  const handleDismissRollup = useCallback((areaId: string) => {
    setDismissedRollupAreaIds((prev) => {
      const next = new Set(prev);
      next.add(areaId);
      return next;
    });
  }, []);
  const handleToggleRollupProse = useCallback((areaId: string) => {
    setKeptOriginalRollupAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }, []);

  // #486 (S8 follow-up): monthly rollup, mirroring the S8 weekly flow above
  // wholesale. Unlike weekly (composed live from `state.calendarBlocks`), the
  // monthly draft composes from this month's already-APPROVED weekly rollups
  // — persisted rows, fetched once via `listApprovedRollups` (real client
  // only; mock/preview keeps `allRollupSummaries` empty, so no monthly card
  // shows there, same "nothing to show" idiom as everywhere else in this
  // surface). Composition and the month-over-month readback are pure
  // (momentsViewModel); approve/dismiss/AI-prose state is kept independent of
  // the weekly rollup state above so each rollup type is separately decided.
  const [allRollupSummaries, setAllRollupSummaries] = useState<RollupSummary[]>(
    [],
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rollups = await listApprovedRollups();
      if (!cancelled) setAllRollupSummaries(rollups);
    })();
    return () => {
      cancelled = true;
    };
  }, [listApprovedRollups]);

  const areaLabelForWorkflowId = useCallback(
    (areaId: string) =>
      state.areas.find((area) => area.id === areaId)?.name ?? "",
    [state.areas],
  );

  const approvedWeeklyRollupsThisMonth = useMemo<ApprovedWeeklyRollupInput[]>(
    () =>
      allRollupSummaries
        .filter((row) => row.period_type === "week")
        .map((row) => ({
          areaId: row.area_id,
          areaLabel: areaLabelForWorkflowId(row.area_id),
          periodStart: row.period_start,
          summary: row.summary,
        })),
    [allRollupSummaries, areaLabelForWorkflowId],
  );
  const monthlyRollupDraftsRaw = useMemo(
    () => buildMonthlyRollupDrafts(approvedWeeklyRollupsThisMonth, now),
    [approvedWeeklyRollupsThisMonth, now],
  );

  const priorMonthRollups = useMemo<PriorMonthRollupInput[]>(
    () =>
      allRollupSummaries
        .filter((row) => row.period_type === "month")
        .map((row) => ({
          areaId: row.area_id,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          summary: row.summary,
        })),
    [allRollupSummaries],
  );
  const monthOverMonthReadback = useMemo(
    () => deriveMonthOverMonthReadback(priorMonthRollups, now),
    [priorMonthRollups, now],
  );

  const [approvedMonthlyRollups, setApprovedMonthlyRollups] = useState<
    {
      areaId: string;
      areaLabel: string;
      periodLabel: string;
      counts: Record<string, number>;
    }[]
  >([]);
  const [dismissedMonthlyRollupAreaIds, setDismissedMonthlyRollupAreaIds] =
    useState<Set<string>>(() => new Set());
  const approvedMonthlyRollupAreaIds = useMemo(
    () => new Set(approvedMonthlyRollups.map((rollup) => rollup.areaId)),
    [approvedMonthlyRollups],
  );
  const pendingMonthlyRollups = useMemo(
    () =>
      monthlyRollupDraftsRaw.filter(
        (draft) =>
          !dismissedMonthlyRollupAreaIds.has(draft.areaId) &&
          !approvedMonthlyRollupAreaIds.has(draft.areaId),
      ),
    [
      monthlyRollupDraftsRaw,
      dismissedMonthlyRollupAreaIds,
      approvedMonthlyRollupAreaIds,
    ],
  );

  // E3 parity: AI-prose enhancement for pending monthly rollup drafts, routed
  // through the SAME choke point as weekly (`requestRollupProse`) with
  // `periodType: "month"` — no new AI plumbing.
  const [enhancedMonthlyRollupSummaries, setEnhancedMonthlyRollupSummaries] =
    useState<Record<string, RollupSummaryContent>>({});
  const requestedMonthlyRollupAreaIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) {
      return;
    }
    const toRequest = pendingMonthlyRollups.filter(
      (draft) => !requestedMonthlyRollupAreaIdsRef.current.has(draft.areaId),
    );
    if (toRequest.length === 0) {
      return;
    }
    for (const draft of toRequest) {
      requestedMonthlyRollupAreaIdsRef.current.add(draft.areaId);
    }
    let cancelled = false;
    void (async () => {
      const accessToken =
        (await client.auth.getSession()).data.session?.access_token ?? null;
      for (const draft of toRequest) {
        if (cancelled) {
          return;
        }
        const result = await requestRollupProse(
          {
            areaLabel: draft.areaLabel,
            periodType: "month",
            periodLabel: draft.periodLabel,
            draft: draft.summary,
          },
          { accessToken },
        );
        if (cancelled) {
          return;
        }
        if (!result.enhanced) {
          continue;
        }
        setEnhancedMonthlyRollupSummaries((prev) =>
          prev[draft.areaId]
            ? prev
            : { ...prev, [draft.areaId]: result.summary },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingMonthlyRollups]);
  const [
    keptOriginalMonthlyRollupAreaIds,
    setKeptOriginalMonthlyRollupAreaIds,
  ] = useState<Set<string>>(() => new Set());
  const displayedMonthlyRollups = useMemo(
    () =>
      pendingMonthlyRollups.map((draft) => {
        const enhanced = enhancedMonthlyRollupSummaries[draft.areaId];
        const showingProse =
          Boolean(enhanced) &&
          !keptOriginalMonthlyRollupAreaIds.has(draft.areaId);
        return {
          ...draft,
          summary: showingProse && enhanced ? enhanced : draft.summary,
          enhanced: showingProse,
          hasEnhancement: Boolean(enhanced),
        };
      }),
    [
      pendingMonthlyRollups,
      enhancedMonthlyRollupSummaries,
      keptOriginalMonthlyRollupAreaIds,
    ],
  );
  const handleApproveMonthlyRollup = useCallback(
    (draft: MonthlyRollupDraftVM) => {
      setApprovedMonthlyRollups((prev) => [
        {
          areaId: draft.areaId,
          areaLabel: draft.areaLabel,
          periodLabel: draft.periodLabel,
          counts: draft.summary.counts,
        },
        ...prev,
      ]);
      void confirmRollup({
        areaId: draft.areaId,
        periodType: "month",
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        summary: draft.summary,
      });
      showToast("Rollup approved");
    },
    [confirmRollup, showToast],
  );
  const handleDismissMonthlyRollup = useCallback((areaId: string) => {
    setDismissedMonthlyRollupAreaIds((prev) => {
      const next = new Set(prev);
      next.add(areaId);
      return next;
    });
  }, []);
  const handleToggleMonthlyRollupProse = useCallback((areaId: string) => {
    setKeptOriginalMonthlyRollupAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }, []);

  return {
    pendingWins,
    confirmedWins,
    handleConfirmWin,
    handleSkipWin,
    approvedRollups,
    displayedRollups,
    handleApproveRollup,
    handleDismissRollup,
    handleToggleRollupProse,
    displayedMonthlyRollups,
    approvedMonthlyRollups,
    monthOverMonthReadback,
    handleApproveMonthlyRollup,
    handleDismissMonthlyRollup,
    handleToggleMonthlyRollupProse,
  };
}
