import type { Area as SharedArea, Task as SharedTask } from "@lifeos/types";

export type { Phase2TimeBlockProposal as TimeBlockProposal } from "@lifeos/schemas";

/**
 * Phase 2 shell seed areas (human-readable ids). Not the same shape as persisted `Area` rows.
 */
export interface Phase2MockArea {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type Area = SharedArea;

export type Task = SharedTask & {
  project_id?: string | null;
  source_capture_item_id?: string | null;
  description?: string | null;
  first_tiny_step?: string | null;
  definition_of_done?: string | null;
};

export interface Project {
  id: string;
  user_id: string;
  area_id: string;
  title: string;
  description?: string | null;
  status: "active" | "paused" | "done" | "dropped";
  created_at: string;
}

export interface CalendarBlock {
  id: string;
  user_id: string;
  area_id: string;
  task_id: string | null;
  proposal_id: string | null;
  start_at: string;
  end_at: string;
  status: "scheduled" | "running" | "completed" | "missed";
}

export interface ExecutionSession {
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
    | "stopped";
  outcome: "completed" | "partial" | "stopped" | "distracted" | "blocked" | "skipped";
  notes?: string | null;
}

export interface DailyReviewSummary {
  id: string;
  date: string;
  completedCount: number;
  missedCount: number;
  openCount: number;
  note?: string;
}

export interface WeeklyReviewSummary {
  id: string;
  weekOf: string;
  areaSummaries: {
    area_id: string;
    backlogHealth: "steady" | "growing" | "shrinking";
    missedBlocks: number;
    comment?: string;
  }[];
}

export interface HealthCheck {
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

