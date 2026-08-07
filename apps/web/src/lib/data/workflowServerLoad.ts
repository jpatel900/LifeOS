import {
  AreaSchema,
  CalendarBlockSchema,
  CaptureItemSchema,
  ExecutionSessionSchema,
  ReviewEntrySchema,
  TaskSchema,
  TimeBlockProposalSchema,
  type Area,
} from "@lifeos/schemas";
import { normalizeSupabaseRows } from "./supabaseRowNormalization";
import {
  areaColumns,
  calendarBlockColumns,
  captureColumns,
  executionSessionColumns,
  reviewEntryColumns,
  taskColumns,
  timeBlockProposalColumns,
  type MinimalSupabaseClient,
} from "./workflow";
import {
  reviewEntryLine,
  toWorkflowBlock,
  toWorkflowCapture,
  toWorkflowProposal,
  toWorkflowSession,
  toWorkflowTask,
} from "./workflowPersistedNormalization";
import { workflowAreaIdForPersistedArea } from "../workflowAreaMapping";
import type { WorkflowState } from "../workflow";

/**
 * Issue #515 slice 2 remainder: server-side (service-role) rebuild of the
 * SAME `WorkflowState` shape the browser client assembles via
 * `WorkflowContext.syncPersistedWorkflowRows`, but explicitly scoped to a
 * given `userId` rather than resolved from `client.auth.getUser()` — the
 * telegram brief cron route has no caller session/access-token, only the
 * owner-decided `OWNER_USER_ID` env var (see route.ts).
 *
 * Every query below mirrors the query/order/filter semantics of the matching
 * `lib/data/workflow.ts` reader exactly (same selected columns, same order
 * clause, same status filters), with one necessary difference: those readers
 * rely on RLS + `auth.getUser()` to scope rows to the caller, which a
 * service-role client bypasses, so each query here adds an explicit
 * `.eq("user_id", userId)`. Mirrors:
 *   - listAreas({ includeInactive: false }) -> areas
 *   - listCaptureItems -> captureItems
 *   - listExecutionReviewItems -> tasks, calendarBlocks, executionSessions, reviewLog
 *   - listPlanningItems -> timeBlockProposals (proposals only; that reader's
 *     `tasks` field is intentionally NOT the WorkflowState.tasks source — see
 *     the KNOWN_ISSUES row 11 comment on listPlanningItems)
 * `projects` stays `[]`: the client itself never persists/syncs projects
 * (no `listProjects` reader exists), so `state.projects` is always `[]` for
 * a Supabase-backed session today. This loader reproduces that same gap
 * rather than silently fixing it — out of scope for this slice.
 */

function getSupabaseMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Supabase request failed.";
}

async function loadAreas(
  client: MinimalSupabaseClient,
  userId: string,
): Promise<Area[]> {
  const query = client.from("areas") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: boolean,
        ) => {
          eq: (
            column: string,
            value: string,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .select(areaColumns)
    .order("sort_order", { ascending: true })
    .eq("is_active", true)
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return AreaSchema.array().parse(normalizeSupabaseRows(data));
}

async function loadCaptures(client: MinimalSupabaseClient, userId: string) {
  const query = client.from("capture_items") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(captureColumns)
    .order("created_at", { ascending: false })
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return CaptureItemSchema.array().parse(normalizeSupabaseRows(data));
}

async function loadTasks(client: MinimalSupabaseClient, userId: string) {
  const query = client.from("tasks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(taskColumns)
    .order("updated_at", { ascending: false })
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return TaskSchema.array().parse(normalizeSupabaseRows(data));
}

async function loadProposals(client: MinimalSupabaseClient, userId: string) {
  const query = client.from("time_block_proposals") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(timeBlockProposalColumns)
    .order("proposed_start", { ascending: true })
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return TimeBlockProposalSchema.array().parse(normalizeSupabaseRows(data));
}

async function loadBlocks(client: MinimalSupabaseClient, userId: string) {
  const query = client.from("calendar_blocks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(calendarBlockColumns)
    .order("start_at", { ascending: true })
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return CalendarBlockSchema.array().parse(normalizeSupabaseRows(data));
}

async function loadSessions(client: MinimalSupabaseClient, userId: string) {
  const query = client.from("execution_sessions") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(executionSessionColumns)
    .order("created_at", { ascending: false })
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return ExecutionSessionSchema.array().parse(normalizeSupabaseRows(data));
}

async function loadReviewEntries(
  client: MinimalSupabaseClient,
  userId: string,
) {
  const query = client.from("review_entries") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(reviewEntryColumns)
    .order("created_at", { ascending: false })
    .eq("user_id", userId);

  if (error) throw new Error(getSupabaseMessage(error));
  return ReviewEntrySchema.array().parse(normalizeSupabaseRows(data));
}

/**
 * Rebuild the owner's `WorkflowState` for a given `userId`, using a
 * service-role client scoped explicitly by `.eq("user_id", userId)` on every
 * query (see module doc comment for the exact per-table mirror). Throws on
 * any read/parse failure — the route boundary is responsible for catching
 * and fail-safeing, never this loader.
 */
export async function loadOwnerWorkflowState(
  client: MinimalSupabaseClient,
  userId: string,
): Promise<WorkflowState> {
  const [areas, captures, tasks, proposals, blocks, sessions, reviewEntries] =
    await Promise.all([
      loadAreas(client, userId),
      loadCaptures(client, userId),
      loadTasks(client, userId),
      loadProposals(client, userId),
      loadBlocks(client, userId),
      loadSessions(client, userId),
      loadReviewEntries(client, userId),
    ]);

  const workflowAreas = areas.map((area) => ({
    id: workflowAreaIdForPersistedArea(area),
    user_id: area.user_id,
    name: area.name,
    color: area.color ?? "#64748b",
    created_at: area.created_at,
  }));

  return {
    areas: workflowAreas,
    captureItems: captures.map((capture) => toWorkflowCapture(capture, areas)),
    // C2-S5 (#687), investigated rather than "fixed": this is empty because
    // there is nowhere to load drafts FROM. No `create table` across
    // `supabase/migrations/*.sql` defines one, and that is deliberate —
    // `lib/durability/draftStore.ts` states it: a pending draft "has no server
    // destination and is deliberately NOT journalled." Drafts live on the
    // device (sessionStorage, plus IndexedDB for pending ones) and only reach
    // the account once accepted, as a task.
    //
    // The C2-S1 inventory's FINDING 2 named this line as the cause of the
    // legacy "0 Triage" chip and `/areas`' false "Nothing is waiting for a
    // decision." That chain does not hold: this loader is server-only — its
    // one non-test caller is `app/api/brief/telegram/route.ts` — so it has
    // never fed the web UI, whose drafts come from the device stores above.
    // Nor does it currently mislead the brief: that route reads only
    // `buildStartVM`, which never touches `state.taskDrafts`.
    //
    // The real defect FINDING 2 observed was that those surfaces counted the
    // wrong noun — a draft only exists once a capture has already been SORTED,
    // so an UNSORTED capture, the one thing genuinely awaiting a decision, was
    // invisible. Fixed where it lives, in
    // `components/moments/areasOverview.ts`. Making this line non-empty would
    // need a migration and would not have changed anything a person sees.
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    // The client never persists/syncs projects (no `listProjects` reader
    // exists); this loader reproduces that same gap rather than fixing it.
    projects: [],
    tasks: tasks.map((task) => toWorkflowTask(task, areas)),
    timeBlockProposals: proposals
      .map((proposal) => toWorkflowProposal(proposal, areas))
      .filter(
        (proposal): proposal is NonNullable<typeof proposal> =>
          proposal !== null,
      ),
    calendarBlocks: blocks.map((block) => toWorkflowBlock(block, areas)),
    executionSessions: sessions.map((session) =>
      toWorkflowSession(session, areas),
    ),
    healthChecks: [],
    reviewLog: reviewEntries.map(reviewEntryLine),
    wipRefusal: null,
  };
}
