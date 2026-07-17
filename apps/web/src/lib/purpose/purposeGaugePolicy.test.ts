import { describe, expect, it } from "vitest";
import {
  PURPOSE_GAUGE_RESPONSES,
  PURPOSE_GAUGE_SAMPLE_DAYS,
  parsePurposeGaugeResponse,
  shouldOfferPurposeGauge,
} from "./purposeGaugePolicy";

const validInput = (overrides: Record<string, unknown> = {}) => ({
  localDayOfMonth: 4,
  alreadyOfferedToday: false,
  sanctuaryContext: {},
  ...overrides,
});

describe("constants (acceptance 1)", () => {
  it("sample days are exactly the ratified 4/12/20/28 and immutable", () => {
    expect(PURPOSE_GAUGE_SAMPLE_DAYS).toEqual([4, 12, 20, 28]);
    expect(Object.isFrozen(PURPOSE_GAUGE_SAMPLE_DAYS)).toBe(true);
    expect(() => {
      (PURPOSE_GAUGE_SAMPLE_DAYS as number[]).push(29);
    }).toThrow();
  });

  it("responses are exactly lighter/even/heavier and immutable", () => {
    expect(PURPOSE_GAUGE_RESPONSES).toEqual(["lighter", "even", "heavier"]);
    expect(Object.isFrozen(PURPOSE_GAUGE_RESPONSES)).toBe(true);
  });
});

describe("shouldOfferPurposeGauge — eligibility (acceptance 2-3)", () => {
  it("each ratified day is eligible with an unmarked context and no prior offer", () => {
    for (const day of [4, 12, 20, 28]) {
      expect(
        shouldOfferPurposeGauge(validInput({ localDayOfMonth: day })),
      ).toBe(true);
    }
  });

  it("a null-prototype record input is a valid container", () => {
    const input = Object.assign(Object.create(null), validInput());
    expect(shouldOfferPurposeGauge(input)).toBe(true);
  });

  it("enumerating days 1..31 yields EXACTLY four eligible days", () => {
    const eligible = [];
    for (let day = 1; day <= 31; day += 1) {
      if (shouldOfferPurposeGauge(validInput({ localDayOfMonth: day }))) {
        eligible.push(day);
      }
    }
    expect(eligible).toEqual([4, 12, 20, 28]);
  });

  it("days 29-31 are never sample days: every month yields exactly four offers", () => {
    for (const day of [29, 30, 31]) {
      expect(
        shouldOfferPurposeGauge(validInput({ localDayOfMonth: day })),
      ).toBe(false);
    }
  });
});

describe("shouldOfferPurposeGauge — malformed day values (acceptance 4)", () => {
  it.each([
    ["zero", 0],
    ["negative sample-day mirror", -4],
    ["fractional near-sample", 4.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["string digit", "4"],
    ["boolean", true],
    ["null", null],
    ["undefined value", undefined],
  ])("%s fails closed", (_label, day) => {
    expect(shouldOfferPurposeGauge(validInput({ localDayOfMonth: day }))).toBe(
      false,
    );
  });

  it("a missing day field fails closed", () => {
    const input: Record<string, unknown> = validInput();
    delete input.localDayOfMonth;
    expect(shouldOfferPurposeGauge(input)).toBe(false);
  });
});

describe("shouldOfferPurposeGauge — alreadyOfferedToday (acceptance 5)", () => {
  it.each([
    ["true", true],
    ["truthy string", "false"],
    ["zero", 0],
    ["null", null],
    ["undefined", undefined],
    ["object", {}],
  ])("must be EXACTLY false; %s fails closed", (_label, value) => {
    expect(
      shouldOfferPurposeGauge(validInput({ alreadyOfferedToday: value })),
    ).toBe(false);
  });
});

describe("shouldOfferPurposeGauge — Sanctuary suppression via #627 (acceptance 6)", () => {
  it.each([
    ["item marker", { item: true }],
    ["area marker", { area: true }],
    ["day marker", { day: true }],
    ["all markers", { item: true, area: true, day: true }],
  ])("%s suppresses the offer", (_label, sanctuaryContext) => {
    expect(shouldOfferPurposeGauge(validInput({ sanctuaryContext }))).toBe(
      false,
    );
  });

  it("false/absent markers and the empty legacy context permit the offer", () => {
    for (const sanctuaryContext of [
      {},
      { item: false },
      { item: false, area: false, day: false },
      { unrelated: "field" },
    ]) {
      expect(shouldOfferPurposeGauge(validInput({ sanctuaryContext }))).toBe(
        true,
      );
    }
  });

  it("malformed sanctuary contexts suppress through the predicate (fail closed)", () => {
    for (const sanctuaryContext of [
      null,
      [],
      "sanctuary",
      42,
      () => false,
      { item: "true" },
      { day: 1 },
    ]) {
      expect(shouldOfferPurposeGauge(validInput({ sanctuaryContext }))).toBe(
        false,
      );
    }
  });

  it("an accessor sanctuary marker suppresses without the offer succeeding", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "item", {
      get() {
        return false;
      },
      enumerable: true,
    });
    expect(
      shouldOfferPurposeGauge(validInput({ sanctuaryContext: hostile })),
    ).toBe(false);
  });

  it("a throwing proxy sanctuary context suppresses without escaping", () => {
    const throwing = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("trap");
        },
      },
    );
    expect(
      shouldOfferPurposeGauge(validInput({ sanctuaryContext: throwing })),
    ).toBe(false);
  });
});

describe("shouldOfferPurposeGauge — hostile outer containers (acceptance 7, CONTRACT CORRECTION v1)", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["array", [4, false, {}]],
    ["string", "input"],
    ["number", 4],
    ["function", () => validInput()],
  ])("%s outer input fails closed without throwing", (_label, input) => {
    expect(shouldOfferPurposeGauge(input)).toBe(false);
  });

  it("a class instance outer container is rejected (prototype check)", () => {
    class OfferInput {
      localDayOfMonth = 4;
      alreadyOfferedToday = false;
      sanctuaryContext = {};
    }
    expect(shouldOfferPurposeGauge(new OfferInput())).toBe(false);
  });

  it("accessor outer fields are rejected WITHOUT executing the getter", () => {
    let getterCalls = 0;
    const hostile: Record<string, unknown> = {
      alreadyOfferedToday: false,
      sanctuaryContext: {},
    };
    Object.defineProperty(hostile, "localDayOfMonth", {
      get() {
        getterCalls += 1;
        return 4;
      },
      enumerable: true,
    });

    expect(shouldOfferPurposeGauge(hostile)).toBe(false);
    expect(getterCalls).toBe(0);
  });

  it("a revoked proxy outer container fails closed without throwing", () => {
    const { proxy, revoke } = Proxy.revocable(validInput(), {});
    revoke();
    expect(shouldOfferPurposeGauge(proxy)).toBe(false);
  });

  it("a proxy with throwing descriptor traps fails closed without throwing", () => {
    const hostile = new Proxy(validInput(), {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap");
      },
    });
    expect(shouldOfferPurposeGauge(hostile)).toBe(false);
  });

  it("DOCUMENTED PLATFORM LIMIT: a fully transparent proxy over a plain record behaves like its target", () => {
    // Per CONTRACT CORRECTION v1 (and the #638 precedent): portable browser
    // JS has no side-effect-free isProxy, so a transparent proxy is
    // observationally identical to its plain-record target. This fixture
    // pins the honest 3/4 boundary rather than pretending otherwise.
    const transparent = new Proxy(validInput(), {});
    expect(shouldOfferPurposeGauge(transparent)).toBe(true);
  });

  it("extra outer fields are ignored without weakening validation", () => {
    expect(
      shouldOfferPurposeGauge(validInput({ extra: "field", rung: "I3" })),
    ).toBe(true);
    expect(
      shouldOfferPurposeGauge(
        validInput({ extra: "field", localDayOfMonth: 5 }),
      ),
    ).toBe(false);
  });
});

describe("shouldOfferPurposeGauge — determinism and immutability (acceptance 8)", () => {
  it("frozen inputs remain unchanged and repeated calls match", () => {
    const sanctuaryContext = Object.freeze({ item: false });
    const input = Object.freeze(validInput({ sanctuaryContext }));

    const first = shouldOfferPurposeGauge(input);
    const second = shouldOfferPurposeGauge(input);

    expect(first).toBe(true);
    expect(second).toBe(first);
    expect(input).toEqual(validInput({ sanctuaryContext: { item: false } }));
  });
});

describe("parsePurposeGaugeResponse (acceptance 9-10)", () => {
  it("the three exact response values round-trip", () => {
    for (const value of ["lighter", "even", "heavier"] as const) {
      expect(parsePurposeGaugeResponse(value)).toBe(value);
    }
  });

  it.each([
    ["null (a skip)", null],
    ["undefined", undefined],
    ["blank", ""],
    ["whitespace", "  "],
    ["case drift", "Lighter"],
    ["padded", "even "],
    ["other string", "heavy"],
    ["number", 1],
    ["object", { value: "even" }],
    ["array", ["even"]],
  ])("%s returns null and creates no signal", (_label, value) => {
    expect(parsePurposeGaugeResponse(value)).toBeNull();
  });
});
