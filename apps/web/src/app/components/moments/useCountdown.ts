import { useEffect, useMemo, useState } from "react";

/**
 * Moments pass P1 — packet: structural moments (Start/Flow/Close cockpit).
 *
 * Encodes UX-INV-4 (countdown affordances always show remaining time plus a
 * warn state once the remaining time crosses a fixed threshold, so the user
 * never has to do the subtraction themselves). Pure formatting helpers are
 * exported standalone so the warn-threshold and label rules are unit
 * testable without mounting a component; `useCountdown` is the thin
 * interval-driven wrapper consumed by moment components in packet P2.
 */

/** Minutes remaining at/under which a countdown enters its "warn" state (UX-INV-4). */
export const COUNTDOWN_WARN_THRESHOLD_MINUTES = 10;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Formats a remaining duration as a compact "left" label. Never negative —
 * any non-positive input collapses to the floor label "0m left".
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0m left";

  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((ms % MINUTE_MS) / SECOND_MS);

  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${seconds}s left`;
}

/**
 * Formats a duration until a future point as an "in ..." label. Same
 * hour/minute/second precedence as `formatRemaining`; never negative.
 */
export function formatUntil(ms: number): string {
  if (ms <= 0) return "in 0m";

  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((ms % MINUTE_MS) / SECOND_MS);

  if (hours > 0) return `in ${hours}h ${minutes}m`;
  if (minutes > 0) return `in ${minutes}m`;
  return `in ${seconds}s`;
}

export interface UseCountdownOptions {
  /** Tick interval in ms. Default 1000. */
  intervalMs?: number;
  /** Clock injection for tests. Default Date.now. */
  now?: () => number;
}

export interface CountdownResult {
  remainingMs: number;
  label: string;
  warn: boolean;
}

/**
 * Ticks down to `endAt`. Null `endAt` is the "no active countdown" case:
 * zeroed result, no interval registered (invariant — no timers for nothing).
 */
export function useCountdown(
  endAt: string | null,
  options: UseCountdownOptions = {},
): CountdownResult {
  const { intervalMs = 1000, now = Date.now } = options;
  const endAtMs = useMemo(
    () => (endAt ? new Date(endAt).getTime() : null),
    [endAt],
  );

  const [remainingMs, setRemainingMs] = useState<number>(() =>
    endAtMs === null ? 0 : Math.max(0, endAtMs - now()),
  );

  useEffect(() => {
    if (endAtMs === null) {
      setRemainingMs(0);
      return;
    }

    setRemainingMs(Math.max(0, endAtMs - now()));
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, endAtMs - now()));
    }, intervalMs);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAtMs, intervalMs]);

  if (endAtMs === null) {
    return { remainingMs: 0, label: "", warn: false };
  }

  return {
    remainingMs,
    label: formatRemaining(remainingMs),
    warn: remainingMs <= COUNTDOWN_WARN_THRESHOLD_MINUTES * MINUTE_MS,
  };
}
