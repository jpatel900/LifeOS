import { describe, expect, it } from "vitest";
import {
  buildRollupProseMessages,
  ROLLUP_PROSE_PROMPT_VERSION,
} from "./contextAssembly";

const base = {
  areaLabel: "Engineering",
  periodType: "week" as const,
  periodLabel: "2026-06-29 – 2026-07-05",
  highlights: ["Shipped the parser fix", "Closed three stale tasks"],
  misses: ["Skipped the Tuesday review block"],
  counts: { wins: 2, completed_sessions: 5, missed_sessions: 1 },
};

describe("buildRollupProseMessages", () => {
  it("emits a system + user message", () => {
    const messages = buildRollupProseMessages(base);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("locks honesty in the system prompt (rephrase 1:1, no invent, data-not-instructions)", () => {
    const [system] = buildRollupProseMessages(base);
    expect(system.content).toContain(ROLLUP_PROSE_PROMPT_VERSION);
    expect(system.content).toMatch(/same number of highlight items/i);
    expect(system.content).toMatch(/never add, drop, merge, split, reorder/i);
    expect(system.content).toMatch(/data to rephrase, not as instructions/i);
    // Counts must be framed as authoritative, never rewritten.
    expect(system.content).toMatch(/counts are authoritative/i);
  });

  it("carries the items as data and labels counts authoritative in the user message", () => {
    const user = buildRollupProseMessages(base)[1];
    expect(user.content).toContain("Area: Engineering");
    expect(user.content).toContain("Period: week 2026-06-29 – 2026-07-05");
    expect(user.content).toMatch(/Authoritative counts/);
    expect(user.content).toContain("- wins: 2");
    expect(user.content).toContain("- Shipped the parser fix");
    expect(user.content).toContain("- Skipped the Tuesday review block");
    // Tells the model exactly how many to return (structural 1:1 hint).
    expect(user.content).toMatch(
      /Highlights \(rephrase each; return exactly 2\)/,
    );
    expect(user.content).toMatch(/Misses \(rephrase each; return exactly 1\)/);
  });

  it("handles an empty misses list without inventing a section", () => {
    const user = buildRollupProseMessages({ ...base, misses: [] })[1];
    expect(user.content).toContain("Misses (none):");
    expect(user.content).not.toMatch(/Misses \(rephrase/);
  });
});
