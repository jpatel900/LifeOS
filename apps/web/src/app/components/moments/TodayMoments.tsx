"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkflow } from "@/lib/WorkflowContext";
import { momentKeyLabel } from "@/lib/keys/keymap";
import { cn } from "@/lib/utils";
import { useMomentKeyboard } from "./useMomentKeyboard";
import { HIT_TARGET_ROW, HIT_TARGET_INVISIBLE } from "./hitTarget";
import { buildStartVM, buildFlowVM, buildCloseVM } from "./momentsViewModel";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import { BottomNavigator } from "./BottomNavigator";
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
import { CloseMoment } from "./CloseMoment";
import { useReEntryRitual } from "./useReEntryRitual";
import { ReEntryRitual, type RecoveryCandidate } from "./ReEntryRitual";
import { useOnboardingRitual } from "./useOnboardingRitual";
import { OnboardingRitual } from "./OnboardingRitual";
import { readDayShapePreferences } from "@/lib/onboarding/onboarding";
import { buildPipelineCounts } from "./pipelineCounts";
import { TriageSheet } from "./TriageSheet";
import { PlanSheet } from "./PlanSheet";
import { EndSessionSheet } from "./EndSessionSheet";
import type { DeepLinkTarget } from "./deepLink";
import type { ToastAction } from "./toast";
import { useFlowFocusSession } from "./useFlowFocusSession";
import { useCloseMomentRollups } from "./useCloseMomentRollups";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * Container that wires the P1 view-model builders and P2 presentation
 * primitives to WorkflowContext. Owns the moment/capture/palette UI state,
 * preferences persistence, and cross-moment coordination (primary action,
 * command palette, deep links, toast). No fetches, no new routes — this
 * only renders on the dev-only /moments-preview route.
 *
 * #590 slice 3: Flow's focus-session/task-map wiring and Close's wins/rollup
 * harvesting now live in `useFlowFocusSession` and `useCloseMomentRollups`
 * respectively (screen logic + view-model section moved together, per
 * moment). This file stays the thin composition root — it owns the
 * moment/capture/palette/toast state that is genuinely shared across all
 * three moments, and wires the two hooks' outputs into `<StartMoment>` /
 * `<FlowMoment>` / `<CloseMoment>`.
 */

const PREFERENCES_KEY = "lifeos.moments.preferences";
const CAPTURE_DRAFT_KEY = "lifeos.moments.captureDraft";
const TOAST_DURATION_MS = 2500;
// SP-6: undo over confirm. A toast carrying an Undo action stays up longer
// (6s) than a plain acknowledgement (2.5s) — the extra time is the reading
// + decision budget for the one thing a mistake is worth reversing.
const TOAST_WITH_ACTION_DURATION_MS = 6000;
const DEFAULT_FOCUS_MINUTES = 25;

/** SP-6: the toast slot's action — a real, focusable (never auto-focused) Undo button. */
export type { ToastAction };

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
  const router = useRouter();
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
    syncPersistedAreas,
    submitCaptureText,
    submitCaptureRaw,
    captureParse,
    retryCaptureParseWithMock,
    startTaskSession,
    markSession,
    updateTaskFirstTinyStep,
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

  // #581: the onboarding ritual owns the screen ahead of everything else on
  // a zero-state (or Settings-rerun) session. The re-entry ritual is
  // disabled while onboarding is eligible/active — a brand-new account has
  // nothing to be welcomed back to.
  const onboarding = useOnboardingRitual({ state });
  const onboardingActive = onboarding.active;

  const ritual = useReEntryRitual({
    state,
    now,
    enabled: !onboardingActive && !onboarding.pending,
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

  // #581 (onboarding step 2): the day-shape preference, when the user has
  // saved one, feeds the default focus-session length used whenever a move
  // has no estimate of its own. No saved preference -> the pre-existing
  // 25-minute default, unchanged. Read once at mount (localStorage).
  const [fallbackFocusMinutes] = useState(
    () => readDayShapePreferences()?.sessionMinutes ?? DEFAULT_FOCUS_MINUTES,
  );

  const pipelineCounts = useMemo(
    () => buildPipelineCounts(state, selectedAreaId, { now }),
    [state, selectedAreaId, now],
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
    if (onboardingActive || onboarding.pending) return;

    deepLinkAppliedRef.current = true;
    if (deepLink.moment) setMoment(deepLink.moment);
    if (deepLink.overlay === "capture") setCaptureOpen(true);
    if (deepLink.overlay === "palette") setPaletteOpen(true);
    if (deepLink.sheet) setActiveSheet(deepLink.sheet);
  }, [
    deepLink,
    ritualActive,
    ritual.pending,
    onboardingActive,
    onboarding.pending,
  ]);

  // FR-027 (F-G1b) share target: text shared into the installed PWA lands on
  // the moments home as ?shared_text=. Open the capture overlay prefilled with
  // it exactly once (deferring to the re-entry ritual, same as deep links),
  // then strip the param so a refresh doesn't reopen it.
  const sharedTextAppliedRef = useRef(false);
  useEffect(() => {
    if (sharedTextAppliedRef.current) return;
    if (ritualActive || ritual.pending) return;
    if (onboardingActive || onboarding.pending) return;
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
  }, [ritualActive, ritual.pending, onboardingActive, onboarding.pending]);

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

  // #590 slice 3: Flow moment's focus-session + task-map wiring, extracted
  // to `useFlowFocusSession` (see its doc comment for the full contract).
  const {
    session,
    progressionNodes,
    focusedTask,
    taskMapDraftForSection,
    handleRequestTaskMapDraft,
    handleApproveTaskMapDraft,
    handleToggleTaskMapNodeCompletion,
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
  } = useFlowFocusSession({
    state,
    now,
    startVM,
    fallbackFocusMinutes,
    showToast,
    setMoment,
    startTaskSession,
    markSession,
    taskMapDraft,
    requestTaskMapDraft,
    dismissTaskMapDraft,
    approveTaskMapDraft,
    toggleTaskMapNodeCompletion,
    updateTaskFirstTinyStep,
  });

  // #590 slice 3: Close moment's wins + rollup harvesting, extracted to
  // `useCloseMomentRollups` (see its doc comment for the full contract).
  const {
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
  } = useCloseMomentRollups({
    state,
    closeVM,
    now,
    showToast,
    confirmWin,
    confirmRollup,
    listApprovedRollups,
  });

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
    enabled:
      !captureOpen &&
      !paletteOpen &&
      !activeSheet &&
      !ritualActive &&
      !onboardingActive,
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
      {onboardingActive ? (
        // #581: the onboarding ritual stands in for the moments content the
        // same way the re-entry ritual does; completing (or skipping) it
        // unmounts onto the Start moment, where the #551 state-truth
        // surfaces show whatever was just captured.
        <OnboardingRitual
          captureParse={captureParse}
          onSubmitParse={(text, hook) =>
            submitCaptureText(text, selectedAreaId, hook)
          }
          onSubmitRaw={(text, hook) =>
            submitCaptureRaw(text, selectedAreaId, hook)
          }
          onRetryWithMock={retryCaptureParseWithMock}
          onAreasPersisted={syncPersistedAreas}
          onComplete={(outcome) => {
            onboarding.complete();
            setMoment("start");
            showToast(
              outcome === "captured"
                ? "Captured — you're set up"
                : "You're set up",
            );
          }}
        />
      ) : ritualActive && ritual.summary && ritual.plan ? (
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
                className={cn(
                  HIT_TARGET_ROW,
                  "rounded-md border border-border bg-background px-2 py-1 text-sm",
                )}
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
              <Link
                href="/settings/areas"
                className={cn(
                  HIT_TARGET_INVISIBLE,
                  "text-sm font-medium text-muted-foreground hover:text-foreground",
                )}
                data-testid="moments-settings-link"
              >
                Settings
              </Link>
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
              onOpenHealth={() => router.push("/health")}
              pipelineCounts={pipelineCounts}
              onDrillPipeline={handleDrillPipeline}
              onOpenRecovery={() => setMoment("close")}
              onOpenTriage={() => setActiveSheet("triage")}
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
              firstTinyStep={focusedTask?.first_tiny_step ?? null}
              onUpdateFirstTinyStep={(value) => {
                if (!focusedTask) return;
                updateTaskFirstTinyStep(focusedTask.id, value);
              }}
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

      {/* #574: <640px only (BottomNavigator itself is `sm:hidden`) — the
          Start/Flow/Close switch + Settings, reachable in the thumb zone
          without scrolling to the header. Rendered unconditionally
          (matching CaptureAffordance just above), including while the
          re-entry ritual is active: it's a fixed low-risk nav strip, not
          part of the ritual's own flow, and hiding it would just be one
          more state to track for no real benefit. */}
      <BottomNavigator value={moment} onChange={setMoment} />

      <CaptureOverlay
        open={captureOpen}
        captureParse={captureParse}
        onRetryWithMock={retryCaptureParseWithMock}
        initialText={captureDraft}
        onDraftChange={(text) => {
          setCaptureDraft(text);
          writeStoredCaptureDraft(text);
        }}
        onSave={(text, returnHook) =>
          submitCaptureText(text, selectedAreaId, returnHook)
        }
        onSaveRaw={(text, returnHook) => {
          submitCaptureRaw(text, selectedAreaId, returnHook);
        }}
        onResolved={(outcome) => {
          // #556: the success toast only fires once the capture truly
          // entered the pipeline (parsed, or a raw save the user actually
          // resolved to) — never ahead of that truth.
          showToast(outcome === "parsed" ? "Captured" : "Saved raw");
          setCaptureOpen(false);
          // Clear the draft only after a successful save — Esc/close must
          // preserve it, so this write happens nowhere else.
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

      <EndSessionSheet
        open={endSessionOpen}
        taskTitle={
          focusedTask?.title ?? flowVM.currentBlock?.title ?? "Focus session"
        }
        elapsedMinutes={endSessionElapsedMinutes}
        onCancel={() => setEndSessionOpen(false)}
        onSave={handleEndSessionSave}
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
