import type { TaskMapGraphDraft } from "@lifeos/schemas";
import {
  recordAiCallTrace,
  type AiCallTraceValidationOutcome,
} from "@/lib/observability";
import { validateTaskMapForPersistence } from "@/lib/taskmap/persistence";
import {
  taskMapDraftDetailed,
  type TaskMapDraftBreakdownStepContext,
  type TaskMapDraftCurrentMapContext,
  type TaskMapDraftOptions,
  type TaskMapDraftTelemetry,
} from "./taskMapDraft";
import { TASK_MAP_DRAFT_SCHEMA_VERSION } from "./contracts/taskMapDraft";
import { TASK_MAP_DRAFT_PROMPT_VERSION } from "./contextAssembly";
import { resolveStructuredOutputProvider } from "./provider";

/**
 * FR-031 slice 4 — task-map draft generation service.
 *
 * Mirrors `parseCaptureService.ts`'s mock-first / provider plumbing and
 * `ai_call_traces` observability, with one deliberate difference (NFR-004):
 * this service never throws for provider failure, AI schema-invalid output,
 * or graph-invalid output. Each of those degrades to a typed, non-throwing
 * `{ ok: false, degrade: "breakdown_rail" }` result so the caller (the
 * generation route) can always respond, never hit a dead end.
 */

export interface TaskMapDraftServiceInput {
  title: string;
  description?: string | null;
  definitionOfDone?: string | null;
  firstTinyStep?: string | null;
  breakdownSteps?: TaskMapDraftBreakdownStepContext[] | null;
  /** FR-031 slice 8 — present only for a regeneration request (an
   * already-approved map exists for this task). The mock parser ignores
   * this (its degrade/validate behavior is unchanged either way); only the
   * AI prompt (via `contextAssembly.ts`) reads it. */
  currentMap?: TaskMapDraftCurrentMapContext | null;
}

export interface TaskMapDraftServiceOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  forceMock?: boolean;
  taskMapDraftImpl?: (
    input: TaskMapDraftServiceInput,
    options: Pick<TaskMapDraftOptions, "apiKey" | "model">,
  ) => Promise<TaskMapGraphDraft>;
  /**
   * Caller context for Postgres AI call tracing (issue #288), same shape as
   * parseCaptureService.
   */
  traceContext?: {
    accessToken?: string | null;
  };
  recordAiCallTraceImpl?: typeof recordAiCallTrace;
}

export type TaskMapDraftServiceResult =
  | {
      ok: true;
      parser: "ai" | "mock";
      draft: TaskMapGraphDraft;
      telemetry?: TaskMapDraftTelemetry;
    }
  | {
      ok: false;
      degrade: "breakdown_rail";
      errorCategory: string;
      errors: string[];
    };

export type TaskMapDraftRuntimeStatus =
  | "mock"
  | "ai_configured"
  | "ai_unavailable";

export interface TaskMapDraftStatusResult {
  status: TaskMapDraftRuntimeStatus;
  preferredParser: "ai" | "mock";
}

function assertServerRuntime() {
  const isVitest =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isVitest) {
    throw new Error("taskMapDraftService must run on the server.");
  }
}

function isTaskMapDraftEnabled(env: Partial<NodeJS.ProcessEnv>) {
  const raw = env.AI_TASK_MAP_DRAFT_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(raw);
}

function resolveTaskMapDraftModelConfig(env: Partial<NodeJS.ProcessEnv>) {
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

function categorizeTaskMapDraftError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/task title is required/i.test(message)) {
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

  if (/request failed: (429|500|502|503|504)\b/i.test(message)) {
    return "provider_runtime_unavailable";
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

// Provider/runtime failure messages may carry vendor-specific detail; this
// service never echoes raw exception text to the caller (route). Categories
// map to one safe, static sentence each.
function safeDegradeMessage(category: string) {
  switch (category) {
    case "input_invalid":
      return "Task title is required for map drafting.";
    case "provider_config_missing_api_key":
    case "parser_config_missing_model":
      return "AI task-map drafting is not configured.";
    case "provider_runtime_unavailable":
      return "AI provider is temporarily unavailable.";
    case "provider_output_missing":
    case "provider_invalid_json":
    case "provider_schema_validation_failed":
      return "AI task-map draft response failed schema validation.";
    default:
      return "Task-map draft generation failed safely.";
  }
}

function getValidationStatus(error: unknown) {
  return categorizeTaskMapDraftError(error) ===
    "provider_schema_validation_failed"
    ? "failed"
    : "not_run";
}

export function getTaskMapDraftStatus(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): TaskMapDraftStatusResult {
  assertServerRuntime();

  if (!isTaskMapDraftEnabled(env)) {
    return { status: "mock", preferredParser: "mock" };
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { status: "ai_unavailable", preferredParser: "mock" };
  }

  const model = resolveTaskMapDraftModelConfig(env);
  if (!model) {
    return { status: "ai_unavailable", preferredParser: "mock" };
  }

  return { status: "ai_configured", preferredParser: "ai" };
}

/**
 * Deterministic mock draft: re-drafts the existing linear breakdown (when
 * present) into a linear required-node chain, or falls back to one generic
 * required node. Always structurally valid (no branching, no cycles).
 */
function buildMockDraft(input: TaskMapDraftServiceInput): TaskMapGraphDraft {
  const sourceSteps =
    input.breakdownSteps && input.breakdownSteps.length > 0
      ? input.breakdownSteps
      : [{ title: `Do the core work for: ${input.title}` }];

  const nodes = sourceSteps.slice(0, 7).map((step, index) => ({
    id: `step-${index + 1}`,
    title: step.title,
    role: "required" as const,
  }));

  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index]!.id,
    to: node.id,
  }));

  return {
    schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
    nodes,
    edges,
  };
}

interface RawDraftResult {
  parser: "ai" | "mock";
  draft: TaskMapGraphDraft;
  telemetry?: TaskMapDraftTelemetry;
}

export async function generateTaskMapDraftWithFallback(
  input: TaskMapDraftServiceInput,
  options: TaskMapDraftServiceOptions = {},
): Promise<TaskMapDraftServiceResult> {
  assertServerRuntime();

  const title = input.title.trim();
  if (!title) {
    return {
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: "input_invalid",
      errors: [safeDegradeMessage("input_invalid")],
    };
  }

  const env = options.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY;
  const aiEnabled = isTaskMapDraftEnabled(env);
  const modelConfig = resolveTaskMapDraftModelConfig(env);
  const parser =
    options.forceMock || !aiEnabled || !apiKey
      ? ("mock" as const)
      : ("ai" as const);

  const startedAt = Date.now();

  const warnTraceFailure = (error: unknown) => {
    console.warn(
      `ai_call_traces: trace recording failed and was ignored: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  };

  const recordTraceRow = (
    outcome:
      | { status: "passed"; result: RawDraftResult }
      | { status: Exclude<AiCallTraceValidationOutcome, "passed"> },
  ) => {
    if (parser !== "ai" || !modelConfig) {
      return;
    }

    const recordImpl = options.recordAiCallTraceImpl ?? recordAiCallTrace;
    const accessToken = options.traceContext?.accessToken ?? null;
    const latencyMs = Date.now() - startedAt;
    const traceInput =
      outcome.status === "passed"
        ? {
            accessToken,
            surface: "task_map_draft",
            promptVersion: TASK_MAP_DRAFT_PROMPT_VERSION,
            model: outcome.result.telemetry?.modelName ?? modelConfig.model,
            inputTokens: outcome.result.telemetry?.inputTokenCount ?? null,
            outputTokens: outcome.result.telemetry?.outputTokenCount ?? null,
            latencyMs,
            validationOutcome: "passed" as const,
          }
        : {
            accessToken,
            surface: "task_map_draft",
            promptVersion: TASK_MAP_DRAFT_PROMPT_VERSION,
            model: modelConfig.model,
            inputTokens: null,
            outputTokens: null,
            latencyMs,
            validationOutcome: outcome.status,
          };

    try {
      void Promise.resolve(recordImpl(traceInput)).catch(warnTraceFailure);
    } catch (error) {
      warnTraceFailure(error);
    }
  };

  // NB: this generation runs a plain (non-Langfuse-traced) AI call — a
  // source-of-truth guard test keeps the Langfuse span-wrapper helpers in
  // "./observability" scoped to the parse-capture service only. Postgres
  // `ai_call_traces` tracing (below, `recordAiCallTrace`) is the house
  // pattern other AI surfaces (rollup-prose) use instead, and is what this
  // service uses too.
  const runRaw = async (): Promise<RawDraftResult> => {
    if (parser === "mock") {
      return { parser: "mock", draft: buildMockDraft({ ...input, title }) };
    }

    if (!modelConfig) {
      throw new Error(
        "One of AI_MODEL_STANDARD, AI_MODEL_CHEAP, or AI_MODEL_STRONG is required when OPENAI_API_KEY is configured.",
      );
    }

    if (options.taskMapDraftImpl) {
      const draft = await options.taskMapDraftImpl(
        { ...input, title },
        { apiKey, model: modelConfig.model },
      );

      return {
        parser: "ai",
        draft,
        telemetry: { modelName: modelConfig.model },
      };
    }

    const result = await taskMapDraftDetailed(
      {
        title,
        description: input.description,
        definitionOfDone: input.definitionOfDone,
        firstTinyStep: input.firstTinyStep,
        breakdownSteps: input.breakdownSteps,
        currentMap: input.currentMap,
      },
      {
        apiKey,
        model: modelConfig.model,
        provider: resolveStructuredOutputProvider(env),
      },
    );

    return {
      parser: "ai",
      draft: result.draft,
      telemetry: result.telemetry,
    };
  };

  let rawResult: RawDraftResult;
  try {
    rawResult = await runRaw();
  } catch (error) {
    const category = categorizeTaskMapDraftError(error);
    recordTraceRow({
      status:
        getValidationStatus(error) === "failed" ? "schema_failed" : "failed",
    });

    return {
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: category,
      errors: [safeDegradeMessage(category)],
    };
  }

  const persistenceCheck = validateTaskMapForPersistence(rawResult.draft);
  if (!persistenceCheck.ok) {
    recordTraceRow({ status: "schema_failed" });
    return {
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: "graph_invalid",
      errors: persistenceCheck.errors,
    };
  }

  recordTraceRow({ status: "passed", result: rawResult });

  return {
    ok: true,
    parser: rawResult.parser,
    draft: persistenceCheck.graph,
    telemetry: rawResult.telemetry,
  };
}
