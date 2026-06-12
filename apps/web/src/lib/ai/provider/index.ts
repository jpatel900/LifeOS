import { openAiStructuredOutputProvider } from "./openai";
import type { StructuredOutputProvider } from "./types";

export type {
  StructuredOutputMessage,
  StructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResult,
  StructuredOutputTelemetry,
} from "./types";

const providers: Record<string, StructuredOutputProvider> = {
  openai: openAiStructuredOutputProvider,
};

export const DEFAULT_AI_PROVIDER_ID = "openai";

/**
 * Resolve the configured AI provider. OpenAI is the documented V1 product
 * decision; AI_PROVIDER exists so a second provider can be added behind this
 * boundary later without touching parse contracts or call sites.
 */
export function resolveStructuredOutputProvider(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): StructuredOutputProvider {
  const requested =
    env.AI_PROVIDER?.trim().toLowerCase() || DEFAULT_AI_PROVIDER_ID;
  const provider = providers[requested];

  if (!provider) {
    throw new Error(
      `Unknown AI_PROVIDER "${requested}". Supported providers: ${Object.keys(
        providers,
      ).join(", ")}.`,
    );
  }

  return provider;
}
