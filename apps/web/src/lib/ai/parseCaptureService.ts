import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";
import { traceParseCapture } from "@/lib/observability";
import {
  parseCapture,
  parseCaptureDetailed,
  type ParseCaptureExecutionResult,
  type ParseCaptureOptions,
  type ParseCaptureTelemetry,
} from "./parseCapture";
import { PARSE_CAPTURE_SCHEMA_VERSION } from "./contracts/parseCapture";
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
  traceParseCaptureImpl?: typeof traceParseCapture;
}

export interface ParseCaptureServiceResult {
  parser: "ai" | "mock";
  response: ParseCaptureResponse;
  telemetry?: ParseCaptureTelemetry;
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

function isAiParserEnabled(env: Partial<NodeJS.ProcessEnv>) {
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

function resolveParseCaptureModelConfig(env: Partial<NodeJS.ProcessEnv>) {
  const standard = env.AI_MODEL_STANDARD?.trim();
  if (standard) {
    return { model: standard, tierLabel: "standard" as const };
  }

  const cheap = env.AI_MODEL_CHEAP?.trim();
  if (cheap) {
    return { model: cheap, tierLabel: "cheap" as const };
  }

  const strong = env.AI_MODEL_STRONG?.trim();
  if (strong) {
    return { model: strong, tierLabel: "strong" as const };
  }

  return null;
}

function categorizeParseCaptureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/capture text is required/i.test(message)) {
    return "input_invalid";
  }

  if (/must run on the server/i.test(message)) {
    return "server_boundary_violation";
  }

  if (/AI_MODEL_STANDARD|AI_MODEL_CHEAP|AI_MODEL_STRONG/i.test(message)) {
    return "parser_config_missing_model";
  }

  if (/OPENAI_API_KEY/i.test(message)) {
    return "provider_config_missing_api_key";
  }

  if (/request failed/i.test(message)) {
    return "provider_request_failed";
  }

  if (/did not include output text/i.test(message)) {
    return "provider_output_missing";
  }

  if (/not valid JSON/i.test(message)) {
    return "provider_invalid_json";
  }

  if (/failed schema validation/i.test(message)) {
    return "provider_schema_validation_failed";
  }

  return "unknown_error";
}

function getValidationStatus(error: unknown) {
  return categorizeParseCaptureError(error) === "provider_schema_validation_failed"
    ? "failed"
    : "not_run";
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

function makeProjectTitle(rawText: string) {
  return makeTitle(rawText)
    .replace(/^(?:need\s+)?a\s+project\s+to\s+/i, "")
    .trim();
}

function isProjectShapedCapture(rawText: string) {
  const lower = rawText.toLowerCase();
  return (
    /\bproject\b/.test(lower) ||
    /\broadmap\b/.test(lower) ||
    /\binitiative\b/.test(lower) ||
    /\bsystem\b/.test(lower) ||
    /\boverhaul\b/.test(lower)
  );
}

function buildMockResponse(rawText: string): ParseCaptureResponse {
  const title = makeTitle(rawText);
  const isProjectShaped = isProjectShapedCapture(rawText);
  const response = {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "parsed",
    overall_confidence: 0.78,
    triage_required: true,
    triage_reasons: [
      "Mock parser output requires user review before persistence.",
    ],
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
      ...(isProjectShaped
        ? [
            {
              draft_type: "project_draft" as const,
              title: makeProjectTitle(rawText),
              description: `Draft created from capture: ${rawText.trim()}`,
              area_slug_suggestion: null,
              confidence: 0.72,
            },
          ]
        : []),
    ],
    clarification_questions: [
      "What deadline or definition of done should this use?",
    ],
    ambiguity_assessment: {
      likely_objective: title,
      problem_type: isProjectShaped ? "project" : "task",
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
  const apiKey = env.OPENAI_API_KEY;
  const aiEnabled = isAiParserEnabled(env);
  const modelConfig = resolveParseCaptureModelConfig(env);
  const parser =
    options.forceMock || !aiEnabled || !apiKey ? ("mock" as const) : ("ai" as const);

  return (options.traceParseCaptureImpl ?? traceParseCapture)(
    {
      parser,
      provider: parser === "ai" ? "openai" : "mock",
      metadata: {
        fallback_used: parser === "mock",
        model_name: parser === "ai" ? modelConfig?.model : undefined,
        model_tier_label: parser === "ai" ? modelConfig?.tierLabel : undefined,
      },
      finalizeMetadata(outcome) {
        if (outcome.ok) {
          const result = outcome.value as ParseCaptureServiceResult;
          return {
            fallback_used: result.parser === "mock",
            input_token_count: result.telemetry?.inputTokenCount,
            model_name: result.telemetry?.modelName,
            output_token_count: result.telemetry?.outputTokenCount,
            parse_status: result.response.parse_status,
            prompt_version: result.response.prompt_version,
            schema_version: result.response.schema_version,
            status: "succeeded",
            total_token_count: result.telemetry?.totalTokenCount,
            validation_status: "validated",
            estimated_cost_usd: result.telemetry?.estimatedCostUsd,
          };
        }

        return {
          error_category: categorizeParseCaptureError(outcome.error),
          fallback_used: parser === "mock",
          status: "failed",
          validation_status: getValidationStatus(outcome.error),
        };
      },
    },
    async () => {
      if (parser === "mock") {
        return {
          parser: "mock",
          response: buildMockResponse(rawText),
        };
      }

      if (!modelConfig) {
        throw new Error(
          "One of AI_MODEL_STANDARD, AI_MODEL_CHEAP, or AI_MODEL_STRONG is required when OPENAI_API_KEY is configured.",
        );
      }

      if (options.parseCaptureImpl) {
        const response = await options.parseCaptureImpl(
          {
            rawText,
            areaContext: input.areaContext,
          },
          {
            apiKey,
            model: modelConfig.model,
          },
        );

        return {
          parser: "ai",
          response,
          telemetry: {
            modelName: modelConfig.model,
          },
        };
      }

      const result: ParseCaptureExecutionResult = await parseCaptureDetailed(
        {
          rawText,
          areaContext: input.areaContext,
        },
        {
          apiKey,
          model: modelConfig.model,
        },
      );

      return {
        parser: "ai",
        response: result.response,
        telemetry: result.telemetry,
      };
    },
  );
}
