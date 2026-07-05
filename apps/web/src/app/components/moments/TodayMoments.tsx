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

function heuristicMoment(now: Date, hasCurrentBlock: boolean): MomentValue {
  const hour = now.getHours();
  if (hour < 11) return "start";
  if (hour >= 17) return "close";
  return hasCurrentBlock ? "flow" : "start";
}

export interface TodayMomentsProps {
  initialMoment?: MomentValue;
  now?: Date;
}

export function TodayMoments({
  initialMoment,
  now: nowProp,
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
  } = useWorkflow();

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
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  useEffect(() => {
    writeStoredPreferences({ moment, timeDisplay });
  }, [moment, timeDisplay]);

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

  const closeTopOverlay = useCallback(() => {
    if (paletteOpen) {
      setPaletteOpen(false);
      return;
    }
    if (captureOpen) {
      setCaptureOpen(false);
    }
  }, [paletteOpen, captureOpen]);

  useMomentKeyboard({
    onSwitchMoment: setMoment,
    onCapture: () => setCaptureOpen(true),
    onPalette: () => setPaletteOpen(true),
    onPrimary: runPrimary,
    onEscape: closeTopOverlay,
    enabled: !captureOpen && !paletteOpen,
  });

  const paletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      { id: "switch-start", label: "Switch to Start", hint: "1" },
      { id: "switch-flow", label: "Switch to Flow", hint: "2" },
      { id: "switch-close", label: "Switch to Close", hint: "3" },
      { id: "open-capture", label: "Open capture", hint: "C" },
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">
            LifeOS · Today
          </span>
          <select
            aria-label="Area"
            value={selectedAreaId ?? ""}
            onChange={(event) => setSelectedAreaId(event.target.value || null)}
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
          <CountdownClockToggle value={timeDisplay} onChange={setTimeDisplay} />
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

      <CaptureAffordance onOpen={() => setCaptureOpen(true)} />

      <CaptureOverlay
        open={captureOpen}
        kinds={CAPTURE_KINDS}
        onSave={(text) => {
          submitCaptureText(text, selectedAreaId);
          showToast("Captured");
          setCaptureOpen(false);
        }}
        onClose={() => setCaptureOpen(false)}
      />

      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onRun={runPaletteAction}
        onClose={() => setPaletteOpen(false)}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
        data-testid="today-moments-toast"
      >
        {toast ? (
          <div className="rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
