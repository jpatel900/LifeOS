"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkflow } from "@/lib/WorkflowContext";

/**
 * Moments pass P0 — packet: extract the Execute-stage focus session out of
 * `LifeOSCockpit.tsx` into a presentation-agnostic hook.
 *
 * Moments pass SP-2 — packet: make the running clock drift-free and
 * visibility-aware (UX-INV-4: a countdown is a promise about time; it must
 * not lie after a tab switch or a throttled/sleeping tab). `remaining` is
 * now DERIVED each tick from a fixed anchor (`endsAt`, an epoch-ms timestamp
 * computed whenever ticking (re)starts) rather than accumulated by
 * decrementing a counter, so ticks can never drift and a stale tab always
 * recomputes the true value the instant it becomes visible again.
 *
 * Pause/finish/extend semantics are preserved EXACTLY as authored in the P0
 * extraction (same `markSession` calls, same `actualMinutes` formula, same
 * state resets) — this packet took the documented safe-fallback path rather
 * than modeling pause spans as accumulated-paused-time, because the cockpit
 * and the frozen P0 unit tests already lock in the "pausing freezes
 * `remaining` at its current value; resuming continues from there" contract.
 * Only the RUNNING tick's mechanics changed; the observable state machine
 * (what each action returns/records) did not.
 *
 * `now` is an injected clock (default `Date.now`) purely for deterministic
 * testing; the cockpit's call site `useFocusSession()` takes no arguments,
 * so production behavior is unchanged.
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

export interface UseFocusSessionOptions {
  /** Clock injection for tests. Default `Date.now`. */
  now?: () => number;
}

export function useFocusSession(
  options: UseFocusSessionOptions = {},
): UseFocusSessionResult {
  const { now = Date.now } = options;
  const { startTaskSession, markSession } = useWorkflow();

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);

  // Anchor: the epoch-ms timestamp at which the running countdown reaches
  // zero, given the `remaining` value in effect when ticking last (re)armed
  // (start, resume, or extend-while-running). `remaining` is always
  // recomputed FROM this anchor, never accumulated.
  const endsAtRef = useRef<number | null>(null);

  function armAnchor(remainingSeconds: number) {
    endsAtRef.current = now() + remainingSeconds * 1000;
  }

  function recompute() {
    if (endsAtRef.current === null) return;
    const nextRemaining = Math.max(
      0,
      Math.floor((endsAtRef.current - now()) / 1000),
    );
    setRemaining(nextRemaining);
  }

  useEffect(() => {
    if (!running || remaining <= 0) return;

    let timeoutId: number | undefined;
    let cancelled = false;

    function scheduleNext() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        // Tab hidden: stop scheduling ticks entirely (battery + honesty).
        // The visibilitychange handler below recomputes immediately and
        // re-arms scheduling the instant the tab becomes visible again.
        return;
      }
      const delay = 1000 - (now() % 1000);
      timeoutId = window.setTimeout(() => {
        recompute();
        scheduleNext();
      }, delay);
    }

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remaining <= 0]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (!document.hidden && running) {
        recompute();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    if (running && remaining === 0 && activeTaskId) {
      setRunning(false);
    }
  }, [activeTaskId, remaining, running]);

  function start(taskId: string, minutes: number) {
    setActiveTaskId(taskId);
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
    armAnchor(minutes * 60);
    setRunning(true);
    startTaskSession(taskId);
  }

  function finish(status: "completed" | "stuck" | "missed") {
    const actualMinutes = Math.max(0, Math.ceil((total - remaining) / 60));
    markSession(status, actualMinutes);
    setRunning(false);
    setRemaining(0);
    endsAtRef.current = null;
    setActiveTaskId(null);
  }

  function toggle() {
    if (running) {
      const actualMinutes = Math.max(0, Math.ceil((total - remaining) / 60));
      markSession("paused", actualMinutes);
      setRunning(false);
      endsAtRef.current = null;
      return;
    }

    armAnchor(remaining);
    setRunning(true);
  }

  function extend(minutes: number) {
    setRemaining((value) => {
      const next = value + minutes * 60;
      if (running) armAnchor(next);
      return next;
    });
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
