import type { Phase2CaptureItem, Phase2TaskDraft } from "@lifeos/schemas";
import type {
  Phase2MockCalendarBlock,
  Phase2MockDailyReviewSummary,
  Phase2MockExecutionSession,
  Phase2MockArea,
  Phase2MockHealthCheck,
  Phase2MockProject,
  Phase2MockTask,
  Phase2MockTimeBlockProposal,
  Phase2MockWeeklyReviewSummary,
} from "./types";

export const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

// R2-C (#483 round 2): colors match the retuned AREA_COLOR_PRESETS in
// lib/areaAccent.ts (Ocean/Forest/Violet/Clay) — see that file for why the
// raw Tailwind seed hues moved to a shared OKLCH lightness/chroma budget.
export const areas: Phase2MockArea[] = [
  {
    id: "area-main-job",
    user_id: MOCK_USER_ID,
    name: "Main Job",
    color: "#4c80cd",
    created_at: new Date().toISOString(),
  },
  {
    id: "area-personal",
    user_id: MOCK_USER_ID,
    name: "Personal",
    color: "#439458",
    created_at: new Date().toISOString(),
  },
  {
    id: "area-volunteer",
    user_id: MOCK_USER_ID,
    name: "Volunteer Work",
    color: "#8965ba",
    created_at: new Date().toISOString(),
  },
  {
    id: "area-side-project",
    user_id: MOCK_USER_ID,
    name: "Side Project",
    color: "#d87248",
    created_at: new Date().toISOString(),
  },
];

export const projects: Phase2MockProject[] = [
  {
    id: "proj-main-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    title: "Q2 planning doc",
    description: "Draft and circulate Q2 planning document.",
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "proj-volunteer-1",
    user_id: MOCK_USER_ID,
    area_id: "area-volunteer",
    title: "Next fundraiser event",
    description: "Prepare for upcoming volunteer fundraiser.",
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const tasks: Phase2MockTask[] = [
  {
    id: "task-main-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    title: "Review open tickets",
    description: null,
    status: "active",
    priority_score: 2,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 25,
    estimated_minutes_high: 40,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: "proj-main-1",
    source_capture_item_id: null,
  },
  {
    id: "task-personal-1",
    user_id: MOCK_USER_ID,
    area_id: "area-personal",
    title: "Book dentist appointment",
    description: null,
    status: "draft",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 10,
    estimated_minutes_high: 20,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: null,
    source_capture_item_id: null,
  },
  {
    id: "task-volunteer-1",
    user_id: MOCK_USER_ID,
    area_id: "area-volunteer",
    title: "Email sponsors about event date",
    description: null,
    status: "active",
    priority_score: 3,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 30,
    estimated_minutes_high: 60,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: "proj-volunteer-1",
    source_capture_item_id: null,
  },
];

export const timeBlockProposals: Phase2MockTimeBlockProposal[] = [
  {
    id: "proposal-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    task_id: "task-main-1",
    proposed_start: new Date().toISOString(),
    proposed_end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    rationale: "Block focused time for triaging tickets.",
    conflict_flag: false,
    status: "proposed",
    created_at: new Date().toISOString(),
  },
  {
    id: "proposal-2",
    user_id: MOCK_USER_ID,
    area_id: "area-volunteer",
    task_id: "task-volunteer-1",
    proposed_start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    proposed_end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    rationale: "Reach out to sponsors while they are likely online.",
    conflict_flag: true,
    status: "proposed",
    created_at: new Date().toISOString(),
  },
];

export const calendarBlocks: Phase2MockCalendarBlock[] = [
  {
    id: "block-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    task_id: "task-main-1",
    proposal_id: "proposal-1",
    google_event_id: null,
    start_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    end_at: new Date().toISOString(),
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const executionSessions: Phase2MockExecutionSession[] = [
  {
    id: "session-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    task_id: "task-main-1",
    calendar_block_id: "block-1",
    planned_minutes: 60,
    actual_minutes: 55,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: 4,
    status: "completed",
    outcome: "completed",
    notes: "Wrapped slightly early.",
  },
];

export const dailyReview: Phase2MockDailyReviewSummary = {
  id: "daily-1",
  date: new Date().toISOString().slice(0, 10),
  completedCount: 3,
  missedCount: 1,
  openCount: 4,
  note: "A few blocks slipped, but progress is steady.",
};

export const weeklyReview: Phase2MockWeeklyReviewSummary = {
  id: "weekly-1",
  weekOf: new Date().toISOString().slice(0, 10),
  areaSummaries: [
    {
      area_id: "area-main-job",
      backlogHealth: "steady",
      missedBlocks: 1,
      comment: "Most planned work completed as expected.",
    },
    {
      area_id: "area-personal",
      backlogHealth: "growing",
      missedBlocks: 0,
      comment: "A few small personal tasks are accumulating.",
    },
    {
      area_id: "area-volunteer",
      backlogHealth: "steady",
      missedBlocks: 1,
      comment: "Volunteer prep is on track overall.",
    },
  ],
};

export const healthChecks: Phase2MockHealthCheck[] = [
  {
    id: "health-auth",
    subsystem: "auth",
    status: "healthy",
    score: 100,
    // #692 / NFR-006: demo copy is user-facing copy. Same statuses and
    // scores as before; only the wording changed.
    summary: "Signing in works. This demo isn't linked to a real account yet.",
  },
  {
    id: "health-database",
    subsystem: "database",
    status: "watch",
    score: 75,
    summary:
      "Your work is kept on this device only. It isn't saved to an account yet.",
  },
  {
    id: "health-ai",
    subsystem: "ai_parsing",
    status: "watch",
    score: 60,
    summary:
      "The AI helper isn't turned on yet. Anything you capture is sorted with built-in rules.",
  },
  {
    id: "health-calendar",
    subsystem: "calendar_connector",
    status: "watch",
    score: 50,
    summary:
      "No calendar is connected yet, so everything you plan stays inside LifeOS.",
  },
];

export function getAreaById(
  areaId: string | null | undefined,
): Phase2MockArea | undefined {
  if (!areaId) return undefined;
  return areas.find((a) => a.id === areaId);
}

/**
 * #687 demo-seed (owner 2026-08-30) — the sample content layered onto the
 * empty initial workflow state when the app is unconfigured (no Supabase)
 * and `isDemoSeedEnabled()` (`lib/flags.ts`) is on. Every id here is prefixed
 * `demo-seed-`, which does NOT match `WORKFLOW_GENERATED_ID`
 * (`lib/workflow/shared.ts`) — a real capture/task/etc a person creates while
 * looking at the sample can never collide with, or get re-minted over, one
 * of these ids.
 *
 * Dates are computed relative to "now" (same idiom the rest of this file
 * already uses), not hardcoded calendar dates, so the sample never reads as
 * stale and pins that assert on it never flake as today's date moves on.
 */
export const DEMO_SEED_ID_PREFIX = "demo-seed-";

function demoSeedIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Two raw, unsorted captures ("new" — nothing has looked at them yet).
// One capture already parsed and waiting on a triage decision (paired with
// demoSeedTaskDrafts[0] below via capture_item_id — captureHasTriageDecision
// is what keeps a "triage_required" row out of the unsorted list, not the
// status column, so both must agree).
// One capture already sorted into an accepted, completed task ("resolved").
export const demoSeedCaptureItems: Phase2CaptureItem[] = [
  {
    id: `${DEMO_SEED_ID_PREFIX}capture-1`,
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    raw_text: "Follow up with the client about the contract redline",
    return_hook: null,
    client_capture_id: null,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: demoSeedIso(-2 * HOUR_MS),
  },
  {
    id: `${DEMO_SEED_ID_PREFIX}capture-2`,
    user_id: MOCK_USER_ID,
    area_id: "area-personal",
    raw_text: "Pick up the prescription refill",
    return_hook: null,
    client_capture_id: null,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: demoSeedIso(-5 * HOUR_MS),
  },
  {
    id: `${DEMO_SEED_ID_PREFIX}capture-3`,
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    raw_text: "Draft the Q2 planning doc outline",
    return_hook: null,
    client_capture_id: null,
    capture_mode: "text",
    inferred_area_confidence: 0.82,
    status: "triage_required",
    created_at: demoSeedIso(-1 * DAY_MS),
  },
  {
    id: `${DEMO_SEED_ID_PREFIX}capture-4`,
    user_id: MOCK_USER_ID,
    area_id: "area-volunteer",
    raw_text: "Confirm the venue for the fundraiser",
    return_hook: null,
    client_capture_id: null,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "resolved",
    created_at: demoSeedIso(-2 * DAY_MS),
  },
];

// One AI-parsed draft, still pending a triage decision — pairs with
// demoSeedCaptureItems[2] ("Draft the Q2 planning doc outline").
export const demoSeedTaskDrafts: Phase2TaskDraft[] = [
  {
    id: `${DEMO_SEED_ID_PREFIX}draft-1`,
    user_id: MOCK_USER_ID,
    capture_item_id: `${DEMO_SEED_ID_PREFIX}capture-3`,
    area_id: "area-main-job",
    title: "Draft the Q2 planning doc outline",
    description: null,
    confidence: 0.82,
    estimated_minutes_low: 20,
    estimated_minutes_high: 40,
    first_tiny_step: "Open a blank doc and list the three sections",
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: demoSeedIso(-1 * DAY_MS),
  },
];

// One planned task with a scheduled (future) time block, and one completed
// win — the task an accepted capture turned into, already done.
export const demoSeedTasks: Phase2MockTask[] = [
  {
    id: `${DEMO_SEED_ID_PREFIX}task-1`,
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    title: "Prep slides for Monday standup",
    description: null,
    status: "scheduled",
    priority_score: 2,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 30,
    estimated_minutes_high: 45,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: demoSeedIso(-3 * HOUR_MS),
    updated_at: demoSeedIso(-3 * HOUR_MS),
    project_id: null,
    source_capture_item_id: null,
  },
  {
    id: `${DEMO_SEED_ID_PREFIX}task-2`,
    user_id: MOCK_USER_ID,
    area_id: "area-volunteer",
    title: "Confirm the venue for the fundraiser",
    description: null,
    status: "done",
    priority_score: 3,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 15,
    estimated_minutes_high: 30,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: demoSeedIso(-2 * DAY_MS),
    updated_at: demoSeedIso(-1 * DAY_MS),
    project_id: "proj-volunteer-1",
    source_capture_item_id: `${DEMO_SEED_ID_PREFIX}capture-4`,
  },
];

export const demoSeedTimeBlockProposals: Phase2MockTimeBlockProposal[] = [
  {
    id: `${DEMO_SEED_ID_PREFIX}proposal-1`,
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    task_id: `${DEMO_SEED_ID_PREFIX}task-1`,
    proposed_start: demoSeedIso(3 * HOUR_MS),
    proposed_end: demoSeedIso(3 * HOUR_MS + 45 * 60 * 1000),
    rationale: "Block focused time before the Monday standup.",
    conflict_flag: false,
    status: "accepted",
    created_at: demoSeedIso(-3 * HOUR_MS),
  },
];

export const demoSeedCalendarBlocks: Phase2MockCalendarBlock[] = [
  {
    id: `${DEMO_SEED_ID_PREFIX}block-1`,
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    task_id: `${DEMO_SEED_ID_PREFIX}task-1`,
    proposal_id: `${DEMO_SEED_ID_PREFIX}proposal-1`,
    google_event_id: null,
    start_at: demoSeedIso(3 * HOUR_MS),
    end_at: demoSeedIso(3 * HOUR_MS + 45 * 60 * 1000),
    status: "scheduled",
    created_at: demoSeedIso(-3 * HOUR_MS),
    updated_at: demoSeedIso(-3 * HOUR_MS),
  },
];

// One closed daily review, so the Review moment has something on the log
// besides "nothing yet".
export const demoSeedReviewLog: string[] = [
  `Review saved: ${demoSeedIso(-1 * DAY_MS)}`,
];

/** True when any row in `state` came from the demo seed above. */
export function hasDemoSeedId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DEMO_SEED_ID_PREFIX);
}
