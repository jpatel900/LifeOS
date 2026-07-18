// FR-048 slice 1 (#669) — Triggers deterministic matching kernel.
//
// A trigger is a user-declared "when X happens, do Y" intention. This kernel
// takes declared trigger rules + current facts + a caller-supplied `now` and
// returns candidate firings. It is the "propose" half of propose/dispose: the
// candidates it returns are surfaced only if `evaluateI1InitiativeGate`
// (apps/web/src/lib/initiative/initiativePolicy.ts) allows them at I1. The
// kernel deliberately emits pure domain firings with NO initiative-gate
// vocabulary so the rung decision stays entirely with the gate.
//
// Doctrine (docs/REQUIREMENTS.md FR-048):
//   - Deterministic matching only. NO AI anywhere in this path.
//   - Caller-supplied time: `now` is an explicit parameter; no ambient clock is
//     read inside the kernel, matching compostPolicy.ts (`now: Date`) and
//     rupturePolicy.ts (caller-computed signals).
//   - Fail closed: a malformed rule or malformed facts never fires; it is
//     skipped with a named reason. Sanctuary-marked rows never fire.
//
// Structural dodges — the three open owner questions in FR-048 are answered by
// making each a caller-supplied kernel input, so this slice invents no product
// default that a later persistence/UI slice would have to unwind:
//   - default expires_at: `expiresAt` is caller-supplied per rule; `null` means
//     "no declared expiry" and the kernel invents NO default horizon.
//   - date_window vs calendar-overlap semantics: the caller supplies the window
//     `{ start, end }` boundaries per rule; the kernel only checks membership.
//   - manual_review cadence: the caller supplies `manualReviewDueRefs` (which
//     refs are due this evaluation); the kernel invents no cadence.
//
// Two error channels, kept distinct (as compostPolicy.ts does):
//   - Caller programming errors (invalid `now`, invalid config) throw TypeError.
//   - Data errors (malformed rule / malformed facts) fail closed: no throw, the
//     affected rule is skipped with a named reason.
//
// Hostile input (#636/#638 lineage): rule and fact fields are read via
// `Object.getOwnPropertyDescriptor` value snapshots, never property access, so a
// getter or proxy trap on the input cannot execute or observe the evaluation.

const DAY_MS = 86_400_000;

/**
 * Frozen upper bound on rules evaluated per call. Rules beyond the cap are
 * skipped (`rule_cap_exceeded`) rather than evaluated — a bounded, deterministic
 * fail-closed ceiling on a single evaluation.
 */
export const MAX_TRIGGER_RULES_PER_CALL = 500;

/**
 * Forward-hook only: the stable policy id FR-048 reserves for the future
 * suggestion/override instrumentation. No instrumentation is written in this
 * slice; this constant exists so the persistence slice has one source of truth.
 */
export const TRIGGER_SURFACE_POLICY_ID = "trigger_surface.v1";

export type TriggerConditionType =
  | "person"
  | "area_event"
  | "date_window"
  | "manual_review";

export type TriggerStatus =
  | "armed"
  | "fired"
  | "done"
  | "expired"
  | "composted";

export interface TriggerDateWindow {
  /** ISO 8601 start of the caller-defined window (inclusive). */
  readonly start: string;
  /** ISO 8601 end of the caller-defined window (exclusive). */
  readonly end: string;
}

export interface TriggerRule {
  readonly id: string;
  readonly conditionType: TriggerConditionType;
  readonly conditionRef: string;
  readonly intentionText: string;
  readonly status: TriggerStatus;
  /** Caller-supplied. `null` = no declared expiry; the kernel invents no default. */
  readonly expiresAt: string | null;
  /** Caller-supplied window for `date_window` rules; ignored for other types. */
  readonly window?: TriggerDateWindow | null;
  /** True marks the row sanctuary-excluded; only an explicit `false` may fire. */
  readonly sanctuaryExcluded: boolean;
}

export interface TriggerFacts {
  /** condition_refs of people touched (capture/commitment) this evaluation. */
  readonly personTouchRefs: readonly string[];
  /** condition_refs of areas with a qualifying event (task done / block scheduled). */
  readonly areaEventRefs: readonly string[];
  /** condition_refs whose manual_review cadence the caller judges due now. */
  readonly manualReviewDueRefs: readonly string[];
}

export interface TriggerMatchOptions {
  readonly now: Date;
}

export type TriggerMatchedReason =
  | "person_touched"
  | "area_event"
  | "date_window_entered"
  | "manual_review_due";

export type TriggerSkipReason =
  | "not_armed"
  | "sanctuary_excluded"
  | "expired"
  | "unmatched"
  | "malformed_rule"
  | "malformed_facts"
  | "rule_cap_exceeded";

export interface TriggerFiringCandidate {
  readonly triggerId: string;
  readonly conditionType: TriggerConditionType;
  readonly intentionText: string;
  readonly matchedReason: TriggerMatchedReason;
}

export interface TriggerSkip {
  readonly triggerId: string;
  readonly reason: TriggerSkipReason;
}

export interface TriggerMatchResult {
  readonly firings: readonly TriggerFiringCandidate[];
  readonly skipped: readonly TriggerSkip[];
}

const CONDITION_TYPES: ReadonlySet<TriggerConditionType> = new Set([
  "person",
  "area_event",
  "date_window",
  "manual_review",
]);

const STATUSES: ReadonlySet<TriggerStatus> = new Set([
  "armed",
  "fired",
  "done",
  "expired",
  "composted",
]);

const INVALID = Symbol("invalid");

function readOwnValue(
  source: unknown,
  key: PropertyKey,
): unknown | typeof INVALID {
  if ((typeof source !== "object" && typeof source !== "function") || !source) {
    return INVALID;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor && "value" in descriptor ? descriptor.value : INVALID;
  } catch {
    return INVALID;
  }
}

function isPlainRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface RefSet {
  has(ref: string): boolean;
}

/**
 * Snapshot a caller-supplied string array into a membership set using descriptor
 * reads, so a hostile array-like (getters, proxies) cannot execute code or
 * mutate mid-scan. Returns null (fail closed) if the shape is not a plain,
 * finite, all-string array.
 */
function snapshotRefSet(value: unknown): RefSet | null {
  if (!Array.isArray(value)) return null;
  const lengthValue = readOwnValue(value, "length");
  if (
    typeof lengthValue !== "number" ||
    !Number.isInteger(lengthValue) ||
    lengthValue < 0
  ) {
    return null;
  }
  const refs = new Set<string>();
  for (let index = 0; index < lengthValue; index += 1) {
    const element = readOwnValue(value, String(index));
    if (typeof element !== "string") return null;
    refs.add(element);
  }
  return { has: (ref: string) => refs.has(ref) };
}

interface FactSets {
  readonly person: RefSet;
  readonly area: RefSet;
  readonly manualReview: RefSet;
}

function snapshotFacts(facts: unknown): FactSets | null {
  if (!isPlainRecord(facts)) return null;
  const person = snapshotRefSet(readOwnValue(facts, "personTouchRefs"));
  const area = snapshotRefSet(readOwnValue(facts, "areaEventRefs"));
  const manualReview = snapshotRefSet(
    readOwnValue(facts, "manualReviewDueRefs"),
  );
  if (!person || !area || !manualReview) return null;
  return { person, area, manualReview };
}

interface RuleSnapshot {
  readonly id: string;
  readonly conditionType: TriggerConditionType;
  readonly conditionRef: string;
  readonly intentionText: string;
  readonly status: TriggerStatus;
  readonly expiresAtMs: number | null;
  readonly windowStartMs: number | null;
  readonly windowEndMs: number | null;
  readonly sanctuaryExcluded: boolean;
}

/**
 * Snapshot a single rule via descriptor reads. Returns { id } | null if the id
 * cannot be trusted (the firing/skip record needs a stable id), else a fully
 * validated snapshot, else `{ id }` with no snapshot to signal malformed_rule.
 */
function snapshotRule(
  rule: unknown,
): { id: string; snapshot: RuleSnapshot | null } | null {
  if (!isPlainRecord(rule)) return null;

  const idValue = readOwnValue(rule, "id");
  if (!isNonEmptyString(idValue)) return null;
  const id = idValue;

  const conditionType = readOwnValue(rule, "conditionType");
  const conditionRef = readOwnValue(rule, "conditionRef");
  const intentionText = readOwnValue(rule, "intentionText");
  const status = readOwnValue(rule, "status");
  const expiresAt = readOwnValue(rule, "expiresAt");
  const sanctuaryExcluded = readOwnValue(rule, "sanctuaryExcluded");

  if (
    typeof conditionType !== "string" ||
    !CONDITION_TYPES.has(conditionType as TriggerConditionType) ||
    !isNonEmptyString(conditionRef) ||
    typeof intentionText !== "string" ||
    typeof status !== "string" ||
    !STATUSES.has(status as TriggerStatus) ||
    typeof sanctuaryExcluded !== "boolean"
  ) {
    return { id, snapshot: null };
  }

  // expiresAt: null (no declared expiry) is valid; a present value must parse.
  let expiresAtMs: number | null = null;
  if (expiresAt !== null) {
    if (typeof expiresAt !== "string") return { id, snapshot: null };
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed)) return { id, snapshot: null };
    expiresAtMs = parsed;
  }

  // window is required and must be well-formed for date_window; ignored otherwise.
  let windowStartMs: number | null = null;
  let windowEndMs: number | null = null;
  if (conditionType === "date_window") {
    const window = readOwnValue(rule, "window");
    if (!isPlainRecord(window)) return { id, snapshot: null };
    const start = readOwnValue(window, "start");
    const end = readOwnValue(window, "end");
    if (typeof start !== "string" || typeof end !== "string") {
      return { id, snapshot: null };
    }
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= endMs
    ) {
      return { id, snapshot: null };
    }
    windowStartMs = startMs;
    windowEndMs = endMs;
  }

  return {
    id,
    snapshot: {
      id,
      conditionType: conditionType as TriggerConditionType,
      conditionRef,
      intentionText,
      status: status as TriggerStatus,
      expiresAtMs,
      windowStartMs,
      windowEndMs,
      sanctuaryExcluded,
    },
  };
}

function matchedReasonFor(
  snapshot: RuleSnapshot,
  facts: FactSets,
  nowMs: number,
): TriggerMatchedReason | null {
  switch (snapshot.conditionType) {
    case "person":
      return facts.person.has(snapshot.conditionRef) ? "person_touched" : null;
    case "area_event":
      return facts.area.has(snapshot.conditionRef) ? "area_event" : null;
    case "manual_review":
      return facts.manualReview.has(snapshot.conditionRef)
        ? "manual_review_due"
        : null;
    case "date_window":
      // Half-open interval [start, end): now === start fires, now === end does not.
      return snapshot.windowStartMs !== null &&
        snapshot.windowEndMs !== null &&
        nowMs >= snapshot.windowStartMs &&
        nowMs < snapshot.windowEndMs
        ? "date_window_entered"
        : null;
    default:
      return null;
  }
}

/**
 * Evaluate declared trigger rules against current facts at a caller-supplied
 * `now`, returning candidate firings (to be disposed by `evaluateI1InitiativeGate`)
 * and a named-reason skip record for every rule that did not fire.
 *
 * @throws TypeError if `now` is not a valid Date (caller programming error).
 */
export function matchTriggers(
  rules: readonly TriggerRule[],
  facts: TriggerFacts,
  options: TriggerMatchOptions,
): TriggerMatchResult {
  const nowMs = options.now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new TypeError("now must be a valid date");
  }
  if (!Array.isArray(rules)) {
    throw new TypeError("rules must be an array");
  }

  const factSets = snapshotFacts(facts);

  const firings: TriggerFiringCandidate[] = [];
  const skipped: TriggerSkip[] = [];

  let evaluated = 0;
  for (const rule of rules) {
    const read = snapshotRule(rule);
    // A rule whose id cannot be trusted is dropped silently — there is no stable
    // id to attribute a skip record to, and fabricating one would be dishonest.
    if (read === null) continue;

    if (evaluated >= MAX_TRIGGER_RULES_PER_CALL) {
      skipped.push({ triggerId: read.id, reason: "rule_cap_exceeded" });
      continue;
    }
    evaluated += 1;

    const { id, snapshot } = read;
    if (snapshot === null) {
      skipped.push({ triggerId: id, reason: "malformed_rule" });
      continue;
    }

    // Fail-safe direction: only an explicit `false` may fire (matches
    // compostPolicy `!== false` / rupturePolicy sanctuary handling).
    // Mutation note: `!== false` vs `=== true` is an equivalent mutant here —
    // snapshotRule already rejects non-boolean flags as malformed_rule, so the
    // real fail-safe lives in that type guard; this direction is defense-in-depth
    // kept for doctrine consistency with the sibling kernels.
    if (snapshot.sanctuaryExcluded !== false) {
      skipped.push({ triggerId: id, reason: "sanctuary_excluded" });
      continue;
    }

    if (snapshot.status !== "armed") {
      skipped.push({ triggerId: id, reason: "not_armed" });
      continue;
    }

    // Expiry at equality (now === expiresAt) counts as expired: never fires.
    if (snapshot.expiresAtMs !== null && nowMs >= snapshot.expiresAtMs) {
      skipped.push({ triggerId: id, reason: "expired" });
      continue;
    }

    // Facts are only consulted for an otherwise-firable rule. Malformed facts
    // fail closed: the rule cannot match, so it is skipped, never fired.
    if (factSets === null) {
      skipped.push({ triggerId: id, reason: "malformed_facts" });
      continue;
    }

    const matchedReason = matchedReasonFor(snapshot, factSets, nowMs);
    if (matchedReason === null) {
      skipped.push({ triggerId: id, reason: "unmatched" });
      continue;
    }

    firings.push(
      Object.freeze({
        triggerId: id,
        conditionType: snapshot.conditionType,
        intentionText: snapshot.intentionText,
        matchedReason,
      }),
    );
  }

  return Object.freeze({
    firings: Object.freeze(firings),
    skipped: Object.freeze(skipped),
  });
}
