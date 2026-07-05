"use client";

import { useEffect, useState } from "react";
import { useWorkflow } from "@/lib/WorkflowContext";

/**
 * Moments pass P0 — packet: extract the Execute-stage focus session out of
 * `LifeOSCockpit.tsx` into a presentation-agnostic hook.
 *
 * This is a pure behavior-preserving extraction: the tick effect, the
 * auto-stop-at-zero effect, and the start/toggle/finish handlers are
 * transcribed verbatim from the cockpit (same state shape, same dependency
 * arrays, same `remaining <= 0` / `remaining === 0` conditions). Do not
 * "improve" the clock here (no drift correction, no injected `now()`) — that
 * is a later packet (SP-2). `startTaskSession`/`markSession` are called from
 * inside the hook via `useWorkflow()`, matching how the interim session in
 * `TodayMoments.tsx` already reaches the workflow, so that a later packet can
 * swap that local session for this hook as a drop-in replacement.
 *
 * The hook carries no cockpit-specific rendering, navigation, or toast
 * concerns — `finish`/`toggle` here return only the session-state
 * transition plus the workflow side effect. Cockpit-only effects (showing a
 * toast, navigating to a stage) stay in the caller, wrapped around these
 * actions.
 */

export interface UseFocusSessionResult {
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
  /** Starts a new session for `taskId`, `minutes` long, and calls startTaskSession. */
  start(taskId: string, minutes: number): void;
  /**
   * Toggles running state. Pausing (running -> false) logs a "paused"
   * session via markSession with the elapsed minutes so far, matching the
   * cockpit's original toggleFocus. Resuming (false -> running) does not
   * call markSession.
   */
  toggle(): void;
  /** Ends the session with `status`, calls markSession with elapsed minutes, and resets state. */
  finish(status: "completed" | "stuck" | "missed"): void;
  /** Adds `minutes` to both remaining and total without touching workflow state. */
  extend(minutes: number): void;
}

export function useFocusSession(): UseFocusSessionResult {
  const { startTaskSession, markSession } = useWorkflow();

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const interval = window.setInterval(() => {
      setRemaining((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [remaining, running]);

  useEffect(() => {
    if (running && remaining === 0 && activeTaskId) {
      setRunning(false);
    }
  }, [activeTaskId, remaining, running]);

  function start(taskId: string, minutes: number) {
    setActiveTaskId(taskId);
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
    setRunning(true);
    startTaskSession(taskId);
  }

  function finish(status: "completed" | "stuck" | "missed") {
    const actualMinutes = Math.max(0, Math.ceil((total - remaining) / 60));
    markSession(status, actualMinutes);
    setRunning(false);
    setRemaining(0);
    setActiveTaskId(null);
  }

  function toggle() {
    if (running) {
      const actualMinutes = Math.max(0, Math.ceil((total - remaining) / 60));
      markSession("paused", actualMinutes);
      setRunning(false);
      return;
    }

    setRunning(true);
  }

  function extend(minutes: number) {
    setRemaining((value) => value + minutes * 60);
    setTotal((value) => value + minutes * 60);
  }

  return {
    activeTaskId,
    running,
    remaining,
    total,
    start,
    toggle,
    finish,
    extend,
  };
}
