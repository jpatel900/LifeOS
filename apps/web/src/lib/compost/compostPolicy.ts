export const DEFAULT_COMPOST_THRESHOLD_DAYS = 14;

const DAY_MS = 86_400_000;
const ELIGIBLE_STATUSES = new Set(["new", "parsed", "triage_required"]);

export interface CompostCandidate {
  readonly id: string;
  readonly created_at: string;
  readonly status: string;
  readonly excludedFromAutomation: boolean;
}

export interface CompostTransitionIntent {
  readonly captureId: string;
  readonly status: "composted";
}

export interface CompostPolicyOptions {
  readonly now: Date;
  readonly thresholdDays?: number;
}

interface EligibleCandidate {
  readonly id: string;
  readonly createdAtMs: number;
}

function compareCandidates(
  left: EligibleCandidate,
  right: EligibleCandidate,
): number {
  if (left.createdAtMs !== right.createdAtMs) {
    return left.createdAtMs - right.createdAtMs;
  }
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function selectCompostTransitionIntents(
  candidates: readonly CompostCandidate[],
  options: CompostPolicyOptions,
): CompostTransitionIntent[] {
  const nowMs = options.now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new TypeError("now must be a valid date");
  }

  const thresholdDays = options.thresholdDays ?? DEFAULT_COMPOST_THRESHOLD_DAYS;
  if (!Number.isFinite(thresholdDays) || thresholdDays < 0) {
    throw new RangeError("thresholdDays must be finite and non-negative");
  }
  const thresholdMs = thresholdDays * DAY_MS;

  const eligible: EligibleCandidate[] = [];
  for (const candidate of candidates) {
    if (
      candidate.excludedFromAutomation !== false ||
      typeof candidate.id !== "string" ||
      candidate.id.trim().length === 0 ||
      !ELIGIBLE_STATUSES.has(candidate.status)
    ) {
      continue;
    }

    const createdAtMs = Date.parse(candidate.created_at);
    if (
      !Number.isFinite(createdAtMs) ||
      createdAtMs > nowMs ||
      nowMs - createdAtMs <= thresholdMs
    ) {
      continue;
    }

    eligible.push({ id: candidate.id, createdAtMs });
  }

  return eligible.sort(compareCandidates).map(({ id }) => ({
    captureId: id,
    status: "composted",
  }));
}
