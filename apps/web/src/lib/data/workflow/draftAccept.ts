/**
 * #737 C1 slice S3 — the account side of a journalled triage accept.
 *
 * ## Why this is a module and not a plpgsql function
 *
 * Placement got a transition function (`place_time_block`) because everything
 * it touches is rows. Accepting a draft is not: it has to find-or-create PEOPLE
 * for approved `waiting_on` / `committed_to` mentions before the task insert
 * (FK ordering), and `findOrCreatePerson` carries normalization rules that live
 * in TypeScript (`lib/data/personLinks.ts`). Reimplementing that in plpgsql
 * would fork the normalization, so the sequence stays here and each STEP is
 * made individually idempotent instead.
 *
 * ## Exactly once, step by step
 *
 * The whole sequence can be replayed. What makes that safe:
 *
 *  - **task** — carries the journal entry's `client_write_id`, unique per
 *    `(user_id, client_write_id)`. Looked up FIRST, so a replay that already
 *    landed the task does no insert at all.
 *  - **people** — `findOrCreatePerson` is already idempotent per
 *    `normalized_name`, and only runs on the attempt that creates the task
 *    (they are resolved BEFORE the insert, so a task that exists proves they
 *    were resolved).
 *  - **proposal** — carries a DERIVED key, `<client_write_id>:proposal`, on the
 *    same plain unique index placement uses. Derived rather than freshly minted
 *    so it is stable across replays without needing its own journal entry.
 *  - **capture status** — `resolveCaptureItems` is a status update to a fixed
 *    value; running it twice is the same as running it once.
 *
 * ## What is deliberately NOT idempotent, and why that is fine
 *
 * `recordPersonLinkAcceptance` is a learning write, fire-and-forget by
 * NS-INV-3. A replay can record the same acceptance twice. That is a duplicate
 * row in an append-only learning log, not user-visible data, and the cost of
 * keying it is not worth a second index.
 */
import type { Task, TimeBlockProposal } from "@lifeos/schemas";
import { normalizePersonName } from "../personLinks";
import { resolveCaptureItems } from "./capture";
import { recordPersonLinkAcceptance, findOrCreatePerson } from "./people";
import { createTask } from "./planning";
import {
  getSupabaseMessage,
  parseTask,
  parseTimeBlockProposal,
  requireSupabaseUser,
  taskColumns,
  timeBlockProposalColumns,
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
    throw new Error(getSupabaseMessage(error));
  }

  return data ? parseTask(data) : null;
}

async function findProposalByClientWriteId(
  client: MinimalSupabaseClient,
  userId: string,
  clientWriteId: string,
): Promise<TimeBlockProposal | null> {
  const query = client.from("time_block_proposals") as {
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
    .select(timeBlockProposalColumns)
    .eq("user_id", userId)
    .eq("client_write_id", clientWriteId)
    .maybeSingle();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return data ? parseTimeBlockProposal(data) : null;
}

/**
 * The pending proposal an ACTIVE accept mints, written idempotently.
 *
 * `upsert(..., { ignoreDuplicates: true })` returns NO row on conflict, so the
 * row is read back separately rather than with `.select().single()` — which
 * would turn the successful no-op into an error. Same reason
 * `syncJournaledWin` skips the select; the difference is that this caller does
 * need the id, to record the local -> persisted proposal mapping.
 */
async function upsertJournaledAcceptProposal(
  client: MinimalSupabaseClient,
  userId: string,
  input: {
    client_write_id: string;
    area_id: string;
    task_id: string;
    proposal: JournaledAcceptProposal;
  },
): Promise<TimeBlockProposal | null> {
  const query = client.from("time_block_proposals") as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => PromiseLike<{ error: unknown }>;
  };

  const { error } = await query.upsert(
    {
      user_id: userId,
      area_id: input.area_id,
      task_id: input.task_id,
      proposed_start: input.proposal.proposed_start,
      proposed_end: input.proposal.proposed_end,
      rationale_json: { note: input.proposal.rationale },
      conflict_flag: false,
      conflict_details_json: null,
      status: "proposed",
      client_write_id: input.client_write_id,
    },
    { onConflict: "user_id,client_write_id", ignoreDuplicates: true },
  );
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return findProposalByClientWriteId(client, userId, input.client_write_id);
}

/**
 * Replay one journalled triage accept to the account.
 *
 * Mock mode (no client) reports `provider: "mock"` and writes nothing; the
 * journal entry stays queued until an account is reachable, exactly like the
 * offline capture queue.
 */
export async function syncJournaledTaskDraftAccept(
  client: MinimalSupabaseClient | null,
  input: SyncJournaledTaskDraftAcceptInput,
): Promise<SyncJournaledTaskDraftAcceptResult> {
  const clientWriteId = input.client_write_id?.trim();
  if (!clientWriteId) {
    throw new Error("A journalled triage accept needs a client write id.");
  }

  if (!client) {
    return {
      provider: "mock",
      task: null,
      proposal: null,
      deduplicated: false,
    };
  }

  // Plain wording on purpose: the pre-S3 copy at this call site said "Sign in
  // before saving tasks to Supabase", which names a vendor the user has no
  // reason to know (#692 / NFR-006). The sibling journalled paths already say
  // it plainly ("Sign in before recording wins").
  const user = await requireSupabaseUser(
    client,
    "Sign in before saving tasks.",
  );

  // FIRST, always: a replay whose task already landed must not re-run any of
  // the person resolution below.
  const existingTask = await findTaskByClientWriteId(
    client,
    user.id,
    clientWriteId,
  );

  let task = existingTask;
  const acceptedLinks: Array<{
    name: string;
    role: JournaledPersonMention["role"];
    personId: string | null;
  }> = [];

  if (!task) {
    // S3 (#255), unchanged in intent from the pre-S3 `persistAcceptedTaskDraft`:
    // a mention that survived to accept was not rejected, so it is
    // user-approved. Role "mention" is informational — it creates no person and
    // links no column. Multiple mentions of one role map to one column, so the
    // first resolved id wins deterministically. A find/create failure degrades
    // that one link to no-link; the task still lands (NS-INV-4).
    let waitingOnPersonId: string | null = null;
    let committedToPersonId: string | null = null;

    for (const mention of input.person_mentions) {
      let personId: string | null = null;
      if (mention.role === "waiting_on" || mention.role === "committed_to") {
        try {
          const personResult = await findOrCreatePerson(client, {
            display_name: mention.name,
            normalized_name: normalizePersonName(mention.name),
          });
          personId = personResult.person?.id ?? null;
        } catch {
          personId = null;
        }
      }

      if (personId) {
        if (mention.role === "waiting_on" && !waitingOnPersonId) {
          waitingOnPersonId = personId;
        } else if (mention.role === "committed_to" && !committedToPersonId) {
          committedToPersonId = personId;
        }
      }

      acceptedLinks.push({
        name: mention.name,
        role: mention.role,
        personId,
      });
    }

    // A committed_to link OR an approved commitment draft flag both make the
    // task a commitment (deliverable b honors is_commitment without a person).
    const isCommitment = input.is_commitment || committedToPersonId !== null;

    const taskResult = await createTask(client, {
      area_id: input.area_id,
      source_capture_item_id: input.source_capture_item_id,
      title: input.title,
      description: input.description,
      status: input.task_status,
      priority_confidence: input.confidence,
      task_type: input.task_type ?? "task",
      is_reversible:
        input.task_type === "decision" ? (input.is_reversible ?? null) : null,
      due_at: input.due_at,
      estimated_minutes_low: input.estimated_minutes_low,
      estimated_minutes_high: input.estimated_minutes_high,
      first_tiny_step: input.first_tiny_step,
      waiting_on_person_id: waitingOnPersonId,
      waiting_on_since: waitingOnPersonId ? input.accepted_at : null,
      is_commitment: isCommitment,
      committed_to_person_id: committedToPersonId,
      client_write_id: clientWriteId,
    });

    if (taskResult.provider !== "supabase") {
      return {
        provider: taskResult.provider,
        task: null,
        proposal: null,
        deduplicated: false,
      };
    }

    task = taskResult.task;

    // Resolve the pending person-link proposals to accepted (mirrors the
    // rejection path). Fire-and-forget — a learning-write failure never affects
    // the accept flow (NS-INV-3).
    for (const link of acceptedLinks) {
      recordPersonLinkAcceptance(client, {
        area_id: input.area_id,
        draft_id: input.draft_id,
        name: link.name,
        role: link.role,
        matched_person_id: link.personId,
      });
    }
  }

  const proposal =
    input.proposal && input.task_status === "active"
      ? await upsertJournaledAcceptProposal(client, user.id, {
          client_write_id: acceptProposalClientWriteId(clientWriteId),
          area_id: input.area_id,
          task_id: task.id,
          proposal: input.proposal,
        })
      : null;

  // Final UX Loop C1, Target Card 1 (audit P0#3, PR #771): the local reducer
  // already moved this capture to "resolved". Mirror that to the account, or
  // the next session rehydrates the thought at status "new" and offers back
  // work the user already decided.
  //
  // Ordered after the task (and its proposal) on purpose: the task is what
  // MAKES the capture resolved, so a failed insert must leave the capture
  // waiting rather than resolve a thought that produced nothing.
  //
  // NOT wrapped in try/catch — unlike the person-link writes above, which are
  // documented best-effort (NS-INV-4), a status write that fails silently is
  // exactly the bug #771 fixed. It propagates, and the journal keeps the entry
  // queued for the next replay. A null id (capture never reached the account)
  // is a no-op, not an error.
  await resolveCaptureItems(client, [input.source_capture_item_id]);

  return {
    provider: "supabase",
    task,
    proposal,
    deduplicated: existingTask !== null,
  };
}
