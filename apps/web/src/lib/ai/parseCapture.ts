import type { ParseCaptureResponse } from "@lifeos/schemas";
import { parseCaptureResponseFormat, validateParseCaptureResponse } from "./contracts/parseCapture";
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

interface ResponsesApiContentItem {
  text?: unknown;
}

interface ResponsesApiOutputItem {
  content?: unknown;
}

interface ResponsesApiResponseBody {
  output_text?: unknown;
  output?: unknown;
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

export async function parseCapture(
  input: ParseCaptureInput,
  options: ParseCaptureOptions = {},
): Promise<ParseCaptureResponse> {
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
    return validateParseCaptureResponse(parsedOutput);
  } catch (error) {
    throw new Error(
      `AI capture parsing response failed schema validation: ${
        error instanceof Error ? error.message : "unknown validation error"
      }`,
    );
  }
}
