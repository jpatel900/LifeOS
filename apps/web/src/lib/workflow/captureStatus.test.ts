import { describe, expect, it } from "vitest";
import type { Phase2CaptureItem, Phase2TaskDraft } from "@lifeos/schemas";
import type { Phase2MockArea, Phase2MockTask } from "@/lib/types";
import { workflowSeed } from "@/__tests__/helpers/workflowReachability";
import { buildPipelineCounts } from "@/app/components/moments/pipelineCounts";
import { buildStartVM } from "@/app/components/moments/momentsViewModel/start";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { buildWhileYouWereOutSummary } from "@/lib/reEntry/summary";
import {
  captureHasTriageDecision,
  countUnsortedCaptures,
  selectUnsortedCaptures,
} from "./captureStatus";

/**
 * Final UX Loop C1 — Target Card 4: "one item = one truth: never
 * simultaneously 'unsorted' and an accepted task ANYWHERE in the app."
 *
 * ## The state under test is the one a fresh session actually produced
 *
 * Audit P0#3 (`docs/design/ux-audit-2026-07-26-fable.md`): after sort +
 * accept, `capture_items.status` stayed `"new"`; task drafts are device-local
 * and do not survive a new session; `tasks.source_capture_item_id` points back
 * at the capture. A fresh session rehydrating from Supabase therefore holds
 * exactly `RESURRECTED_STATE` below — and every surface read it as unsorted,
 * offering the user work they had already decided.
 *
 * The fix has two halves. `resolveCaptureItems` (proved at the account tier in
 * `__tests__/phase4aRls.local.test.ts`) stops NEW work from ever reaching this
 * shape. This file pins the other half: even holding a stale status, no
 * surface may offer the thought back as undone. That is what makes the
 * invariant hold for rows written BEFORE the fix, without migrating anyone's
 * data.
 *
 * Red-first on `origin/main` @ 6cc76ade: every assertion against
 * `RESURRECTED_STATE` fails there, because each surface filtered on the
 * capture's status alone.
 */

const YESTERDAY = "2026-07-04T09:00:00.000Z";
/** Strictly older than everything else, so "the stalest thing" is unambiguous. */
const LAST_WEEK = "2026-06-28T09:00:00.000Z";
const NOW = new Date("2026-07-05T12:00:00.000Z");
const ABSENCE = {
  absent: true,
  absenceDays: 1,
  lastActivityAt: YESTERDAY,
} as const;

function makeArea(
  overrides: Partial<Phase2MockArea> & { id: string },
): Phase2MockArea {
  return {
    user_id: "user-1",
    name: `Area ${overrides.id}`,
    color: "#000000",
    created_at: YESTERDAY,
    ...overrides,
  };
}

function makeCapture(
  overrides: Partial<Phase2CaptureItem> & { id: string },
): Phase2CaptureItem {
  return {
    user_id: "user-1",
    area_id: "area-1",
    raw_text: "Call the accountant about the quarterly filing",
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: YESTERDAY,
    ...overrides,
  };
}

function makeTask(
  overrides: Partial<Phase2MockTask> & { id: string; title: string },
): Phase2MockTask {
  return {
    user_id: "user-1",
    area_id: "area-1",
    project_id: null,
    source_capture_item_id: null,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
    ...overrides,
  } as Phase2MockTask;
}

function makeDraft(
  overrides: Partial<Phase2TaskDraft> & { id: string },
): Phase2TaskDraft {
  return {
    user_id: "user-1",
    capture_item_id: "capture-1",
    area_id: "area-1",
    title: "Draft task",
    description: null,
    confidence: 0.8,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    first_tiny_step: null,
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: YESTERDAY,
    ...overrides,
  };
}

function stateWith(
  partial: Partial<ReturnType<typeof workflowSeed>>,
): ReturnType<typeof workflowSeed> {
  return {
    ...workflowSeed(),
    areas: [makeArea({ id: "area-1" })],
    captureItems: [],
    taskDrafts: [],
    tasks: [],
    projects: [],
    projectDrafts: [],
    timeBlockProposals: [],
    timeBlockProposalDrafts: [],
    calendarBlocks: [],
    executionSessions: [],
    ...partial,
  };
}

/** Exactly what a fresh session held after the audit's capture→sort→accept run. */
const RESURRECTED_STATE = stateWith({
  captureItems: [
    makeCapture({ id: "capture-1", status: "new", created_at: LAST_WEEK }),
  ],
  taskDrafts: [],
  tasks: [
    makeTask({
      id: "task-1",
      title: "Call the accountant about the quarterly filing",
      source_capture_item_id: "capture-1",
      status: "active",
    }),
  ],
});

/** One genuinely undecided thought — nothing sorted, nothing accepted. */
const GENUINELY_UNSORTED_STATE = stateWith({
  captureItems: [makeCapture({ id: "capture-9", status: "new" })],
});

/**
 * Every derivation in the app that answers "is this thought still unsorted?".
 *
 * A new surface answering that question must be added here, or this guard
 * silently stops covering it. Each entry returns the number of thoughts that
 * surface presents as not yet sorted.
 */
const UNSORTED_SURFACES: ReadonlyArray<{
  name: string;
  count: (state: ReturnType<typeof workflowSeed>) => number;
}> = [
  {
    name: "UnsortedCaptures rows (moments TriageSheet + cockpit TriageView)",
    count: (state) => selectUnsortedCaptures(state, null).length,
  },
  {
    name: "TriageSheet empty-state count",
    count: (state) => countUnsortedCaptures(state, "area-1"),
  },
  {
    name: "Pipeline Capture badge",
    count: (state) =>
      buildPipelineCounts(state, "area-1", { now: NOW }).capture,
  },
  {
    // C2-S2 / FINDING 4 of the C2-S1 capability inventory (#687): the legacy
    // `/calendar` masthead's "N Capture" chip filtered `state.captureItems`
    // by AREA ONLY — no status filter, no triage-decision check — so it
    // counted resolved, archived and composted thoughts as still waiting.
    // It is the same question every row above answers, so it belongs in the
    // same table: the port must not carry a second answer onto the moments
    // surface.
    name: "Cockpit masthead Capture chip",
    count: (state) =>
      buildCockpitViewModel(state, "area-1", true, { now: NOW }).counts.capture,
  },
  {
    name: "Start hero — 'N thoughts waiting for a decision.'",
    count: (state) => buildStartVM(state, { now: NOW }).counts.pendingTriage,
  },
  {
    name: "Re-entry ritual — 'N waiting for triage'",
    count: (state) =>
      buildWhileYouWereOutSummary({ state, absence: ABSENCE, now: NOW }).counts
        .pendingTriage,
  },
];

describe("captureHasTriageDecision", () => {
  it("is true once a task points back at the capture", () => {
    expect(captureHasTriageDecision(RESURRECTED_STATE, "capture-1")).toBe(true);
  });

  it("is true while a draft points at the capture (sorted, awaiting a decision)", () => {
    const sorted = stateWith({
      captureItems: [
        makeCapture({ id: "capture-1", status: "triage_required" }),
      ],
      taskDrafts: [makeDraft({ id: "draft-1", capture_item_id: "capture-1" })],
    });
    expect(captureHasTriageDecision(sorted, "capture-1")).toBe(true);
  });

  it("is false for a thought nothing has been decided about", () => {
    expect(
      captureHasTriageDecision(GENUINELY_UNSORTED_STATE, "capture-9"),
    ).toBe(false);
  });
});

describe("one item = one truth (C1 Target Card 4)", () => {
  it.each(UNSORTED_SURFACES.map((surface) => [surface.name, surface] as const))(
    "%s never offers back a thought an accepted task already came from",
    (_name, surface) => {
      expect(surface.count(RESURRECTED_STATE)).toBe(0);
    },
  );

  it.each(UNSORTED_SURFACES.map((surface) => [surface.name, surface] as const))(
    "%s still counts a thought that genuinely is unsorted",
    (_name, surface) => {
      expect(surface.count(GENUINELY_UNSORTED_STATE)).toBe(1);
    },
  );

  it("holds for a backlogged accept too, not just an active one", () => {
    const backlogged = stateWith({
      captureItems: [makeCapture({ id: "capture-1", status: "new" })],
      tasks: [
        makeTask({
          id: "task-1",
          title: "Write the volunteer rota for next weekend",
          source_capture_item_id: "capture-1",
          status: "backlog",
        }),
      ],
    });
    for (const surface of UNSORTED_SURFACES) {
      expect(surface.count(backlogged), surface.name).toBe(0);
    }
  });

  it("holds when the stale status is 'triage_required' rather than 'new'", () => {
    // A capture sorted in an earlier session (status advanced locally, draft
    // long gone) and then accepted is the same lie in a different column value.
    const staleTriageRequired = stateWith({
      captureItems: [
        makeCapture({ id: "capture-1", status: "triage_required" }),
      ],
      tasks: [
        makeTask({
          id: "task-1",
          title: "Call the accountant about the quarterly filing",
          source_capture_item_id: "capture-1",
        }),
      ],
    });
    for (const surface of UNSORTED_SURFACES) {
      expect(surface.count(staleTriageRequired), surface.name).toBe(0);
    }
  });

  it("never names a decided thought as the oldest thing waiting", () => {
    // D-8 (#483) promotes the oldest pending capture BY NAME into the Start
    // hero when there is no first move. In the resurrected state that name is
    // a task the user already accepted.
    expect(
      buildStartVM(RESURRECTED_STATE, { now: NOW }).topPendingTriageItem,
    ).toBeNull();
  });

  it("never names a decided thought as the stalest item in the return ritual", () => {
    const summary = buildWhileYouWereOutSummary({
      state: RESURRECTED_STATE,
      absence: ABSENCE,
      now: NOW,
    });
    // The capture is the oldest row in state by a week, so on main it won the
    // "one stalest thing" slot outright — and named work already accepted.
    expect(summary.stalest).not.toBeNull();
    expect(summary.stalest?.kind).toBe("task");
  });

  it("stops flagging the area as needing attention once nothing is really waiting", () => {
    // buildAreaHealth returns "watch" whenever any capture in the area reads
    // unsorted. One open task, no blocks today, nothing waiting on a person:
    // the only thing that could raise it is the resurrected capture.
    const area = buildStartVM(RESURRECTED_STATE, { now: NOW }).areas.find(
      (candidate) => candidate.id === "area-1",
    );
    expect(area?.status).toBe("ok");
  });
});
