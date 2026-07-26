import type {
  CalendarBlock as SharedCalendarBlock,
  Project as SharedProject,
  Task as SharedTask,
} from "@lifeos/types";

export type { Phase2TimeBlockProposal as Phase2MockTimeBlockProposal } from "@lifeos/schemas";

/**
 * Phase 2 mock-only UI view models. These are deliberately not canonical domain
 * entity exports; runtime/persisted entity types remain owned by `@lifeos/schemas`.
 */
export interface Phase2MockArea {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type Phase2MockTask = SharedTask;

export type Phase2MockProject = SharedProject;

export type Phase2MockCalendarBlock = SharedCalendarBlock;

export interface Phase2MockExecutionSession {
  id: string;
  user_id: string;
  area_id: string;
  task_id: string | null;
  calendar_block_id: string | null;
  planned_minutes: number | null;
  actual_minutes: number | null;
  paused_minutes?: number | null;
  distraction_minutes?: number | null;
  productivity_rating?: number | null;
  status:
    | "running"
    | "paused"
    | "completed"
    | "missed"
    | "distracted"
    | "stuck"
    | "stopped"
    | "partial"
    | "skipped";
  /**
   * #737 C1 card 1 — "user-chosen outcome only, never a silent 'partial'".
   *
   * `in_progress` is DEVICE-ONLY and exists so a session that is merely
   * running carries no verdict. Before this, `startExecutionSession` opened
   * every session at `"partial"`, so an abandoned one read back as a partial
   * the user never chose (and `sessionStatusFromOutcome` turned it into a
   * phantom "running" session forever).
   *
   * It is never persisted: `execution_sessions.outcome` keeps its original
   * six-value CHECK, and the account row is only ever created from the end
   * sheet's chosen outcome.
   */
  outcome:
    | "in_progress"
    | "completed"
    | "partial"
    | "stopped"
    | "distracted"
    | "blocked"
    | "skipped";
  cap_outcome?: "cut_scope" | "deferred" | null;
  notes?: string | null;
}

export interface Phase2MockDailyReviewSummary {
  id: string;
  date: string;
  completedCount: number;
  missedCount: number;
  openCount: number;
  note?: string;
}

export interface Phase2MockWeeklyReviewSummary {
  id: string;
  weekOf: string;
  areaSummaries: {
    area_id: string;
    backlogHealth: "steady" | "growing" | "shrinking";
    missedBlocks: number;
    comment?: string;
  }[];
}

export interface Phase2MockHealthCheck {
  id: string;
  subsystem:
    | "auth"
    | "database"
    | "ai_parsing"
    | "calendar_connector"
    | "scheduler"
    | "priority_model"
    | "duration_model"
    | "time_preferences";
  status: "healthy" | "watch" | "critical";
  score: number;
  summary: string;
}
