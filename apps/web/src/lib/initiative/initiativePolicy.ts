export type InitiativeOpportunity =
  | "asked"
  | "start"
  | "flow"
  | "close"
  | "brief"
  | "mid_day"
  | "outside_app";

export type CappedInitiativeRung = "I0" | "I1";

export type InitiativeGateBlockReason =
  | "invalid_input"
  | "initiative_class_required"
  | "user_initiation_required"
  | "graduation_required";

export type InitiativeGateDecision =
  | Readonly<{
      kind: "allow";
      initiativeClass: string;
      effectiveRung: CappedInitiativeRung;
    }>
  | Readonly<{
      kind: "block";
      reason: InitiativeGateBlockReason;
    }>;

const REQUIRED_FIELDS = [
  "initiativeClass",
  "opportunity",
  "userInitiated",
] as const;

const OPPORTUNITIES: readonly InitiativeOpportunity[] = [
  "asked",
  "start",
  "flow",
  "close",
  "brief",
  "mid_day",
  "outside_app",
];

const INVALID_INPUT = Object.freeze({
  kind: "block" as const,
  reason: "invalid_input" as const,
});
const INITIATIVE_CLASS_REQUIRED = Object.freeze({
  kind: "block" as const,
  reason: "initiative_class_required" as const,
});
const USER_INITIATION_REQUIRED = Object.freeze({
  kind: "block" as const,
  reason: "user_initiation_required" as const,
});
const GRADUATION_REQUIRED = Object.freeze({
  kind: "block" as const,
  reason: "graduation_required" as const,
});

type InputSnapshot = Readonly<{
  initiativeClass: unknown;
  opportunity: unknown;
  userInitiated: unknown;
}>;

function snapshotInput(input: unknown): InputSnapshot | undefined {
  if (typeof input !== "object" || input === null) return undefined;

  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const values: unknown[] = [];
    for (const field of REQUIRED_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (descriptor === undefined || !("value" in descriptor)) {
        return undefined;
      }
      values.push(descriptor.value);
    }

    return {
      initiativeClass: values[0],
      opportunity: values[1],
      userInitiated: values[2],
    };
  } catch {
    return undefined;
  }
}

function isInitiativeOpportunity(
  opportunity: unknown,
): opportunity is InitiativeOpportunity {
  return (
    typeof opportunity === "string" &&
    OPPORTUNITIES.includes(opportunity as InitiativeOpportunity)
  );
}

export function evaluateI1InitiativeGate(
  input: unknown,
): InitiativeGateDecision {
  const snapshot = snapshotInput(input);
  if (
    snapshot === undefined ||
    typeof snapshot.initiativeClass !== "string" ||
    !isInitiativeOpportunity(snapshot.opportunity) ||
    typeof snapshot.userInitiated !== "boolean"
  ) {
    return INVALID_INPUT;
  }

  if (snapshot.initiativeClass.trim().length === 0) {
    return INITIATIVE_CLASS_REQUIRED;
  }

  if (
    snapshot.opportunity === "mid_day" ||
    snapshot.opportunity === "outside_app"
  ) {
    return GRADUATION_REQUIRED;
  }

  if (!snapshot.userInitiated) return USER_INITIATION_REQUIRED;

  return Object.freeze({
    kind: "allow",
    initiativeClass: snapshot.initiativeClass,
    effectiveRung: snapshot.opportunity === "asked" ? "I0" : "I1",
  });
}
