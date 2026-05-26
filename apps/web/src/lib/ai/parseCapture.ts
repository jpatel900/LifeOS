import type { ParseCaptureResponse } from "@lifeos/schemas";
import {
  parseCaptureResponseFormat,
  validateParseCaptureResponse,
} from "./contracts/parseCapture";
import {
  buildParseCaptureMessages,
  type ParseCaptureAreaContext,
} from "./prompts/parseCapturePrompt";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

export interface BuildParseCaptureRequestInput {
  rawText: string;
  model: string;
  areaContext?: ParseCaptureAreaContext[];
}

export interface ParseCaptureInput {
  rawText: string;
  areaContext?: ParseCaptureAreaContext[];
}

export interface ParseCaptureOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
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

interface ResponsesApiContentItem {
  text?: unknown;
}

interface ResponsesApiOutputItem {
  content?: unknown;
}

interface ResponsesApiResponseBody {
  model?: unknown;
  output_text?: unknown;
  output?: unknown;
  usage?: unknown;
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
    }),
    text: {
      format: parseCaptureResponseFormat,
    },
  };
}

function getOutputText(body: ResponsesApiResponseBody) {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  if (!Array.isArray(body.output)) {
    return null;
  }

  for (const outputItem of body.output as ResponsesApiOutputItem[]) {
    if (!Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content as ResponsesApiContentItem[]) {
      if (typeof contentItem.text === "string") {
        return contentItem.text;
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractTelemetry(
  body: ResponsesApiResponseBody,
  requestedModel: string,
): ParseCaptureTelemetry {
  const usage = isRecord(body.usage) ? body.usage : null;

  return {
    estimatedCostUsd:
      getFiniteNumber(usage?.total_cost_usd) ??
      getFiniteNumber(usage?.estimated_cost_usd) ??
      getFiniteNumber(usage?.total_cost),
    inputTokenCount: getFiniteNumber(usage?.input_tokens),
    modelName:
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : requestedModel,
    outputTokenCount: getFiniteNumber(usage?.output_tokens),
    totalTokenCount: getFiniteNumber(usage?.total_tokens),
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

  const response = await (options.fetchImpl ?? fetch)(RESPONSES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildParseCaptureRequest({
        ...input,
        model,
      }),
    ),
  });

  if (!response.ok) {
    throw new Error(`AI capture parsing request failed: ${response.status}`);
  }

  const body = (await response.json()) as ResponsesApiResponseBody;
  const outputText = getOutputText(body);
  if (!outputText) {
    throw new Error("AI capture parsing response did not include output text.");
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new Error("AI capture parsing response was not valid JSON.");
  }

  try {
    return {
      response: validateParseCaptureResponse(parsedOutput),
      telemetry: extractTelemetry(body, model),
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
