import { describe, expect, it } from "vitest";
import { TaskMapGraphDraftSchema } from "./task-map";

const minimalGraph = {
  schema_version: "1.0",
  nodes: [{ id: "required-1", title: "Required 1", role: "required" }],
  edges: [],
} as const;

const expectRejectedWithMessage = (input: unknown, message: string) => {
  const result = TaskMapGraphDraftSchema.safeParse(input);

  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      message,
    );
  }
};

describe("TaskMapGraphDraftSchema", () => {
  it("accepts a valid minimal graph", () => {
    expect(TaskMapGraphDraftSchema.safeParse(minimalGraph).success).toBe(true);
  });

  it("accepts a valid full graph at all role caps", () => {
    const fullGraph = {
      schema_version: "1.0",
      nodes: [
        ...Array.from({ length: 7 }, (_, index) => ({
          id: `required-${index + 1}`,
          title: `Required ${index + 1}`,
          role: "required",
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          id: `optional-${index + 1}`,
          title: `Optional ${index + 1}`,
          role: "optional",
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `red-${index + 1}`,
          title: `Red ${index + 1}`,
          role: "red",
          red_reason: `Reason ${index + 1}`,
        })),
      ],
      edges: [
        { from: "required-1", to: "required-2" },
        { from: "required-1", to: "optional-1" },
      ],
    };

    expect(TaskMapGraphDraftSchema.safeParse(fullGraph).success).toBe(true);
  });

  it("rejects more than 7 required nodes with a specific message", () => {
    expectRejectedWithMessage(
      {
        ...minimalGraph,
        nodes: Array.from({ length: 8 }, (_, index) => ({
          id: `required-${index + 1}`,
          title: `Required ${index + 1}`,
          role: "required",
        })),
      },
      "Task maps may include at most 7 required nodes.",
    );
  });

  it("rejects more than 4 optional nodes with a specific message", () => {
    expectRejectedWithMessage(
      {
        ...minimalGraph,
        nodes: [
          { id: "required-1", title: "Required 1", role: "required" },
          ...Array.from({ length: 5 }, (_, index) => ({
            id: `optional-${index + 1}`,
            title: `Optional ${index + 1}`,
            role: "optional",
          })),
        ],
      },
      "Task maps may include at most 4 optional nodes.",
    );
  });

  it("rejects more than 2 red nodes with a specific message", () => {
    expectRejectedWithMessage(
      {
        ...minimalGraph,
        nodes: [
          { id: "required-1", title: "Required 1", role: "required" },
          ...Array.from({ length: 3 }, (_, index) => ({
            id: `red-${index + 1}`,
            title: `Red ${index + 1}`,
            role: "red",
            red_reason: `Reason ${index + 1}`,
          })),
        ],
      },
      "Task maps may include at most 2 red nodes.",
    );
  });

  it("rejects red nodes without a red_reason", () => {
    expectRejectedWithMessage(
      {
        ...minimalGraph,
        nodes: [
          { id: "required-1", title: "Required 1", role: "required" },
          { id: "red-1", title: "Red 1", role: "red" },
        ],
      },
      "Red nodes must include a non-empty red_reason.",
    );
  });

  it("rejects duplicate node ids", () => {
    expectRejectedWithMessage(
      {
        ...minimalGraph,
        nodes: [
          { id: "same", title: "Required 1", role: "required" },
          { id: "same", title: "Optional 1", role: "optional" },
        ],
      },
      "Task map node ids must be unique.",
    );
  });

  it("rejects unknown graph keys", () => {
    expect(
      TaskMapGraphDraftSchema.safeParse({ ...minimalGraph, extra: true })
        .success,
    ).toBe(false);
  });

  it("rejects unknown node keys", () => {
    expect(
      TaskMapGraphDraftSchema.safeParse({
        ...minimalGraph,
        nodes: [{ ...minimalGraph.nodes[0], extra: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown edge keys", () => {
    expect(
      TaskMapGraphDraftSchema.safeParse({
        ...minimalGraph,
        edges: [{ from: "required-1", to: "required-1", extra: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects the wrong schema_version", () => {
    expect(
      TaskMapGraphDraftSchema.safeParse({
        ...minimalGraph,
        schema_version: "2.0",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty nodes array", () => {
    expect(
      TaskMapGraphDraftSchema.safeParse({ ...minimalGraph, nodes: [] }).success,
    ).toBe(false);
  });

  // FR-031 slice F2 (#664): additive duration estimation.
  it("accepts schema_version 1.1 with per-node estimated_minutes", () => {
    const result = TaskMapGraphDraftSchema.safeParse({
      schema_version: "1.1",
      nodes: [
        {
          id: "required-1",
          title: "Required 1",
          role: "required",
          estimated_minutes: 30,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
  });

  it("still accepts a 1.0 document with no estimated_minutes on any node", () => {
    expect(TaskMapGraphDraftSchema.safeParse(minimalGraph).success).toBe(true);
  });

  it("rejects a zero or negative estimated_minutes", () => {
    expect(
      TaskMapGraphDraftSchema.safeParse({
        ...minimalGraph,
        schema_version: "1.1",
        nodes: [{ ...minimalGraph.nodes[0], estimated_minutes: 0 }],
      }).success,
    ).toBe(false);

    expect(
      TaskMapGraphDraftSchema.safeParse({
        ...minimalGraph,
        schema_version: "1.1",
        nodes: [{ ...minimalGraph.nodes[0], estimated_minutes: -5 }],
      }).success,
    ).toBe(false);
  });
});
