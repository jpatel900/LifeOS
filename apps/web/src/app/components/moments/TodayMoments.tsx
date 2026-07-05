"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkflow } from "@/lib/WorkflowContext";
import { useMomentKeyboard } from "./useMomentKeyboard";
import { buildStartVM, buildFlowVM, buildCloseVM } from "./momentsViewModel";
import type { FirstMoveVM } from "./momentsViewModel";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import {
  CountdownClockToggle,
  type CountdownClockValue,
} from "./CountdownClockToggle";
import { CaptureAffordance } from "./CaptureAffordance";
import { CaptureOverlay } from "./CaptureOverlay";
import { CommandPalette, type CommandPaletteAction } from "./CommandPalette";
import { StartMoment } from "./StartMoment";
import { FlowMoment } from "./FlowMoment";
import { CloseMoment } from "./CloseMoment";
import { useReEntryRitual } from "./useReEntryRitual";
import { ReEntryRitual, type RecoveryCandidate } from "./ReEntryRitual";
import { buildProgressionNodes } from "./progressionNodes";
import { buildPipelineCounts } from "./pipelineCounts";
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
const CAPTURE_KINDS = ["Task", "Note", "Idea"];
const DEFAULT_FOCUS_MINUTES = 25;

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
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText,
    startTaskSession,
    markSession,
    carryForwardTask,
    saveReview,
    refreshPersistedWorkflow,
    promoteBacklogTask,
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
  const [toast, setToast] = useState<string | null>(null);
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

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, TOAST_DURATION_MS);
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
      if (task && task.status === "backlog") {
        promoteBacklogTask(taskId);
      }
      ritual.complete();
      setMoment("start");
      showToast("Welcome back — first move queued");
    },
    [state.tasks, promoteBacklogTask, ritual, showToast],
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
      { id: "switch-start", label: "Switch to Start", hint: "1" },
      { id: "switch-flow", label: "Switch to Flow", hint: "2" },
      { id: "switch-close", label: "Switch to Close", hint: "3" },
      { id: "open-capture", label: "Open capture", hint: "C" },
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
        hint: "↵",
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
      actions.push({ id: "close-day", label: "Close the day", hint: "↵" });
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
            />
          ) : null}

          {moment === "close" ? (
            <CloseMoment
              vm={closeVM}
              onCloseDay={() => {
                saveReview();
                showToast("Day closed");
              }}
              onCarryForward={(taskId) => carryForwardTask(taskId)}
            />
          ) : null}
        </>
      )}

      <CaptureAffordance onOpen={() => setCaptureOpen(true)} />

      <CaptureOverlay
        open={captureOpen}
        kinds={CAPTURE_KINDS}
        initialText={captureDraft}
        onDraftChange={(text) => {
          setCaptureDraft(text);
          writeStoredCaptureDraft(text);
        }}
        onSave={(text) => {
          submitCaptureText(text, selectedAreaId);
          showToast("Captured");
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

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
        data-testid="today-moments-toast"
      >
        {toast ? (
          <div
            className="rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg motion-reduce:transition-none motion-reduce:duration-0"
            style={{
              transitionProperty: "opacity, transform",
              transitionDuration: "var(--motion-base)",
              transitionTimingFunction: "var(--motion-ease)",
            }}
          >
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
