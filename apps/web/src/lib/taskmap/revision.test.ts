import type { DurationProfile } from "@lifeos/schemas";
import { describe, expect, it } from "vitest";

import type { TaskMapGraph } from "./graph";
import {
  buildRevisionEvidence,
  CLOSE_REVISION_OFFER_LIMIT,
  diffTaskMaps,
  DURATION_DRIFT_MULTIPLE,
  evidenceFingerprint,
  mostActiveMapTaskId,
  REVISION_OFFER_DAILY_CAP,
  revisionEligibility,
  shouldOfferRevision,
  type RevisionEvidence,
  type RevisionEvidenceSession,
} from "./revision";
import {
  readRevisionOfferRecord,
  recordRevisionOfferDismissed,
  recordRevisionOfferShown,
  REVISION_OFFER_STORE_KEY,
  type MinimalStringStorage,
} from "./revisionOfferStore";

const TODAY = "2026-07-18";

function linearGraph(): TaskMapGraph {
  return {
    nodes: [
      { id: "a", title: "First", role: "required" },
      { id: "b", title: "Second", role: "required" },
      { id: "c", title: "Third", role: "required" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  };
}

function session(
  overrides: Partial<RevisionEvidenceSession> = {},
): RevisionEvidenceSession {
  return {
    plannedMinutes: 30,
    actualMinutes: 30,
    expectedMinutes: 30,
    outcome: "completed",
    capOutcome: null,
    ...overrides,
  };
}

const NO_EVIDENCE: RevisionEvidence = { sessions: [] };

describe("revisionEligibility", () => {
  it("returns not eligible with zero signals for a clean graph and no evidence", () => {
    const result = revisionEligibility(linearGraph(), NO_EVIDENCE);
    expect(result.eligible).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("fails closed (not eligible) for a structurally invalid graph even with strong evidence", () => {
    const invalid: TaskMapGraph = {
      nodes: [{ id: "a", title: "A", role: "required" }],
      edges: [{ from: "a", to: "missing" }],
    };
    const result = revisionEligibility(invalid, {
      sessions: [session({ capOutcome: "cut_scope", outcome: "blocked" })],
    });
    expect(result.eligible).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("flags out-of-critical-path-order completion with the completed node's id", () => {
    const graph = linearGraph();
    graph.nodes[2] = {
      ...graph.nodes[2]!,
      completed_at: "2026-07-18T09:00:00.000Z",
    };
    const result = revisionEligibility(graph, NO_EVIDENCE);
    expect(result.eligible).toBe(true);
    expect(result.signals).toEqual([
      {
        kind: "out_of_order_completion",
        nodeId: "c",
        detail: expect.stringContaining("Third"),
      },
    ]);
  });

  it("does NOT flag in-order completion (head done, rest pending)", () => {
    const graph = linearGraph();
    graph.nodes[0] = { ...graph.nodes[0]!, done: true };
    expect(revisionEligibility(graph, NO_EVIDENCE).eligible).toBe(false);
  });

  it("does NOT flag a fully completed critical path", () => {
    const graph = linearGraph();
    graph.nodes = graph.nodes.map((node) => ({ ...node, done: true }));
    expect(revisionEligibility(graph, NO_EVIDENCE).eligible).toBe(false);
  });

  it(`flags duration drift at exactly ${DURATION_DRIFT_MULTIPLE}x expected`, () => {
    const result = revisionEligibility(linearGraph(), {
      sessions: [session({ expectedMinutes: 30, actualMinutes: 60 })],
    });
    expect(result.eligible).toBe(true);
    expect(result.signals.map((signal) => signal.kind)).toEqual([
      "duration_drift",
    ]);
  });

  it("does not flag drift just under the multiple", () => {
    const result = revisionEligibility(linearGraph(), {
      sessions: [session({ expectedMinutes: 30, actualMinutes: 59 })],
    });
    expect(result.eligible).toBe(false);
  });

  it("falls back to plannedMinutes when expectedMinutes is absent", () => {
    const result = revisionEligibility(linearGraph(), {
      sessions: [
        session({
          expectedMinutes: null,
          plannedMinutes: 20,
          actualMinutes: 40,
        }),
      ],
    });
    expect(result.signals.map((signal) => signal.kind)).toEqual([
      "duration_drift",
    ]);
  });

  it("never fabricates drift from missing/zero expectations", () => {
    for (const expected of [null, 0, -5, Number.NaN]) {
      const result = revisionEligibility(linearGraph(), {
        sessions: [
          session({
            expectedMinutes: expected,
            plannedMinutes: expected,
            actualMinutes: 500,
          }),
        ],
      });
      expect(result.eligible).toBe(false);
    }
  });

  it("flags a cut-scope cap outcome once regardless of session count", () => {
    const result = revisionEligibility(linearGraph(), {
      sessions: [
        session({ capOutcome: "cut_scope" }),
        session({ capOutcome: "cut_scope" }),
      ],
    });
    expect(result.signals.map((signal) => signal.kind)).toEqual(["cut_scope"]);
  });

  it("flags a blocked session outcome", () => {
    const result = revisionEligibility(linearGraph(), {
      sessions: [session({ outcome: "blocked" })],
    });
    expect(result.signals.map((signal) => signal.kind)).toEqual(["blocker"]);
  });

  it("a deferred cap outcome alone is not a signal", () => {
    const result = revisionEligibility(linearGraph(), {
      sessions: [session({ capOutcome: "deferred" })],
    });
    expect(result.eligible).toBe(false);
  });

  it("combines independent signals in fixed kind order", () => {
    const graph = linearGraph();
    graph.nodes[2] = { ...graph.nodes[2]!, done: true };
    const result = revisionEligibility(graph, {
      sessions: [
        session({ expectedMinutes: 10, actualMinutes: 25 }),
        session({ capOutcome: "cut_scope", outcome: "blocked" }),
      ],
    });
    expect(result.signals.map((signal) => signal.kind)).toEqual([
      "out_of_order_completion",
      "duration_drift",
      "cut_scope",
      "blocker",
    ]);
  });
});

describe("buildRevisionEvidence", () => {
  const profile: DurationProfile = {
    id: "profile-1",
    user_id: "user-1",
    area_id: "area-1",
    task_type: "__area__",
    estimate_stats_json: {
      multiplier: 2,
      sample_count: 8,
      last_updated: "2026-07-01T00:00:00.000Z",
    },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  } as DurationProfile;

  it("adjusts expected minutes through a matching duration profile", () => {
    const evidence = buildRevisionEvidence(
      [
        {
          planned_minutes: 30,
          actual_minutes: 70,
          outcome: "completed",
        },
      ],
      [profile],
      "area-1",
    );
    expect(evidence.sessions[0]?.expectedMinutes).toBe(60);
  });

  it("falls back to the planned estimate when no profile matches", () => {
    const evidence = buildRevisionEvidence(
      [{ planned_minutes: 30, actual_minutes: 70, outcome: "completed" }],
      [profile],
      "other-area",
    );
    expect(evidence.sessions[0]?.expectedMinutes).toBe(30);
  });

  it("keeps null planned estimates as no expectation", () => {
    const evidence = buildRevisionEvidence(
      [{ planned_minutes: null, actual_minutes: 70, outcome: "completed" }],
      [profile],
      "area-1",
    );
    expect(evidence.sessions[0]?.expectedMinutes).toBeNull();
  });
});

describe("evidenceFingerprint", () => {
  it("is order-insensitive and ignores detail wording", () => {
    const left = evidenceFingerprint([
      { kind: "cut_scope", detail: "one wording" },
      { kind: "out_of_order_completion", nodeId: "c", detail: "x" },
    ]);
    const right = evidenceFingerprint([
      { kind: "out_of_order_completion", nodeId: "c", detail: "different" },
      { kind: "cut_scope", detail: "another wording" },
    ]);
    expect(left).toBe(right);
  });

  it("distinguishes different node ids and kinds", () => {
    const a = evidenceFingerprint([
      { kind: "out_of_order_completion", nodeId: "c", detail: "" },
    ]);
    const b = evidenceFingerprint([
      { kind: "out_of_order_completion", nodeId: "d", detail: "" },
    ]);
    const c = evidenceFingerprint([{ kind: "blocker", detail: "" }]);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("shouldOfferRevision", () => {
  const eligible = {
    eligible: true,
    signals: [
      { kind: "cut_scope" as const, detail: "Scope was cut during execution." },
    ],
  };

  it("never offers without a signal", () => {
    expect(
      shouldOfferRevision({
        eligibility: { eligible: false, signals: [] },
        todayIsoDate: TODAY,
        record: null,
      }),
    ).toBe(false);
  });

  it("offers on signals with no prior record", () => {
    expect(
      shouldOfferRevision({
        eligibility: eligible,
        todayIsoDate: TODAY,
        record: null,
      }),
    ).toBe(true);
  });

  it(`caps at ${REVISION_OFFER_DAILY_CAP} offer per task per day`, () => {
    expect(
      shouldOfferRevision({
        eligibility: eligible,
        todayIsoDate: TODAY,
        record: { lastOfferedDate: TODAY },
      }),
    ).toBe(false);
  });

  it("offers again on a new calendar day", () => {
    expect(
      shouldOfferRevision({
        eligibility: eligible,
        todayIsoDate: "2026-07-19",
        record: { lastOfferedDate: TODAY },
      }),
    ).toBe(true);
  });

  it("suppresses a dismissed fingerprint until the evidence changes", () => {
    const dismissed = evidenceFingerprint(eligible.signals);
    expect(
      shouldOfferRevision({
        eligibility: eligible,
        todayIsoDate: "2026-07-19",
        record: { dismissedFingerprint: dismissed },
      }),
    ).toBe(false);

    const newEvidence = {
      eligible: true,
      signals: [...eligible.signals, { kind: "blocker" as const, detail: "" }],
    };
    expect(
      shouldOfferRevision({
        eligibility: newEvidence,
        todayIsoDate: "2026-07-19",
        record: { dismissedFingerprint: dismissed },
      }),
    ).toBe(true);
  });

  it("keeps the Close offer cap owner-gate constant at the recommended default", () => {
    expect(CLOSE_REVISION_OFFER_LIMIT).toBe(1);
  });
});

describe("diffTaskMaps", () => {
  const current: TaskMapGraph = {
    nodes: [
      {
        id: "a",
        title: "First",
        role: "required",
        done: true,
        completed_at: "2026-07-18T09:00:00.000Z",
        two_minute_move: true,
      },
      { id: "b", title: "Second", role: "required", estimated_minutes: 30 },
      { id: "opt", title: "Extra", role: "optional" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "opt" },
    ],
  };

  it("classifies added, removed, changed, and unchanged nodes plus edge changes", () => {
    const candidate: TaskMapGraph = {
      nodes: [
        { id: "a", title: "First", role: "required", two_minute_move: true },
        { id: "b", title: "Second pass", role: "required" },
        { id: "new", title: "Brand new", role: "required" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "new" },
      ],
    };
    const diff = diffTaskMaps(current, candidate);
    expect(diff.addedNodes.map((node) => node.id)).toEqual(["new"]);
    expect(diff.removedNodes.map((node) => node.id)).toEqual(["opt"]);
    expect(diff.changedNodes.map((change) => change.after.id)).toEqual(["b"]);
    expect(diff.unchangedNodeIds).toEqual(["a"]);
    expect(diff.addedEdges).toEqual([{ from: "b", to: "new" }]);
    expect(diff.removedEdges).toEqual([{ from: "b", to: "opt" }]);
    expect(diff.identical).toBe(false);
  });

  it("treats completion-state-only differences as identical (carry-forward territory)", () => {
    const candidate: TaskMapGraph = {
      nodes: [
        { id: "a", title: "First", role: "required", two_minute_move: true },
        { id: "b", title: "Second", role: "required", estimated_minutes: 30 },
        { id: "opt", title: "Extra", role: "optional" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "opt" },
      ],
    };
    const diff = diffTaskMaps(current, candidate);
    expect(diff.identical).toBe(true);
    expect(diff.unchangedNodeIds).toEqual(["a", "b", "opt"]);
  });

  it("flags a two_minute_move reassignment and an estimate change as changes", () => {
    const candidate: TaskMapGraph = {
      nodes: [
        { id: "a", title: "First", role: "required" },
        {
          id: "b",
          title: "Second",
          role: "required",
          estimated_minutes: 45,
          two_minute_move: true,
        },
        { id: "opt", title: "Extra", role: "optional" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "opt" },
      ],
    };
    const diff = diffTaskMaps(current, candidate);
    expect(diff.changedNodes.map((change) => change.after.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("flags a role change (e.g. optional -> red) as a change", () => {
    const candidate: TaskMapGraph = {
      nodes: [
        { id: "a", title: "First", role: "required", two_minute_move: true },
        { id: "b", title: "Second", role: "required", estimated_minutes: 30 },
        { id: "opt", title: "Extra", role: "red", red_reason: "Dead end" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const diff = diffTaskMaps(current, candidate);
    expect(diff.changedNodes.map((change) => change.after.id)).toEqual(["opt"]);
    expect(diff.removedEdges).toEqual([{ from: "b", to: "opt" }]);
  });
});

describe("mostActiveMapTaskId", () => {
  const graphWithCompletion = (completedAt: string | null): TaskMapGraph => ({
    nodes: [
      {
        id: "a",
        title: "First",
        role: "required",
        ...(completedAt ? { done: true, completed_at: completedAt } : {}),
      },
    ],
    edges: [],
  });

  it("returns null for no candidates or zero activity today", () => {
    expect(mostActiveMapTaskId([], TODAY)).toBeNull();
    expect(
      mostActiveMapTaskId(
        [
          {
            taskId: "t1",
            graph: graphWithCompletion("2026-07-01T08:00:00.000Z"),
            blocksTodayCount: 0,
          },
        ],
        TODAY,
      ),
    ).toBeNull();
  });

  it("ranks by nodes completed today, then blocks today, then task id", () => {
    const candidates = [
      {
        taskId: "t-b",
        graph: graphWithCompletion(`${TODAY}T10:00:00.000Z`),
        blocksTodayCount: 0,
      },
      {
        taskId: "t-a",
        graph: graphWithCompletion(null),
        blocksTodayCount: 3,
      },
    ];
    expect(mostActiveMapTaskId(candidates, TODAY)).toBe("t-b");

    const tie = [
      {
        taskId: "t-b",
        graph: graphWithCompletion(`${TODAY}T10:00:00.000Z`),
        blocksTodayCount: 1,
      },
      {
        taskId: "t-a",
        graph: graphWithCompletion(`${TODAY}T11:00:00.000Z`),
        blocksTodayCount: 1,
      },
    ];
    expect(mostActiveMapTaskId(tie, TODAY)).toBe("t-a");
  });
});

describe("revisionOfferStore", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const backing = new Map(Object.entries(initial));
    const storage: MinimalStringStorage = {
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => {
        backing.set(key, value);
      },
    };
    return { storage, backing };
  }

  it("round-trips shown and dismissed records per task", () => {
    const { storage } = memoryStorage();
    expect(readRevisionOfferRecord(storage, "t1")).toBeNull();

    recordRevisionOfferShown(storage, "t1", TODAY);
    expect(readRevisionOfferRecord(storage, "t1")).toEqual({
      lastOfferedDate: TODAY,
      dismissedFingerprint: null,
    });

    recordRevisionOfferDismissed(storage, "t1", "cut_scope:-");
    expect(readRevisionOfferRecord(storage, "t1")).toEqual({
      lastOfferedDate: TODAY,
      dismissedFingerprint: "cut_scope:-",
    });
    expect(readRevisionOfferRecord(storage, "t2")).toBeNull();
  });

  it("fails safe on a null storage and on corrupt JSON", () => {
    expect(readRevisionOfferRecord(null, "t1")).toBeNull();
    expect(() => recordRevisionOfferShown(null, "t1", TODAY)).not.toThrow();

    const { storage } = memoryStorage({
      [REVISION_OFFER_STORE_KEY]: "{not json",
    });
    expect(readRevisionOfferRecord(storage, "t1")).toBeNull();
    recordRevisionOfferShown(storage, "t1", TODAY);
    expect(readRevisionOfferRecord(storage, "t1")).toEqual({
      lastOfferedDate: TODAY,
      dismissedFingerprint: null,
    });
  });
});
