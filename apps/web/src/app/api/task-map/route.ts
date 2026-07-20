import {
  getTaskMapDraftStatus,
  generateTaskMapDraftWithFallback,
} from "@/lib/ai/taskMapDraftService";
import {
  recordTaskMapDraftSuggestion,
  TASK_MAP_DRAFT_POLICY_ID,
  TASK_MAP_REVISION_POLICY_ID,
  type MinimalSupabaseClient,
} from "@/lib/data/workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability";

/**
 * FR-031 slice 4 — on-demand task-map draft generation.
 *
 * Mirrors `api/parse-capture/route.ts`'s provider/mock-first plumbing and
 * `ai_call_traces` observability. One deliberate divergence: this route
 * requires a bearer token. `parse-capture`'s bearer is optional and
 * tracing-only — this route additionally identifies the user for the
 * NS-INV-3 suggestion_records write and the one-pass approve linkage
 * (the returned suggestion id), so an unauthenticated caller is rejected
 * outright rather than degraded to an anonymous trace.
 *
 * NS-INV-4: this endpoint never persists. It returns the AI-drafted graph
 * ephemerally, like a parse-capture draft; only the approve path
 * (`approveTaskMap` in `@/lib/data/workflow`) writes `tasks.progression_map`.
 */

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value?.trim()) {
    return null;
  }

  return value.trim();
}

interface BreakdownStepInput {
  title: string;
  estimatedMinutes?: number | null;
}

interface CurrentMapNodeInput {
  id: string;
  title: string;
  role: "required" | "optional" | "red";
  done?: boolean;
  red_reason?: string | null;
  red_condition?: string | null;
  /** FR-031 slice F5 (#679): approved estimate carried back as prompt data. */
  estimated_minutes?: number | null;
  /** FR-031 slice F5 (#679, closes the #685 AGENT-TODO): the approved
   * opening-move flag carried back as prompt data. */
  two_minute_move?: boolean;
}

interface CurrentMapEdgeInput {
  from: string;
  to: string;
}

interface CurrentMapInput {
  nodes: CurrentMapNodeInput[];
  edges: CurrentMapEdgeInput[];
}

const REVISION_SIGNAL_KINDS = [
  "out_of_order_completion",
  "duration_drift",
  "cut_scope",
  "blocker",
] as const;

const MAX_REVISION_SIGNALS = 8;
const MAX_REVISION_DETAIL_LENGTH = 200;

interface RevisionSignalInput {
  kind: (typeof REVISION_SIGNAL_KINDS)[number];
  detail: string;
}

interface RevisionInput {
  signals: RevisionSignalInput[];
}

interface TaskMapRequestBody {
  taskId: string;
  areaId: string | null;
  title: string;
  description: string | null;
  definitionOfDone: string | null;
  firstTinyStep: string | null;
  breakdownSteps: BreakdownStepInput[] | null;
  parserMode: "auto" | "mock";
  /** FR-031 slice 8 — present only when the client is requesting a
   * regeneration of an already-approved map (explicit user action; this
   * route stays on-demand-only either way). */
  currentMap: CurrentMapInput | null;
  /** FR-031 slice F5 (#679) — present only for an evidence-triggered
   * revision request (offer tapped at node-completion or Close). Signals
   * are computed client-side by the deterministic kernel and treated as
   * bounded prompt DATA here; the route stays stateless and still returns
   * the same wire schema. Requires `currentMap`. */
  revision: RevisionInput | null;
}

function parseRequestBody(body: unknown): TaskMapRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Task map request body is required.");
  }

  const record = body as Record<string, unknown>;

  if (typeof record.taskId !== "string" || !record.taskId.trim()) {
    throw new Error("taskId is required.");
  }

  if (typeof record.title !== "string" || !record.title.trim()) {
    throw new Error("title is required.");
  }

  if (
    record.areaId !== undefined &&
    record.areaId !== null &&
    typeof record.areaId !== "string"
  ) {
    throw new Error("areaId must be a string when provided.");
  }

  if (
    record.description !== undefined &&
    record.description !== null &&
    typeof record.description !== "string"
  ) {
    throw new Error("description must be a string when provided.");
  }

  if (
    record.definitionOfDone !== undefined &&
    record.definitionOfDone !== null &&
    typeof record.definitionOfDone !== "string"
  ) {
    throw new Error("definitionOfDone must be a string when provided.");
  }

  if (
    record.firstTinyStep !== undefined &&
    record.firstTinyStep !== null &&
    typeof record.firstTinyStep !== "string"
  ) {
    throw new Error("firstTinyStep must be a string when provided.");
  }

  let breakdownSteps: BreakdownStepInput[] | null = null;
  if (record.breakdownSteps !== undefined && record.breakdownSteps !== null) {
    if (!Array.isArray(record.breakdownSteps)) {
      throw new Error("breakdownSteps must be an array when provided.");
    }

    breakdownSteps = record.breakdownSteps.map((step) => {
      if (
        !step ||
        typeof step !== "object" ||
        typeof (step as Record<string, unknown>).title !== "string"
      ) {
        throw new Error("breakdownSteps entries require a title.");
      }

      const stepRecord = step as Record<string, unknown>;
      const estimatedMinutes =
        typeof stepRecord.estimatedMinutes === "number"
          ? stepRecord.estimatedMinutes
          : null;

      return { title: stepRecord.title as string, estimatedMinutes };
    });
  }

  let parserMode: "auto" | "mock" = "auto";
  if (record.parserMode !== undefined) {
    if (record.parserMode === "auto" || record.parserMode === "mock") {
      parserMode = record.parserMode;
    } else {
      throw new Error("parserMode must be auto or mock when provided.");
    }
  }

  let currentMap: CurrentMapInput | null = null;
  if (record.currentMap !== undefined && record.currentMap !== null) {
    if (typeof record.currentMap !== "object") {
      throw new Error("currentMap must be an object when provided.");
    }
    const mapRecord = record.currentMap as Record<string, unknown>;

    if (!Array.isArray(mapRecord.nodes)) {
      throw new Error("currentMap.nodes must be an array.");
    }
    const nodes = mapRecord.nodes.map((node) => {
      if (
        !node ||
        typeof node !== "object" ||
        typeof (node as Record<string, unknown>).id !== "string" ||
        typeof (node as Record<string, unknown>).title !== "string" ||
        !["required", "optional", "red"].includes(
          (node as Record<string, unknown>).role as string,
        )
      ) {
        throw new Error("currentMap.nodes entries require id, title, role.");
      }
      const nodeRecord = node as Record<string, unknown>;
      return {
        id: nodeRecord.id as string,
        title: nodeRecord.title as string,
        role: nodeRecord.role as "required" | "optional" | "red",
        done: nodeRecord.done === true,
        red_reason:
          typeof nodeRecord.red_reason === "string"
            ? nodeRecord.red_reason
            : null,
        red_condition:
          typeof nodeRecord.red_condition === "string"
            ? nodeRecord.red_condition
            : null,
        estimated_minutes:
          typeof nodeRecord.estimated_minutes === "number" &&
          Number.isFinite(nodeRecord.estimated_minutes) &&
          nodeRecord.estimated_minutes > 0
            ? nodeRecord.estimated_minutes
            : null,
        two_minute_move: nodeRecord.two_minute_move === true,
      };
    });

    if (!Array.isArray(mapRecord.edges)) {
      throw new Error("currentMap.edges must be an array.");
    }
    const edges = mapRecord.edges.map((edge) => {
      if (
        !edge ||
        typeof edge !== "object" ||
        typeof (edge as Record<string, unknown>).from !== "string" ||
        typeof (edge as Record<string, unknown>).to !== "string"
      ) {
        throw new Error("currentMap.edges entries require from and to.");
      }
      const edgeRecord = edge as Record<string, unknown>;
      return { from: edgeRecord.from as string, to: edgeRecord.to as string };
    });

    currentMap = { nodes, edges };
  }

  let revision: RevisionInput | null = null;
  if (record.revision !== undefined && record.revision !== null) {
    if (typeof record.revision !== "object") {
      throw new Error("revision must be an object when provided.");
    }
    if (!currentMap) {
      throw new Error("revision requires currentMap.");
    }
    const revisionRecord = record.revision as Record<string, unknown>;
    if (!Array.isArray(revisionRecord.signals)) {
      throw new Error("revision.signals must be an array.");
    }
    if (
      revisionRecord.signals.length === 0 ||
      revisionRecord.signals.length > MAX_REVISION_SIGNALS
    ) {
      throw new Error(
        `revision.signals must contain 1-${MAX_REVISION_SIGNALS} entries.`,
      );
    }
    const signals = revisionRecord.signals.map((signal) => {
      if (
        !signal ||
        typeof signal !== "object" ||
        typeof (signal as Record<string, unknown>).detail !== "string" ||
        !REVISION_SIGNAL_KINDS.includes(
          (signal as Record<string, unknown>)
            .kind as RevisionSignalInput["kind"],
        )
      ) {
        throw new Error(
          "revision.signals entries require a known kind and a detail string.",
        );
      }
      const signalRecord = signal as Record<string, unknown>;
      return {
        kind: signalRecord.kind as RevisionSignalInput["kind"],
        detail: (signalRecord.detail as string).slice(
          0,
          MAX_REVISION_DETAIL_LENGTH,
        ),
      };
    });
    revision = { signals };
  }

  return {
    taskId: record.taskId.trim(),
    areaId: typeof record.areaId === "string" ? record.areaId : null,
    title: record.title.trim(),
    description:
      typeof record.description === "string" ? record.description : null,
    definitionOfDone:
      typeof record.definitionOfDone === "string"
        ? record.definitionOfDone
        : null,
    firstTinyStep:
      typeof record.firstTinyStep === "string" ? record.firstTinyStep : null,
    breakdownSteps,
    parserMode,
    currentMap,
    revision,
  };
}

async function verifyBearerToken(accessToken: string) {
  const client = createSupabaseServerClient({ accessToken });

  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return client as MinimalSupabaseClient;
}

function countNodesByRole(nodes: { role: "required" | "optional" | "red" }[]) {
  return {
    required: nodes.filter((node) => node.role === "required").length,
    optional: nodes.filter((node) => node.role === "optional").length,
    red: nodes.filter((node) => node.role === "red").length,
  };
}

async function logRouteFailure(error: unknown) {
  console.error(
    `task-map draft failed safely: ${error instanceof Error ? error.message : String(error)}`,
  );
  await captureError({
    feature: "task_map_route",
    error,
    context: {
      environment: "server",
      error_category: "route_handler_failure",
      route_pattern: "/api/task-map",
    },
  });
}

export async function GET() {
  const status = getTaskMapDraftStatus();

  return Response.json({
    ok: true,
    status: status.status,
    preferredParser: status.preferredParser,
  });
}

export async function POST(request: Request) {
  const status = getTaskMapDraftStatus();
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return Response.json(
      { ok: false, errorCategory: "auth_rejected" },
      { status: 401 },
    );
  }

  const client = await verifyBearerToken(accessToken);

  if (!client) {
    return Response.json(
      { ok: false, errorCategory: "auth_rejected" },
      { status: 401 },
    );
  }

  let input: TaskMapRequestBody;
  try {
    input = parseRequestBody(await request.json());
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid request.",
      },
      { status: 400 },
    );
  }

  try {
    const forceMock =
      input.parserMode === "mock" || status.status === "ai_unavailable";
    const result = await generateTaskMapDraftWithFallback(
      {
        title: input.title,
        description: input.description,
        definitionOfDone: input.definitionOfDone,
        firstTinyStep: input.firstTinyStep,
        breakdownSteps: input.breakdownSteps,
        currentMap: input.currentMap,
        revisionEvidence: input.revision,
      },
      {
        forceMock,
        traceContext: { accessToken },
      },
    );

    if (!result.ok) {
      // NFR-004: never a dead end. Provider failure, AI-schema-invalid, and
      // graph-invalid output all degrade to a typed, non-throwing response so
      // the UI can fall back to the plain breakdown rail.
      return Response.json({
        ok: false,
        degrade: result.degrade,
        errors: result.errors,
        status: status.status,
      });
    }

    // NS-INV-3: instrument the draft at birth. This write is awaited (with
    // full error containment inside recordTaskMapDraftSuggestion) rather than
    // detached fire-and-forget, because the caller needs the row id back to
    // resolve it on approve; a write failure degrades to a null
    // suggestionRecordId without affecting the draft response.
    const suggestion = await recordTaskMapDraftSuggestion(client, {
      area_id: input.areaId,
      task_id: input.taskId,
      node_counts: countNodesByRole(result.draft.nodes),
      node_titles: result.draft.nodes.map((node) => node.title),
      confidence: null,
      // FR-031 slice F5 (#679): evidence-triggered revisions are measurable
      // separately (their own policy id); manual regens and first drafts
      // keep the slice-4/8 instrumentation unchanged.
      generated_from: input.revision
        ? "revision"
        : input.currentMap
          ? "regen"
          : "initial",
      policy_identifier: input.revision
        ? TASK_MAP_REVISION_POLICY_ID
        : TASK_MAP_DRAFT_POLICY_ID,
    });

    return Response.json({
      ok: true,
      parser: result.parser,
      draft: result.draft,
      suggestionRecordId: suggestion.suggestionId,
      status: status.status,
    });
  } catch (error) {
    await logRouteFailure(error);

    return Response.json(
      {
        ok: false,
        degrade: "breakdown_rail",
        errors: ["Task-map draft generation failed safely."],
        status: status.status,
      },
      { status: 200 },
    );
  }
}
