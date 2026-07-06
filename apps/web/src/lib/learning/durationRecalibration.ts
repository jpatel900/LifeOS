/**
 * S9 (#261) — duration recalibration (task 1).
 *
 * Area-scoped, deterministic, sourced. Compares planned vs actual minutes across
 * this area's completed execution sessions and, when actuals consistently run
 * off the estimate, surfaces a recalibration multiplier WITH its evidence. The
 * adjusted estimate is only ever applied as the default after the user accepts
 * (NS-INV-3 instrumented at the call site) — this module computes, it never
 * mutates. `duration_profiles` is a future target table; until it exists the
 * signal comes straight from `execution_sessions` actuals.
 */

export interface DurationSessionSample {
  plannedMinutes: number | null;
  actualMinutes: number | null;
}

export interface DurationRecalibrationConfig {
  /** Minimum usable sessions before a recalibration is offered. */
  minSamples: number;
  /** How far the actual/planned ratio must sit from 1.0 to be worth surfacing. */
  minDeviation: number;
}

export const DEFAULT_DURATION_RECALIBRATION_CONFIG: DurationRecalibrationConfig =
  {
    minSamples: 3,
    minDeviation: 0.15,
  };

export interface DurationRecalibration {
  /** actual/planned ratio, rounded to one decimal (what the card shows). */
  multiplier: number;
  sampleCount: number;
  /** Plain, sourced evidence line — never an invented number. */
  evidence: string;
}

function usableSamples(
  sessions: DurationSessionSample[],
): { planned: number; actual: number }[] {
  const out: { planned: number; actual: number }[] = [];
  for (const session of sessions) {
    const planned = session.plannedMinutes;
    const actual = session.actualMinutes;
    if (typeof planned !== "number" || planned <= 0) continue;
    if (typeof actual !== "number" || actual <= 0) continue;
    out.push({ planned, actual });
  }
  return out;
}

export function computeDurationRecalibration(
  sessions: DurationSessionSample[],
  config: DurationRecalibrationConfig = DEFAULT_DURATION_RECALIBRATION_CONFIG,
): DurationRecalibration | null {
  const samples = usableSamples(sessions);
  if (samples.length < config.minSamples) return null;

  const totalPlanned = samples.reduce((sum, s) => sum + s.planned, 0);
  const totalActual = samples.reduce((sum, s) => sum + s.actual, 0);
  const ratio = totalActual / totalPlanned;

  if (Math.abs(ratio - 1) < config.minDeviation) return null;

  const multiplier = Math.round(ratio * 10) / 10;
  // A ratio like 1.05 rounds to 1.0 — nothing meaningful to show.
  if (multiplier === 1) return null;

  return {
    multiplier,
    sampleCount: samples.length,
    evidence: `your actuals on this area run ${multiplier}x`,
  };
}

/** Apply a recalibration multiplier to an estimate, rounded to whole minutes. */
export function applyRecalibration(
  estimateMinutes: number,
  multiplier: number,
): number {
  return Math.round(estimateMinutes * multiplier);
}
