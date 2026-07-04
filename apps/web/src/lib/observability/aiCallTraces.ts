import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Postgres LLM call tracing (issue #288).
 *
 * Writes one metadata-only row to `ai_call_traces` per AI call: surface,
 * prompt version, model, token counts, latency, and validation outcome.
 * NO raw prompt or response content ever flows through this module — raw
 * content stays in the existing capture tables (privacy doctrine).
 *
 * Recording is strictly fire-and-forget: this function must never throw
 * and must never slow or fail the user action it observes. Every failure
 * path degrades to a console-level warning.
 */

export type AiCallTraceValidationOutcome =
  | "passed"
  | "schema_failed"
  | "retried"
  | "failed";

export interface RecordAiCallTraceInput {
  /** Caller's Supabase access token; the insert runs user-scoped under RLS. */
  accessToken: string | null;
  /** Which AI surface made the call (for example "parse"). */
  surface: string;
  promptVersion: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  validationOutcome: AiCallTraceValidationOutcome;
}

export interface RecordAiCallTraceDependencies {
  createClientImpl?: typeof createSupabaseServerClient;
  warn?: (message: string) => void;
}

function normalizeTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

export async function recordAiCallTrace(
  input: RecordAiCallTraceInput,
  dependencies: RecordAiCallTraceDependencies = {},
): Promise<void> {
  const warn =
    dependencies.warn ??
    ((message: string) => {
      console.warn(message);
    });

  try {
    if (!input.accessToken) {
      warn(
        "ai_call_traces: skipped trace insert because no user access token was provided.",
      );
      return;
    }

    const createClientImpl =
      dependencies.createClientImpl ?? createSupabaseServerClient;
    const client = createClientImpl({ accessToken: input.accessToken });

    if (!client) {
      // Supabase is not configured (local/mock mode); tracing degrades silently.
      return;
    }

    const { data, error: userError } = await client.auth.getUser();

    if (userError || !data.user) {
      warn(
        "ai_call_traces: skipped trace insert because the caller could not be resolved.",
      );
      return;
    }

    const { error: insertError } = await client.from("ai_call_traces").insert({
      user_id: data.user.id,
      surface: input.surface,
      prompt_version: input.promptVersion,
      model: input.model,
      input_tokens: normalizeTokenCount(input.inputTokens),
      output_tokens: normalizeTokenCount(input.outputTokens),
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      validation_outcome: input.validationOutcome,
    });

    if (insertError) {
      warn(
        `ai_call_traces: trace insert failed and was ignored: ${insertError.message}`,
      );
    }
  } catch (error) {
    warn(
      `ai_call_traces: trace recording failed and was ignored: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}
