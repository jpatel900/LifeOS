import { isSanctuaryExcluded } from "../privacy/sanctuary";

/**
 * FR-047 slice 1 (issue #668) — Mirror purpose-gauge trend kernel.
 *
 * Deterministic, observation-only: FR-033 purpose-gauge samples in, trend
 * out. No ambient clock — ordering comes exclusively from each sample's
 * caller-supplied `sampledAtMs`. No persistence, no UI, no AI, no coaching
 * is claimed here.
 *
 * Doctrine (docs/REQUIREMENTS.md FR-047, merged #666):
 * - A skipped or absent check is never counted, shown, or treated as
 *   signal: malformed/hostile records are DROPPED (they contribute
 *   nothing), never interpolated, never carried forward.
 * - Sanctuary-marked samples are excluded via the one shared predicate
 *   (`isSanctuaryExcluded`, #627) — never a duplicated rule. A sample
 *   without a sanctuary context is excluded (fail closed).
 * - Below MIRROR_MIN_TREND_SAMPLE_COUNT valid samples the kernel reports
 *   `insufficient_data` — never a single point, an interpolated line, or a
 *   flat default.
 *
 * Hostile-container boundary (CONTRACT CORRECTION v1, platform limit
 * ratified on #638): accessor fields are rejected WITHOUT executing
 * getters and all inspection is wrapped so throwing/revoked/malformed
 * proxies fail closed — but a fully transparent Proxy over a plain record
 * is observationally indistinguishable from its target in portable browser
 * JS. Documented platform limitation, not a trust claim.
 */

/**
 * Minimum count of valid, non-sanctuary samples before a trend renders.
 * OWNER-GATE on #668: default 3 pending owner ratification. Below this the
 * Mirror shows the calm insufficient-data state, never a degenerate chart.
 */
export const MIRROR_MIN_TREND_SAMPLE_COUNT = 3;

/**
 * Neutral band on the recent-vs-earlier ordinal-mean delta: at or inside
 * it the trend reads `flat`. Ordinals span [-1, 1], so 0.25 requires a
 * real shift before a direction is claimed.
 */
export const MIRROR_TREND_FLAT_BAND = 0.25;

const RESPONSE_ORDINALS = Object.freeze({
  heavier: -1,
  even: 0,
  lighter: 1,
} as const);

export type MirrorPurposeResponse = keyof typeof RESPONSE_ORDINALS;

export interface MirrorPurposeSample {
  readonly response: MirrorPurposeResponse;
  /** Caller-supplied epoch milliseconds — the kernel never reads a clock. */
  readonly sampledAtMs: number;
  /** Sanctuary context for the shared FR-034 exclusion predicate. */
  readonly sanctuaryContext: unknown;
}

export type MirrorTrendStatus = "up" | "flat" | "down";

export type MirrorTrend =
  | { readonly status: "insufficient_data"; readonly sampleCount: number }
  | {
      readonly status: MirrorTrendStatus;
      readonly sampleCount: number;
      /** Ordinals (-1 heavier, 0 even, +1 lighter) in sampled-time order. */
      readonly points: readonly number[];
    };

const SAMPLE_FIELDS = ["response", "sampledAtMs", "sanctuaryContext"] as const;

const INVALID = Symbol("invalid");

type SampleSnapshot = Readonly<{ ordinal: number; sampledAtMs: number }>;

function snapshotSample(record: unknown): SampleSnapshot | typeof INVALID {
  if (typeof record !== "object" || record === null) {
    return INVALID;
  }

  try {
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      return INVALID;
    }

    const values: unknown[] = [];
    for (const field of SAMPLE_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(record, field);
      // Accessor properties are rejected here without ever invoking the
      // getter: "value" is only present on data properties.
      if (descriptor === undefined || !("value" in descriptor)) {
        return INVALID;
      }
      values.push(descriptor.value);
    }

    const [response, sampledAtMs, sanctuaryContext] = values;

    if (
      typeof response !== "string" ||
      !Object.prototype.hasOwnProperty.call(RESPONSE_ORDINALS, response)
    ) {
      return INVALID;
    }

    if (typeof sampledAtMs !== "number" || !Number.isFinite(sampledAtMs)) {
      return INVALID;
    }

    if (isSanctuaryExcluded(sanctuaryContext)) {
      return INVALID;
    }

    return {
      ordinal: RESPONSE_ORDINALS[response as MirrorPurposeResponse],
      sampledAtMs,
    };
  } catch {
    return INVALID;
  }
}

function collectValidSamples(input: unknown): SampleSnapshot[] {
  const valid: SampleSnapshot[] = [];

  try {
    if (!Array.isArray(input)) {
      return valid;
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (
      !lengthDescriptor ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return valid;
    }

    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const elementDescriptor = Object.getOwnPropertyDescriptor(
        input,
        String(index),
      );
      if (!elementDescriptor || !("value" in elementDescriptor)) {
        continue;
      }
      const snapshot = snapshotSample(elementDescriptor.value);
      if (snapshot !== INVALID) {
        valid.push(snapshot);
      }
    }
  } catch {
    return [];
  }

  return valid;
}

function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/**
 * Purpose-gauge samples in, trend out. Deterministic; never throws; fails
 * closed to `insufficient_data`. `sampleCount` always reflects only valid,
 * non-sanctuary samples — dropped records are never counted or shown.
 */
export function computeMirrorTrend(input: unknown): MirrorTrend {
  const valid = collectValidSamples(input);

  if (valid.length < MIRROR_MIN_TREND_SAMPLE_COUNT) {
    return { status: "insufficient_data", sampleCount: valid.length };
  }

  // Stable order by caller-supplied time; input position breaks ties.
  const ordered = valid
    .map((snapshot, position) => ({ snapshot, position }))
    .sort(
      (a, b) =>
        a.snapshot.sampledAtMs - b.snapshot.sampledAtMs ||
        a.position - b.position,
    )
    .map((entry) => entry.snapshot);

  const points = Object.freeze(ordered.map((entry) => entry.ordinal));
  const split = Math.floor(points.length / 2);
  const delta = mean(points.slice(split)) - mean(points.slice(0, split));

  const status: MirrorTrendStatus =
    delta > MIRROR_TREND_FLAT_BAND
      ? "up"
      : delta < -MIRROR_TREND_FLAT_BAND
        ? "down"
        : "flat";

  return { status, sampleCount: points.length, points };
}
