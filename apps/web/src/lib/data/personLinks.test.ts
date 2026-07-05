import { describe, expect, it } from "vitest";
import type { ParseCapturePersonMention, Person } from "@lifeos/schemas";
import {
  normalizePersonName,
  resolvePersonMention,
  resolvePersonMentions,
} from "./personLinks";

function person(overrides: Partial<Person>): Person {
  return {
    id: "550e8400-e29b-41d4-a716-446655440b01",
    user_id: "550e8400-e29b-41d4-a716-446655440001",
    display_name: "Sarah Lee",
    normalized_name: "sarah lee",
    notes: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

const mention = (
  overrides: Partial<ParseCapturePersonMention>,
): ParseCapturePersonMention => ({
  name: "Sarah Lee",
  role: "committed_to",
  confidence: 0.9,
  ...overrides,
});

describe("normalizePersonName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizePersonName("  Sarah   Lee ")).toBe("sarah lee");
  });
});

describe("resolvePersonMention", () => {
  it("matches an existing person by normalized name", () => {
    const result = resolvePersonMention(mention({ name: "SARAH lee" }), [
      person({}),
    ]);
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.person.display_name).toBe("Sarah Lee");
    }
  });

  it("proposes a new person when no active match exists", () => {
    const result = resolvePersonMention(mention({ name: "Jordan" }), [
      person({}),
    ]);
    expect(result.kind).toBe("new");
    expect(result.normalizedName).toBe("jordan");
  });

  it("never matches an archived person", () => {
    const result = resolvePersonMention(mention({}), [
      person({ archived_at: "2026-07-02T00:00:00.000Z" }),
    ]);
    expect(result.kind).toBe("new");
  });

  it("does not fuzzy-match distinct names", () => {
    const result = resolvePersonMention(mention({ name: "Sara" }), [
      person({}),
    ]);
    expect(result.kind).toBe("new");
  });
});

describe("resolvePersonMentions", () => {
  it("returns one resolution per mention in order", () => {
    const results = resolvePersonMentions(
      [mention({ name: "Sarah Lee" }), mention({ name: "Jordan" })],
      [person({})],
    );
    expect(results.map((r) => r.kind)).toEqual(["matched", "new"]);
  });

  it("returns an empty result for a person-free draft", () => {
    expect(resolvePersonMentions([], [person({})])).toEqual([]);
  });
});
