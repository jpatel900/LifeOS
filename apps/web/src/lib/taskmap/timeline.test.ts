import { describe, expect, it } from "vitest";
import type { DurationProfile } from "@lifeos/schemas";

import type { TaskMapGraph } from "./graph";
import {
  computeTaskMapTimeline,
  estimateEtaIso,
  resolveNodeDuration,
} from "./timeline";

const required = (id: string, estimated_minutes?: number, done = false) => ({
  id,
  title: id,
  role: "required" as const,
  ...(estimated_minutes !== undefined ? { estimated_minutes } : {}),
  ...(done ? { done: true, completed_at: "2026-07-01T00:00:00.000Z" } : {}),
});
const optional = (id: string, estimated_minutes?: number) => ({
  id,
  title: id,
  role: "optional" as const,
  ...(estimated_minutes !== undefined ? { estimated_minutes } : {}),
});
const red = (id: string) => ({
  id,
  title: id,
  role: "red" as const,
  red_reason: "Known dead end",
});

const NOW = new Date("2026-07-17T09:00:00.000Z");

const profile = (multiplier: number): DurationProfile => ({
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  area_id: "33333333-3333-3333-3333-333333333333",
  task_type: "__area__",
  estimate_stats_json: { multiplier, sample_count: 5 },
  sample_count: 5,
  last_updated_at: "2026-07-01T00:00:00.000Z",
});

describe("resolveNodeDuration", () => {
  it("resolves 'none' when the node has no estimate", () => {
    const result = resolveNodeDuration(required("a"), [], null);
    expect(result).toEqual({ minutes: 0, source: "none" });
  });

  it("resolves the raw AI estimate when no matching profile exists", () => {
    const result = resolveNodeDuration(required("a", 30), [], "area-1");
    expect(result).toEqual({ minutes: 30, source: "ai_estimate" });
  });

  it("resolves the profile-adjusted minutes when a matching area profile exists", () => {
    const areaId = "33333333-3333-3333-3333-333333333333";
    const result = resolveNodeDuration(
      required("a", 30),
      [profile(1.5)],
      areaId,
    );
    expect(result).toEqual({ minutes: 45, source: "learned_profile" });
  });

  it("does not apply a profile from a different area", () => {
    const result = resolveNodeDuration(
      required("a", 30),
      [profile(1.5)],
      "some-other-area",
    );
    expect(result).toEqual({ minutes: 30, source: "ai_estimate" });
  });

  it("does not fabricate minutes from a profile when the node has no AI estimate", () => {
    const areaId = "33333333-3333-3333-3333-333333333333";
    const result = resolveNodeDuration(required("a"), [profile(1.5)], areaId);
    expect(result).toEqual({ minutes: 0, source: "none" });
  });
});

describe("computeTaskMapTimeline", () => {
  it("fails closed to 'no estimate' on a malformed/invalid graph", () => {
    const graph: TaskMapGraph = {
      nodes: [required("a"), required("a")], // duplicate id -> invalid
      edges: [],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    expect(result).toEqual({
      criticalPath: [],
      totalMinutes: 0,
      remainingMinutes: 0,
      partial: true,
      etaIso: null,
    });
  });

  it("returns an empty, non-partial timeline when there are no required nodes", () => {
    const graph: TaskMapGraph = {
      nodes: [optional("a", 30)],
      edges: [],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    expect(result.criticalPath).toEqual([]);
    expect(result.totalMinutes).toBe(0);
    expect(result.partial).toBe(false);
    expect(result.etaIso).toBe(NOW.toISOString());
  });

  it("sums a simple linear chain and computes the ETA from the supplied start time", () => {
    const graph: TaskMapGraph = {
      nodes: [required("a", 10), required("b", 20), required("c", 5)],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    expect(result.criticalPath).toEqual(["a", "b", "c"]);
    expect(result.totalMinutes).toBe(35);
    expect(result.remainingMinutes).toBe(35);
    expect(result.partial).toBe(false);
    expect(result.etaIso).toBe(
      new Date(NOW.getTime() + 35 * 60 * 1000).toISOString(),
    );
  });

  it("excludes already-completed nodes from the remaining/ETA estimate but keeps them in totalMinutes", () => {
    const graph: TaskMapGraph = {
      nodes: [required("a", 10, true), required("b", 20), required("c", 5)],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    expect(result.totalMinutes).toBe(35);
    expect(result.remainingMinutes).toBe(25);
    expect(result.etaIso).toBe(
      new Date(NOW.getTime() + 25 * 60 * 1000).toISOString(),
    );
  });

  it("flags partial when a node contributing to the chosen path has no resolvable duration", () => {
    const graph: TaskMapGraph = {
      nodes: [required("a", 10), required("b"), required("c", 5)],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    expect(result.totalMinutes).toBe(15);
    expect(result.partial).toBe(true);
  });

  it("diverges from hop-count: a short-hop high-minute path beats a long-hop low-minute path", () => {
    // Diamond: a forks into b (short, low-minute) and c (long chain, low total)
    // vs the high-minute single hop d, all merging at e. Duration-weighted
    // critical path must pick the branch with the larger summed minutes even
    // though it is not the branch with the most hops.
    const graph: TaskMapGraph = {
      nodes: [
        required("a", 1),
        required("b", 1), // a -> b -> e: 1 + 1 + 1(a) + 1(e) = short hop, low minutes
        required("c1", 1),
        required("c2", 1),
        required("c3", 1), // a -> c1 -> c2 -> c3 -> e: more hops, still low minutes
        required("d", 50), // a -> d -> e: single hop, very high minutes
        required("e", 1),
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "e" },
        { from: "a", to: "c1" },
        { from: "c1", to: "c2" },
        { from: "c2", to: "c3" },
        { from: "c3", to: "e" },
        { from: "a", to: "d" },
        { from: "d", to: "e" },
      ],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    // Duration-weighted: a(1) + d(50) + e(1) = 52, beats the b-branch (3) and
    // the c-branch (5) despite having fewer hops than the c-branch.
    expect(result.criticalPath).toEqual(["a", "d", "e"]);
    expect(result.totalMinutes).toBe(52);
  });

  it("never routes the weighted path through a red node", () => {
    const graph: TaskMapGraph = {
      nodes: [required("a", 1), required("b", 1), red("r")],
      edges: [{ from: "a", to: "b" }],
    };

    const result = computeTaskMapTimeline(
      graph,
      (node) => resolveNodeDuration(node, [], null),
      NOW,
    );

    expect(result.criticalPath).toEqual(["a", "b"]);
  });
});

describe("estimateEtaIso", () => {
  it("adds whole minutes to the supplied start time", () => {
    expect(estimateEtaIso(NOW, 90)).toBe(
      new Date(NOW.getTime() + 90 * 60 * 1000).toISOString(),
    );
  });

  it("returns the start time unchanged for zero minutes", () => {
    expect(estimateEtaIso(NOW, 0)).toBe(NOW.toISOString());
  });
});
