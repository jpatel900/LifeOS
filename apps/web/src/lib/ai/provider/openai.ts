import type {
  StructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResult,
  StructuredOutputTelemetry,
} from "./types";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

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
): StructuredOutputTelemetry {
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

export const openAiStructuredOutputProvider: StructuredOutputProvider = {
  id: "openai",
  async generateStructuredOutput(
    request: StructuredOutputRequest,
  ): Promise<StructuredOutputResult> {
    const response = await (request.fetchImpl ?? fetch)(RESPONSES_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        store: false,
        input: request.messages,
        text: {
          format: request.responseFormat,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`AI capture parsing request failed: ${response.status}`);
    }

    const body = (await response.json()) as ResponsesApiResponseBody;
    const outputText = getOutputText(body);
    if (!outputText) {
      throw new Error(
        "AI capture parsing response did not include output text.",
      );
    }

    return {
      outputText,
      telemetry: extractTelemetry(body, request.model),
    };
  },
};
