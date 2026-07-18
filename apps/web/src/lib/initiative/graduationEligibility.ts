// FR-032 slice 2 — graduation-eligibility kernel (issue #667).
//
// This module MUST NOT be merged into or replace the shipped I1-cap kernel
// (`./initiativePolicy.ts`, #638). It is a new, additive module: an I1-capped
// class becomes *eligible to be proposed* for I2 graduation, but the kernel
// itself is structurally incapable of granting I2 — `requiresOwnerRatification`
// is always `true` on the success branch, and explicit owner approval (a
// separate, human, out-of-band act) is never represented as an input this
// kernel can flip to bypass evaluation.
//
// No ambient clock: this kernel takes no time input and needs none — it
// evaluates a caller-supplied evidence snapshot, not a rolling window.

export type OpportunityOutcome =
  | "accepted"
  | "welcomed"
  | "dismissed"
  | "ignored";

export type GraduationEligibilityBlockReason =
  | "malformed_evidence"
  | "insufficient_opportunities"
  | "acceptance_rate_below_threshold"
  | "dismissal_rate_at_or_above_threshold";

export type GraduationEvidenceSummary = Readonly<{
  initiativeClass: string;
  totalOpportunities: number;
  acceptedOrWelcomedCount: number;
  dismissedCount: number;
  acceptanceOrWelcomeRate: number;
  dismissalRate: number;
}>;

export type GraduationEligibilityDecision =
  | Readonly<{
      eligible: true;
      requiresOwnerRatification: true;
      evidenceSummary: GraduationEvidenceSummary;
    }>
  | Readonly<{
      eligible: false;
      reason: GraduationEligibilityBlockReason;
    }>;

// Frozen thresholds anchored to docs/REQUIREMENTS.md FR-032, line 698:
// "I2 eligibility is per class: shadow-rehearse first, record at least 20
// eligible I1/shadow opportunities, demonstrate an acceptance or welcome
// rate of at least 80%, keep dismissals below 20%, and obtain explicit
// graduation approval." Explicit graduation approval is the fourth
// condition and is deliberately NOT evaluated here — it is the human act
// that follows a `{ eligible: true }` proposal, per issue #667.
const MIN_ELIGIBLE_OPPORTUNITIES = 20;
// Compared via integer cross-multiplication (x/n >= 4/5), never as a float,
// so the boundary sits on an exact integer and a mutated comparator/constant
// is guaranteed to flip a test at n=20.
const MIN_ACCEPTANCE_OR_WELCOME_NUMERATOR = 4;
const MIN_ACCEPTANCE_OR_WELCOME_DENOMINATOR = 5;
// dismissals / n >= 1/5 blocks (i.e. dismissals must stay strictly below 20%).
const MAX_DISMISSAL_NUMERATOR = 1;
const MAX_DISMISSAL_DENOMINATOR = 5;

const OUTCOMES: readonly OpportunityOutcome[] = [
  "accepted",
  "welcomed",
  "dismissed",
  "ignored",
];

const MALFORMED_EVIDENCE = Object.freeze({
  eligible: false as const,
  reason: "malformed_evidence" as const,
});
const INSUFFICIENT_OPPORTUNITIES = Object.freeze({
  eligible: false as const,
  reason: "insufficient_opportunities" as const,
});
const ACCEPTANCE_RATE_BELOW_THRESHOLD = Object.freeze({
  eligible: false as const,
  reason: "acceptance_rate_below_threshold" as const,
});
const DISMISSAL_RATE_AT_OR_ABOVE_THRESHOLD = Object.freeze({
  eligible: false as const,
  reason: "dismissal_rate_at_or_above_threshold" as const,
});

const TOP_LEVEL_FIELDS = ["initiativeClass", "opportunities"] as const;

type TopLevelSnapshot = Readonly<{
  initiativeClass: unknown;
  opportunities: unknown;
}>;

/**
 * Reads only the exact own-value descriptors this kernel needs, refusing
 * anything else about the container's shape. Mirrors the #638
 * (`initiativePolicy.ts`) hostile-input pattern: reject non-plain
 * prototypes, never invoke a getter, and fail closed on any thrown trap.
 */
function snapshotTopLevel(input: unknown): TopLevelSnapshot | undefined {
  if (typeof input !== "object" || input === null) return undefined;

  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const values: unknown[] = [];
    for (const field of TOP_LEVEL_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (descriptor === undefined || !("value" in descriptor)) {
        return undefined;
      }
      values.push(descriptor.value);
    }

    return {
      initiativeClass: values[0],
      opportunities: values[1],
    };
  } catch {
    return undefined;
  }
}

function isOpportunityOutcome(value: unknown): value is OpportunityOutcome {
  return (
    typeof value === "string" && OUTCOMES.includes(value as OpportunityOutcome)
  );
}

/**
 * Reads only the `outcome` own-value descriptor from one evidence record.
 * Same hostile-input discipline as `snapshotTopLevel`: no getter execution,
 * no inherited-prototype records, fail closed on thrown traps.
 */
function readOutcome(record: unknown): OpportunityOutcome | undefined {
  if (typeof record !== "object" || record === null) return undefined;

  try {
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const descriptor = Object.getOwnPropertyDescriptor(record, "outcome");
    if (descriptor === undefined || !("value" in descriptor)) return undefined;

    const outcome = descriptor.value;
    return isOpportunityOutcome(outcome) ? outcome : undefined;
  } catch {
    return undefined;
  }
}

export function evaluateGraduationEligibility(
  input: unknown,
): GraduationEligibilityDecision {
  const snapshot = snapshotTopLevel(input);
  if (snapshot === undefined) return MALFORMED_EVIDENCE;

  if (
    typeof snapshot.initiativeClass !== "string" ||
    snapshot.initiativeClass.trim().length === 0
  ) {
    return MALFORMED_EVIDENCE;
  }

  if (!Array.isArray(snapshot.opportunities)) return MALFORMED_EVIDENCE;

  const outcomes: OpportunityOutcome[] = [];
  for (const record of snapshot.opportunities) {
    const outcome = readOutcome(record);
    if (outcome === undefined) return MALFORMED_EVIDENCE;
    outcomes.push(outcome);
  }

  const total = outcomes.length;
  if (total < MIN_ELIGIBLE_OPPORTUNITIES) return INSUFFICIENT_OPPORTUNITIES;

  let acceptedOrWelcomedCount = 0;
  let dismissedCount = 0;
  for (const outcome of outcomes) {
    if (outcome === "accepted" || outcome === "welcomed")
      acceptedOrWelcomedCount += 1;
    else if (outcome === "dismissed") dismissedCount += 1;
  }

  // acceptedOrWelcomedCount / total >= 4/5, evaluated as integers.
  if (
    acceptedOrWelcomedCount * MIN_ACCEPTANCE_OR_WELCOME_DENOMINATOR <
    total * MIN_ACCEPTANCE_OR_WELCOME_NUMERATOR
  ) {
    return ACCEPTANCE_RATE_BELOW_THRESHOLD;
  }

  // dismissedCount / total >= 1/5, evaluated as integers.
  if (
    dismissedCount * MAX_DISMISSAL_DENOMINATOR >=
    total * MAX_DISMISSAL_NUMERATOR
  ) {
    return DISMISSAL_RATE_AT_OR_ABOVE_THRESHOLD;
  }

  return Object.freeze({
    eligible: true as const,
    requiresOwnerRatification: true as const,
    evidenceSummary: Object.freeze({
      initiativeClass: snapshot.initiativeClass,
      totalOpportunities: total,
      acceptedOrWelcomedCount,
      dismissedCount,
      acceptanceOrWelcomeRate: acceptedOrWelcomedCount / total,
      dismissalRate: dismissedCount / total,
    }),
  });
}
