/**
 * FR-037 slice 2 — deterministic rupture-signal derivation.
 *
 * Pure functions that compute the two data-derived fields of
 * `RuptureSignals` (`daysSinceMeaningfulActivity`, `dismissalSpike`) from
 * caller-supplied domain rows. `assessRupture` (rupturePolicy.ts, merged in
 * #630/#635/#636/#645) consumes these fields but does not derive them; this
 * module is that derivation only. No clock reads, no I/O, no persistence —
 * the caller supplies the reference instant ("now") and every row. This
 * module does not decide which domain tables feed the derivation and does
 * not enumerate table names; that is the wiring slice's job.
 */

const DAY_MS = 86_400_000;

/**
 * FR-037 names "a dismissal spike across proactive surfaces" as a trigger
 * concept but specifies no window, count, or malformed-ratio — these three
 * constants are tunable defaults this slice introduces, not FR-037-mandated
 * numbers.
 */
export const DEFAULT_DISMISSAL_SPIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT = 3;
export const DEFAULT_DISMISSAL_SPIKE_MAX_MALFORMED_RATIO = 0.5;

export interface DismissalSpikeOptions {
  readonly windowMs: number;
  readonly thresholdCount: number;
  readonly maxMalformedRatio: number;
}

const INVALID_OPTION = Symbol("invalid-dismissal-spike-option");

/**
 * Reads an own property's *value* descriptor without ever invoking an
 * accessor (getter). If the key resolves to an accessor property (or the
 * input isn't a readable object at all, or reading throws), this returns
 * the invalid sentinel — the caller then falls back to the safe default.
 * Mirrors the descriptor-snapshot hostile-input pattern used by
 * `rupturePolicy.ts`'s `readOwnSignal` (#636/#638 precedent).
 */
function readOwnOption(options: unknown, key: string): unknown {
  if ((typeof options !== "object" && typeof options !== "function") || !options) {
    return INVALID_OPTION;
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    return descriptor && "value" in descriptor ? descriptor.value : INVALID_OPTION;
  } catch {
    return INVALID_OPTION;
  }
}

/**
 * Snapshots an unknown input into a plain array of its elements, read by
 * index rather than through a (possibly hijacked) iterator. Any
 * non-array input is treated as empty rather than thrown. The length is
 * read once before iteration begins, per the hostile-input handling this
 * slice's contract calls for.
 */
function safeArraySnapshot(input: unknown): readonly unknown[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const length = input.length;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    snapshot.push(input[index]);
  }
  return snapshot;
}

/**
 * Parses a value as an ISO-8601 instant. Returns `null` (never throws, never
 * `NaN`) for anything that isn't a string or doesn't parse to a finite
 * timestamp.
 */
function safeParseInstant(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return isFiniteNonNegativeNumber(value) && Number.isInteger(value);
}

function isValidRatio(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function resolveDismissalSpikeConfig(
  options: unknown,
): { windowMs: number; thresholdCount: number; maxMalformedRatio: number } {
  const windowMsRaw = readOwnOption(options, "windowMs");
  const thresholdCountRaw = readOwnOption(options, "thresholdCount");
  const maxMalformedRatioRaw = readOwnOption(options, "maxMalformedRatio");

  return {
    windowMs: isFiniteNonNegativeNumber(windowMsRaw)
      ? windowMsRaw
      : DEFAULT_DISMISSAL_SPIKE_WINDOW_MS,
    thresholdCount: isFiniteNonNegativeInteger(thresholdCountRaw)
      ? thresholdCountRaw
      : DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT,
    maxMalformedRatio: isValidRatio(maxMalformedRatioRaw)
      ? maxMalformedRatioRaw
      : DEFAULT_DISMISSAL_SPIKE_MAX_MALFORMED_RATIO,
  };
}

/**
 * Derives days-since-meaningful-activity as an elapsed-milliseconds floor
 * between `referenceDate` and the latest valid, non-future entry in
 * `activityTimestamps` — never calendar-date arithmetic, so it stays
 * timezone-explicit rather than reintroducing an ambient TZ via calendar-day
 * boundaries.
 *
 * "Meaningful activity" is defined only as whatever the caller passes in
 * `activityTimestamps`; this function does not know or care which table a
 * timestamp came from.
 *
 * Fail-closed convention (deliberate, not coincidental): when no valid
 * candidate remains — empty input, all-malformed, or all-future — this
 * returns `0`, not `Infinity` and not `NaN`. `assessRupture`'s absence
 * trigger requires `daysSinceMeaningfulActivity` to be a finite integer
 * `>= DEFAULT_RUPTURE_ABSENCE_DAYS (7)`. `0` can never satisfy `>= n` for a
 * positive `n`, so its safety holds regardless of `assessRupture`'s
 * implementation or any future threshold change. `Infinity` and `NaN` are
 * only *coincidentally* safe today (via `Number.isFinite`/`Number.isInteger`
 * guards elsewhere) and would become dangerous the moment a future consumer
 * compared `days >= n` without that guard. "Cannot assert a prolonged
 * absence from zero usable data points" defaults to "assume just active."
 */
export function deriveDaysSinceMeaningfulActivity(
  referenceDate: string,
  activityTimestamps: readonly string[],
): number {
  const referenceMs = safeParseInstant(referenceDate);
  if (referenceMs === null) {
    return 0;
  }

  const items = safeArraySnapshot(activityTimestamps);
  let latestValidMs: number | null = null;

  for (let index = 0; index < items.length; index += 1) {
    const candidateMs = safeParseInstant(items[index]);
    if (candidateMs === null) {
      continue;
    }
    if (candidateMs > referenceMs) {
      // Future noise / clock skew — excluded from the candidate set.
      continue;
    }
    if (latestValidMs === null || candidateMs > latestValidMs) {
      latestValidMs = candidateMs;
    }
  }

  if (latestValidMs === null) {
    return 0;
  }

  return Math.floor((referenceMs - latestValidMs) / DAY_MS);
}

/**
 * Derives whether a dismissal spike occurred: `true` only when the
 * malformed-entry ratio is within bounds **and** the count of valid,
 * in-window dismissals meets or exceeds the threshold. Fail-closed in both
 * directions — corrupted data (excess-malformed ratio) never claims a
 * spike, and a garbage `options` override never silently loosens the guard
 * (it falls back to the frozen default instead).
 */
export function deriveDismissalSpike(
  referenceDate: string,
  dismissalTimestamps: readonly string[],
  options?: Partial<DismissalSpikeOptions>,
): boolean {
  const referenceMs = safeParseInstant(referenceDate);
  if (referenceMs === null) {
    return false;
  }

  const { windowMs, thresholdCount, maxMalformedRatio } =
    resolveDismissalSpikeConfig(options);
  const windowStartMs = referenceMs - windowMs;

  const items = safeArraySnapshot(dismissalTimestamps);
  const totalCount = items.length;
  if (totalCount === 0) {
    return false;
  }

  let malformedCount = 0;
  let inWindowValidCount = 0;

  for (let index = 0; index < totalCount; index += 1) {
    const candidateMs = safeParseInstant(items[index]);
    if (candidateMs === null) {
      malformedCount += 1;
      continue;
    }
    if (candidateMs >= windowStartMs && candidateMs <= referenceMs) {
      inWindowValidCount += 1;
    }
  }

  const malformedRatio = malformedCount / totalCount;
  if (malformedRatio > maxMalformedRatio) {
    return false;
  }

  return inWindowValidCount >= thresholdCount;
}
