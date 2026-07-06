import { describe, expect, it } from "vitest";
import {
  buildWeeklyRollupDraft,
  composeMonthlyRollupDraft,
} from "./rollupDraft";

describe("buildWeeklyRollupDraft", () => {
  it("composes highlights/misses/counts from the period's review data", () => {
    const draft = buildWeeklyRollupDraft({
      winTitles: ["Shipped onboarding", "Closed the quarter"],
      missedTitles: ["Deep-work morning"],
      counts: { wins: 2, completedSessions: 5, missedSessions: 1 },
    });

    expect(draft).toEqual({
      highlights: ["Shipped onboarding", "Closed the quarter"],
      misses: ["Deep-work morning"],
      counts: { wins: 2, completed_sessions: 5, missed_sessions: 1 },
    });
  });

  it("dedupes and trims titles and caps at 10 items", () => {
    const draft = buildWeeklyRollupDraft({
      winTitles: [
        "  Repeated  ",
        "Repeated",
        ...Array.from({ length: 15 }, (_, i) => `Win ${i}`),
      ],
      missedTitles: ["", "   "],
      counts: { wins: 16, completedSessions: 20, missedSessions: 0 },
    });

    expect(draft.highlights).toHaveLength(10);
    expect(draft.highlights[0]).toBe("Repeated");
    expect(draft.misses).toEqual([]);
  });
});

describe("composeMonthlyRollupDraft", () => {
  it("unions highlights/misses and sums counts across weeks", () => {
    const monthly = composeMonthlyRollupDraft([
      {
        highlights: ["Shipped onboarding"],
        misses: ["Skipped review"],
        counts: { wins: 1, completed_sessions: 4, missed_sessions: 1 },
      },
      {
        highlights: ["Shipped onboarding", "Launched pricing"],
        misses: [],
        counts: { wins: 2, completed_sessions: 6, missed_sessions: 0 },
      },
    ]);

    expect(monthly).toEqual({
      highlights: ["Shipped onboarding", "Launched pricing"],
      misses: ["Skipped review"],
      counts: { wins: 3, completed_sessions: 10, missed_sessions: 1 },
    });
  });

  it("returns null with no weeks to compose", () => {
    expect(composeMonthlyRollupDraft([])).toBeNull();
  });
});
