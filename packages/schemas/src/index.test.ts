import { describe, it, expect } from "vitest";
import {
  AmbiguityAssessmentSchema,
  AreaSchema,
  CalendarBlockSchema,
  CaptureItemSchema,
  CreateCaptureItemInputSchema,
  CreateExecutionSessionInputSchema,
  CreateGoogleCalendarEventInputSchema,
  CreateReviewEntryInputSchema,
  CreateTimeBlockProposalInputSchema,
  EditTimeBlockProposalInputSchema,
  CheckTimeBlockProposalConflictInputSchema,
  MarkExecutionSessionInputSchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  ExecutionSessionSchema,
  ExternalWriteEventSchema,
  GoogleCalendarConnectionSchema,
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
});

describe("CreateCaptureItemInputSchema", () => {
  it("trims and validates raw capture input", () => {
    const result = CreateCaptureItemInputSchema.safeParse({
      raw_text: "  Call dentist tomorrow  ",
      area_id: null,
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.raw_text : "").toBe(
      "Call dentist tomorrow",
    );
  });
});

describe("CreateProjectInputSchema", () => {
  it("trims and validates accepted project draft input", () => {
    const result = CreateProjectInputSchema.safeParse({
      area_id: uid,
      title: "  Volunteer ops cleanup  ",
      description: "  Bring loose ends under control.  ",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.title : "").toBe(
      "Volunteer ops cleanup",
    );
    expect(result.success ? result.data.description : "").toBe(
      "Bring loose ends under control.",
    );
  });
});

describe("CreateTaskInputSchema", () => {
  it("trims and validates accepted task draft input", () => {
    const result = CreateTaskInputSchema.safeParse({
      area_id: uid,
      source_capture_item_id: uid2,
      title: "  Draft sponsor email  ",
      description: "",
      priority_confidence: 0.78,
      estimated_minutes_low: 15,
      estimated_minutes_high: 45,
      first_tiny_step: "  Open the event notes  ",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.title : "").toBe("Draft sponsor email");
    expect(result.success ? result.data.description : "x").toBeNull();
    expect(result.success ? result.data.first_tiny_step : "").toBe(
      "Open the event notes",
    );
  });
});

describe("CreateTimeBlockProposalInputSchema", () => {
  it("validates task-backed local proposal input", () => {
    const result = CreateTimeBlockProposalInputSchema.safeParse({
      task_id: uid,
      proposed_start: "2026-05-08T16:00:00.000Z",
      proposed_end: "2026-05-08T17:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.rationale_note : "").toBe(
      "Local planning proposal created from task duration.",
    );
  });

  it("rejects proposals where end is not after start", () => {
    const result = CreateTimeBlockProposalInputSchema.safeParse({
      task_id: uid,
      proposed_start: "2026-05-08T17:00:00.000Z",
      proposed_end: "2026-05-08T16:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("EditTimeBlockProposalInputSchema", () => {
  it("validates editable start and end before proposal acceptance", () => {
    const result = EditTimeBlockProposalInputSchema.safeParse({
      proposed_start: "2026-05-08T18:00:00.000Z",
      proposed_end: "2026-05-08T19:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });
});

describe("CheckTimeBlockProposalConflictInputSchema", () => {
  it("validates proposal ids for manual conflict checks", () => {
    const result = CheckTimeBlockProposalConflictInputSchema.safeParse({
      proposal_id: uid,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid proposal ids", () => {
    const result = CheckTimeBlockProposalConflictInputSchema.safeParse({
      proposal_id: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });
});

describe("CreateGoogleCalendarEventInputSchema", () => {
  it("requires explicit approval before Google Calendar event creation", () => {
    const result = CreateGoogleCalendarEventInputSchema.safeParse({
      proposal_id: uid,
      approved: true,
      acknowledge_first_write_warning: true,
      timezone: "America/Toronto",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.approved : false).toBe(true);
    expect(
      result.success ? result.data.acknowledge_first_write_warning : false,
    ).toBe(true);
  });

  it("rejects event creation input without approval", () => {
    const result = CreateGoogleCalendarEventInputSchema.safeParse({
      proposal_id: uid,
      approved: false,
    });

    expect(result.success).toBe(false);
  });
});

describe("CreateExecutionSessionInputSchema", () => {
  it("validates task-backed execution start input", () => {
    const result = CreateExecutionSessionInputSchema.safeParse({
      task_id: uid,
      calendar_block_id: uid2,
    });

    expect(result.success).toBe(true);
  });
});

describe("MarkExecutionSessionInputSchema", () => {
  it("validates paused execution updates without terminal fields", () => {
    const result = MarkExecutionSessionInputSchema.safeParse({
      status: "paused",
    });

    expect(result.success).toBe(true);
  });

  it("requires terminal fields for non-paused marks", () => {
    for (const status of [
      "completed",
      "missed",
      "distracted",
      "stuck",
    ] as const) {
      const result = MarkExecutionSessionInputSchema.safeParse({
        status,
        outcome: "completed",
        actual_minutes: 42,
        productivity_rating: 4,
        notes: "solid focus",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects terminal marks missing required terminal fields", () => {
    const result = MarkExecutionSessionInputSchema.safeParse({
      status: "completed",
    });

    expect(result.success).toBe(false);
  });
});

describe("CreateReviewEntryInputSchema", () => {
  it("validates daily review entry creation input", () => {
    const result = CreateReviewEntryInputSchema.safeParse({
      review_type: "daily",
      period_start: "2026-05-08",
      period_end: "2026-05-08",
      area_id: null,
      summary_json: {
        completed_sessions: 1,
        missed_sessions: 0,
        open_tasks: 2,
      },
    });

    expect(result.success).toBe(true);
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

describe("GoogleCalendarConnectionSchema", () => {
  it("validates metadata-only Google Calendar connection rows without tokens", () => {
    const result = GoogleCalendarConnectionSchema.safeParse({
      id: uid,
      user_id: uid2,
      provider: "google_calendar",
      calendar_id: "primary",
      granted_scopes_json: [
        "https://www.googleapis.com/auth/calendar.freebusy",
        "https://www.googleapis.com/auth/calendar.events.owned",
      ],
      status: "metadata_only",
      first_write_warning_acknowledged_at: null,
      connected_at: null,
      disconnected_at: null,
      created_at: "2024-01-01T12:00:00.000Z",
      updated_at: "2024-01-01T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported calendar providers", () => {
    const result = GoogleCalendarConnectionSchema.safeParse({
      id: uid,
      user_id: uid2,
      provider: "gmail",
      calendar_id: "primary",
      granted_scopes_json: [],
      status: "metadata_only",
      first_write_warning_acknowledged_at: null,
      connected_at: null,
      disconnected_at: null,
      created_at: "2024-01-01T12:00:00.000Z",
      updated_at: "2024-01-01T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("ExternalWriteEventSchema", () => {
  it("validates external write audit rows without provider secret material", () => {
    const result = ExternalWriteEventSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      provider: "google_calendar",
      operation: "events.insert",
      target_type: "calendar_block",
      target_id: uid,
      request_summary_json: {
        calendar_id: "primary",
        has_google_event_id: false,
      },
      result_summary_json: {
        stored_google_event_id: false,
      },
      result_status: "failed",
      error_message: "Google Calendar insert failed safely.",
      created_at: "2024-01-01T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported external write result statuses", () => {
    const result = ExternalWriteEventSchema.safeParse({
      id: uid,
      user_id: uid2,
      area_id: null,
      provider: "google_calendar",
      operation: "events.insert",
      target_type: "calendar_block",
      target_id: null,
      request_summary_json: {},
      result_summary_json: {},
      result_status: "done",
      error_message: null,
      created_at: "2024-01-01T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
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
  it("parses a multi-draft response", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      schema_version: "1.0",
      prompt_version: "parse-capture-v1",
      parse_status: "needs_clarification",
      overall_confidence: 0.62,
      triage_required: true,
      triage_reasons: ["Area unclear between Personal and Volunteer"],
      drafts: [
        {
          draft_type: "task_draft",
          title: "Short task",
          description: null,
          area_slug_suggestion: null,
          first_tiny_step: "Brain dump into bullets",
          estimated_minutes_low: null,
          estimated_minutes_high: null,
          due_at: null,
          confidence: 0.9,
        },
        {
          draft_type: "project_draft",
          title: "Website refresh",
          description: null,
          area_slug_suggestion: null,
          confidence: 0.62,
        },
      ],
      clarification_questions: ["Which area should own this?"],
      ambiguity_assessment: {
        likely_objective: "Reduce chaos",
        problem_type: "project",
        complexity_level: "moderate",
        knowns: ["Website refresh was mentioned."],
        unknowns: ["Owning area"],
        assumptions: [],
        constraints: [],
        risks: [],
        dependencies: [],
        recommended_first_move: "Brain dump into bullets",
        what_not_to_do_yet: ["Do not schedule before triage."],
        confidence: 0.4,
        review_trigger: "Area unclear between Personal and Volunteer",
      },
    });

    expect(result.success).toBe(true);
  });
});
