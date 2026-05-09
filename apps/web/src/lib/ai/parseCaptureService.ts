import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";
import { parseCapture, type ParseCaptureOptions } from "./parseCapture";
import {
  PARSE_CAPTURE_SCHEMA_VERSION,
} from "./contracts/parseCapture";
import { PARSE_CAPTURE_PROMPT_VERSION } from "./prompts/parseCapturePrompt";
import type { ParseCaptureAreaContext } from "./prompts/parseCapturePrompt";

export interface ParseCaptureServiceInput {
  rawText: string;
  areaContext?: ParseCaptureAreaContext[];
}

export interface ParseCaptureServiceOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  forceMock?: boolean;
  parseCaptureImpl?: (
    input: ParseCaptureServiceInput,
    options: Pick<ParseCaptureOptions, "apiKey" | "model">,
  ) => Promise<ParseCaptureResponse>;
}

export interface ParseCaptureServiceResult {
  parser: "ai" | "mock";
  response: ParseCaptureResponse;
}

export type ParseCaptureRuntimeStatus =
  | "mock"
  | "ai_configured"
  | "ai_unavailable";

export interface ParseCaptureStatusResult {
  status: ParseCaptureRuntimeStatus;
  preferredParser: "ai" | "mock";
}

function assertServerRuntime() {
  const isVitest =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isVitest) {
    throw new Error("parseCaptureService must run on the server.");
  }
}

function isAiParserEnabled(
  env: Partial<NodeJS.ProcessEnv>,
) {
  const raw = env.AI_PARSE_CAPTURE_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(raw);
}

function resolveParseCaptureModel(env: Partial<NodeJS.ProcessEnv>) {
  const standard = env.AI_MODEL_STANDARD?.trim();
  if (standard) {
    return standard;
  }

  const cheap = env.AI_MODEL_CHEAP?.trim();
  if (cheap) {
    return cheap;
  }

  const strong = env.AI_MODEL_STRONG?.trim();
  if (strong) {
    return strong;
  }

  return null;
}

export function getParseCaptureStatus(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): ParseCaptureStatusResult {
  assertServerRuntime();

  if (!isAiParserEnabled(env)) {
    return { status: "mock", preferredParser: "mock" };
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { status: "ai_unavailable", preferredParser: "mock" };
  }

  const model = resolveParseCaptureModel(env);
  if (!model) {
    return { status: "ai_unavailable", preferredParser: "mock" };
  }

  return { status: "ai_configured", preferredParser: "ai" };
}

function makeTitle(rawText: string) {
  const normalized = rawText
    .trim()
    .replace(/^need to\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");

  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 69).trim()}...`;
}

function buildMockResponse(rawText: string): ParseCaptureResponse {
  const title = makeTitle(rawText);
  const response = {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "parsed",
    overall_confidence: 0.78,
    triage_required: true,
    triage_reasons: ["Mock parser output requires user review before persistence."],
    drafts: [
      {
        draft_type: "task_draft",
        title,
        description: `Draft created from capture: ${rawText.trim()}`,
        area_slug_suggestion: null,
        first_tiny_step: `Clarify the next concrete step for: ${title}`,
        estimated_minutes_low: 30,
        estimated_minutes_high: 60,
        due_at: null,
        confidence: 0.78,
      },
    ],
    clarification_questions: ["What deadline or definition of done should this use?"],
    ambiguity_assessment: {
      likely_objective: title,
      problem_type: "task",
      complexity_level: "unclear",
      knowns: [rawText.trim()],
      unknowns: ["Exact deadline", "Definition of done"],
      assumptions: ["This should become a task before scheduling."],
      constraints: ["No external calendar write during parsing."],
      risks: ["Committing before review may capture the wrong intent."],
      dependencies: ["User review in triage."],
      recommended_first_move: `Clarify the next concrete step for: ${title}`,
      what_not_to_do_yet: ["Do not schedule before triage."],
      confidence: 0.72,
      review_trigger: "Review in triage before committing task.",
    },
  };

  return ParseCaptureResponseSchema.parse(response);
}

export async function parseCaptureWithFallback(
  input: ParseCaptureServiceInput,
  options: ParseCaptureServiceOptions = {},
): Promise<ParseCaptureServiceResult> {
  assertServerRuntime();

  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required for parsing.");
  }

  const env = options.env ?? process.env;
  if (options.forceMock) {
    return {
      parser: "mock",
      response: buildMockResponse(rawText),
    };
  }

  const apiKey = env.OPENAI_API_KEY;

  if (!isAiParserEnabled(env) || !apiKey) {
    return {
      parser: "mock",
      response: buildMockResponse(rawText),
    };
  }

  const model = resolveParseCaptureModel(env);
  if (!model) {
    throw new Error(
      "One of AI_MODEL_STANDARD, AI_MODEL_CHEAP, or AI_MODEL_STRONG is required when OPENAI_API_KEY is configured.",
    );
  }

  const response = await (options.parseCaptureImpl ?? parseCapture)(
    {
      rawText,
      areaContext: input.areaContext,
    },
    {
      apiKey,
      model,
    },
  );

  return { parser: "ai", response };
}
