import { describe, expect, expectTypeOf, it } from "vitest";

import {
  evaluateI1InitiativeGate,
  type CappedInitiativeRung,
  type InitiativeGateDecision,
} from "./initiativePolicy";

type Assert<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

const cappedRungCannotRepresentI2OrI3: Assert<
  IsNever<Extract<CappedInitiativeRung, "I2" | "I3">>
> = true;

describe("evaluateI1InitiativeGate", () => {
  it("allows asked opportunities at I0 and preserves the exact class", () => {
    const decision = evaluateI1InitiativeGate({
      initiativeClass: "  deliberate class  ",
      opportunity: "asked",
      userInitiated: true,
    });

    expect(decision).toEqual({
      kind: "allow",
      initiativeClass: "  deliberate class  ",
      effectiveRung: "I0",
    });
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it.each(["start", "flow", "close", "brief"] as const)(
    "allows %s at I1 when user initiated",
    (opportunity) => {
      expect(
        evaluateI1InitiativeGate({
          initiativeClass: "planning",
          opportunity,
          userInitiated: true,
        }),
      ).toEqual({
        kind: "allow",
        initiativeClass: "planning",
        effectiveRung: "I1",
      });
    },
  );

  it.each(["asked", "start", "flow", "close", "brief"] as const)(
    "requires user initiation for %s",
    (opportunity) => {
      expect(
        evaluateI1InitiativeGate({
          initiativeClass: "planning",
          opportunity,
          userInitiated: false,
        }),
      ).toEqual({ kind: "block", reason: "user_initiation_required" });
    },
  );

  it.each(["mid_day", "outside_app"] as const)(
    "requires graduation for %s regardless of user initiation",
    (opportunity) => {
      for (const userInitiated of [true, false]) {
        expect(
          evaluateI1InitiativeGate({
            initiativeClass: "planning",
            opportunity,
            userInitiated,
          }),
        ).toEqual({ kind: "block", reason: "graduation_required" });
      }
    },
  );

  it("applies invalid-input precedence before class and opportunity decisions", () => {
    expect(
      evaluateI1InitiativeGate({
        initiativeClass: "   ",
        opportunity: "mid_day",
        userInitiated: "yes",
      }),
    ).toEqual({ kind: "block", reason: "invalid_input" });

    expect(
      evaluateI1InitiativeGate({
        initiativeClass: "   ",
        opportunity: "unknown",
        userInitiated: true,
      }),
    ).toEqual({ kind: "block", reason: "invalid_input" });
  });

  it("applies class-required precedence before graduation-required", () => {
    expect(
      evaluateI1InitiativeGate({
        initiativeClass: "   ",
        opportunity: "mid_day",
        userInitiated: true,
      }),
    ).toEqual({ kind: "block", reason: "initiative_class_required" });
  });

  it.each([
    {},
    { initiativeClass: 7, opportunity: "asked", userInitiated: true },
    { initiativeClass: "planning", opportunity: 7, userInitiated: true },
    {
      initiativeClass: "planning",
      opportunity: "unknown",
      userInitiated: true,
    },
    { initiativeClass: "planning", opportunity: "asked", userInitiated: 1 },
  ])("blocks missing, wrong-type, and unknown fields", (input) => {
    expect(evaluateI1InitiativeGate(input)).toEqual({
      kind: "block",
      reason: "invalid_input",
    });
  });

  it.each(["", " ", "\t\r\n"])("blocks blank class %j", (initiativeClass) => {
    expect(
      evaluateI1InitiativeGate({
        initiativeClass,
        opportunity: "asked",
        userInitiated: true,
      }),
    ).toEqual({ kind: "block", reason: "initiative_class_required" });
  });

  it("ignores combined I3, graduation, and large-evidence bypass claims", () => {
    const evidence = Array.from({ length: 10_000 }, (_, index) => ({
      accepted: true,
      index,
    }));

    expect(
      evaluateI1InitiativeGate({
        initiativeClass: "planning",
        opportunity: "outside_app",
        userInitiated: true,
        rung: "I3",
        graduated: true,
        evidence,
      }),
    ).toEqual({ kind: "block", reason: "graduation_required" });
  });

  it("does not observe ignored extra-key accessors", () => {
    let getterCalls = 0;
    const input = {
      initiativeClass: "planning",
      opportunity: "asked",
      userInitiated: true,
    };
    Object.defineProperties(input, {
      rung: {
        get() {
          getterCalls += 1;
          return "I3";
        },
      },
      graduated: {
        get() {
          getterCalls += 1;
          return true;
        },
      },
      evidence: {
        get() {
          getterCalls += 1;
          return Array.from({ length: 10_000 });
        },
      },
    });

    expect(evaluateI1InitiativeGate(input)).toEqual({
      kind: "allow",
      initiativeClass: "planning",
      effectiveRung: "I0",
    });
    expect(getterCalls).toBe(0);
  });

  it.each([
    null,
    undefined,
    true,
    7,
    "input",
    Symbol("input"),
    [],
    () => undefined,
    new Date(),
    new Map(),
    new (class InitiativeInput {
      initiativeClass = "planning";
      opportunity = "asked";
      userInitiated = true;
    })(),
    Object.create({ inherited: true }),
  ])("fails closed for a non-record container", (input) => {
    expect(evaluateI1InitiativeGate(input)).toEqual({
      kind: "block",
      reason: "invalid_input",
    });
  });

  it("accepts valid null-prototype records", () => {
    const input = Object.assign(Object.create(null), {
      initiativeClass: "planning",
      opportunity: "asked",
      userInitiated: true,
    });

    expect(evaluateI1InitiativeGate(input)).toEqual({
      kind: "allow",
      initiativeClass: "planning",
      effectiveRung: "I0",
    });
  });

  it.each(["initiativeClass", "opportunity", "userInitiated"] as const)(
    "does not execute an accessor for %s",
    (accessorField) => {
      let getterCalls = 0;
      const input = Object.create(null) as Record<string, unknown>;
      const values = {
        initiativeClass: "planning",
        opportunity: "asked",
        userInitiated: true,
      } as const;

      for (const [field, value] of Object.entries(values)) {
        Object.defineProperty(
          input,
          field,
          field === accessorField
            ? {
                enumerable: true,
                get() {
                  getterCalls += 1;
                  return value;
                },
              }
            : { enumerable: true, value },
        );
      }

      expect(evaluateI1InitiativeGate(input)).toEqual({
        kind: "block",
        reason: "invalid_input",
      });
      expect(getterCalls).toBe(0);
    },
  );

  it("snapshots every required descriptor exactly once", () => {
    const descriptorCalls = new Map<PropertyKey, number>();
    const target = {
      initiativeClass: "planning",
      opportunity: "asked",
      userInitiated: true,
    };
    const input = new Proxy(target, {
      getOwnPropertyDescriptor(currentTarget, property) {
        descriptorCalls.set(property, (descriptorCalls.get(property) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(currentTarget, property);
      },
    });

    expect(evaluateI1InitiativeGate(input)).toEqual({
      kind: "allow",
      initiativeClass: "planning",
      effectiveRung: "I0",
    });
    expect(descriptorCalls).toEqual(
      new Map<PropertyKey, number>([
        ["initiativeClass", 1],
        ["opportunity", 1],
        ["userInitiated", 1],
      ]),
    );
  });

  it("fails closed for revoked and throwing proxies", () => {
    const revoked = Proxy.revocable(
      {
        initiativeClass: "planning",
        opportunity: "asked",
        userInitiated: true,
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
      expect(evaluateI1InitiativeGate(input)).toEqual({
        kind: "block",
        reason: "invalid_input",
      });
    }
  });

  it("documents that a fully transparent proxy is indistinguishable from its target", () => {
    const transparentProxy = new Proxy(
      {
        initiativeClass: "planning",
        opportunity: "asked" as const,
        userInitiated: true,
      },
      {},
    );

    expect(evaluateI1InitiativeGate(transparentProxy)).toEqual({
      kind: "allow",
      initiativeClass: "planning",
      effectiveRung: "I0",
    });
  });

  it("does not mutate frozen input and returns deterministic frozen decisions", () => {
    const input = Object.freeze({
      initiativeClass: "planning",
      opportunity: "close" as const,
      userInitiated: true,
      nested: Object.freeze({ untouched: true }),
    });
    const before = structuredClone(input);

    const first = evaluateI1InitiativeGate(input);
    const second = evaluateI1InitiativeGate(input);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("freezes every block reason decision", () => {
    const decisions = [
      evaluateI1InitiativeGate(null),
      evaluateI1InitiativeGate({
        initiativeClass: " ",
        opportunity: "asked",
        userInitiated: true,
      }),
      evaluateI1InitiativeGate({
        initiativeClass: "planning",
        opportunity: "asked",
        userInitiated: false,
      }),
      evaluateI1InitiativeGate({
        initiativeClass: "planning",
        opportunity: "mid_day",
        userInitiated: true,
      }),
    ];

    expect(decisions.every(Object.isFrozen)).toBe(true);
  });

  it("exposes an exhaustive capped decision type", () => {
    expect(cappedRungCannotRepresentI2OrI3).toBe(true);
    expectTypeOf<InitiativeGateDecision>().toMatchTypeOf<
      | {
          readonly kind: "allow";
          readonly initiativeClass: string;
          readonly effectiveRung: "I0" | "I1";
        }
      | {
          readonly kind: "block";
          readonly reason:
            | "invalid_input"
            | "initiative_class_required"
            | "user_initiation_required"
            | "graduation_required";
        }
    >();
  });
});
