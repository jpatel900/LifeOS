import { describe, expect, expectTypeOf, it } from "vitest";

import {
  evaluateGraduationEligibility,
  type GraduationEligibilityDecision,
} from "./graduationEligibility";

type Assert<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

// Structural guarantee: the success branch can never encode a granted I2 —
// it can only ever say "ratification is required", never that it happened.
const successBranchCannotClaimGranted: Assert<
  IsNever<
    Extract<
      Extract<GraduationEligibilityDecision, { eligible: true }>,
      { requiresOwnerRatification: false }
    >
  >
> = true;

function opportunities(
  spec: Readonly<{
    accepted?: number;
    welcomed?: number;
    ignored?: number;
    dismissed?: number;
  }>,
): Array<{ outcome: string }> {
  const out: Array<{ outcome: string }> = [];
  for (let i = 0; i < (spec.accepted ?? 0); i++)
    out.push({ outcome: "accepted" });
  for (let i = 0; i < (spec.welcomed ?? 0); i++)
    out.push({ outcome: "welcomed" });
  for (let i = 0; i < (spec.ignored ?? 0); i++)
    out.push({ outcome: "ignored" });
  for (let i = 0; i < (spec.dismissed ?? 0); i++)
    out.push({ outcome: "dismissed" });
  return out;
}

describe("evaluateGraduationEligibility", () => {
  it("is eligible at exactly the frozen thresholds (20 count, 80% accept, <20% dismiss)", () => {
    const decision = evaluateGraduationEligibility({
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 16, ignored: 4 }),
    });

    expect(decision).toEqual({
      eligible: true,
      requiresOwnerRatification: true,
      evidenceSummary: {
        initiativeClass: "brief",
        totalOpportunities: 20,
        acceptedOrWelcomedCount: 16,
        dismissedCount: 0,
        acceptanceOrWelcomeRate: 0.8,
        dismissalRate: 0,
      },
    });
    expect(Object.isFrozen(decision)).toBe(true);
    if (decision.eligible) {
      expect(Object.isFrozen(decision.evidenceSummary)).toBe(true);
    }
  });

  it("counts both accepted and welcomed toward the acceptance-or-welcome rate", () => {
    const decision = evaluateGraduationEligibility({
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 8, welcomed: 8, ignored: 4 }),
    });

    expect(decision).toEqual({
      eligible: true,
      requiresOwnerRatification: true,
      evidenceSummary: {
        initiativeClass: "brief",
        totalOpportunities: 20,
        acceptedOrWelcomedCount: 16,
        dismissedCount: 0,
        acceptanceOrWelcomeRate: 0.8,
        dismissalRate: 0,
      },
    });
  });

  // --- Count boundary: >= 20 required -------------------------------------

  it("blocks with insufficient_opportunities at 19 (all accepted)", () => {
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 19 }),
      }),
    ).toEqual({ eligible: false, reason: "insufficient_opportunities" });
  });

  it("proceeds past the count gate at exactly 20 (all accepted)", () => {
    const decision = evaluateGraduationEligibility({
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 20 }),
    });
    expect(decision.eligible).toBe(true);
  });

  it("blocks with insufficient_opportunities for an empty evidence array", () => {
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: [],
      }),
    ).toEqual({ eligible: false, reason: "insufficient_opportunities" });
  });

  // --- Acceptance-or-welcome boundary: >= 80% required --------------------

  it("blocks with acceptance_rate_below_threshold just under 80% (dismissal rate unaffected)", () => {
    // 15/20 = 0.75 < 0.8; dismissed:0 keeps the dismissal gate from masking this.
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 15, ignored: 5 }),
      }),
    ).toEqual({ eligible: false, reason: "acceptance_rate_below_threshold" });
  });

  it("is eligible right at 80% acceptance with a non-zero neutral bucket", () => {
    const decision = evaluateGraduationEligibility({
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 16, ignored: 4 }),
    });
    expect(decision.eligible).toBe(true);
  });

  // --- Dismissal boundary: < 20% required ----------------------------------

  it("blocks with dismissal_rate_at_or_above_threshold at exactly 20% dismissed", () => {
    // 4/20 = 0.20, acceptance 16/20 = 0.80 (passes), isolating the dismissal gate.
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 16, dismissed: 4 }),
      }),
    ).toEqual({
      eligible: false,
      reason: "dismissal_rate_at_or_above_threshold",
    });
  });

  it("is eligible just under the dismissal ceiling at 15%", () => {
    const decision = evaluateGraduationEligibility({
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 17, dismissed: 3 }),
    });
    expect(decision.eligible).toBe(true);
  });

  // --- Precedence -----------------------------------------------------------

  it("applies malformed precedence before insufficient_opportunities", () => {
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: [{ outcome: "bogus" }],
      }),
    ).toEqual({ eligible: false, reason: "malformed_evidence" });
  });

  it("applies insufficient_opportunities precedence before acceptance/dismissal thresholds", () => {
    // Only 3 opportunities, all dismissed — would fail every threshold, but count gate fires first.
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ dismissed: 3 }),
      }),
    ).toEqual({ eligible: false, reason: "insufficient_opportunities" });
  });

  it("applies acceptance_rate precedence before dismissal_rate", () => {
    // 20 total, accepted 10 (0.5 < 0.8 fails), dismissed 10 (0.5 >= 0.2 also fails) —
    // acceptance check must fire first per declared precedence.
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 10, dismissed: 10 }),
      }),
    ).toEqual({ eligible: false, reason: "acceptance_rate_below_threshold" });
  });

  // --- Malformed / hostile input: fail closed --------------------------------

  it.each([
    null,
    undefined,
    true,
    7,
    "input",
    [],
    () => undefined,
    new Date(),
    new Map(),
  ])("fails closed for a non-record container", (input) => {
    expect(evaluateGraduationEligibility(input)).toEqual({
      eligible: false,
      reason: "malformed_evidence",
    });
  });

  it.each([
    {},
    { initiativeClass: "brief" },
    { opportunities: [] },
    { initiativeClass: 7, opportunities: [] },
    { initiativeClass: "brief", opportunities: "not-an-array" },
    { initiativeClass: "  ", opportunities: opportunities({ accepted: 20 }) },
    { initiativeClass: "", opportunities: opportunities({ accepted: 20 }) },
  ])("fails closed for malformed top-level shapes", (input) => {
    expect(evaluateGraduationEligibility(input)).toEqual({
      eligible: false,
      reason: "malformed_evidence",
    });
  });

  it.each([
    [{ outcome: "accepted" }, { outcome: "unknown" }],
    [{ outcome: "accepted" }, { notOutcome: "accepted" }],
    [{ outcome: "accepted" }, null],
    [{ outcome: "accepted" }, "accepted"],
    [{ outcome: "accepted" }, 7],
    [{ outcome: "accepted" }, { outcome: 7 }],
  ])("fails closed when any opportunity record is malformed", (...records) => {
    expect(
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: records,
      }),
    ).toEqual({ eligible: false, reason: "malformed_evidence" });
  });

  it("does not observe ignored extra-key accessors on the top-level input", () => {
    let getterCalls = 0;
    const input = {
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 20 }),
    };
    Object.defineProperties(input, {
      requiresOwnerRatification: {
        get() {
          getterCalls += 1;
          return true;
        },
      },
      eligible: {
        get() {
          getterCalls += 1;
          return true;
        },
      },
    });

    const decision = evaluateGraduationEligibility(input);
    expect(decision.eligible).toBe(true);
    expect(getterCalls).toBe(0);
  });

  it("does not execute a getter accessor for initiativeClass or opportunities", () => {
    let getterCalls = 0;
    const input = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(input, "initiativeClass", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "brief";
      },
    });
    Object.defineProperty(input, "opportunities", {
      enumerable: true,
      value: opportunities({ accepted: 20 }),
    });

    expect(evaluateGraduationEligibility(input)).toEqual({
      eligible: false,
      reason: "malformed_evidence",
    });
    expect(getterCalls).toBe(0);
  });

  it("accepts valid null-prototype top-level records", () => {
    const input = Object.assign(Object.create(null), {
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 20 }),
    });

    const decision = evaluateGraduationEligibility(input);
    expect(decision.eligible).toBe(true);
  });

  it("fails closed for revoked and throwing proxies", () => {
    const revoked = Proxy.revocable(
      {
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 20 }),
      },
      {},
    );
    revoked.revoke();

    const throwsOnPrototype = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile prototype");
        },
      },
    );
    const throwsOnDescriptor = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("hostile descriptor");
        },
      },
    );

    for (const input of [
      revoked.proxy,
      throwsOnPrototype,
      throwsOnDescriptor,
    ]) {
      expect(evaluateGraduationEligibility(input)).toEqual({
        eligible: false,
        reason: "malformed_evidence",
      });
    }
  });

  it("does not mutate frozen input and is deterministic across repeated calls", () => {
    const input = Object.freeze({
      initiativeClass: "brief",
      opportunities: Object.freeze(opportunities({ accepted: 16, ignored: 4 })),
    });
    const before = structuredClone(input);

    const first = evaluateGraduationEligibility(input);
    const second = evaluateGraduationEligibility(input);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("freezes every block-reason decision", () => {
    const decisions = [
      evaluateGraduationEligibility(null),
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: [],
      }),
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 15, ignored: 5 }),
      }),
      evaluateGraduationEligibility({
        initiativeClass: "brief",
        opportunities: opportunities({ accepted: 16, dismissed: 4 }),
      }),
    ];

    expect(decisions.every(Object.isFrozen)).toBe(true);
  });

  it("does not treat ownerApproved, graduated, or rung claims on the input as a bypass", () => {
    const decision = evaluateGraduationEligibility({
      initiativeClass: "brief",
      opportunities: opportunities({ accepted: 3 }),
      ownerApproved: true,
      graduated: true,
      rung: "I2",
    });

    expect(decision).toEqual({
      eligible: false,
      reason: "insufficient_opportunities",
    });
  });

  it("exposes an exhaustive decision type where success can only require ratification", () => {
    expect(successBranchCannotClaimGranted).toBe(true);
    expectTypeOf<GraduationEligibilityDecision>().toMatchTypeOf<
      | {
          readonly eligible: true;
          readonly requiresOwnerRatification: true;
          readonly evidenceSummary: {
            readonly initiativeClass: string;
            readonly totalOpportunities: number;
            readonly acceptedOrWelcomedCount: number;
            readonly dismissedCount: number;
            readonly acceptanceOrWelcomeRate: number;
            readonly dismissalRate: number;
          };
        }
      | {
          readonly eligible: false;
          readonly reason:
            | "malformed_evidence"
            | "insufficient_opportunities"
            | "acceptance_rate_below_threshold"
            | "dismissal_rate_at_or_above_threshold";
        }
    >();
  });
});
