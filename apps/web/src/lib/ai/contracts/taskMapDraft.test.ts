import { describe, expect, it } from "vitest";
import {
  TASK_MAP_DRAFT_SCHEMA_VERSION,
  taskMapDraftResponseFormat,
  taskMapDraftResponseJsonSchema,
  validateTaskMapDraftResponse,
} from "./taskMapDraft";

const validPayload = {
  schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
  nodes: [
    {
      id: "step-1",
      title: "Gather inputs",
      role: "required",
      red_reason: null,
      red_condition: null,
    },
    {
      id: "step-2",
      title: "Do the work",
      role: "required",
      red_reason: null,
      red_condition: null,
    },
    {
      id: "polish",
      title: "Polish it",
      role: "optional",
      red_reason: null,
      red_condition: null,
    },
    {
      id: "skip-shortcut",
      title: "Do not skip review",
      role: "red",
      red_reason: "Skipping review has broken this before.",
      red_condition: null,
    },
  ],
  edges: [{ from: "step-1", to: "step-2" }],
};

describe("taskMapDraftResponseJsonSchema", () => {
  it("is a strict json_schema response format with no extra properties allowed", () => {
    expect(taskMapDraftResponseFormat.type).toBe("json_schema");
    expect(taskMapDraftResponseFormat.strict).toBe(true);
    expect(taskMapDraftResponseJsonSchema.additionalProperties).toBe(false);
  });

  it("never exposes a critical-path field on nodes or edges (AI drafts the graph only)", () => {
    const schemaText = JSON.stringify(taskMapDraftResponseJsonSchema);
    expect(schemaText).not.toMatch(/critical/i);
  });
});

describe("validateTaskMapDraftResponse", () => {
  it("accepts a well-formed draft and normalizes null red fields to absent", () => {
    const result = validateTaskMapDraftResponse(validPayload);
    expect(result.schema_version).toBe(TASK_MAP_DRAFT_SCHEMA_VERSION);
    expect(result.nodes).toHaveLength(4);
    const requiredStep = result.nodes.find((node) => node.id === "step-1");
    expect(requiredStep?.red_reason).toBeUndefined();
  });

  it("rejects a payload with the wrong schema_version", () => {
    expect(() =>
      validateTaskMapDraftResponse({ ...validPayload, schema_version: "2.0" }),
    ).toThrow(/failed validation/);
  });

  it("rejects a red node missing red_reason", () => {
    const invalid = {
      ...validPayload,
      nodes: [
        ...validPayload.nodes,
        {
          id: "bad-red",
          title: "Bad red",
          role: "red",
          red_reason: null,
          red_condition: null,
        },
      ],
    };

    expect(() => validateTaskMapDraftResponse(invalid)).toThrow(
      /failed validation/,
    );
  });

  it("rejects more than 7 required nodes", () => {
    const nodes = Array.from({ length: 8 }, (_, index) => ({
      id: `step-${index + 1}`,
      title: `Step ${index + 1}`,
      role: "required" as const,
      red_reason: null,
      red_condition: null,
    }));

    expect(() =>
      validateTaskMapDraftResponse({
        schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
        nodes,
        edges: [],
      }),
    ).toThrow(/failed validation/);
  });

  // FR-023 slice F4 (#678): the two_minute_move marker.
  it("keeps a true two_minute_move flag and normalizes false/null to absent", () => {
    const result = validateTaskMapDraftResponse({
      schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
      nodes: [
        { ...validPayload.nodes[0], two_minute_move: true },
        { ...validPayload.nodes[1], two_minute_move: false },
        { ...validPayload.nodes[2], two_minute_move: null },
        validPayload.nodes[3],
      ],
      edges: validPayload.edges,
    });

    expect(
      result.nodes.find((node) => node.id === "step-1")?.two_minute_move,
    ).toBe(true);
    expect(
      result.nodes.find((node) => node.id === "step-2")?.two_minute_move,
    ).toBeUndefined();
    expect(
      result.nodes.find((node) => node.id === "polish")?.two_minute_move,
    ).toBeUndefined();
  });

  it("rejects a draft that flags two nodes as the two-minute move", () => {
    expect(() =>
      validateTaskMapDraftResponse({
        schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
        nodes: [
          { ...validPayload.nodes[0], two_minute_move: true },
          { ...validPayload.nodes[1], two_minute_move: true },
        ],
        edges: validPayload.edges,
      }),
    ).toThrow(/failed validation/);
  });
});
