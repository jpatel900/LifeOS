import type { TaskMapGraphDraft } from "@lifeos/schemas";
import {
  taskMapDraftResponseFormat,
  validateTaskMapDraftResponse,
} from "./contracts/taskMapDraft";
import {
  buildTaskMapDraftMessages,
  type TaskMapDraftBreakdownStepContext,
  type TaskMapDraftCurrentMapContext,
  type TaskMapDraftPromptInput,
  type TaskMapDraftRevisionEvidenceContext,
} from "./contextAssembly";
import {
  resolveStructuredOutputProvider,
  type StructuredOutputProvider,
} from "./provider";

export type {
  TaskMapDraftBreakdownStepContext,
  TaskMapDraftCurrentMapContext,
  TaskMapDraftPromptInput,
  TaskMapDraftRevisionEvidenceContext,
};

export interface TaskMapDraftInput {
  title: string;
  description?: string | null;
  definitionOfDone?: string | null;
  firstTinyStep?: string | null;
  breakdownSteps?: TaskMapDraftBreakdownStepContext[] | null;
  /** FR-031 slice 8 — present only for a regeneration request. */
  currentMap?: TaskMapDraftCurrentMapContext | null;
  /** FR-031 slice F5 (#679) — present only for an evidence-triggered
   * revision request. Prompt data only; same output wire schema. */
  revisionEvidence?: TaskMapDraftRevisionEvidenceContext | null;
}

export interface TaskMapDraftOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  provider?: StructuredOutputProvider;
}

export interface TaskMapDraftTelemetry {
  estimatedCostUsd?: number;
  inputTokenCount?: number;
  modelName?: string;
  outputTokenCount?: number;
  totalTokenCount?: number;
}

export interface TaskMapDraftExecutionResult {
  draft: TaskMapGraphDraft;
  telemetry: TaskMapDraftTelemetry;
}

function assertServerRuntime() {
  const isVitest =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isVitest) {
    throw new Error("taskMapDraft must run on the server.");
  }
}

function requireTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Task title is required for task-map draft generation.");
  }
  return trimmed;
}

export async function taskMapDraftDetailed(
  input: TaskMapDraftInput,
  options: TaskMapDraftOptions = {},
): Promise<TaskMapDraftExecutionResult> {
  assertServerRuntime();

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI task-map drafting.");
  }

  const model = options.model ?? process.env.AI_MODEL_STANDARD;
  if (!model) {
    throw new Error("AI_MODEL_STANDARD is required for AI task-map drafting.");
  }

  const title = requireTitle(input.title);
  const provider = options.provider ?? resolveStructuredOutputProvider();
  const { outputText, telemetry } = await provider.generateStructuredOutput({
    model,
    apiKey,
    fetchImpl: options.fetchImpl,
    messages: buildTaskMapDraftMessages({
      title,
      description: input.description,
      definitionOfDone: input.definitionOfDone,
      firstTinyStep: input.firstTinyStep,
      breakdownSteps: input.breakdownSteps,
      currentMap: input.currentMap,
      revisionEvidence: input.revisionEvidence,
    }),
    responseFormat: taskMapDraftResponseFormat,
  });

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new Error("AI task-map draft response was not valid JSON.");
  }

  try {
    return {
      draft: validateTaskMapDraftResponse(parsedOutput),
      telemetry,
    };
  } catch (error) {
    throw new Error(
      `AI task-map draft response failed schema validation: ${
        error instanceof Error ? error.message : "unknown validation error"
      }`,
    );
  }
}

export async function taskMapDraft(
  input: TaskMapDraftInput,
  options: TaskMapDraftOptions = {},
): Promise<TaskMapGraphDraft> {
  return (await taskMapDraftDetailed(input, options)).draft;
}
