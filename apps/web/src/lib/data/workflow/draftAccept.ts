/**
 * Account replay of a journalled triage accept. Normalize in TypeScript, then
 * commit people, task, proposal and capture through one invoker RPC (INV-1).
 * The server repairs older partial accepts and deduplicates stable journal keys.
 * Optional learning follows a successful commit and never decides delivery.
 */
import {
  CreateTaskInputSchema,
  type Task,
  type TimeBlockProposal,
} from "@lifeos/schemas";
import { z } from "zod";
import { acceptedTaskDueAt } from "../../workflow/shared";
import { normalizePersonName } from "../personLinks";
import { recordPersonLinkAcceptance } from "./people";
import { recordTaskAcceptance } from "./planning";
import {
  parseTask,
  parseTimeBlockProposal,
  requireSupabaseUser,
  taskColumns,
  toPersistenceWriteError,
  type DataProvider,
  type MinimalSupabaseClient,
} from "./shared";

/** One approved person mention, exactly as the draft carried it. */
export interface JournaledPersonMention {
  name: string;
  role: "waiting_on" | "committed_to" | "mention";
}

/** The proposal the accept path mints alongside an ACTIVE task. */
export interface JournaledAcceptProposal {
  proposed_start: string;
  proposed_end: string;
  rationale: string;
}

export interface SyncJournaledTaskDraftAcceptInput {
  /** Idempotency key; matches the journal record's `client_write_id`. */
  client_write_id: string;
  /** Account area id. Resolved by the caller; this module never guesses one. */
  area_id: string;
  /** Account capture id, or null when the capture never reached the account. */
  source_capture_item_id: string | null;
  /** Workflow-local draft id — the join key for the learning records. */
  draft_id: string;
  title: string;
  description: string | null;
  confidence: number | null;
  task_type: string | null;
  is_reversible: boolean | null;
  due_at: string | null;
  estimated_minutes_low: number | null;
  estimated_minutes_high: number | null;
  first_tiny_step: string | null;
  is_commitment: boolean;
  person_mentions: JournaledPersonMention[];
  task_status: "active" | "backlog";
  /**
   * When the USER accepted, pinned by the caller. Feeds `waiting_on_since`.
   * Never `new Date()` in here: a replay may not run until hours later, and
   * "waiting on Sam since" must mean since the accept, not since the retry.
   */
  accepted_at: string;
  proposal: JournaledAcceptProposal | null;
}

export interface SyncJournaledTaskDraftAcceptResult {
  provider: DataProvider;
  task: Task | null;
  proposal: TimeBlockProposal | null;
  /** True when the task already existed under this key. */
  deduplicated: boolean;
}

/** The derived key for the proposal minted alongside an accepted draft. */
export function acceptProposalClientWriteId(clientWriteId: string): string {
  return `${clientWriteId}:proposal`;
}

async function findTaskByClientWriteId(
  client: MinimalSupabaseClient,
  userId: string,
  clientWriteId: string,
): Promise<Task | null> {
  const query = client.from("tasks") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .select(taskColumns)
    .eq("user_id", userId)
    .eq("client_write_id", clientWriteId)
    .maybeSingle();
  if (error) {
    throw toPersistenceWriteError(error);
  }

  return data ? parseTask(data) : null;
}

/**
 * Recover the account task created by a journalled accept.
 *
 * A compensating task drop can run in a different tab from the accept, so its
 * local id map may be empty even though the task already landed. The original
 * journal id is stable across tabs and unique inside the authenticated
 * account; querying it is the durable fallback.
 */
export async function findJournaledTaskIdByClientWriteId(
  client: MinimalSupabaseClient,
  clientWriteId: string,
): Promise<string | null> {
  const normalizedClientWriteId = clientWriteId.trim();
  if (!normalizedClientWriteId) {
    throw new Error("A journalled task lookup needs a client write id.");
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before finding saved tasks.",
  );
  const task = await findTaskByClientWriteId(
    client,
    user.id,
    normalizedClientWriteId,
  );
  return task?.id ?? null;
}

const mentionSchema = z.object({
  name: z.string(),
  role: z.enum(["waiting_on", "committed_to", "mention"]),
});
const acceptanceResultSchema = z.object({
  task: z.unknown(),
  proposal: z.unknown(),
  deduplicated: z.boolean(),
  accepted_links: z.array(
    mentionSchema.extend({ person_id: z.string().uuid().nullable() }),
  ),
});

export async function syncJournaledTaskDraftAccept(
  client: MinimalSupabaseClient | null,
  input: SyncJournaledTaskDraftAcceptInput,
): Promise<SyncJournaledTaskDraftAcceptResult> {
  const clientWriteId = input.client_write_id?.trim();
  if (!clientWriteId)
    throw new Error("A journalled triage accept needs a client write id.");
  if (!client) {
    return {
      provider: "mock",
      task: null,
      proposal: null,
      deduplicated: false,
    };
  }
  await requireSupabaseUser(client, "Sign in before saving tasks.");
  if (!client.rpc) {
    throw toPersistenceWriteError({
      code: "PGRST202",
      message: "The accept_task_draft database function is unavailable.",
    });
  }
  const taskInput = CreateTaskInputSchema.parse({
    area_id: input.area_id,
    source_capture_item_id: input.source_capture_item_id,
    title: input.title,
    description: input.description,
    status: input.task_status,
    priority_confidence: input.confidence,
    task_type: input.task_type ?? "task",
    is_reversible: input.task_type === "decision" ? input.is_reversible : null,
    due_at: acceptedTaskDueAt(input.task_type, input.due_at),
    estimated_minutes_low: input.estimated_minutes_low,
    estimated_minutes_high: input.estimated_minutes_high,
    first_tiny_step: input.first_tiny_step,
    is_commitment: input.is_commitment,
    client_write_id: clientWriteId,
  });
  const mentions = mentionSchema
    .array()
    .parse(input.person_mentions)
    .map((mention) => ({
      ...mention,
      normalized_name: normalizePersonName(mention.name),
    }));
  const { data, error } = await client.rpc("accept_task_draft", {
    p_task: taskInput,
    p_person_mentions: mentions,
    p_accepted_at: z.string().datetime().parse(input.accepted_at),
    p_proposal: input.task_status === "active" ? input.proposal : null,
  });
  if (error) throw toPersistenceWriteError(error);
  const result = acceptanceResultSchema.parse(data);
  const task = parseTask(result.task);
  const proposal = result.proposal
    ? parseTimeBlockProposal(result.proposal)
    : null;
  if (!result.deduplicated) {
    recordTaskAcceptance(client, task);
    for (const link of result.accepted_links) {
      recordPersonLinkAcceptance(client, {
        area_id: task.area_id,
        draft_id: input.draft_id,
        name: link.name,
        role: link.role,
        matched_person_id: link.person_id,
      });
    }
  }
  return {
    provider: "supabase",
    task,
    proposal,
    deduplicated: result.deduplicated,
  };
}
