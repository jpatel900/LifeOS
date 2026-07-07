import type { RollupSummaryContent } from "@lifeos/schemas";
import { recordAiCallTrace } from "@/lib/observability";
import {
  buildRollupProseMessages,
  ROLLUP_PROSE_PROMPT_VERSION,
} from "./contextAssembly";
import {
  resolveStructuredOutputProvider,
  type StructuredOutputProvider,
} from "./provider";
import {
  rollupProseResponseFormat,
  validateRollupProseResponse,
} from "./contracts/rollupProse";

/**
 * E3 (#260 follow-up) — AI-prose enhancement for a rollup draft, with a
 * deterministic fallback.
 *
 * Rewrites a rollup's highlight/miss items into warmer prose while holding the
 * facts fixed BY CONSTRUCTION:
 *   - counts are never sent to the model and are copied through unchanged;
 *   - the model may only rephrase items 1:1 (same count, same order);
 *   - the returned item-set is re-validated (lengths match, no empties) and any
 *     mismatch falls back to the deterministic draft.
 * The rollup approve-before-persist gate (NS-INV-4) is the final human backstop.
 *
 * This function NEVER throws: the deterministic draft is always a valid result,
 * so a missing key, disabled flag, provider outage, or a malformed/unfaithful
 * response all degrade silently to the deterministic prose. It runs server-side
 * only (the provider call needs OPENAI_API_KEY).
 */

export interface EnhanceRollupProseInput {
  areaLabel: string;
  periodType: "week" | "month";
  periodLabel: string;
  /** The deterministic draft the user is about to approve. */
  draft: RollupSummaryContent;
}

export interface EnhanceRollupProseOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  forceMock?: boolean;
  provider?: StructuredOutputProvider;
  /** Caller's Supabase access token for the fire-and-forget ai_call_traces row. */
  traceContext?: { accessToken?: string | null };
  recordAiCallTraceImpl?: typeof recordAiCallTrace;
}

export interface EnhanceRollupProseResult {
  source: "ai" | "deterministic";
  summary: RollupSummaryContent;
  /** True when a real AI attempt failed/was unfaithful and we degraded. */
  degraded?: boolean;
}

function assertServerRuntime() {
  const isVitest =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isVitest) {
    throw new Error("rollupProseService must run on the server.");
  }
}

function isRollupProseEnabled(env: Partial<NodeJS.ProcessEnv>) {
  const raw = env.AI_ROLLUP_PROSE_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

// Prose rewriting is a light task, so prefer the cheap tier when configured.
function resolveRollupProseModel(env: Partial<NodeJS.ProcessEnv>) {
  return (
    env.AI_MODEL_CHEAP?.trim() ||
    env.AI_MODEL_STANDARD?.trim() ||
    env.AI_MODEL_STRONG?.trim() ||
    null
  );
}

/**
 * Enforce faithfulness structurally: the rewrite must have the SAME number of
 * items in the SAME order and no empty strings. Returns the cleaned items, or
 * null when the model added/dropped/emptied an item (→ deterministic fallback).
 */
function preserveItemSet(
  source: string[],
  rewritten: string[],
): string[] | null {
  if (rewritten.length !== source.length) {
    return null;
  }
  const cleaned = rewritten.map((item) => item.trim());
  if (cleaned.some((item) => item.length === 0)) {
    return null;
  }
  return cleaned;
}

export async function enhanceRollupProse(
  input: EnhanceRollupProseInput,
  options: EnhanceRollupProseOptions = {},
): Promise<EnhanceRollupProseResult> {
  assertServerRuntime();

  const deterministic: EnhanceRollupProseResult = {
    source: "deterministic",
    summary: input.draft,
  };

  const env = options.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = resolveRollupProseModel(env);
  const hasItems =
    input.draft.highlights.length > 0 || input.draft.misses.length > 0;

  // Deterministic when: forced, disabled, unconfigured, or nothing to rephrase.
  if (
    options.forceMock ||
    !isRollupProseEnabled(env) ||
    !apiKey ||
    !model ||
    !hasItems
  ) {
    return deterministic;
  }

  const startedAt = Date.now();
  const accessToken = options.traceContext?.accessToken ?? null;
  const recordImpl = options.recordAiCallTraceImpl ?? recordAiCallTrace;

  const trace = (
    outcome: "passed" | "schema_failed" | "failed",
    telemetry?: { inputTokens?: number | null; outputTokens?: number | null },
  ) => {
    try {
      void Promise.resolve(
        recordImpl({
          accessToken,
          surface: "rollup",
          promptVersion: ROLLUP_PROSE_PROMPT_VERSION,
          model,
          inputTokens: telemetry?.inputTokens ?? null,
          outputTokens: telemetry?.outputTokens ?? null,
          latencyMs: Date.now() - startedAt,
          validationOutcome: outcome,
        }),
      ).catch(() => {
        // ai_call_traces is best-effort; a trace failure never affects output.
      });
    } catch {
      // Same — never let tracing throw into the enhancement path.
    }
  };

  try {
    const provider = options.provider ?? resolveStructuredOutputProvider(env);
    const { outputText, telemetry } = await provider.generateStructuredOutput({
      model,
      messages: buildRollupProseMessages({
        areaLabel: input.areaLabel,
        periodType: input.periodType,
        periodLabel: input.periodLabel,
        highlights: input.draft.highlights,
        misses: input.draft.misses,
        counts: input.draft.counts,
      }),
      responseFormat: rollupProseResponseFormat,
      apiKey,
    });

    const response = validateRollupProseResponse(JSON.parse(outputText));
    const highlights = preserveItemSet(
      input.draft.highlights,
      response.highlights,
    );
    const misses = preserveItemSet(input.draft.misses, response.misses);

    // Any faithfulness violation (added/dropped/emptied item) → deterministic.
    if (!highlights || !misses) {
      trace("schema_failed", {
        inputTokens: telemetry?.inputTokenCount,
        outputTokens: telemetry?.outputTokenCount,
      });
      return { ...deterministic, degraded: true };
    }

    trace("passed", {
      inputTokens: telemetry?.inputTokenCount,
      outputTokens: telemetry?.outputTokenCount,
    });

    return {
      source: "ai",
      summary: {
        highlights,
        misses,
        // Counts are authoritative and never touched by the model.
        counts: input.draft.counts,
      },
    };
  } catch {
    // Provider outage, invalid JSON, schema failure — degrade to deterministic.
    trace("failed");
    return { ...deterministic, degraded: true };
  }
}
