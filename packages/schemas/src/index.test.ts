import { describe, it, expect } from "vitest";
import {
  AmbiguityAssessmentSchema,
  AreaSchema,
  CalendarBlockSchema,
  CaptureItemSchema,
  ExecutionSessionSchema,
  HealthCheckSchema,
  ParseCaptureResponseSchema,
  ProjectSchema,
  ReviewEntrySchema,
  TaskSchema,
  TimeBlockProposalSchema,
} from "./index";

const uid = "550e8400-e29b-41d4-a716-446655440000";
const uid2 = "550e8400-e29b-41d4-a716-446655440001";

describe("CaptureItemSchema", () => {
  it("accepts a valid capture_item row shape", () => {
    const result = CaptureItemSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      raw_text: "Follow up with Alex",
      raw_audio_ref: null,
      capture_mode: "text",
      inferred_area_confidence: 0.72,
      status: "new",
      created_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects legacy status values not in DATA_MODEL.md", () => {
    const result = CaptureItemSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      raw_text: "x",
      raw_audio_ref: null,
      capture_mode: "text",
      inferred_area_confidence: null,
      status: "raw",
      created_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid capture_mode", () => {
    const result = CaptureItemSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      raw_text: "x",
      raw_audio_ref: null,
      capture_mode: "voice_live",
      inferred_area_confidence: null,
      status: "new",
      created_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("AreaSchema", () => {
  it("validates full area row", () => {
    const result = AreaSchema.safeParse({
      id: uid,
      user_id: uid2,
      name: "Main Job",
      slug: "main-job",
      description: null,
      color: "#336699",
      icon: "briefcase",
      sort_order: 0,
      is_active: true,
      created_at: "2024-01-01T12:00:00.000Z",
      updated_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("ProjectSchema", () => {
  it("accepts project statuses from DATA_MODEL.md", () => {
    for (const status of [
      "active",
      "paused",
      "done",
      "dropped",
      "archived",
    ] as const) {
      const result = ProjectSchema.safeParse({
        id: uid,
        user_id: uid2,
        area_id: uid,
        title: "Q1 rollout",
        description: null,
        status,
        created_at: "2024-01-01T12:00:00.000Z",
        updated_at: "2024-01-01T12:00:00.000Z",
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("TaskSchema", () => {
  it("accepts task statuses from DATA_MODEL.md", () => {
    const result = TaskSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: uid,
      project_id: null,
      source_capture_item_id: null,
      title: "Draft sponsor email",
      description: null,
      status: "draft",
      priority_score: null,
      priority_confidence: null,
      task_type: null,
      energy_type: null,
      estimated_minutes_low: 15,
      estimated_minutes_high: 45,
      due_at: null,
      definition_of_done: null,
      first_tiny_step: "Open notes",
      created_at: "2024-01-01T12:00:00.000Z",
      updated_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("TimeBlockProposalSchema", () => {
  it("validates proposal row", () => {
    const result = TimeBlockProposalSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: uid,
      task_id: null,
      proposed_start: "2024-01-02T14:00:00.000Z",
      proposed_end: "2024-01-02T15:00:00.000Z",
      rationale_json: { note: "focus block" },
      conflict_flag: false,
      conflict_details_json: null,
      status: "proposed",
      created_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("CalendarBlockSchema", () => {
  it("validates calendar block statuses", () => {
    const result = CalendarBlockSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: uid,
      proposal_id: null,
      task_id: null,
      google_event_id: null,
      start_at: "2024-01-02T14:00:00.000Z",
      end_at: "2024-01-02T15:00:00.000Z",
      status: "scheduled",
      created_at: "2024-01-01T12:00:00.000Z",
      updated_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("ExecutionSessionSchema", () => {
  it("validates outcome enum", () => {
    const result = ExecutionSessionSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: uid,
      task_id: uid,
      calendar_block_id: null,
      planned_minutes: 60,
      actual_minutes: 40,
      paused_minutes: 5,
      distraction_minutes: 10,
      productivity_rating: 4,
      energy_rating: "medium",
      outcome: "partial",
      notes: null,
      created_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("ReviewEntrySchema", () => {
  it("accepts ISO date periods", () => {
    const result = ReviewEntrySchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      review_type: "daily",
      period_start: "2024-01-01",
      period_end: "2024-01-01",
      summary_json: { wins: ["shipped"] },
      created_at: "2024-01-01T23:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO dates", () => {
    const result = ReviewEntrySchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      review_type: "weekly",
      period_start: "01/01/2024",
      period_end: "2024-01-07",
      summary_json: {},
      created_at: "2024-01-01T23:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("HealthCheckSchema", () => {
  it("validates subsystem status literals", () => {
    const result = HealthCheckSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      subsystem: "calendar_connector",
      status: "watch",
      score: 72,
      details_json: { latency_ms: 120 },
      checked_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("AmbiguityAssessmentSchema", () => {
  it("validates json payload fields", () => {
    const result = AmbiguityAssessmentSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      source_capture_item_id: uid2,
      likely_objective: "Stabilize ops before event",
      problem_type: "coordination",
      complexity_level: "medium",
      knowns_json: [],
      unknowns_json: ["owner unclear"],
      assumptions_json: [],
      constraints_json: {},
      risks_json: [],
      dependencies_json: [],
      recommended_first_move: "List stakeholders",
      what_not_to_do_yet_json: ["full rewrite"],
      confidence_score: 0.55,
      review_trigger: "manual",
      created_at: "2024-01-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("ParseCaptureResponseSchema", () => {
  const minimalValid = () => ({
    schema_version: "1.0" as const,
    prompt_version: "parse-capture-v1",
    drafts: [
      {
        draft_type: "task_draft" as const,
        title: "Call sponsor",
        area_slug_suggestion: "volunteer-work",
        confidence: 0.81,
      },
    ],
    ambiguities: [],
  });

  it("parses a multi-draft response", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      schema_version: "1.0",
      prompt_version: "parse-capture-v1",
      drafts: [
        {
          draft_type: "task_draft",
          title: "Short task",
          confidence: 0.9,
        },
        {
          draft_type: "project_draft",
          title: "Website refresh",
          area_slug_suggestion: null,
          confidence: 0.62,
        },
        {
          draft_type: "ambiguity_assessment",
          likely_objective: "Reduce chaos",
          recommended_first_move: "Brain dump into bullets",
          confidence: 0.4,
        },
      ],
      ambiguities: ["Area unclear between Personal and Volunteer"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.drafts).toHaveLength(3);
      expect(result.data.drafts[2].draft_type).toBe("ambiguity_assessment");
    }
  });

  it("rejects wrong schema_version", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      ...minimalValid(),
      schema_version: "2.0",
    } as unknown);
    expect(result.success).toBe(false);
  });

  it("rejects missing prompt_version", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      schema_version: "1.0",
      drafts: minimalValid().drafts,
      ambiguities: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence out of range", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      ...minimalValid(),
      drafts: [{ draft_type: "task_draft", title: "x", confidence: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown draft_type", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      ...minimalValid(),
      drafts: [{ draft_type: "unknown", title: "x", confidence: 0.5 }],
    } as unknown);
    expect(result.success).toBe(false);
  });
});
