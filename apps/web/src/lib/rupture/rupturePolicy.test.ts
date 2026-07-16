import { describe, expect, it } from "vitest";

import {
  DEFAULT_RUPTURE_ABSENCE_DAYS,
  assessRupture,
  createFullAdaptiveSurfaceState,
  transitionAdaptiveSurface,
  type AdaptiveSurfaceState,
  type RuptureSignals,
} from "./rupturePolicy";

const eligibleSignals = (
  overrides: Partial<RuptureSignals> = {},
): RuptureSignals => ({
  daysSinceMeaningfulActivity: 0,
  dismissalSpike: false,
  operatorDeclaredAway: false,
  sanctuaryExcluded: false,
  ...overrides,
});

describe("assessRupture", () => {
  it("uses the single seven-day policy constant", () => {
    expect(DEFAULT_RUPTURE_ABSENCE_DAYS).toBe(7);
  });

  it.each([
    [6, false],
    [7, true],
    [8, true],
    [7.5, false],
    [8.5, false],
    [-1, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])("assesses an absence value of %s without coercion", (days, ruptured) => {
    expect(
      assessRupture(eligibleSignals({ daysSinceMeaningfulActivity: days })),
    ).toEqual({
      ruptured,
      reasons: ruptured ? ["absence"] : [],
      suppressedBy: [],
    });
  });

  it.each([null, undefined, "7", true, new Number(7), {}, []])(
    "rejects malformed absence input %s",
    (days) => {
      expect(
        assessRupture({
          ...eligibleSignals(),
          daysSinceMeaningfulActivity: days,
        } as unknown as RuptureSignals),
      ).toEqual({ ruptured: false, reasons: [], suppressedBy: [] });
    },
  );

  it("detects a caller-computed dismissal spike without absence", () => {
    expect(assessRupture(eligibleSignals({ dismissalSpike: true }))).toEqual({
      ruptured: true,
      reasons: ["dismissal_spike"],
      suppressedBy: [],
    });
  });

  it.each([1, "true", new Boolean(true), null, undefined])(
    "does not coerce malformed dismissal input %j",
    (dismissalSpike) => {
      expect(
        assessRupture({
          ...eligibleSignals(),
          dismissalSpike,
        } as unknown as RuptureSignals),
      ).toEqual({ ruptured: false, reasons: [], suppressedBy: [] });
    },
  );

  it("orders simultaneous reasons as absence then dismissal spike", () => {
    expect(
      assessRupture(
        eligibleSignals({
          daysSinceMeaningfulActivity: 7,
          dismissalSpike: true,
        }),
      ),
    ).toEqual({
      ruptured: true,
      reasons: ["absence", "dismissal_spike"],
      suppressedBy: [],
    });
  });

  it.each(["operatorDeclaredAway", "sanctuaryExcluded"] as const)(
    "lets %s suppress each trigger shape while retaining reasons",
    (flag) => {
      const suppressedBy =
        flag === "operatorDeclaredAway"
          ? ["operator_declared_away"]
          : ["sanctuary"];
      const fixtures = [
        {
          signals: { daysSinceMeaningfulActivity: 7, dismissalSpike: false },
          reasons: ["absence"],
        },
        {
          signals: { daysSinceMeaningfulActivity: 0, dismissalSpike: true },
          reasons: ["dismissal_spike"],
        },
        {
          signals: { daysSinceMeaningfulActivity: 7, dismissalSpike: true },
          reasons: ["absence", "dismissal_spike"],
        },
      ] as const;

      for (const fixture of fixtures) {
        expect(
          assessRupture({
            ...eligibleSignals(fixture.signals),
            [flag]: true,
          }),
        ).toEqual({
          ruptured: false,
          reasons: fixture.reasons,
          suppressedBy,
        });
      }
    },
  );

  it("records away then Sanctuary suppression while retaining reasons", () => {
    expect(
      assessRupture({
        daysSinceMeaningfulActivity: 7,
        dismissalSpike: true,
        operatorDeclaredAway: true,
        sanctuaryExcluded: true,
      }),
    ).toEqual({
      ruptured: false,
      reasons: ["absence", "dismissal_spike"],
      suppressedBy: ["operator_declared_away", "sanctuary"],
    });
  });

  it.each([undefined, null, 0, 1, "false", {}, []])(
    "fails closed when an exclusion flag is %j",
    (malformed) => {
      const assessment = assessRupture({
        daysSinceMeaningfulActivity: 7,
        dismissalSpike: false,
        operatorDeclaredAway: malformed,
        sanctuaryExcluded: false,
      } as unknown as RuptureSignals);

      expect(assessment).toEqual({
        ruptured: false,
        reasons: ["absence"],
        suppressedBy: ["operator_declared_away"],
      });
    },
  );

  it("requires both exclusion flags to be exactly false", () => {
    const assessment = assessRupture({
      ...eligibleSignals({ daysSinceMeaningfulActivity: 7 }),
      sanctuaryExcluded: undefined,
    } as unknown as RuptureSignals);

    expect(assessment).toEqual({
      ruptured: false,
      reasons: ["absence"],
      suppressedBy: ["sanctuary"],
    });
  });

  it("fails closed without throwing for a malformed signals container", () => {
    expect(assessRupture(null as unknown as RuptureSignals)).toEqual({
      ruptured: false,
      reasons: [],
      suppressedBy: ["operator_declared_away", "sanctuary"],
    });
  });

  it("does not execute signal accessors", () => {
    let reads = 0;
    const signals = Object.defineProperty({}, "operatorDeclaredAway", {
      get() {
        reads += 1;
        return false;
      },
    });

    expect(assessRupture(signals as RuptureSignals)).toEqual({
      ruptured: false,
      reasons: [],
      suppressedBy: ["operator_declared_away", "sanctuary"],
    });
    expect(reads).toBe(0);
  });
});

describe("transitionAdaptiveSurface", () => {
  const ruptureAssessment = assessRupture(
    eligibleSignals({ daysSinceMeaningfulActivity: 7 }),
  );

  it("creates the canonical full state", () => {
    expect(createFullAdaptiveSurfaceState()).toEqual({
      mode: "full",
      reasons: [],
      restoredSurfaceIds: [],
    });
  });

  it("enters minimal mode and clears stale restorations on rupture", () => {
    const state: AdaptiveSurfaceState = Object.freeze({
      mode: "progressive",
      reasons: Object.freeze(["dismissal_spike"] as const),
      restoredSurfaceIds: Object.freeze(["today", "triage"]),
    });

    expect(
      transitionAdaptiveSurface(state, {
        type: "rupture_detected",
        assessment: ruptureAssessment,
      }),
    ).toEqual({
      mode: "minimal",
      reasons: ["absence"],
      restoredSurfaceIds: [],
    });
    expect(state.restoredSurfaceIds).toEqual(["today", "triage"]);
  });

  it("is idempotent by value for repeated valid rupture detection", () => {
    const first = transitionAdaptiveSurface(createFullAdaptiveSurfaceState(), {
      type: "rupture_detected",
      assessment: ruptureAssessment,
    });
    const repeated = transitionAdaptiveSurface(first, {
      type: "rupture_detected",
      assessment: ruptureAssessment,
    });

    expect(repeated).toEqual(first);
  });

  it("restores surfaces progressively, deduplicated and lexically sorted", () => {
    const minimal = transitionAdaptiveSurface(
      createFullAdaptiveSurfaceState(),
      {
        type: "rupture_detected",
        assessment: ruptureAssessment,
      },
    );
    const triage = transitionAdaptiveSurface(minimal, {
      type: "feature_reused",
      surfaceId: "triage",
    });
    const today = transitionAdaptiveSurface(triage, {
      type: "feature_reused",
      surfaceId: "today",
    });
    const duplicate = transitionAdaptiveSurface(today, {
      type: "feature_reused",
      surfaceId: "triage",
    });

    expect(triage).toEqual({
      mode: "progressive",
      reasons: ["absence"],
      restoredSurfaceIds: ["triage"],
    });
    expect(today.restoredSurfaceIds).toEqual(["today", "triage"]);
    expect(duplicate).toBe(today);
    expect(minimal.restoredSurfaceIds).toEqual([]);
    expect(triage.restoredSurfaceIds).toEqual(["triage"]);
  });

  it("returns the original state for full-mode reuse and blank IDs", () => {
    const full = createFullAdaptiveSurfaceState();
    const minimal = transitionAdaptiveSurface(full, {
      type: "rupture_detected",
      assessment: ruptureAssessment,
    });

    expect(
      transitionAdaptiveSurface(full, {
        type: "feature_reused",
        surfaceId: "today",
      }),
    ).toBe(full);
    expect(
      transitionAdaptiveSurface(minimal, {
        type: "feature_reused",
        surfaceId: "   ",
      }),
    ).toBe(minimal);
  });

  it("returns the original state for suppressed and nonrupture assessments", () => {
    const state = createFullAdaptiveSurfaceState();
    const suppressed = assessRupture({
      ...eligibleSignals({ daysSinceMeaningfulActivity: 7 }),
      operatorDeclaredAway: true,
    });
    const stable = assessRupture(eligibleSignals());

    expect(
      transitionAdaptiveSurface(state, {
        type: "rupture_detected",
        assessment: suppressed,
      }),
    ).toBe(state);
    expect(
      transitionAdaptiveSurface(state, {
        type: "rupture_detected",
        assessment: stable,
      }),
    ).toBe(state);
  });

  it("fails visible with an exact-reference no-op for a malformed assessment", () => {
    const state = createFullAdaptiveSurfaceState();

    expect(
      transitionAdaptiveSurface(state, {
        type: "rupture_detected",
        assessment: { ruptured: true } as never,
      }),
    ).toBe(state);
  });

  it("returns canonical full state immediately for show_all", () => {
    const progressive: AdaptiveSurfaceState = {
      mode: "progressive",
      reasons: ["absence"],
      restoredSurfaceIds: ["today"],
    };

    expect(
      transitionAdaptiveSurface(progressive, { type: "show_all" }),
    ).toEqual(createFullAdaptiveSurfaceState());
  });

  it("is deterministic and does not mutate frozen state or event inputs", () => {
    const state: AdaptiveSurfaceState = Object.freeze({
      mode: "minimal",
      reasons: Object.freeze(["absence"] as const),
      restoredSurfaceIds: Object.freeze([]),
    });
    const event = Object.freeze({
      type: "feature_reused" as const,
      surfaceId: "today",
    });

    const first = transitionAdaptiveSurface(state, event);
    const second = transitionAdaptiveSurface(state, event);

    expect(first).toEqual(second);
    expect(state).toEqual({
      mode: "minimal",
      reasons: ["absence"],
      restoredSurfaceIds: [],
    });
    expect(event).toEqual({ type: "feature_reused", surfaceId: "today" });
  });

  it("converges to the same value when surfaces are reused out of order", () => {
    const state: AdaptiveSurfaceState = {
      mode: "minimal",
      reasons: ["absence"],
      restoredSurfaceIds: [],
    };
    const todayThenTriage = transitionAdaptiveSurface(
      transitionAdaptiveSurface(state, {
        type: "feature_reused",
        surfaceId: "today",
      }),
      { type: "feature_reused", surfaceId: "triage" },
    );
    const triageThenToday = transitionAdaptiveSurface(
      transitionAdaptiveSurface(state, {
        type: "feature_reused",
        surfaceId: "triage",
      }),
      { type: "feature_reused", surfaceId: "today" },
    );

    expect(todayThenTriage).toEqual(triageThenToday);
  });

  it("does not share mutable arrays between canonical full states", () => {
    const first = createFullAdaptiveSurfaceState();
    const second = createFullAdaptiveSurfaceState();

    expect(first.reasons).not.toBe(second.reasons);
    expect(first.restoredSurfaceIds).not.toBe(second.restoredSurfaceIds);
  });
});
