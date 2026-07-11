import { describe, expect, it } from "vitest";

import { validateTaskMapForPersistence } from "./persistence";

const required = (id: string, title = id) => ({
  id,
  title,
  role: "required" as const,
});
const optional = (id: string, title = id, done = false) => ({
  id,
  title,
  role: "optional" as const,
  done,
});
const red = (id: string, title = id, red_reason = "Known dead end") => ({
  id,
  title,
  role: "red" as const,
  red_reason,
});

const validDraft = {
  schema_version: "1.0" as const,
  nodes: [required("a"), required("b"), optional("c"), red("d")],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ],
};

describe("validateTaskMapForPersistence", () => {
  it("accepts a valid graph", () => {
    const result = validateTaskMapForPersistence(validDraft);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph).toEqual(validDraft);
    }
  });

  it("rejects schema-invalid input", () => {
    const result = validateTaskMapForPersistence({
      schema_version: "2.0",
      nodes: [],
      edges: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects schema-valid input with a cycle (validateGraph channel)", () => {
    const cyclic = {
      schema_version: "1.0" as const,
      nodes: [required("a"), required("b"), required("c")],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    };

    const result = validateTaskMapForPersistence(cyclic);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Cycle detected: a -> b -> c -> a");
    }
  });

  it("rejects schema-valid input with an edge to a missing node (validateGraph channel)", () => {
    const missingNode = {
      schema_version: "1.0" as const,
      nodes: [required("a")],
      edges: [{ from: "a", to: "missing-to" }],
    };

    const result = validateTaskMapForPersistence(missingNode);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        "Edge references missing to node: missing-to",
      );
    }
  });

  it("surfaces schema error messages distinct from graph error messages", () => {
    const schemaInvalid = validateTaskMapForPersistence({
      schema_version: "1.0",
      nodes: [{ id: "a", title: "a", role: "red" }], // missing red_reason
      edges: [],
    });

    expect(schemaInvalid.ok).toBe(false);
    if (!schemaInvalid.ok) {
      expect(
        schemaInvalid.errors.some((error) => error.includes("red_reason")),
      ).toBe(true);
    }
  });
});
