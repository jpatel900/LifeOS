"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Settings as SettingsIcon } from "lucide-react";
import { useWorkflow } from "@/lib/WorkflowContext";
import { buildCockpitAccentStyle } from "@/lib/cockpit/accent";
import { resolveSelectedArea } from "@/lib/areaAccent";
import { momentKeyLabel } from "@/lib/keys/keymap";
import { cn } from "@/lib/utils";
import { useMomentKeyboard } from "./useMomentKeyboard";
import { HIT_TARGET_MIN } from "./hitTarget";
import { buildStartVM, buildFlowVM, buildCloseVM } from "./momentsViewModel";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import { BottomNavigator } from "./BottomNavigator";
import {
  CountdownClockToggle,
  type CountdownClockValue,
} from "./CountdownClockToggle";
import { AreaSelector } from "./AreaSelector";
import { MastheadThemeToggle } from "./MastheadThemeToggle";
import { formatMastheadDate } from "./formatMastheadDate";
import { CaptureAffordance } from "./CaptureAffordance";
import { AuthAffordance } from "./AuthAffordance";
import { KeyboardLegend } from "./KeyboardLegend";
import { CaptureOverlay } from "./CaptureOverlay";
import { CommandPalette, type CommandPaletteAction } from "./CommandPalette";
import { StartMoment } from "./StartMoment";
import { FlowMoment } from "./FlowMoment";
import { CloseMoment } from "./CloseMoment";
import { useReEntryRitual } from "./useReEntryRitual";
import { ReEntryRitual, type RecoveryCandidate } from "./ReEntryRitual";
import {
  createBriefViewRecorder,
  type BriefViewRecorder,
} from "@/lib/reEntry/briefView";
import {
  localDayStamp,
  recordPurposeGaugeCheckinFireAndForget,
  shouldOfferPurposeGaugeCheckin,
} from "@/lib/purpose/purposeGaugeCheckin";
import type { PurposeGaugeResponse } from "@/lib/purpose/purposeGaugePolicy";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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
 * command palette, deep links, toast). No fetches; renders at `/` when
 * NEXT_PUBLIC_MOMENTS_HOME is on (see app/page.tsx).
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
// FR-047 slice 2 (#686): the local day (YYYY-MM-DD) a purpose-gauge check-in
// was last taken, so the optional Close offer doesn't re-appear after it was
// answered that day. A decline never writes this — it stays re-offerable,
// which is fine for an asked-only surface (FR-033).
const PURPOSE_GAUGE_KEY = "lifeos.moments.purposeGaugeLastChecked";

function readPurposeGaugeLastChecked(): string | null {
  try {
    return window.localStorage.getItem(PURPOSE_GAUGE_KEY);
  } catch {
    return null;
  }
}

function writePurposeGaugeLastChecked(day: string): void {
  try {
    window.localStorage.setItem(PURPOSE_GAUGE_KEY, day);
  } catch {
    // Blocked storage (private mode, quota) — the offer may re-appear later
    // the same day, harmless: a re-tap is a DB no-op (append-only PK).
  }
}
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

  // #690 Part 2: the moments home is area-scoped (selectedAreaId drives every
  // stage view model below). Mirror LifeOSCockpit's screen-accent wiring so
  // the --acc token family (emphasis borders, progression rail, schedule and
  // pipeline tints — all `var(--acc)` consumers) takes the active area's color
  // at this scoped container instead of the fixed .lifeos-cockpit default.
  // Same buildCockpitAccentStyle the stage routes use, so the home and the
  // stage agree on the accent for a given area. Mounted guard mirrors
  // MomentsThemeShell: default dark until next-themes resolves, so the SSR and
  // first-client style strings match (no hydration mismatch). The base --acc
  // is dark-independent; only the surface/ring derivations settle on mount.
  const { resolvedTheme } = useTheme();
  const [accentThemeMounted, setAccentThemeMounted] = useState(false);
  useEffect(() => {
    setAccentThemeMounted(true);
  }, []);

  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    syncStatus,
    syncPersistedAreas,
    submitCaptureText,
    submitCaptureRaw,
    captureParse,
    retryCaptureParseWithMock,
    startTaskSession,
    markSession,
    deferTask,
    deferTaskWithSession,
    updateTaskFirstTinyStep,
    carryForwardTask,
    saveReview,
    confirmWin,
    confirmRollup,
    listApprovedRollups,
    refreshPersistedWorkflow,
    promoteBacklogTask,
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

  // #690 Part 2: resolve the active area the same way the stage cockpit does
  // (`activeArea ?? areas[0]`, via resolveSelectedArea) so an "All areas"
  // selection lands on the same default accent as the stage routes.
  const accentAreaColor = resolveSelectedArea(
    state.areas,
    selectedAreaId,
  )?.color;
  const accentStyle = useMemo(
    () =>
      buildCockpitAccentStyle(
        accentAreaColor,
        !accentThemeMounted || resolvedTheme !== "light",
      ),
    [accentAreaColor, accentThemeMounted, resolvedTheme],
  );

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

  // #292 Stage-2 entry gate instrumentation: "brief viewed >= 4 days/week"
  // needs a signal on the surface a returning user actually sees daily —
  // the Start moment (S6 #258's "daily brief additions"), not only the rare
  // post-absence re-entry ritual (useReEntryRitual.ts already records its
  // own view separately). This fires once per local day the Start moment is
  // the actually-rendered surface (below: `moment === "start"` AND neither
  // the onboarding nor the re-entry ritual is standing in front of it,
  // mirroring the exact render condition below). Fire-and-forget and
  // failure-silent by construction (lib/reEntry/briefView.ts); demo mode
  // (no Supabase client) is skipped silently inside the recorder.
  const briefViewRecorderRef = useRef<BriefViewRecorder | null>(null);
  if (briefViewRecorderRef.current === null) {
    briefViewRecorderRef.current = createBriefViewRecorder();
  }
  const startMomentShowing =
    !onboardingActive &&
    !(ritualActive && ritual.summary && ritual.plan) &&
    moment === "start";
  useEffect(() => {
    if (!startMomentShowing) return;
    briefViewRecorderRef.current?.recordIfNeeded(
      createSupabaseBrowserClient(),
      now,
    );
  }, [startMomentShowing, now]);

  // FR-047 slice 2 / FR-033 (#686): the optional Close purpose-gauge check-in.
  // Read the last-checked local day once (localStorage, mount-only) so an
  // answered check-in stays hidden the rest of that day; gating itself lives
  // in the shipped `shouldOfferPurposeGaugeCheckin` policy wrapper. Recording
  // is fire-and-forget and skipped silently in demo mode.
  const [purposeGaugeLastChecked, setPurposeGaugeLastChecked] = useState<
    string | null
  >(() => readPurposeGaugeLastChecked());
  const purposeGaugeOffered = shouldOfferPurposeGaugeCheckin(
    now,
    purposeGaugeLastChecked,
  );
  const handlePurposeGaugeCheckIn = useCallback(
    (response: PurposeGaugeResponse) => {
      const checkedOn = localDayStamp(now);
      recordPurposeGaugeCheckinFireAndForget(
        createSupabaseBrowserClient(),
        checkedOn,
        response,
      );
      writePurposeGaugeLastChecked(checkedOn);
      setPurposeGaugeLastChecked(checkedOn);
    },
    [now],
  );

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
    deferTaskWithSession,
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

  // #588: the only close-day path in this shell. "Day closed" is reported
  // only after the review save actually persisted; local-only keeps the
  // recovery-oriented fallback truth; failure shows recovery copy and never
  // claims closure.
  const handleCloseDay = useCallback(() => {
    void saveReview().then((result) => {
      if (result === "persisted") {
        showToast("Day closed");
        return;
      }
      if (result === "local-only") {
        showToast("Day closed locally — account sync pending");
        return;
      }
      showToast("Couldn't close the day — review not saved yet");
    });
  }, [saveReview, showToast]);

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
    handleCloseDay();
  }, [
    moment,
    startVM.firstMove,
    handleStartMove,
    session.activeTaskId,
    session.total,
    finishFocus,
    handleCloseDay,
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

  // D-10 (#483): shared gate for the masthead's own guarded shortcuts (area
  // cycle "A", theme toggle "D") — identical expression to
  // useMomentKeyboard's `enabled` below, so neither shortcut can fire
  // behind a modal/ritual/onboarding, matching every other global shortcut
  // in this file.
  const topbarShortcutsEnabled =
    !captureOpen &&
    !paletteOpen &&
    !activeSheet &&
    !ritualActive &&
    !onboardingActive;

  useMomentKeyboard({
    onSwitchMoment: setMoment,
    onCapture: () => setCaptureOpen(true),
    onPalette: () => setPaletteOpen(true),
    onPrimary: runPrimary,
    onEscape: closeTopOverlay,
    enabled: topbarShortcutsEnabled,
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
          handleCloseDay();
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
      handleCloseDay,
    ],
  );

  return (
    <div className="grid gap-6" data-testid="today-moments" style={accentStyle}>
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
          {/* D-10 (#483): one composed masthead bar — brand+date on the
              left, every control (moments, area, time display, theme,
              settings) in a single tightened-gap cluster on the right,
              replacing the previous two-separate-pills-plus-a-bare-link
              layout the audit flagged as "loose grouping" (finding #4).

              D-10 R2 (#483 round 2): round 1 shipped this as one
              `flex flex-wrap` row unconditionally. Below `sm` that meant
              *two* copies of the Start/Flow/Close switcher on screen at
              once (this row's MomentSwitcher plus the fixed BottomNavigator
              — "no taste argument for it") and, once that's fixed, a
              5-control row with nowhere to go but a ragged flex-wrap
              staircase (measured at 206px tall / 24% of a 390x844
              viewport, terminating at three different right edges). Fixed
              with a real two-part mobile composition instead of emergent
              wrapping:
              - Row 1 (always): brand + date.
              - Row 2 (mobile, `flex flex-col` below `sm`): only the two
                controls with no mobile equivalent anywhere else on the
                page — AreaSelector (which area's data you're looking at —
                context, not a preference) and MastheadThemeToggle (the
                ONLY theme control in the app; no settings-page fallback
                exists, so it can never be dropped from a viewport). Both
                already stayed under `sm:` visibility flags for nothing —
                they simply render.
              - MomentSwitcher and the Settings link are `hidden sm:contents`
                below `sm`: BottomNavigator already carries an identical
                moment switch and a Settings link into the thumb zone, so
                rendering them here too on mobile is the exact duplicate
                the critics flagged. `sm:contents` (not `sm:flex`/
                `sm:inline-flex`) means the wrapper itself never becomes a
                layout box at `sm`+ either — the wrapped control's own root
                participates in the row exactly as if unwrapped.
              - CountdownClockToggle is the same `hidden sm:contents` — a
                "minor display-FORMAT preference" (round-1 critic's own
                framing) is the one control this composition can't fit
                robustly next to a full-length area name on a 390px row
                without risking the staircase reappearing; FlowMoment
                already exposes its own time-display toggle for the one
                moment where the format matters most, and the desktop/
                tablet masthead keeps full access at `sm`+.
              At `sm`+ the whole header becomes one `sm:flex-row` line and
              every control renders — nothing is lost above the mobile
              breakpoint.

              Visual rank ("primary nav > context > preferences", per
              round-1 critics): a hairline divider now separates
              MomentSwitcher (the only accent-filled, i.e. primary, control
              in the bar) from the secondary cluster (Area/Countdown/Theme/
              Settings — context + preferences, deliberately quieter and
              visually one family). The divider itself is `sm:` only —
              MomentSwitcher isn't in the mobile row for it to divide from.

              Height lock: every control in the row is now height-locked to
              the same ~44-46px line (was a 57px/44px, 13px split — see
              MomentSwitcher.tsx/CountdownClockToggle.tsx's own comments for
              the `.workflow-shell__nav` root cause) via a tightened `gap-2`
              instead of the previous `gap-3`.

              R3-C (#483 round 3, Inter reflow): self-hosting Inter (wider
              metrics than the Segoe fallback) reopened the row-1 overflow
              round 2 had just barely closed — measured 18.41px over budget
              at desktop widths (732.13px needed vs 713.72px available) with
              the shortest demo area ("Main Job") selected, wrapping the
              Settings icon alone to a second line.

              First pass shaved only the secondary cluster (gap-2->gap-1.5,
              AreaSelector/CountdownClockToggle/MastheadThemeToggle each one
              padding step) and verified clean against that shortest-name
              case — but AreaSelector's rendered width scales with the
              selected area's name, and this demo data's own longer names
              ("Volunteer Work", "Side Project") still wrapped the row: the
              first pass's margin (~13.75px) was real but smaller than the
              width swing between the shortest and longest demo names
              (~50px), so it only ever covered the case it was measured
              against.

              Two more changes close the real (name-independent) gap:
              1. AreaSelector's label span caps at `max-w-[5rem]` (was
                 `max-w-[9rem]`, effectively never engaging for realistic
                 names) + `min-w-0` (a `truncate` span inside an
                 `inline-flex` button doesn't actually shrink below its own
                 content's width without it — flexbox's `min-width: auto`
                 default silently wins over `max-w` otherwise). This bounds
                 AreaSelector's contribution to the row regardless of how
                 long a real (user-created) area name is — verified
                 in-browser across all 4 demo areas, with margin, not just
                 the shortest one.
              2. MomentSwitcher and CountdownClockToggle each give up one
                 more padding step (`px-3`->`px-2.5` / `px-3`->`px-2`) to
                 fund that 80px label budget without also truncating the
                 common short-name case ("Main Job"/"Personal" both render
                 in full at this cap; only names longer than ~80px worth of
                 text truncate). CountdownClockToggle (the "quietest"
                 secondary control) absorbs the larger of the two cuts;
                 MomentSwitcher's is a small padding harmonization, not a
                 demotion — it's still the only accent-filled control and
                 remains by far the widest. */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-sm font-semibold tracking-tight">
                LifeOS · Today
              </span>
              {/* Finding #2: the masthead had no date. Derived from the
                  real `now` this component already threads through every
                  other time-aware surface — never a fixed/fake string. */}
              <span
                className="text-sm text-muted-foreground"
                data-testid="today-moments-date"
              >
                {formatMastheadDate(now)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                className="hidden sm:contents"
                data-testid="masthead-momentswitcher-slot"
              >
                <MomentSwitcher value={moment} onChange={setMoment} />
              </div>
              <span
                aria-hidden="true"
                data-testid="masthead-divider"
                className="hidden h-6 w-px shrink-0 bg-border sm:block"
              />
              {/* Finding #1: native <select> replaced by a custom pill
                  combobox — swatch + label + a real "A" kbd hint. */}
              <AreaSelector
                areas={state.areas}
                value={selectedAreaId}
                onChange={setSelectedAreaId}
                shortcutEnabled={topbarShortcutsEnabled}
              />
              <div
                className="hidden sm:contents"
                data-testid="masthead-countdowntoggle-slot"
              >
                <CountdownClockToggle
                  value={timeDisplay}
                  onChange={setTimeDisplay}
                />
              </div>
              {/* Finding #3: topbar theme toggle, wired to the existing
                  next-themes setup — a real "D" kbd hint. */}
              <MastheadThemeToggle shortcutEnabled={topbarShortcutsEnabled} />
              {/* #688: the auth door — a "Sign in" pill when signed out (or
                  a quiet who + sign-out when signed in), in the same pill
                  grammar as the cluster. Renders nothing when accounts aren't
                  set up here, so it never dead-ends. Kept visible at every
                  width (not `hidden sm:contents`) because being unable to find
                  sign-in was the reported bug. */}
              <AuthAffordance />
              {/* Finding #4: demoted from a bare text link to an
                  icon-weighted pill matching the rest of the cluster. */}
              <div
                className="hidden sm:contents"
                data-testid="masthead-settingslink-slot"
              >
                <Link
                  href="/settings/areas"
                  aria-label="Settings"
                  className={cn(
                    HIT_TARGET_MIN,
                    "rounded-full border border-border bg-muted/40 text-muted-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
                  )}
                  data-testid="moments-settings-link"
                >
                  <SettingsIcon className="size-4" aria-hidden="true" />
                </Link>
              </div>
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
              onCloseDay={handleCloseDay}
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
              purposeGaugeOffered={purposeGaugeOffered}
              onPurposeGaugeCheckIn={handlePurposeGaugeCheckIn}
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
          more state to track for no real benefit.
          #593: it also carries the mobile capture action (same state as the
          desktop pill above, which is `hidden` below `sm`). */}
      <BottomNavigator
        value={moment}
        onChange={setMoment}
        onCapture={() => setCaptureOpen(true)}
        captureDisabled={captureParse.phase === "parsing"}
        unsyncedCount={unsyncedCaptureCount}
      />

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
          // #689: the toast names WHERE the thought went and offers the
          // one-tap path there. Every resolved outcome is visible in the
          // triage sheet (parsed -> a draft row; raw/failed-raw -> an
          // unsorted-capture row), except the offline queue: a raw capture
          // saved while offline stays on the device until reconnect
          // (FR-027), so the message says that instead of promising a
          // triage row that isn't there yet.
          const offline =
            typeof navigator !== "undefined" && navigator.onLine === false;
          const signedOutNote = syncStatus.signedOut
            ? " Saved on this device — sign in to keep it everywhere."
            : "";
          if (offline && outcome !== "parsed") {
            showToast(
              "Captured — saved on this device. It joins your triage pile when you're back online.",
            );
          } else {
            showToast(`Captured — it's in your triage pile.${signedOutNote}`, {
              label: "Open triage",
              run: () => setActiveSheet("triage"),
            });
          }
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
