export interface StructuredOutputMessage {
  role: string;
  content: string;
}

export interface StructuredOutputRequest {
  model: string;
  messages: StructuredOutputMessage[];
  /** Provider-enforced JSON schema response format (vendor-shaped). */
  responseFormat: unknown;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface StructuredOutputTelemetry {
  estimatedCostUsd?: number;
  inputTokenCount?: number;
  modelName?: string;
  outputTokenCount?: number;
  totalTokenCount?: number;
}

export interface StructuredOutputResult {
  /** Raw JSON text the model produced; callers parse and schema-validate it. */
  outputText: string;
  telemetry: StructuredOutputTelemetry;
}

/**
 * Boundary between LifeOS parse logic and any hosted AI vendor. Schema
 * validation, prompt content, and persistence rules stay outside the
 * provider; a provider only turns a structured request into raw output text
 * plus usage telemetry.
 */
export interface StructuredOutputProvider {
  id: string;
  generateStructuredOutput(
    request: StructuredOutputRequest,
  ): Promise<StructuredOutputResult>;
}
