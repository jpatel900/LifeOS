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
 * Independent verifier round 1 (#687): the original version of this module
 * built its arrays ONCE, at module-import time (top-level `const`s calling
 * `new Date()`). That freezes every timestamp at whatever moment the server
 * process happened to load this file — stale for the lifetime of that
 * process, not "now" for the visitor actually looking at it — and a fixed
 * `+3h` offset silently crosses local midnight for anyone loading the app
 * after roughly 21:00, landing the "planned task" outside today's calendar
 * day (`Close`/`Plan` read `isSameCalendarDay`, so it would vanish from
 * "today"). Every builder below is now a FUNCTION, called fresh each time
 * `createSeededDemoWorkflowState()` runs (`lib/workflow/shared.ts` — once
 * per render, including every SSR request), and the one time-of-day
 * offset (`demoSeedLaterTodayIso`) clamps to a fixed ceiling before local
 * midnight instead of drifting past it.
 */
const DEMO_SEED_ID_PREFIX = "demo-seed-";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function demoSeedIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/**
 * A point in time `minutesFromNow` from now, guaranteed to stay on TODAY's
 * local calendar day (never crosses midnight into tomorrow) and always
 * strictly after `now`. Clamps to 23:55 local time when the naive offset
 * would land tomorrow; in the rare case `now` itself is already past that
 * ceiling, falls back to one minute from now (still today, still future).
 */
function demoSeedLaterTodayDate(minutesFromNow: number): Date {
  const now = new Date();
  const requested = new Date(now.getTime() + minutesFromNow * 60_000);
  const ceiling = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    55,
    0,
    0,
  );
  const candidate =
    requested.getTime() <= ceiling.getTime() ? requested : ceiling;
  return candidate.getTime() > now.getTime()
    ? candidate
    : new Date(now.getTime() + 60_000);
}

/**
 * The mirror image of `demoSeedLaterTodayDate`, for a point in the PAST
 * that must still land on TODAY's local calendar day — a completed block or
 * session "a couple of hours ago" wrongly lands on YESTERDAY whenever the
 * app is opened early enough in the local morning (within `minutesAgo` of
 * midnight). Found by the demo suite itself flaking right after a real
 * local-midnight rollover (`buildCloseVM`'s `completedToday`, which reads
 * `isSameCalendarDay`, went from 1 to 0) — the same class of bug
 * `demoSeedLaterTodayDate` already fixes in the other direction. Clamps to
 * 00:05 local time (floor) when the naive offset would land yesterday; in
 * the vanishingly rare case `now` itself is before that floor, falls back
 * to one minute ago (still today, still in the past).
 */
function demoSeedEarlierTodayDate(minutesAgo: number): Date {
  const now = new Date();
  const requested = new Date(now.getTime() - minutesAgo * 60_000);
  const floor = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    5,
    0,
    0,
  );
  const candidate = requested.getTime() >= floor.getTime() ? requested : floor;
  return candidate.getTime() < now.getTime()
    ? candidate
    : new Date(now.getTime() - 60_000);
}

// Two raw, unsorted captures ("new" — nothing has looked at them yet).
// One capture already parsed and waiting on a triage decision (paired with
// demoSeedTaskDrafts[0] below via capture_item_id — captureHasTriageDecision
// is what keeps a "triage_required" row out of the unsorted list, not the
// status column, so both must agree).
// One capture already sorted into an accepted, completed task ("resolved").
export function buildDemoSeedCaptureItems(): Phase2CaptureItem[] {
  return [
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
}

// One AI-parsed draft, still pending a triage decision — pairs with
// buildDemoSeedCaptureItems()[2] ("Draft the Q2 planning doc outline").
export function buildDemoSeedTaskDrafts(): Phase2TaskDraft[] {
  return [
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
}

// One planned task with a scheduled (later-today) time block, and one
// completed win — the task an accepted capture turned into, already done
// earlier TODAY (not yesterday — see buildDemoSeedCalendarBlocks' completed
// block below, which is what actually drives Close's "completed today"
// count and Review's session list).
export function buildDemoSeedTasks(): Phase2MockTask[] {
  const wonEarlierToday = demoSeedEarlierTodayDate(180).toISOString();
  return [
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
      // Completed a few hours ago TODAY (not yesterday) so Close's
      // "completed today" count and the win-harvest candidates both see it —
      // independent verifier round 1 finding 5.
      created_at: demoSeedIso(-2 * DAY_MS),
      updated_at: wonEarlierToday,
      project_id: "proj-volunteer-1",
      source_capture_item_id: `${DEMO_SEED_ID_PREFIX}capture-4`,
    },
  ];
}

export function buildDemoSeedTimeBlockProposals(): Phase2MockTimeBlockProposal[] {
  const window = demoSeedLaterTodayDate(180); // ~3h from now, clamped to stay today
  const start = window;
  const end = new Date(window.getTime() + 45 * 60_000);
  return [
    {
      id: `${DEMO_SEED_ID_PREFIX}proposal-1`,
      user_id: MOCK_USER_ID,
      area_id: "area-main-job",
      task_id: `${DEMO_SEED_ID_PREFIX}task-1`,
      proposed_start: start.toISOString(),
      proposed_end: end.toISOString(),
      rationale: "Block focused time before the Monday standup.",
      conflict_flag: false,
      status: "accepted",
      created_at: demoSeedIso(-3 * HOUR_MS),
    },
  ];
}

export function buildDemoSeedCalendarBlocks(): Phase2MockCalendarBlock[] {
  const scheduledWindow = demoSeedLaterTodayDate(180);
  const scheduledStart = scheduledWindow;
  const scheduledEnd = new Date(scheduledWindow.getTime() + 45 * 60_000);
  // The win's own block: completed a few hours ago, still TODAY (used by
  // Close's completedToday count, which reads calendar_blocks —
  // momentsViewModel/close.ts). `demoSeedEarlierTodayDate`, not a raw
  // `Date.now() - 2h`: a raw offset lands on YESTERDAY whenever the app is
  // opened early in the local morning (within 2h of midnight) — found by
  // this exact seed flaking right after a real midnight rollover.
  const completedEnd = demoSeedEarlierTodayDate(120);
  const completedStart = demoSeedEarlierTodayDate(150);
  return [
    {
      id: `${DEMO_SEED_ID_PREFIX}block-1`,
      user_id: MOCK_USER_ID,
      area_id: "area-main-job",
      task_id: `${DEMO_SEED_ID_PREFIX}task-1`,
      proposal_id: `${DEMO_SEED_ID_PREFIX}proposal-1`,
      google_event_id: null,
      start_at: scheduledStart.toISOString(),
      end_at: scheduledEnd.toISOString(),
      status: "scheduled",
      created_at: demoSeedIso(-3 * HOUR_MS),
      updated_at: demoSeedIso(-3 * HOUR_MS),
    },
    {
      id: `${DEMO_SEED_ID_PREFIX}block-2`,
      user_id: MOCK_USER_ID,
      area_id: "area-volunteer",
      task_id: `${DEMO_SEED_ID_PREFIX}task-2`,
      proposal_id: null,
      google_event_id: null,
      start_at: completedStart.toISOString(),
      end_at: completedEnd.toISOString(),
      status: "completed",
      created_at: completedStart.toISOString(),
      updated_at: completedEnd.toISOString(),
    },
  ];
}

// The focus session behind the completed block above — gives Review's
// session list (`ReviewSheet.tsx`'s "Focus sessions will appear here"
// fallback) real content instead of staying inert (independent verifier
// round 1 finding 5).
export function buildDemoSeedExecutionSessions(): Phase2MockExecutionSession[] {
  const completedAt = demoSeedEarlierTodayDate(120);
  return [
    {
      id: `${DEMO_SEED_ID_PREFIX}session-1`,
      user_id: MOCK_USER_ID,
      area_id: "area-volunteer",
      task_id: `${DEMO_SEED_ID_PREFIX}task-2`,
      calendar_block_id: `${DEMO_SEED_ID_PREFIX}block-2`,
      planned_minutes: 30,
      actual_minutes: 28,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: 4,
      status: "completed",
      outcome: "completed",
      notes: "Venue confirmed for the fundraiser.",
      created_at: completedAt.toISOString(),
    },
  ];
}

// One closed daily review, so the Review moment has something on the log
// besides "nothing yet".
export function buildDemoSeedReviewLog(): string[] {
  return [`Review saved: ${demoSeedIso(-1 * DAY_MS)}`];
}

/** True when any row in `state` came from the demo seed above. */
export function hasDemoSeedId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DEMO_SEED_ID_PREFIX);
}
