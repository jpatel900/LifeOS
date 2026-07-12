import type { TaskMapGraphDraft } from "@lifeos/schemas";
import { describe, expect, it } from "vitest";

import { computeMapDwell, summarizeMapProgress } from "./dwell";

const baseGraph: TaskMapGraphDraft = {
  schema_version: "1.0",
  nodes: [
    {
      id: "req-1",
      title: "Draft outline",
      role: "required",
      completed_at: "2026-07-12T10:15:00.000Z",
    },
    {
      id: "req-2",
      title: "Send for review",
      role: "required",
      completed_at: "2026-07-12T10:05:00.000Z",
    },
    {
      id: "opt-1",
      title: "Polish appendix",
      role: "optional",
      completed_at: "2026-07-12T10:30:00.000Z",
    },
  ],
  edges: [
    { from: "req-1", to: "req-2" },
    { from: "req-2", to: "opt-1" },
  ],
};

describe("computeMapDwell", () => {
  it("picks the earliest completed_at across multiple completed nodes", () => {
    expect(
      computeMapDwell({
        mapApprovedAt: "2026-07-12T10:00:00.000Z",
        graph: baseGraph,
      }),
    ).toEqual({
      dwellMs: 5 * 60 * 1000,
      firstCompletionAt: "2026-07-12T10:05:00.000Z",
    });
  });

  it("returns null dwell for null map, null approval, or no completions", () => {
    expect(
      computeMapDwell({
        mapApprovedAt: "2026-07-12T10:00:00.000Z",
        graph: null,
      }),
    ).toEqual({ dwellMs: null, firstCompletionAt: null });

    expect(computeMapDwell({ mapApprovedAt: null, graph: baseGraph })).toEqual({
      dwellMs: null,
      firstCompletionAt: null,
    });

    expect(
      computeMapDwell({
        mapApprovedAt: "2026-07-12T10:00:00.000Z",
        graph: {
          schema_version: "1.0",
          nodes: [
            { id: "req-1", title: "Draft outline", role: "required" },
            { id: "opt-1", title: "Polish", role: "optional" },
          ],
          edges: [],
        },
      }),
    ).toEqual({ dwellMs: null, firstCompletionAt: null });
  });

  it("clamps negative dwell to zero", () => {
    expect(
      computeMapDwell({
        mapApprovedAt: "2026-07-12T10:00:00.000Z",
        graph: {
          schema_version: "1.0",
          nodes: [
            {
              id: "req-1",
              title: "Already done",
              role: "required",
              completed_at: "2026-07-12T09:59:00.000Z",
            },
          ],
          edges: [],
        },
      }),
    ).toEqual({
      dwellMs: 0,
      firstCompletionAt: "2026-07-12T09:59:00.000Z",
    });
  });
});

describe("summarizeMapProgress", () => {
  it("counts mixed roles, excludes red nodes everywhere, and honors legacy done completion", () => {
    const graph: TaskMapGraphDraft = {
      schema_version: "1.0",
      nodes: [
        {
          id: "req-1",
          title: "Timestamp complete",
          role: "required",
          completed_at: "2026-07-12T10:00:00.000Z",
        },
        {
          id: "req-2",
          title: "Legacy complete",
          role: "required",
          done: true,
        },
        { id: "req-3", title: "Remaining", role: "required" },
        { id: "opt-1", title: "Optional done", role: "optional", done: true },
        { id: "opt-2", title: "Optional remaining", role: "optional" },
        {
          id: "red-1",
          title: "Do not do",
          role: "red",
          done: true,
          completed_at: "2026-07-12T10:00:00.000Z",
          red_reason: "Known dead end.",
        },
      ],
      edges: [],
    };

    expect(summarizeMapProgress(graph)).toEqual({
      total: 5,
      completed: 3,
      requiredTotal: 3,
      requiredCompleted: 2,
      optionalTotal: 2,
      optionalCompleted: 1,
    });
  });

  it("returns zero counts for a null graph", () => {
    expect(summarizeMapProgress(null)).toEqual({
      total: 0,
      completed: 0,
      requiredTotal: 0,
      requiredCompleted: 0,
      optionalTotal: 0,
      optionalCompleted: 0,
    });
  });
});
