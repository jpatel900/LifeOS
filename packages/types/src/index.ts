export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Area {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface Capture {
  id: string;
  user_id: string;
  area_id: string | null;
  raw_text: string;
  status: "raw" | "parsed" | "triaged" | "archived";
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  area_id: string | null;
  title: string;
  status: "inbox" | "active" | "done" | "archived";
  priority: number | null;
  estimate_minutes_low: number | null;
  estimate_minutes_high: number | null;
  created_at: string;
}

export type ModelTier = "AI_MODEL_CHEAP" | "AI_MODEL_STANDARD" | "AI_MODEL_STRONG";
