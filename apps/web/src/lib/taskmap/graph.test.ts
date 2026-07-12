import { describe, expect, it } from "vitest";

import {
  computeCriticalPath,
  cutScopeCandidates,
  type TaskMapGraph,
  validateGraph,
} from "./graph";

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

describe("validateGraph", () => {
  it("accepts a valid small DAG", () => {
    const graph: TaskMapGraph = {
      nodes: [required("a"), required("b"), optional("c"), red("d")],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    expect(validateGraph(graph)).toEqual({ valid: true, errors: [] });
  });

  it("detects and names a cycle", () => {
    const result = validateGraph({
      nodes: [required("a"), required("b"), required("c")],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Cycle detected: a -> b -> c -> a");
  });

  it("rejects each node cap violation", () => {
    const result = validateGraph({
      nodes: [
        ...Array.from({ length: 8 }, (_, index) => required(`r${index}`)),
        ...Array.from({ length: 5 }, (_, index) => optional(`o${index}`)),
        ...Array.from({ length: 3 }, (_, index) => red(`x${index}`)),
      ],
      edges: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Too many required nodes: 8 (max 7)");
    expect(result.errors).toContain("Too many optional nodes: 5 (max 4)");
    expect(result.errors).toContain("Too many red nodes: 3 (max 2)");
  });

  it("rejects red nodes without a non-empty reason", () => {
    const result = validateGraph({
      nodes: [red("blocked", "Blocked", "   ")],
      edges: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Red node blocked must have a non-empty red_reason",
    );
  });

  it("rejects red nodes with outgoing edges to required nodes", () => {
    const result = validateGraph({
      nodes: [red("avoid"), required("next")],
      edges: [{ from: "avoid", to: "next" }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Red node avoid may not point to required node next",
    );
  });

  it("rejects edges that reference missing nodes", () => {
    const result = validateGraph({
      nodes: [required("a")],
      edges: [
        { from: "missing-from", to: "a" },
        { from: "a", to: "missing-to" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Edge references missing from node: missing-from",
    );
    expect(result.errors).toContain(
      "Edge references missing to node: missing-to",
    );
  });

  it("accepts one level of required branching", () => {
    const result = validateGraph({
      nodes: [required("start"), required("left"), required("right")],
      edges: [
        { from: "start", to: "left" },
        { from: "start", to: "right" },
      ],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects nested required branching through a required-node path", () => {
    const result = validateGraph({
      nodes: [
        required("start"),
        required("left"),
        required("right"),
        required("nested"),
        required("deep-a"),
        required("deep-b"),
      ],
      edges: [
        { from: "start", to: "left" },
        { from: "start", to: "right" },
        { from: "left", to: "nested" },
        { from: "nested", to: "deep-a" },
        { from: "nested", to: "deep-b" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Nested required branching: multiple fork nodes (nested, start)",
    );
  });

  it("accepts a branch that re-converges to a merge node (diamond, FR-031 branch+merge)", () => {
    const result = validateGraph({
      nodes: [
        required("start"),
        required("left"),
        required("right"),
        required("merge"),
      ],
      edges: [
        { from: "start", to: "left" },
        { from: "start", to: "right" },
        { from: "left", to: "merge" },
        { from: "right", to: "merge" },
      ],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects a second merge node", () => {
    const result = validateGraph({
      nodes: [
        required("start"),
        required("left"),
        required("right"),
        required("merge-one"),
        required("merge-two"),
      ],
      edges: [
        { from: "start", to: "left" },
        { from: "start", to: "right" },
        { from: "left", to: "merge-one" },
        { from: "right", to: "merge-one" },
        { from: "left", to: "merge-two" },
        { from: "right", to: "merge-two" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Nested required branching: multiple merge nodes (merge-one, merge-two)",
    );
  });

  it("rejects a node that both merges and forks", () => {
    const result = validateGraph({
      nodes: [
        required("a"),
        required("b"),
        required("hub"),
        required("x"),
        required("y"),
      ],
      edges: [
        { from: "a", to: "hub" },
        { from: "b", to: "hub" },
        { from: "hub", to: "x" },
        { from: "hub", to: "y" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Nested required branching: node hub both merges and forks",
    );
  });
});

describe("computeCriticalPath", () => {
  it("returns [] for empty graphs", () => {
    expect(computeCriticalPath({ nodes: [], edges: [] })).toEqual([]);
  });

  it("returns a single required node", () => {
    expect(
      computeCriticalPath({ nodes: [required("only")], edges: [] }),
    ).toEqual(["only"]);
  });

  it("ignores optional and red nodes", () => {
    expect(
      computeCriticalPath({
        nodes: [required("a"), optional("optional"), red("red")],
        edges: [
          { from: "a", to: "optional" },
          { from: "optional", to: "red" },
        ],
      }),
    ).toEqual(["a"]);
  });

  it("returns the longest required dependency chain across branch shapes", () => {
    expect(
      computeCriticalPath({
        nodes: [required("a"), required("b"), required("c"), required("d")],
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "c" },
          { from: "b", to: "d" },
        ],
      }),
    ).toEqual(["a", "b", "d"]);
  });

  it("uses lexicographic node id as the deterministic tie-break", () => {
    expect(
      computeCriticalPath({
        nodes: [required("a"), required("b"), required("c")],
        edges: [
          { from: "a", to: "c" },
          { from: "b", to: "c" },
        ],
      }),
    ).toEqual(["a", "c"]);
  });

  it("returns [] on invalid graphs", () => {
    expect(
      computeCriticalPath({
        nodes: [required("a"), required("b")],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
    ).toEqual([]);
  });
});

describe("cutScopeCandidates", () => {
  it("returns optional nodes not yet done ordered by title", () => {
    expect(
      cutScopeCandidates({
        nodes: [
          optional("later", "Later"),
          required("required", "Required"),
          optional("done", "Already done", true),
          optional("first", "First"),
        ],
        edges: [],
      }).map((node) => node.id),
    ).toEqual(["first", "later"]);
  });
});
