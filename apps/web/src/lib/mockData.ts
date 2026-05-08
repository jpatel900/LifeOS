import type {
  CalendarBlock,
  DailyReviewSummary,
  ExecutionSession,
  HealthCheck,
  Phase2MockArea,
  Project,
  Task,
  TimeBlockProposal,
  WeeklyReviewSummary,
} from "./types";

export const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

export const areas: Phase2MockArea[] = [
  {
    id: "area-main-job",
    user_id: MOCK_USER_ID,
    name: "Main Job",
    color: "#0ea5e9",
    created_at: new Date().toISOString(),
  },
  {
    id: "area-personal",
    user_id: MOCK_USER_ID,
    name: "Personal",
    color: "#22c55e",
    created_at: new Date().toISOString(),
  },
  {
    id: "area-volunteer",
    user_id: MOCK_USER_ID,
    name: "Volunteer Work",
    color: "#f97316",
    created_at: new Date().toISOString(),
  },
  {
    id: "area-side-project",
    user_id: MOCK_USER_ID,
    name: "Side Project",
    color: "#a855f7",
    created_at: new Date().toISOString(),
  },
];

export const projects: Project[] = [
  {
    id: "proj-main-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    title: "Q2 planning doc",
    description: "Draft and circulate Q2 planning document.",
    status: "active",
    created_at: new Date().toISOString(),
  },
  {
    id: "proj-volunteer-1",
    user_id: MOCK_USER_ID,
    area_id: "area-volunteer",
    title: "Next fundraiser event",
    description: "Prepare for upcoming volunteer fundraiser.",
    status: "active",
    created_at: new Date().toISOString(),
  },
];

export const tasks: Task[] = [
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

export const timeBlockProposals: TimeBlockProposal[] = [
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

export const calendarBlocks: CalendarBlock[] = [
  {
    id: "block-1",
    user_id: MOCK_USER_ID,
    area_id: "area-main-job",
    task_id: "task-main-1",
    proposal_id: "proposal-1",
    start_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    end_at: new Date().toISOString(),
    status: "completed",
  },
];

export const executionSessions: ExecutionSession[] = [
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

export const dailyReview: DailyReviewSummary = {
  id: "daily-1",
  date: new Date().toISOString().slice(0, 10),
  completedCount: 3,
  missedCount: 1,
  openCount: 4,
  note: "A few blocks slipped, but progress is steady.",
};

export const weeklyReview: WeeklyReviewSummary = {
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

export const healthChecks: HealthCheck[] = [
  {
    id: "health-auth",
    subsystem: "auth",
    status: "healthy",
    score: 100,
    summary: "Authentication is configured (mock only, no real auth yet).",
  },
  {
    id: "health-database",
    subsystem: "database",
    status: "watch",
    score: 75,
    summary: "Local mock data only; Supabase not wired yet.",
  },
  {
    id: "health-ai",
    subsystem: "ai_parsing",
    status: "watch",
    score: 60,
    summary: "Parsing is mocked; real AI integration will come later.",
  },
  {
    id: "health-calendar",
    subsystem: "calendar_connector",
    status: "watch",
    score: 50,
    summary: "Calendar connector is not configured; all blocks are local.",
  },
];

export function getAreaById(areaId: string | null | undefined): Phase2MockArea | undefined {
  if (!areaId) return undefined;
  return areas.find((a) => a.id === areaId);
}

