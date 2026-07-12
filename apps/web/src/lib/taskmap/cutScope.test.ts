import { describe, expect, it } from "vitest";
import { appendCutScopeNote, cutScopeCandidatesForTask } from "./cutScope";

const baseGraph = {
  schema_version: "1.0" as const,
  nodes: [
    {
      id: "req-1",
      title: "Draft outline",
      role: "required" as const,
      done: false,
    },
    {
      id: "opt-1",
      title: "Add citations",
      role: "optional" as const,
      done: false,
    },
    {
      id: "opt-2",
      title: "Polish tone",
      role: "optional" as const,
      done: true,
      completed_at: "2026-07-10T00:00:00.000Z",
    },
    {
      id: "red-1",
      title: "Do not skip legal review",
      role: "red" as const,
      red_reason: "Compliance requires review.",
    },
  ],
  edges: [{ from: "req-1", to: "opt-1" }],
};

describe("cutScopeCandidatesForTask", () => {
  it("returns [] for a task with no map", () => {
    expect(cutScopeCandidatesForTask(null)).toEqual([]);
    expect(cutScopeCandidatesForTask(undefined)).toEqual([]);
    expect(
      cutScopeCandidatesForTask({ progression_map: null, map_status: null }),
    ).toEqual([]);
  });

  it("returns [] when the map is still a draft (not yet approved)", () => {
    expect(
      cutScopeCandidatesForTask({
        progression_map: baseGraph,
        map_status: "draft",
      }),
    ).toEqual([]);
  });

  it("returns [] when the map is superseded", () => {
    expect(
      cutScopeCandidatesForTask({
        progression_map: baseGraph,
        map_status: "superseded",
      }),
    ).toEqual([]);
  });

  it("returns the not-yet-completed optional nodes for an approved map", () => {
    const candidates = cutScopeCandidatesForTask({
      progression_map: baseGraph,
      map_status: "approved",
    });

    expect(candidates.map((node) => node.id)).toEqual(["opt-1"]);
  });

  it("excludes already-completed optional nodes", () => {
    const allDoneGraph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((node) =>
        node.role === "optional" ? { ...node, done: true } : node,
      ),
    };

    expect(
      cutScopeCandidatesForTask({
        progression_map: allDoneGraph,
        map_status: "approved",
      }),
    ).toEqual([]);
  });

  it("never includes red nodes even though they are unfinished", () => {
    const candidates = cutScopeCandidatesForTask({
      progression_map: baseGraph,
      map_status: "approved",
    });

    expect(candidates.some((node) => node.role === "red")).toBe(false);
  });

  it("returns [] when the graph has no optional nodes", () => {
    const noOptionalGraph = {
      schema_version: "1.0" as const,
      nodes: [
        {
          id: "req-1",
          title: "Only step",
          role: "required" as const,
          done: false,
        },
      ],
      edges: [],
    };

    expect(
      cutScopeCandidatesForTask({
        progression_map: noOptionalGraph,
        map_status: "approved",
      }),
    ).toEqual([]);
  });

  it("returns [] defensively when the persisted map no longer validates", () => {
    expect(
      cutScopeCandidatesForTask({
        progression_map: { nonsense: true },
        map_status: "approved",
      }),
    ).toEqual([]);
  });
});

describe("appendCutScopeNote", () => {
  it("returns the title when the note is empty", () => {
    expect(appendCutScopeNote("", "Add citations")).toBe("Add citations");
  });

  it("appends with a separator when the note already has text", () => {
    expect(appendCutScopeNote("Written so far", "Add citations")).toBe(
      "Written so far; Add citations",
    );
  });

  it("does not duplicate a title that is already present", () => {
    expect(
      appendCutScopeNote("Written so far; Add citations", "Add citations"),
    ).toBe("Written so far; Add citations");
  });

  it("trims whitespace on both sides", () => {
    expect(appendCutScopeNote("  Written so far  ", "  Add citations  ")).toBe(
      "Written so far; Add citations",
    );
  });

  it("returns the trimmed note unchanged for a blank title", () => {
    expect(appendCutScopeNote("Written so far", "   ")).toBe("Written so far");
  });
});
