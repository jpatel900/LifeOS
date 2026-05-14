import { LangfuseSpanProcessor, isLangfuseSpan } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getLangfuseInitConfig } from "./src/lib/observability/langfuse";
import { registerObservabilityRuntime } from "./src/lib/observability/runtime";
import type { ObservabilityPrimitive } from "./src/lib/observability/types";

function getNumberMetadata(
  metadata: Record<string, ObservabilityPrimitive>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStringMetadata(
  metadata: Record<string, ObservabilityPrimitive>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildUsageDetails(metadata: Record<string, ObservabilityPrimitive>) {
  const input = getNumberMetadata(metadata, "input_token_count");
  const output = getNumberMetadata(metadata, "output_token_count");
  const total = getNumberMetadata(metadata, "total_token_count");

  if (input === undefined && output === undefined && total === undefined) {
    return undefined;
  }

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  };
}

function buildCostDetails(metadata: Record<string, ObservabilityPrimitive>) {
  const estimatedCostUsd = getNumberMetadata(metadata, "estimated_cost_usd");

  if (estimatedCostUsd === undefined) {
    return undefined;
  }

  return {
    estimatedCostUsd,
  };
}

const config = getLangfuseInitConfig();

if (config) {
  const spanProcessor = new LangfuseSpanProcessor({
    ...config,
    shouldExportSpan: ({ otelSpan }) => isLangfuseSpan(otelSpan),
  });
  const sdk = new NodeSDK({
    spanProcessors: [spanProcessor],
  });

  sdk.start();

  registerObservabilityRuntime({
    langfuse: {
      transportMode: "langfuse_sdk",
      async traceAiOperation(input, run) {
        const startedAt = Date.now();

        return startActiveObservation(
          input.operation,
          async (generation) => {
            generation.update({
              metadata: input.metadata,
              model: getStringMetadata(input.metadata, "model_name"),
            });

            try {
              const value = await run();
              const metadata = {
                ...input.metadata,
                ...(input.finalizeMetadata?.({ ok: true, value }) ?? {}),
                latency_ms: Date.now() - startedAt,
              };

              generation.update({
                metadata,
                model: getStringMetadata(metadata, "model_name"),
                statusMessage: getStringMetadata(metadata, "status"),
                usageDetails: buildUsageDetails(metadata),
                costDetails: buildCostDetails(metadata),
                version:
                  getStringMetadata(metadata, "parser_version") ??
                  getStringMetadata(metadata, "prompt_version"),
              });

              return value;
            } catch (error) {
              const metadata = {
                ...input.metadata,
                ...(input.finalizeMetadata?.({ ok: false, error }) ?? {}),
                latency_ms: Date.now() - startedAt,
              };

              generation.update({
                metadata,
                level: "ERROR",
                model: getStringMetadata(metadata, "model_name"),
                statusMessage:
                  getStringMetadata(metadata, "error_category") ?? "unknown_error",
                usageDetails: buildUsageDetails(metadata),
                costDetails: buildCostDetails(metadata),
                version:
                  getStringMetadata(metadata, "parser_version") ??
                  getStringMetadata(metadata, "prompt_version"),
              });

              throw error;
            }
          },
          { asType: "generation" },
        );
      },
      async flush() {
        await spanProcessor.forceFlush();
      },
      async shutdown() {
        await spanProcessor.shutdown();
        await sdk.shutdown();
      },
    },
  });
}
