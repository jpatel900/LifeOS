/**
 * S9 (#261) — learning-loop surface composer.
 *
 * Thin, pure glue between the deterministic learning primitives
 * (`durationRecalibration`, `overrideScan`) and the surfaces that render them
 * (the plan-stage proposal card and the review policy-proposal card). Keeps the
 * components dumb: they render what these functions return and never recompute.
 *
 * Nothing here mutates. Both surfaces are display + recorded-decision: accepting
 * a recalibration or a policy proposal writes a suggestion_record (NS-INV-3) and
 * never re-times a block or changes a stored default. Actually applying an
 * adjusted estimate to planning lands with the future duration_profiles store.
 */

import type { DurationProfile, OverrideRecord } from "@lifeos/schemas";
import type { Phase2MockExecutionSession } from "../types";
import {
  computeDurationRecalibration,
  applyRecalibration,
  DEFAULT_DURATION_RECALIBRATION_CONFIG,
  type DurationRecalibration,
  type DurationRecalibrationConfig,
  type DurationSessionSample,
} from "./durationRecalibration";
import {
  scanOverridePatterns,
  DEFAULT_OVERRIDE_PATTERN_CONFIG,
  type OverridePatternConfig,
  type PolicyChangeCandidate,
} from "./overrideScan";

/** A proposal's estimate paired with the sourced recalibration for its area. */
export interface ProposalRecalibrationVM {
  recalibration: DurationRecalibration;
  /** The original estimate the proposal carried. */
  estimateMinutes: number;
  /** The estimate after applying the multiplier — what "accept" would set. */
  adjustedMinutes: number;
  /** Display line, e.g. "estimated 60m; your actuals on this area run 1.4x -> 84m". */
  label: string;
}

/** Map an area's completed sessions to planned/actual samples for recalibration. */
function areaSessionSamples(
  sessions: Phase2MockExecutionSession[],
  areaId: string | null,
): DurationSessionSample[] {
  return sessions
    .filter((session) => session.area_id === areaId)
    .map((session) => ({
      plannedMinutes: session.planned_minutes,
      actualMinutes: session.actual_minutes,
    }));
}

/**
 * The sourced duration recalibration for a proposal, or null when the area's
 * actuals don't yet justify one (too few samples / deviation too small). Uses
 * real `execution_sessions` actuals — never an invented number.
 */
export function buildProposalRecalibration(
  sessions: Phase2MockExecutionSession[],
  areaId: string | null,
  estimateMinutes: number,
  config: DurationRecalibrationConfig = DEFAULT_DURATION_RECALIBRATION_CONFIG,
): ProposalRecalibrationVM | null {
  const recalibration = computeDurationRecalibration(
    areaSessionSamples(sessions, areaId),
    config,
  );
  if (!recalibration) return null;
  if (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0) return null;

  const adjustedMinutes = applyRecalibration(
    estimateMinutes,
    recalibration.multiplier,
  );
  return {
    recalibration,
    estimateMinutes,
    adjustedMinutes,
    label: `estimated ${estimateMinutes}m; ${recalibration.evidence} → ${adjustedMinutes}m`,
  };
}

/**
 * Policy-change proposals surfaced for user decision (propose->approve). One per
 * (policy, area) whose recent override rate meets the threshold; empty when the
 * user hasn't overridden anything enough to warrant a proposal.
 */
export function buildPolicyProposals(
  overrideRecords: OverrideRecord[],
  config: OverridePatternConfig = DEFAULT_OVERRIDE_PATTERN_CONFIG,
): PolicyChangeCandidate[] {
  return scanOverridePatterns(overrideRecords, config);
}

/**
 * E1 (issue #456 follow-up) — the `task_type` a duration profile is stored under.
 *
 * The recalibration signal is inherently AREA-scoped: `execution_sessions` carry
 * no task_type, so `computeDurationRecalibration` compares planned vs actual
 * across the whole area. The evidence line the user accepts says "this AREA runs
 * 1.4x" — so we apply under the SAME key we describe. A single fixed sentinel
 * keeps `duration_profiles.task_type` populated (NOT NULL, §5.3 shape preserved)
 * while behaving area-wide, and reserves room for a future task_type-aware
 * computation without a schema change. Invariant: evidence-key == apply-key.
 */
export const AREA_DURATION_TASK_TYPE = "__area__" as const;

/** The accepted multiplier + sample count stored for an area, or null. */
export function durationProfileForArea(
  profiles: DurationProfile[],
  persistedAreaId: string | null,
): DurationProfile | null {
  if (!persistedAreaId) return null;
  return (
    profiles.find(
      (profile) =>
        profile.area_id === persistedAreaId &&
        profile.task_type === AREA_DURATION_TASK_TYPE,
    ) ?? null
  );
}

/**
 * The adjusted default duration for a task in `persistedAreaId`, applying the
 * area's accepted recalibration multiplier to `estimateMinutes`. Null when no
 * profile has been accepted for the area yet (planning uses the raw estimate) or
 * the estimate is unusable. This is what "apply-on-accept" reads: once the user
 * accepts a recalibration, future blocks in that area default to this value.
 */
export function applyStoredDuration(
  profiles: DurationProfile[],
  persistedAreaId: string | null,
  estimateMinutes: number,
): number | null {
  const profile = durationProfileForArea(profiles, persistedAreaId);
  if (!profile) return null;
  if (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0) return null;
  return applyRecalibration(
    estimateMinutes,
    profile.estimate_stats_json.multiplier,
  );
}
