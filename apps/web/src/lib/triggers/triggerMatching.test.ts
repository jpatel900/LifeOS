import { describe, expect, it } from "vitest";

import {
  evaluateI1InitiativeGate,
  type InitiativeOpportunity,
} from "../initiative/initiativePolicy";
import {
  MAX_TRIGGER_RULES_PER_CALL,
  TRIGGER_SURFACE_POLICY_ID,
  matchTriggers,
  type TriggerFacts,
  type TriggerFiringCandidate,
  type TriggerRule,
} from "./triggerMatching";

const NOW = new Date("2026-07-17T12:00:00.000Z");

function emptyFacts(): TriggerFacts {
  return {
    personTouchRefs: [],
    areaEventRefs: [],
    manualReviewDueRefs: [],
  };
}

function armedRule(overrides: Partial<TriggerRule> = {}): TriggerRule {
  return {
    id: "trg-1",
    conditionType: "person",
    conditionRef: "person:darpan",
    intentionText: "raise the account plan",
    status: "armed",
    expiresAt: null,
    sanctuaryExcluded: false,
    ...overrides,
  };
}

describe("matchTriggers — matching per condition type", () => {
  it("fires a person rule when its ref is in personTouchRefs", () => {
    const result = matchTriggers(
      [armedRule()],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );

    expect(result.firings).toEqual([
      {
        triggerId: "trg-1",
        conditionType: "person",
        intentionText: "raise the account plan",
        matchedReason: "person_touched",
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("does not fire a person rule whose ref is absent (unmatched)", () => {
    const result = matchTriggers(
      [armedRule()],
      { ...emptyFacts(), personTouchRefs: ["person:someone_else"] },
      { now: NOW },
    );

    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([{ triggerId: "trg-1", reason: "unmatched" }]);
  });

  it("fires an area_event rule on a qualifying area event", () => {
    const rule = armedRule({
      id: "trg-area",
      conditionType: "area_event",
      conditionRef: "area:finance",
    });
    const result = matchTriggers(
      [rule],
      { ...emptyFacts(), areaEventRefs: ["area:finance"] },
      { now: NOW },
    );

    expect(result.firings).toEqual([
      {
        triggerId: "trg-area",
        conditionType: "area_event",
        intentionText: "raise the account plan",
        matchedReason: "area_event",
      },
    ]);
  });

  it("fires a manual_review rule when the caller marks its ref due", () => {
    const rule = armedRule({
      id: "trg-mr",
      conditionType: "manual_review",
      conditionRef: "review:quarterly",
    });
    const result = matchTriggers(
      [rule],
      { ...emptyFacts(), manualReviewDueRefs: ["review:quarterly"] },
      { now: NOW },
    );

    expect(result.firings.map((f) => f.matchedReason)).toEqual([
      "manual_review_due",
    ]);
  });

  it("does not cross-match a person ref against area/manual fact sets", () => {
    const result = matchTriggers(
      [armedRule({ conditionRef: "shared:ref" })],
      {
        personTouchRefs: [],
        areaEventRefs: ["shared:ref"],
        manualReviewDueRefs: ["shared:ref"],
      },
      { now: NOW },
    );

    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([{ triggerId: "trg-1", reason: "unmatched" }]);
  });
});

describe("matchTriggers — date_window half-open interval [start, end)", () => {
  const windowRule = (): TriggerRule =>
    armedRule({
      id: "trg-win",
      conditionType: "date_window",
      conditionRef: "window:next-month",
      window: {
        start: "2026-07-17T12:00:00.000Z",
        end: "2026-07-20T12:00:00.000Z",
      },
    });

  it("fires when now === start (inclusive lower bound)", () => {
    const result = matchTriggers([windowRule()], emptyFacts(), {
      now: new Date("2026-07-17T12:00:00.000Z"),
    });
    expect(result.firings.map((f) => f.matchedReason)).toEqual([
      "date_window_entered",
    ]);
  });

  it("fires strictly inside the window", () => {
    const result = matchTriggers([windowRule()], emptyFacts(), {
      now: new Date("2026-07-18T00:00:00.000Z"),
    });
    expect(result.firings).toHaveLength(1);
  });

  it("does NOT fire when now === end (exclusive upper bound)", () => {
    const result = matchTriggers([windowRule()], emptyFacts(), {
      now: new Date("2026-07-20T12:00:00.000Z"),
    });
    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([
      { triggerId: "trg-win", reason: "unmatched" },
    ]);
  });

  it("does NOT fire one ms before start", () => {
    const result = matchTriggers([windowRule()], emptyFacts(), {
      now: new Date("2026-07-17T11:59:59.999Z"),
    });
    expect(result.firings).toEqual([]);
  });

  it("fires one ms before end", () => {
    const result = matchTriggers([windowRule()], emptyFacts(), {
      now: new Date("2026-07-20T11:59:59.999Z"),
    });
    expect(result.firings).toHaveLength(1);
  });
});

describe("matchTriggers — expiry at equality (now === expiresAt -> expired)", () => {
  it("does NOT fire when now === expiresAt", () => {
    const rule = armedRule({
      expiresAt: "2026-07-17T12:00:00.000Z",
    });
    const result = matchTriggers(
      [rule],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: new Date("2026-07-17T12:00:00.000Z") },
    );
    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([{ triggerId: "trg-1", reason: "expired" }]);
  });

  it("fires one ms before expiry", () => {
    const rule = armedRule({
      expiresAt: "2026-07-17T12:00:00.001Z",
    });
    const result = matchTriggers(
      [rule],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: new Date("2026-07-17T12:00:00.000Z") },
    );
    expect(result.firings).toHaveLength(1);
  });

  it("null expiresAt never expires (kernel invents no default horizon)", () => {
    const rule = armedRule({ expiresAt: null });
    const result = matchTriggers(
      [rule],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: new Date("2099-01-01T00:00:00.000Z") },
    );
    expect(result.firings).toHaveLength(1);
  });
});

describe("matchTriggers — lifecycle status gate", () => {
  it.each(["fired", "done", "expired", "composted"] as const)(
    "does not fire a %s rule (not_armed)",
    (status) => {
      const result = matchTriggers(
        [armedRule({ status })],
        { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
        { now: NOW },
      );
      expect(result.firings).toEqual([]);
      expect(result.skipped).toEqual([
        { triggerId: "trg-1", reason: "not_armed" },
      ]);
    },
  );
});

describe("matchTriggers — sanctuary fails safe", () => {
  it("skips a sanctuary-excluded rule even with a matching fact", () => {
    const result = matchTriggers(
      [armedRule({ sanctuaryExcluded: true })],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );
    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([
      { triggerId: "trg-1", reason: "sanctuary_excluded" },
    ]);
  });

  it.each([undefined, null, 1, "false", 0, {}])(
    "treats non-false sanctuary flag %p as malformed (never fires)",
    (sanctuaryExcluded) => {
      const rule = { ...armedRule(), sanctuaryExcluded } as unknown as TriggerRule;
      const result = matchTriggers(
        [rule],
        { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
        { now: NOW },
      );
      expect(result.firings).toEqual([]);
      // A non-boolean flag is a malformed rule; only an explicit boolean true is
      // the "sanctuary_excluded" domain skip.
      const reason =
        sanctuaryExcluded === false ? undefined : result.skipped[0]?.reason;
      expect(reason).toBe("malformed_rule");
    },
  );
});

describe("matchTriggers — fail closed on malformed data", () => {
  it("skips a malformed rule with a named reason, keeping other rules", () => {
    const good = armedRule({ id: "good" });
    const bad = { ...armedRule({ id: "bad" }), conditionType: "telepathy" } as unknown as TriggerRule;
    const result = matchTriggers(
      [bad, good],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );

    expect(result.skipped).toContainEqual({
      triggerId: "bad",
      reason: "malformed_rule",
    });
    expect(result.firings.map((f) => f.triggerId)).toEqual(["good"]);
  });

  it("drops a rule with no trustworthy id (no fabricated skip record)", () => {
    const idless = { ...armedRule(), id: "  " } as unknown as TriggerRule;
    const result = matchTriggers([idless], emptyFacts(), { now: NOW });
    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("date_window rule without a valid window is malformed_rule", () => {
    const rule = armedRule({
      id: "trg-badwin",
      conditionType: "date_window",
      window: null,
    });
    const result = matchTriggers([rule], emptyFacts(), { now: NOW });
    expect(result.skipped).toEqual([
      { triggerId: "trg-badwin", reason: "malformed_rule" },
    ]);
  });

  it("inverted window (start >= end) is malformed_rule", () => {
    const rule = armedRule({
      id: "trg-inv",
      conditionType: "date_window",
      window: { start: "2026-07-20T00:00:00Z", end: "2026-07-19T00:00:00Z" },
    });
    const result = matchTriggers([rule], emptyFacts(), { now: NOW });
    expect(result.skipped).toEqual([
      { triggerId: "trg-inv", reason: "malformed_rule" },
    ]);
  });

  it.each([
    { personTouchRefs: "not-an-array" },
    { personTouchRefs: [1, 2, 3] },
    { areaEventRefs: null },
    null,
    "facts",
  ])("fails closed (malformed_facts) for malformed facts %p", (badFacts) => {
    const facts = (
      badFacts && typeof badFacts === "object"
        ? { ...emptyFacts(), ...badFacts }
        : badFacts
    ) as unknown as TriggerFacts;
    const result = matchTriggers([armedRule()], facts, { now: NOW });
    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([
      { triggerId: "trg-1", reason: "malformed_facts" },
    ]);
  });

  it("does not consult facts for an already-skipped (expired) rule", () => {
    // Malformed facts must not upgrade an expired skip into malformed_facts.
    const rule = armedRule({ expiresAt: "2020-01-01T00:00:00Z" });
    const result = matchTriggers(
      [rule],
      "garbage" as unknown as TriggerFacts,
      { now: NOW },
    );
    expect(result.skipped).toEqual([{ triggerId: "trg-1", reason: "expired" }]);
  });
});

describe("matchTriggers — hostile input (#636/#638 lineage)", () => {
  it("does not execute getters on rule fields", () => {
    let getterCalls = 0;
    const rule = { id: "trg-getter" } as Record<string, unknown>;
    for (const [field, value] of Object.entries({
      conditionType: "person",
      conditionRef: "person:darpan",
      intentionText: "x",
      status: "armed",
      expiresAt: null,
      sanctuaryExcluded: false,
    })) {
      Object.defineProperty(rule, field, {
        enumerable: true,
        get() {
          getterCalls += 1;
          return value;
        },
      });
    }
    const result = matchTriggers(
      [rule as unknown as TriggerRule],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );
    expect(getterCalls).toBe(0);
    // Getter-only fields are not own-value descriptors -> malformed rule.
    expect(result.skipped).toEqual([
      { triggerId: "trg-getter", reason: "malformed_rule" },
    ]);
  });

  it("fails closed for a throwing proxy rule", () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("hostile");
        },
        getPrototypeOf() {
          throw new Error("hostile");
        },
      },
    );
    const result = matchTriggers(
      [hostile as unknown as TriggerRule],
      emptyFacts(),
      { now: NOW },
    );
    expect(result.firings).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("ignores an inherited (non-own) condition field", () => {
    const rule = Object.assign(
      Object.create({ conditionRef: "person:darpan" }),
      {
        id: "trg-proto",
        conditionType: "person",
        intentionText: "x",
        status: "armed",
        expiresAt: null,
        sanctuaryExcluded: false,
      },
    );
    const result = matchTriggers(
      [rule as unknown as TriggerRule],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );
    // conditionRef lives on the prototype -> not read -> malformed rule.
    expect(result.skipped).toEqual([
      { triggerId: "trg-proto", reason: "malformed_rule" },
    ]);
  });
});

describe("matchTriggers — frozen rule cap", () => {
  it("evaluates up to MAX rules and caps the rest with rule_cap_exceeded", () => {
    const rules: TriggerRule[] = Array.from(
      { length: MAX_TRIGGER_RULES_PER_CALL + 3 },
      (_, i) => armedRule({ id: `trg-${i}`, conditionRef: `person:${i}` }),
    );
    const result = matchTriggers(rules, emptyFacts(), { now: NOW });

    const capped = result.skipped.filter((s) => s.reason === "rule_cap_exceeded");
    expect(capped).toHaveLength(3);
    expect(capped.map((s) => s.triggerId)).toEqual([
      `trg-${MAX_TRIGGER_RULES_PER_CALL}`,
      `trg-${MAX_TRIGGER_RULES_PER_CALL + 1}`,
      `trg-${MAX_TRIGGER_RULES_PER_CALL + 2}`,
    ]);
    // The (MAX-1)th rule is still evaluated (unmatched here), not capped.
    expect(result.skipped[MAX_TRIGGER_RULES_PER_CALL - 1]).toEqual({
      triggerId: `trg-${MAX_TRIGGER_RULES_PER_CALL - 1}`,
      reason: "unmatched",
    });
  });
});

describe("matchTriggers — caller-supplied time contract", () => {
  it("throws TypeError for an invalid now (caller programming error)", () => {
    expect(() =>
      matchTriggers([armedRule()], emptyFacts(), {
        now: new Date("not-a-date"),
      }),
    ).toThrow(TypeError);
  });

  it("reads no ambient clock: identical inputs are deterministic", () => {
    const args = [
      [armedRule()],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    ] as const;
    expect(matchTriggers(...args)).toEqual(matchTriggers(...args));
  });

  it("returns frozen results and frozen firings", () => {
    const result = matchTriggers(
      [armedRule()],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.firings)).toBe(true);
    expect(Object.isFrozen(result.firings[0])).toBe(true);
  });
});

describe("matchTriggers x evaluateI1InitiativeGate — propose/dispose integration", () => {
  // The kernel proposes; the shipped gate disposes. These tests call the REAL
  // gate WITHOUT modifying it, mapping a firing to a gate input.
  function gateInputFor(
    firing: TriggerFiringCandidate,
    opportunity: InitiativeOpportunity,
  ) {
    return {
      initiativeClass: TRIGGER_SURFACE_POLICY_ID,
      opportunity,
      userInitiated: true,
    };
  }

  it("a firing surfaced at the brief opportunity is allowed by the gate at I1", () => {
    const { firings } = matchTriggers(
      [armedRule()],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );
    expect(firings).toHaveLength(1);

    const decision = evaluateI1InitiativeGate(gateInputFor(firings[0], "brief"));
    expect(decision).toEqual({
      kind: "allow",
      initiativeClass: TRIGGER_SURFACE_POLICY_ID,
      effectiveRung: "I1",
    });
  });

  it("the gate refuses the same firing if a caller mislabels it mid_day (no graduation)", () => {
    const { firings } = matchTriggers(
      [armedRule()],
      { ...emptyFacts(), personTouchRefs: ["person:darpan"] },
      { now: NOW },
    );

    const decision = evaluateI1InitiativeGate(
      gateInputFor(firings[0], "mid_day"),
    );
    expect(decision).toEqual({ kind: "block", reason: "graduation_required" });
  });
});
