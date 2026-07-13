"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkflow } from "@/lib/WorkflowContext";
import { momentKeyLabel } from "@/lib/keys/keymap";
import { useMomentKeyboard } from "./useMomentKeyboard";
import { buildStartVM, buildFlowVM, buildCloseVM } from "./momentsViewModel";
import type { FirstMoveVM } from "./momentsViewModel";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import {
  CountdownClockToggle,
  type CountdownClockValue,
} from "./CountdownClockToggle";
import { CaptureAffordance } from "./CaptureAffordance";
import { KeyboardLegend } from "./KeyboardLegend";
import { CaptureOverlay } from "./CaptureOverlay";
import { CommandPalette, type CommandPaletteAction } from "./CommandPalette";
import { StartMoment } from "./StartMoment";
import { FlowMoment } from "./FlowMoment";
import { CloseMoment, type CloseWinVM } from "./CloseMoment";
import type {
  ApprovedWeeklyRollupInput,
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
import { useReEntryRitual } from "./useReEntryRitual";
import { ReEntryRitual, type RecoveryCandidate } from "./ReEntryRitual";
import { buildProgressionNodes } from "./progressionNodes";
import { buildPipelineCounts } from "./pipelineCounts";
import type { TaskMapDraftUiState } from "./TaskMapSection";
import { TriageSheet } from "./TriageSheet";
import { PlanSheet } from "./PlanSheet";
import type { DeepLinkTarget } from "./deepLink";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * Container that wires the P1 view-model builders and P2 presentation
 * primitives to WorkflowContext. Owns the moment/capture/palette UI state,
 * preferences persistence, and the interim local focus session (replaced
 * once packet P0 extracts useFocusSession from LifeOSCockpit). No fetches,
 * no new routes — this only renders on the dev-only /moments-preview route.
 */

const PREFERENCES_KEY = "lifeos.moments.preferences";
const CAPTURE_DRAFT_KEY = "lifeos.moments.captureDraft";
const TOAST_DURATION_MS = 2500;
// SP-6: undo over confirm. A toast carrying an Undo action stays up longer
// (6s) than a plain acknowledgement (2.5s) — the extra time is the reading
// + decision budget for the one thing a mistake is worth reversing.
const TOAST_WITH_ACTION_DURATION_MS = 6000;
const CAPTURE_KINDS = ["Task", "Note", "Idea"];
const DEFAULT_FOCUS_MINUTES = 25;

/** SP-6: the toast slot's action — a real, focusable (never auto-focused) Undo button. */
export interface ToastAction {
  label: string;
  run(): void;
}

interface ToastState {
  message: string;
  action?: ToastAction;
}

interface StoredPreferences {
  moment?: MomentValue;
  timeDisplay?: CountdownClockValue;
}

function readStoredPreferences(): StoredPreferences | null {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPreferences;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPreferences(prefs: StoredPreferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Blocked storage (private mode, quota, etc.) — preferences just won't persist.
  }
}

// SP-5: unsaved capture text must survive an accidental close/reopen within
// the session, but must not haunt a brand-new session — sessionStorage, not
// localStorage. Cleared only on a successful save; an Esc/close/re-entry
// ritual must never clear it. Mirrors the try/catch-guarded idiom used by
// readStoredPreferences/writeStoredPreferences and the reentry suppression
// helpers in useReEntryRitual.ts.
function readStoredCaptureDraft(): string {
  try {
    return window.sessionStorage.getItem(CAPTURE_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredCaptureDraft(text: string): void {
  try {
    if (text) {
      window.sessionStorage.setItem(CAPTURE_DRAFT_KEY, text);
    } else {
      window.sessionStorage.removeItem(CAPTURE_DRAFT_KEY);
    }
  } catch {
    // Blocked storage (private mode, quota, etc.) — draft just won't persist.
  }
}

function heuristicMoment(now: Date, hasCurrentBlock: boolean): MomentValue {
  const hour = now.getHours();
  if (hour < 11) return "start";
  if (hour >= 17) return "close";
  return hasCurrentBlock ? "flow" : "start";
}

export interface TodayMomentsProps {
  initialMoment?: MomentValue;
  now?: Date;
  deepLink?: DeepLinkTarget;
}

export function TodayMoments({
  initialMoment,
  now: nowProp,
  deepLink,
}: TodayMomentsProps) {
  // SP-10: relative/aging labels (schedule "in Xm"/"Xm left" rows, waiting-on
  // day counts) and the mount-time-of-day moment heuristic all derive from
  // `now`. Left frozen at mount, `now` goes stale in a long-lived tab. When
  // no `now` is injected (production path), self-refresh into state on a
  // slow ~60s cadence, aligned to the minute boundary via a self-rescheduling
  // setTimeout (mirrors the SP-2 anchored-scheduler style — no drift, no
  // interval left running while irrelevant). When `nowProp` IS injected
  // (tests), the timer never arms: `now` stays exactly the injected value,
  // so existing and new deterministic tests are unaffected unless they
  // explicitly opt into the default-clock path.
  const [autoNow, setAutoNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (nowProp) return undefined;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function schedule() {
      if (cancelled) return;
      const delay = 60000 - (Date.now() % 60000);
      timeoutId = setTimeout(() => {
        setAutoNow(new Date());
        schedule();
      }, delay);
    }

    schedule();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [nowProp]);
  const now = nowProp ?? autoNow;
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText,
    submitCaptureRaw,
    captureParse,
    startTaskSession,
    markSession,
    carryForwardTask,
    saveReview,
    confirmWin,
    confirmRollup,
    listApprovedRollups,
    refreshPersistedWorkflow,
    promoteBacklogTask,
    deferTask,
    unsyncedCaptureCount,
    taskMapDraft,
    requestTaskMapDraft,
    dismissTaskMapDraft,
    approveTaskMapDraft,
    toggleTaskMapNodeCompletion,
  } = useWorkflow();

  const ritual = useReEntryRitual({
    state,
    now,
    refreshPersistedWorkflow,
  });
  const ritualActive =
    ritual.status === "deferring" || ritual.status === "ready";

  const [recoverySwapIndex, setRecoverySwapIndex] = useState(0);

  const startVM = useMemo(
    () => buildStartVM(state, { now, selectedAreaId }),
    [state, now, selectedAreaId],
  );
  const flowVM = useMemo(() => buildFlowVM(state, { now }), [state, now]);
  const closeVM = useMemo(() => buildCloseVM(state, { now }), [state, now]);

  const [moment, setMoment] = useState<MomentValue>(() => {
    if (initialMoment) return initialMoment;
    const stored = readStoredPreferences();
    if (stored?.moment) return stored.moment;
    return heuristicMoment(now, flowVM.currentBlock !== null);
  });
  const [timeDisplay, setTimeDisplay] = useState<CountdownClockValue>(() => {
    const stored = readStoredPreferences();
    return stored?.timeDisplay ?? "countdown";
  });

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureDraft, setCaptureDraft] = useState<string>(() =>
    readStoredCaptureDraft(),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<null | "triage" | "plan">(
    null,
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interim local session state — replaced by useFocusSession when packet
  // P0 extracts it from LifeOSCockpit.
  const [session, setSession] = useState<{
    activeTaskId: string | null;
    running: boolean;
    remaining: number;
    total: number;
  }>({ activeTaskId: null, running: false, remaining: 0, total: 0 });

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
    (graph: Parameters<typeof approveTaskMapDraft>[1]) => {
      if (!railTaskId) return;
      void approveTaskMapDraft(railTaskId, graph);
    },
    [railTaskId, approveTaskMapDraft],
  );
  const handleToggleTaskMapNodeCompletion = useCallback(
    (nodeId: string) => {
      if (!railTaskId) return;
      void toggleTaskMapNodeCompletion(railTaskId, nodeId);
    },
    [railTaskId, toggleTaskMapNodeCompletion],
  );
  const pipelineCounts = useMemo(
    () => buildPipelineCounts(state, selectedAreaId),
    [state, selectedAreaId],
  );

  useEffect(() => {
    writeStoredPreferences({ moment, timeDisplay });
  }, [moment, timeDisplay]);

  // P6 deep-link shims: apply the incoming deepLink target exactly once. If
  // the re-entry ritual is active OR merely eligible-but-not-yet-latched
  // (ritual.pending — status still reads "idle" on the very first commit
  // before the mount effect flips it), defer application until the ritual
  // resolves rather than fighting it for the moment/overlay/sheet state —
  // the ritual owns the screen until dismissed. Gating on ritualActive
  // alone races: on mount, ritualActive is derived from status === "idle"
  // even when an absence is about to latch, so an overlay/sheet target
  // would pop on top of the ritual before its own effect has a chance to
  // run.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (!deepLink) return;
    if (deepLinkAppliedRef.current) return;
    if (ritualActive || ritual.pending) return;

    deepLinkAppliedRef.current = true;
    if (deepLink.moment) setMoment(deepLink.moment);
    if (deepLink.overlay === "capture") setCaptureOpen(true);
    if (deepLink.overlay === "palette") setPaletteOpen(true);
    if (deepLink.sheet) setActiveSheet(deepLink.sheet);
  }, [deepLink, ritualActive, ritual.pending]);

  // FR-027 (F-G1b) share target: text shared into the installed PWA lands on
  // the moments home as ?shared_text=. Open the capture overlay prefilled with
  // it exactly once (deferring to the re-entry ritual, same as deep links),
  // then strip the param so a refresh doesn't reopen it.
  const sharedTextAppliedRef = useRef(false);
  useEffect(() => {
    if (sharedTextAppliedRef.current) return;
    if (ritualActive || ritual.pending) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared_text");
    if (!shared) return;

    sharedTextAppliedRef.current = true;
    setCaptureDraft(shared);
    writeStoredCaptureDraft(shared);
    setCaptureOpen(true);

    params.delete("shared_text");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [ritualActive, ritual.pending]);

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

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // SP-6: back-compat signature — every existing call site passes a plain
  // string and keeps working unchanged (auto-dismisses at the original
  // 2.5s). An optional action extends the slot to a real, focusable Undo
  // button and the toast lingers longer (6s) to give it a fair chance to be
  // read and clicked before it auto-dismisses.
  const showToast = useCallback((message: string, action?: ToastAction) => {
    setToast({ message, action });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(
      () => {
        setToast(null);
      },
      action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS,
    );
  }, []);

  // S7 (#259) wins harvest. Candidate wins come from closeVM; confirm/skip
  // decisions live here for the session. Confirm persists through the context
  // (real client only; mock/preview stays local) and moves the candidate into
  // the reading list; skip dismisses it and writes nothing.
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

  // S8 (#260) rollup approve/dismiss, keyed by area for the session. Approve
  // persists through the context (real client only; mock/preview stays local)
  // and moves the draft into the week-over-week readback; dismiss writes nothing.
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
  // E3 (#260 follow-up): AI-prose enhancement for pending rollup drafts, keyed
  // by area for the session. The server rephrases items 1:1 with counts held
  // fixed; requestRollupProse falls back to the deterministic draft on any
  // failure, so this is purely additive — the rollup always shows and stays
  // approvable. Skipped entirely in demo/mock (no real account, no server key).
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

  const finishFocus = useCallback(() => {
    const elapsedMinutes =
      session.total > 0
        ? Math.round((session.total - session.remaining) / 60)
        : 0;
    markSession("completed", elapsedMinutes);
    setSession({ activeTaskId: null, running: false, remaining: 0, total: 0 });
    showToast("Focus session logged");
  }, [markSession, session.remaining, session.total, showToast]);

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
      startFocus(move.taskId, move.estMinutes || DEFAULT_FOCUS_MINUTES);
      setMoment("flow");
    },
    [startFocus],
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
        startVM.firstMove.estMinutes || DEFAULT_FOCUS_MINUTES,
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
    showToast,
  ]);

  const handleAbandonDrift = useCallback(() => {
    setMoment("start");
    showToast("Fresh start — pick your next move");
  }, [showToast]);

  const handleDrillPipeline = useCallback(
    (stage: string) => {
      if (stage === "triage") {
        setActiveSheet("triage");
        return;
      }
      if (stage === "plan") {
        setActiveSheet("plan");
        return;
      }
      showToast("Opens with the full shell");
    },
    [showToast],
  );

  const runPrimary = useCallback(() => {
    if (moment === "start") {
      if (startVM.firstMove) {
        handleStartMove(startVM.firstMove);
      }
      return;
    }
    if (moment === "flow") {
      if (session.activeTaskId !== null || session.total > 0) {
        finishFocus();
      }
      return;
    }
    saveReview();
    showToast("Day closed");
  }, [
    moment,
    startVM.firstMove,
    handleStartMove,
    session.activeTaskId,
    session.total,
    finishFocus,
    saveReview,
    showToast,
  ]);

  // Ordering: palette -> capture -> sheet. In practice Escape while a sheet
  // is focused is handled by MomentSheet itself (mirroring how
  // CommandPalette/CaptureOverlay own their own Escape via onKeyDown on the
  // focused element, since useMomentKeyboard is disabled while any overlay
  // is open) — this function exists for parity with that ordering and as a
  // defensive fallback, not as the primary Escape path.
  const closeTopOverlay = useCallback(() => {
    if (paletteOpen) {
      setPaletteOpen(false);
      return;
    }
    if (captureOpen) {
      setCaptureOpen(false);
      return;
    }
    if (activeSheet) {
      setActiveSheet(null);
    }
  }, [paletteOpen, captureOpen, activeSheet]);

  // FR-028 recovery candidate derivation: deterministic, pure. Ordered list
  // = [stalest open task, then each planned task deferral], deduped by
  // taskId. "Something else" cycles the index; empty list -> null.
  const recoveryCandidates = useMemo<RecoveryCandidate[]>(() => {
    if (!ritual.summary || !ritual.plan) return [];

    const candidates: RecoveryCandidate[] = [];
    const seen = new Set<string>();

    if (ritual.summary.stalest && ritual.summary.stalest.kind === "task") {
      const { id, label } = ritual.summary.stalest;
      candidates.push({ taskId: id, title: label, why: "Oldest waiting" });
      seen.add(id);
    }

    for (const deferral of ritual.plan.taskDeferrals) {
      if (seen.has(deferral.taskId)) continue;
      seen.add(deferral.taskId);
      candidates.push({
        taskId: deferral.taskId,
        title: deferral.taskTitle ?? "Task",
        why: "Just moved to backlog",
      });
    }

    return candidates;
  }, [ritual.summary, ritual.plan]);

  const recovery: RecoveryCandidate | null =
    recoveryCandidates.length > 0
      ? recoveryCandidates[recoverySwapIndex % recoveryCandidates.length]
      : null;

  const handleAcceptRecovery = useCallback(
    (taskId: string) => {
      const task = state.tasks.find((item) => item.id === taskId);
      const wasBacklog = task ? task.status === "backlog" : false;
      if (wasBacklog) {
        promoteBacklogTask(taskId);
      }
      ritual.complete();
      setMoment("start");
      // SP-6: `deferTask` genuinely reverses `promoteBacklogTask` here — it
      // returns the task to backlog exactly where it started, cancelling no
      // blocks that didn't already exist (a backlog task has none). Only
      // wire the undo when the promotion actually ran; otherwise there is
      // nothing to reverse and Undo would be a lie.
      showToast(
        "Welcome back — first move queued",
        wasBacklog
          ? { label: "Undo", run: () => deferTask(taskId) }
          : undefined,
      );
    },
    [state.tasks, promoteBacklogTask, deferTask, ritual, showToast],
  );

  const handleSwapRecovery = useCallback(() => {
    setRecoverySwapIndex((current) => current + 1);
  }, []);

  const handleDismissRitual = useCallback(() => {
    ritual.complete();
    showToast("Welcome back");
  }, [ritual, showToast]);

  useMomentKeyboard({
    onSwitchMoment: setMoment,
    onCapture: () => setCaptureOpen(true),
    onPalette: () => setPaletteOpen(true),
    onPrimary: runPrimary,
    onEscape: closeTopOverlay,
    enabled: !captureOpen && !paletteOpen && !activeSheet && !ritualActive,
  });

  const paletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      {
        id: "switch-start",
        label: "Switch to Start",
        hint: momentKeyLabel("switch-start"),
      },
      {
        id: "switch-flow",
        label: "Switch to Flow",
        hint: momentKeyLabel("switch-flow"),
      },
      {
        id: "switch-close",
        label: "Switch to Close",
        hint: momentKeyLabel("switch-close"),
      },
      {
        id: "open-capture",
        label: "Open capture",
        hint: momentKeyLabel("open-capture"),
      },
      { id: "open-triage", label: "Open triage" },
      { id: "open-plan", label: "Open plan" },
    ];
    if (moment === "start" && startVM.firstMove) {
      actions.push({ id: "start-first-move", label: "Start first move" });
    }
    if (session.activeTaskId !== null || session.total > 0) {
      actions.push({
        id: "focus-done",
        label: "Done — log it",
        hint: momentKeyLabel("primary-action"),
      });
      actions.push({
        id: "focus-pause",
        label: session.running ? "Pause focus" : "Resume focus",
      });
    }
    actions.push({
      id: "toggle-time",
      label:
        timeDisplay === "countdown"
          ? "Switch time display to clock"
          : "Switch time display to countdown",
    });
    if (moment === "close") {
      actions.push({
        id: "close-day",
        label: "Close the day",
        hint: momentKeyLabel("primary-action"),
      });
    }
    return actions;
  }, [
    moment,
    startVM.firstMove,
    session.activeTaskId,
    session.total,
    session.running,
    timeDisplay,
  ]);

  const runPaletteAction = useCallback(
    (id: string) => {
      switch (id) {
        case "switch-start":
          setMoment("start");
          break;
        case "switch-flow":
          setMoment("flow");
          break;
        case "switch-close":
          setMoment("close");
          break;
        case "open-capture":
          setCaptureOpen(true);
          break;
        case "open-triage":
          setActiveSheet("triage");
          break;
        case "open-plan":
          setActiveSheet("plan");
          break;
        case "start-first-move":
          if (startVM.firstMove) handleStartMove(startVM.firstMove);
          break;
        case "focus-done":
          finishFocus();
          break;
        case "focus-pause":
          pauseFocus();
          break;
        case "toggle-time":
          setTimeDisplay((current) =>
            current === "countdown" ? "clock" : "countdown",
          );
          break;
        case "close-day":
          saveReview();
          showToast("Day closed");
          break;
        default:
          break;
      }
    },
    [
      startVM.firstMove,
      handleStartMove,
      finishFocus,
      pauseFocus,
      saveReview,
      showToast,
    ],
  );

  return (
    <div className="grid gap-6" data-testid="today-moments">
      {ritualActive && ritual.summary && ritual.plan ? (
        <ReEntryRitual
          summary={ritual.summary}
          plan={ritual.plan}
          outcomes={ritual.outcomes}
          demoMode={ritual.demoMode}
          recovery={recovery}
          onAcceptRecovery={handleAcceptRecovery}
          onSwapRecovery={handleSwapRecovery}
          onDismiss={handleDismissRitual}
        />
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold tracking-tight">
                LifeOS · Today
              </span>
              <select
                aria-label="Area"
                value={selectedAreaId ?? ""}
                onChange={(event) =>
                  setSelectedAreaId(event.target.value || null)
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                data-testid="today-moments-area-switcher"
              >
                <option value="">All areas</option>
                {state.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <CountdownClockToggle
                value={timeDisplay}
                onChange={setTimeDisplay}
              />
              <MomentSwitcher value={moment} onChange={setMoment} />
            </div>
          </header>

          {moment !== "start" ? (
            <h1 className="sr-only">LifeOS Today</h1>
          ) : null}

          {moment === "start" ? (
            <StartMoment
              vm={startVM}
              timeDisplay={timeDisplay}
              now={now}
              onStartMove={handleStartMove}
              onSnooze={() => showToast("Snoozed 10m")}
              onSwap={() => showToast("Looking for something else")}
              onOpenHealth={() => showToast("Area health is on the roadmap")}
              pipelineCounts={pipelineCounts}
              onDrillPipeline={handleDrillPipeline}
              onOpenRecovery={() => setMoment("close")}
            />
          ) : null}

          {moment === "flow" ? (
            <FlowMoment
              vm={flowVM}
              session={session}
              timeDisplay={timeDisplay}
              onDone={finishFocus}
              onPause={pauseFocus}
              onExtend={extendFocus}
              onToggleTime={() =>
                setTimeDisplay((current) =>
                  current === "countdown" ? "clock" : "countdown",
                )
              }
              onReclaimDrift={handleReclaimDrift}
              onAbandonDrift={handleAbandonDrift}
              progressionNodes={progressionNodes}
              focusedTask={focusedTask}
              taskMapDraft={taskMapDraftForSection}
              now={now}
              onRequestTaskMapDraft={handleRequestTaskMapDraft}
              onDismissTaskMapDraft={dismissTaskMapDraft}
              onApproveTaskMapDraft={handleApproveTaskMapDraft}
              onToggleTaskMapNodeCompletion={handleToggleTaskMapNodeCompletion}
            />
          ) : null}

          {moment === "close" ? (
            <CloseMoment
              vm={closeVM}
              pendingWins={pendingWins}
              confirmedWins={confirmedWins}
              pendingRollups={displayedRollups}
              approvedRollups={approvedRollups}
              onCloseDay={() => {
                saveReview();
                showToast("Day closed");
              }}
              onCarryForward={(taskId) => carryForwardTask(taskId)}
              onConfirmWin={handleConfirmWin}
              onSkipWin={handleSkipWin}
              onApproveRollup={handleApproveRollup}
              onDismissRollup={handleDismissRollup}
              onToggleRollupProse={handleToggleRollupProse}
              pendingMonthlyRollups={displayedMonthlyRollups}
              approvedMonthlyRollups={approvedMonthlyRollups}
              monthOverMonthReadback={monthOverMonthReadback}
              onApproveMonthlyRollup={handleApproveMonthlyRollup}
              onDismissMonthlyRollup={handleDismissMonthlyRollup}
              onToggleMonthlyRollupProse={handleToggleMonthlyRollupProse}
            />
          ) : null}
        </>
      )}

      <KeyboardLegend />

      <CaptureAffordance
        disabled={captureParse.phase === "parsing"}
        onOpen={() => setCaptureOpen(true)}
        unsyncedCount={unsyncedCaptureCount}
      />

      <CaptureOverlay
        open={captureOpen}
        kinds={CAPTURE_KINDS}
        initialText={captureDraft}
        onDraftChange={(text) => {
          setCaptureDraft(text);
          writeStoredCaptureDraft(text);
        }}
        onSave={(text, _kind, returnHook) => {
          submitCaptureText(text, selectedAreaId, returnHook);
          showToast("Captured");
          setCaptureOpen(false);
          // Clear the draft only after a successful save — Esc/close must
          // preserve it, so this write happens nowhere else.
          setCaptureDraft("");
          writeStoredCaptureDraft("");
        }}
        onSaveRaw={(text, _kind, returnHook) => {
          submitCaptureRaw(text, selectedAreaId, returnHook);
          showToast("Saved raw");
          setCaptureOpen(false);
          setCaptureDraft("");
          writeStoredCaptureDraft("");
        }}
        onClose={() => setCaptureOpen(false)}
      />

      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onRun={runPaletteAction}
        onClose={() => setPaletteOpen(false)}
      />

      <TriageSheet
        open={activeSheet === "triage"}
        selectedAreaId={selectedAreaId}
        onClose={() => setActiveSheet(null)}
      />

      <PlanSheet
        open={activeSheet === "plan"}
        onClose={() => setActiveSheet(null)}
        blocks={startVM.blocks}
        timeDisplay={timeDisplay}
        now={now}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
        data-testid="today-moments-toast"
      >
        {toast ? (
          <div
            className={
              "flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg motion-reduce:transition-none motion-reduce:duration-0" +
              (toast.action ? " pointer-events-auto" : "")
            }
            style={{
              transitionProperty: "opacity, transform",
              transitionDuration: "var(--motion-base)",
              transitionTimingFunction: "var(--motion-ease)",
            }}
          >
            {toast.message}
            {toast.action ? (
              <button
                type="button"
                // SP-6: a real, focusable button — but never auto-focused.
                // Undo is there for the hand that wants it, not forced on
                // the eye that doesn't.
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                  if (toastTimeoutRef.current) {
                    clearTimeout(toastTimeoutRef.current);
                  }
                }}
                className="font-semibold text-primary underline-offset-2 hover:underline"
                data-testid="today-moments-toast-undo"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
