import {
  TaskMapGraphDraftSchema,
  type TaskMapGraphDraft,
} from "@lifeos/schemas";

/**
 * FR-031 slice 5 — browser-safe client for POST /api/task-map. Mirrors
 * `parseCaptureClient.ts`'s fetch/parse/degrade shape. Unlike parse-capture,
 * this route requires a bearer token (route.ts rejects with 401 otherwise),
 * so a missing/expired session surfaces as an ordinary `ok:false` degrade —
 * never a thrown error — and the caller falls back to the plain breakdown
 * rail (NFR-004).
 */

export interface TaskMapDraftRequestInput {
  taskId: string;
  areaId: string | null;
  title: string;
  description: string | null;
  definitionOfDone: string | null;
  firstTinyStep: string | null;
  authorization?: string;
  fetchImpl?: typeof fetch;
}

export type TaskMapDraftRequestResult =
  | {
      ok: true;
      draft: TaskMapGraphDraft;
      suggestionRecordId: string | null;
    }
  | {
      ok: false;
      error: string;
      degrade: "breakdown_rail";
    };

const SAFE_FAILURE_MESSAGE =
  "Couldn't draft a map right now. Staying on the step list.";

export async function requestTaskMapDraft(
  input: TaskMapDraftRequestInput,
): Promise<TaskMapDraftRequestResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  let body: Record<string, unknown>;
  let httpOk: boolean;
  try {
    const httpResponse = await fetchImpl("/api/task-map", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
      body: JSON.stringify({
        taskId: input.taskId,
        areaId: input.areaId,
        title: input.title,
        description: input.description,
        definitionOfDone: input.definitionOfDone,
        firstTinyStep: input.firstTinyStep,
        breakdownSteps: null,
        parserMode: "auto",
      }),
    });
    httpOk = httpResponse.ok;
    body = (await httpResponse.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: SAFE_FAILURE_MESSAGE,
      degrade: "breakdown_rail",
    };
  }

  if (!httpOk || body.ok !== true) {
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : SAFE_FAILURE_MESSAGE,
      degrade: "breakdown_rail",
    };
  }

  // Validate before staging anything client-side; never trust transport blindly.
  const parsedDraft = TaskMapGraphDraftSchema.safeParse(body.draft);
  if (!parsedDraft.success) {
    return {
      ok: false,
      error: SAFE_FAILURE_MESSAGE,
      degrade: "breakdown_rail",
    };
  }

  return {
    ok: true,
    draft: parsedDraft.data,
    suggestionRecordId:
      typeof body.suggestionRecordId === "string"
        ? body.suggestionRecordId
        : null,
  };
}
