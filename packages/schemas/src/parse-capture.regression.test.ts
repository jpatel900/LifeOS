import { describe, expect, it } from "vitest";
import { ParseCaptureResponseSchema } from "./parse-capture";

const base = {
  schema_version: "1.0" as const,
  prompt_version: "parse-capture-v1",
};

describe("ParseCaptureResponseSchema regression fixtures", () => {
  it("accepts representative valid fixtures", () => {
    const fixtures = [
      {
        ...base,
        parse_status: "parsed" as const,
        overall_confidence: 0.91,
        triage_required: false,
        triage_reasons: [],
        drafts: [
          {
            draft_type: "task_draft" as const,
            title: "Follow up with Alex about event sponsorship",
            description: "Simple single-task capture.",
            area_slug_suggestion: "volunteer-work",
            first_tiny_step: "Open the sponsor note",
            estimated_minutes_low: 15,
            estimated_minutes_high: 25,
            due_at: "2026-05-10T15:00:00.000Z",
            confidence: 0.91,
          },
        ],
        clarification_questions: [],
        ambiguity_assessment: null,
      },
      {
        ...base,
        parse_status: "needs_clarification" as const,
        overall_confidence: 0.58,
        triage_required: true,
        triage_reasons: ["Area unclear between Main Job and Side Project."],
        drafts: [
          {
            draft_type: "project_draft" as const,
            title: "Stabilize volunteer ops workflow",
            description: "Large ambiguous effort.",
            area_slug_suggestion: null,
            confidence: 0.58,
          },
        ],
        clarification_questions: ["Which area owns this?"],
        ambiguity_assessment: {
          likely_objective: "Reduce operational chaos before the next event.",
          problem_type: "project" as const,
          complexity_level: "complex" as const,
          knowns: ["Multiple concerns exist."],
          unknowns: ["Owner area", "Success metric"],
          assumptions: ["A phased approach is safer."],
          constraints: ["No external writes during parse."],
          risks: ["Too many tasks too early."],
          dependencies: ["Owner decision"],
          recommended_first_move: "Choose owner area first.",
          what_not_to_do_yet: ["Do not schedule before triage."],
          confidence: 0.56,
          review_trigger: "Mixed-area ambiguity.",
        },
      },
      {
        ...base,
        parse_status: "low_confidence" as const,
        overall_confidence: 0.41,
        triage_required: true,
        triage_reasons: ["Overall confidence below threshold."],
        drafts: [
          {
            draft_type: "task_draft" as const,
            title: "Possible admin cleanup task",
            description: null,
            area_slug_suggestion: null,
            first_tiny_step: null,
            estimated_minutes_low: null,
            estimated_minutes_high: null,
            due_at: null,
            confidence: 0.41,
          },
        ],
        clarification_questions: ["What concrete outcome should this become?"],
        ambiguity_assessment: null,
      },
    ];

    for (const fixture of fixtures) {
      expect(ParseCaptureResponseSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it("rejects invalid enum and invalid draft shape", () => {
    const invalidEnum = {
      ...base,
      parse_status: "unknown_mode",
      overall_confidence: 0.8,
      triage_required: false,
      triage_reasons: [],
      drafts: [],
      clarification_questions: [],
      ambiguity_assessment: null,
    };

    const invalidShape = {
      ...base,
      parse_status: "parsed",
      overall_confidence: 0.8,
      triage_required: false,
      triage_reasons: [],
      drafts: [
        { draft_type: "task_draft", title: "Incomplete", confidence: 0.8 },
      ],
      clarification_questions: [],
      ambiguity_assessment: null,
    };

    expect(ParseCaptureResponseSchema.safeParse(invalidEnum).success).toBe(
      false,
    );
    expect(ParseCaptureResponseSchema.safeParse(invalidShape).success).toBe(
      false,
    );
  });
});
