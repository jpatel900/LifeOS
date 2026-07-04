import { describe, expect, it } from "vitest";
import {
  CreateOverrideRecordInputSchema,
  CreateSuggestionRecordInputSchema,
  META_LEARNING_EVENT_SCHEMA_VERSION,
  META_LEARNING_EVENT_SCHEMA_VERSION_V2,
  OverrideRecordSchema,
  SuggestionRecordSchema,
} from "./meta-learning";

const base = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  area_id: "550e8400-e29b-41d4-a716-446655440002",
  policy_identifier: "planning.default_time_block",
  schema_version: META_LEARNING_EVENT_SCHEMA_VERSION,
  created_at: "2026-07-03T12:00:00.000Z",
};

const suggestionRow = {
  ...base,
  suggestion_type: "time_block_proposal",
  subject_type: "time_block_proposal",
  subject_id: "550e8400-e29b-41d4-a716-446655440003",
  suggestion_json: { proposed_start: "2026-07-03T14:00:00.000Z" },
  confidence: null,
  status: "pending",
  resolution_reason: null,
  decided_by: "user",
  resolved_at: null,
} as const;

const overrideRow = {
  ...base,
  suggestion_id: null,
  subject_type: "time_block_proposal",
  subject_id: "550e8400-e29b-41d4-a716-446655440003",
  override_type: "edited",
  old_value_json: { proposed_start: "2026-07-03T14:00:00.000Z" },
  new_value_json: { proposed_start: "2026-07-03T15:00:00.000Z" },
  reason: "User edited a local time-block proposal.",
} as const;

describe("meta-learning record schemas", () => {
  it("validates versioned suggestion records with stable policy identifiers", () => {
    expect(SuggestionRecordSchema.parse(suggestionRow).policy_identifier).toBe(
      "planning.default_time_block",
    );
  });

  it("rejects blank or unstable policy identifiers", () => {
    expect(() =>
      CreateSuggestionRecordInputSchema.parse({
        area_id: null,
        policy_identifier: "Default Time Block!",
        suggestion_type: "time_block_proposal",
        subject_type: "time_block_proposal",
        suggestion_json: {},
      }),
    ).toThrow();
  });

  it("validates override records for user edits and choices", () => {
    expect(OverrideRecordSchema.parse(overrideRow).schema_version).toBe(
      META_LEARNING_EVENT_SCHEMA_VERSION,
    );
  });

  it("normalizes optional override reason to null", () => {
    expect(
      CreateOverrideRecordInputSchema.parse({
        area_id: null,
        policy_identifier: "triage.default_accept_task",
        subject_type: "task",
        subject_id: "550e8400-e29b-41d4-a716-446655440003",
        override_type: "accepted",
      }).reason,
    ).toBeNull();
  });

  it("CreateSuggestionRecordInputSchema accepts resolution_reason and decided_by", () => {
    expect(
      CreateSuggestionRecordInputSchema.parse({
        area_id: null,
        policy_identifier: "triage.default_accept_task",
        suggestion_type: "triage_suggestion",
        subject_type: "task_draft",
        resolution_reason: "User accepted the suggestion.",
        decided_by: "system",
      }),
    ).toMatchObject({
      resolution_reason: "User accepted the suggestion.",
      decided_by: "system",
    });
  });

  it("CreateOverrideRecordInputSchema accepts a nullable suggestion_id", () => {
    expect(
      CreateOverrideRecordInputSchema.parse({
        area_id: null,
        policy_identifier: "triage.default_accept_task",
        suggestion_id: null,
        subject_type: "task",
        subject_id: "550e8400-e29b-41d4-a716-446655440003",
        override_type: "accepted",
      }).suggestion_id,
    ).toBeNull();
  });

  it("SuggestionRecordSchema parses a row with decided_by='system'", () => {
    expect(
      SuggestionRecordSchema.parse({
        ...suggestionRow,
        schema_version: META_LEARNING_EVENT_SCHEMA_VERSION_V2,
        resolution_reason: "Expired after review.",
        decided_by: "system",
      }).decided_by,
    ).toBe("system");
  });

  it("both record schemas parse schema_version 'meta-learning-event-v1' and 'meta-learning-event-v2'", () => {
    for (const schemaVersion of [
      META_LEARNING_EVENT_SCHEMA_VERSION,
      META_LEARNING_EVENT_SCHEMA_VERSION_V2,
    ]) {
      expect(
        SuggestionRecordSchema.parse({
          ...suggestionRow,
          schema_version: schemaVersion,
        }).schema_version,
      ).toBe(schemaVersion);
      expect(
        OverrideRecordSchema.parse({
          ...overrideRow,
          schema_version: schemaVersion,
        }).schema_version,
      ).toBe(schemaVersion);
    }
  });
});
