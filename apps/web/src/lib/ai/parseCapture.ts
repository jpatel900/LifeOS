import type { ParseCaptureResponse } from "@lifeos/schemas";
import {
  parseCaptureResponseFormat,
  validateParseCaptureResponse,
} from "./contracts/parseCapture";
import {
  buildParseCaptureMessages,
  type OperatorProfileContext,
  type ParseCaptureAreaContext,
} from "./prompts/parseCapturePrompt";
import {
  resolveStructuredOutputProvider,
  type StructuredOutputProvider,
} from "./provider";

export interface BuildParseCaptureRequestInput {
  rawText: string;
  model: string;
  areaContext?: ParseCaptureAreaContext[];
  operatorProfile?: OperatorProfileContext | null;
}

export interface ParseCaptureInput {
  rawText: string;
  areaContext?: ParseCaptureAreaContext[];
  operatorProfile?: OperatorProfileContext | null;
}

export interface ParseCaptureOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  provider?: StructuredOutputProvider;
}

export interface ParseCaptureTelemetry {
  estimatedCostUsd?: number;
  inputTokenCount?: number;
  modelName?: string;
  outputTokenCount?: number;
  totalTokenCount?: number;
}

export interface ParseCaptureExecutionResult {
  response: ParseCaptureResponse;
  telemetry: ParseCaptureTelemetry;
}

function assertServerRuntime() {
  const isVitest =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isVitest) {
    throw new Error("parseCapture must run on the server.");
  }
}

export function buildParseCaptureRequest(input: BuildParseCaptureRequestInput) {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required for AI parsing.");
  }

  return {
    model: input.model,
    store: false,
    input: buildParseCaptureMessages({
      rawText,
      areaContext: input.areaContext,
      operatorProfile: input.operatorProfile,
    }),
    text: {
      format: parseCaptureResponseFormat,
    },
  };
}

export async function parseCaptureDetailed(
  input: ParseCaptureInput,
  options: ParseCaptureOptions = {},
): Promise<ParseCaptureExecutionResult> {
  assertServerRuntime();

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI capture parsing.");
  }

  const model = options.model ?? process.env.AI_MODEL_STANDARD;
  if (!model) {
    throw new Error("AI_MODEL_STANDARD is required for AI capture parsing.");
  }

  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required for AI parsing.");
  }

  const provider = options.provider ?? resolveStructuredOutputProvider();
  const { outputText, telemetry } = await provider.generateStructuredOutput({
    model,
    apiKey,
    fetchImpl: options.fetchImpl,
    messages: buildParseCaptureMessages({
      rawText,
      areaContext: input.areaContext,
      operatorProfile: input.operatorProfile,
    }),
    responseFormat: parseCaptureResponseFormat,
  });

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new Error("AI capture parsing response was not valid JSON.");
  }

  try {
    return {
      response: validateParseCaptureResponse(parsedOutput),
      telemetry,
    };
  } catch (error) {
    throw new Error(
      `AI capture parsing response failed schema validation: ${
        error instanceof Error ? error.message : "unknown validation error"
      }`,
    );
  }
}

export async function parseCapture(
  input: ParseCaptureInput,
  options: ParseCaptureOptions = {},
): Promise<ParseCaptureResponse> {
  return (await parseCaptureDetailed(input, options)).response;
}
