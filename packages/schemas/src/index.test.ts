import { describe, it, expect } from "vitest";
import { CaptureSchema, ParseCaptureResponseSchema } from "./index";

describe("CaptureSchema", () => {
  it("validates a correct capture", () => {
    const result = CaptureSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      area_id: null,
      raw_text: "Call dentist tomorrow",
      status: "raw",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty raw_text", () => {
    const result = CaptureSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      area_id: null,
      raw_text: "",
      status: "raw",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("ParseCaptureResponseSchema", () => {
  it("validates a correct parse response", () => {
    const result = ParseCaptureResponseSchema.safeParse({
      schema_version: "1.0",
      items: [
        {
          type: "task",
          title: "Call dentist",
          area_suggestion: "health",
          confidence: 0.9,
        },
      ],
      ambiguities: [],
    });
    expect(result.success).toBe(true);
  });
});
