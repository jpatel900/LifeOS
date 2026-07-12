import {
  CreateOverrideRecordInputSchema,
  CreateSuggestionRecordInputSchema,
  META_LEARNING_EVENT_SCHEMA_VERSION_V2,
  OverrideRecordSchema,
  SuggestionRecordSchema,
  type CreateOverrideRecordInput,
  type CreateSuggestionRecordInput,
  type OverrideRecord,
  type SuggestionRecord,
} from "@lifeos/schemas";
import { normalizeSupabaseRows } from "../supabaseRowNormalization";
import {
  type DataProvider,
  type MinimalSupabaseClient,
  getSupabaseMessage,
  logLearningWriteFailure,
  overrideRecordColumns,
  requireSupabaseUser,
  suggestionRecordColumns,
} from "./shared";

export async function createSuggestionRecord(
  client: MinimalSupabaseClient | null,
  input: CreateSuggestionRecordInput,
) {
  const parsedInput = CreateSuggestionRecordInputSchema.parse(input);

  if (!client) return { provider: "mock" as const, record: null };

  const user = await requireSupabaseUser(
    client,
    "Sign in before recording learning suggestions.",
  );

  const query = client.from("suggestion_records") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      user_id: user.id,
      area_id: parsedInput.area_id,
      policy_identifier: parsedInput.policy_identifier,
      schema_version: META_LEARNING_EVENT_SCHEMA_VERSION_V2,
      suggestion_type: parsedInput.suggestion_type,
      subject_type: parsedInput.subject_type,
      subject_id: parsedInput.subject_id ?? null,
      suggestion_json: parsedInput.suggestion_json,
      confidence: parsedInput.confidence ?? null,
      status: parsedInput.status,
      resolution_reason: parsedInput.resolution_reason ?? null,
      decided_by: parsedInput.decided_by,
      resolved_at: parsedInput.resolved_at ?? null,
    })
    .select(suggestionRecordColumns)
    .single();

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase" as const, record: data };
}

export async function createOverrideRecord(
  client: MinimalSupabaseClient | null,
  input: CreateOverrideRecordInput,
) {
  const parsedInput = CreateOverrideRecordInputSchema.parse(input);

  if (!client) return { provider: "mock" as const, record: null };

  const user = await requireSupabaseUser(
    client,
    "Sign in before recording learning overrides.",
  );

  const query = client.from("override_records") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      user_id: user.id,
      area_id: parsedInput.area_id,
      policy_identifier: parsedInput.policy_identifier,
      schema_version: META_LEARNING_EVENT_SCHEMA_VERSION_V2,
      suggestion_id: parsedInput.suggestion_id ?? null,
      subject_type: parsedInput.subject_type,
      subject_id: parsedInput.subject_id,
      override_type: parsedInput.override_type,
      old_value_json: parsedInput.old_value_json,
      new_value_json: parsedInput.new_value_json,
      reason: parsedInput.reason ?? null,
    })
    .select(overrideRecordColumns)
    .single();

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase" as const, record: data };
}

export function recordSuggestionFireAndForget(
  client: MinimalSupabaseClient | null,
  input: CreateSuggestionRecordInput,
) {
  void createSuggestionRecord(client, input).catch((error) => {
    logLearningWriteFailure(error, {
      table: "suggestion_records",
      policy_identifier: input.policy_identifier,
      suggestion_type: input.suggestion_type,
    });
  });
}

export function recordOverrideFireAndForget(
  client: MinimalSupabaseClient,
  input: CreateOverrideRecordInput,
) {
  void createOverrideRecord(client, input).catch((error) => {
    logLearningWriteFailure(error, {
      table: "override_records",
      policy_identifier: input.policy_identifier,
      override_type: input.override_type,
    });
  });
}

// Local triage draft ids are not persisted rows; only uuid ids qualify as subject_id.
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WipEnforcementRecordInput {
  area_id: string | null;
  subject_id?: string | null;
  subject_type: "task" | "task_draft";
  action: "wip_refused" | "wip_swapped";
  refused_task_id: string;
  refused_task_title: string;
  slot_holders: Array<{ task_id: string; title: string; status: string }>;
  released_task_id?: string | null;
  activation_path: string;
}

export function recordWipEnforcementEvent(
  client: MinimalSupabaseClient | null,
  input: WipEnforcementRecordInput,
) {
  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: "wip_enforcement.v1",
    suggestion_type: input.action,
    subject_type: input.subject_type,
    subject_id:
      input.subject_id && uuidPattern.test(input.subject_id)
        ? input.subject_id
        : null,
    suggestion_json: {
      refused_task_id: input.refused_task_id,
      refused_task_title: input.refused_task_title,
      slot_holders: input.slot_holders,
      released_task_id: input.released_task_id ?? null,
      activation_path: input.activation_path,
    },
    confidence: null,
    status: input.action === "wip_swapped" ? "accepted" : "rejected",
    resolved_at: new Date().toISOString(),
    resolution_reason:
      input.action === "wip_swapped"
        ? "User swapped a WIP slot to admit the refused item."
        : "LifeOS refused a fourth active WIP item.",
    decided_by: input.action === "wip_swapped" ? "user" : "system",
  });
}

export interface RejectedTaskDraftInput {
  area_id: string | null;
  draft_id: string;
  title: string;
  confidence?: number | null;
}

export function recordRejectedTaskDraft(
  client: MinimalSupabaseClient | null,
  input: RejectedTaskDraftInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: "triage.default_accept_task",
    suggestion_type: "triage_suggestion",
    subject_type: "task_draft",
    subject_id: uuidPattern.test(input.draft_id) ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      title: input.title,
      status: "rejected",
    },
    confidence: input.confidence ?? null,
    status: "rejected",
    resolved_at: new Date().toISOString(),
  });
}

// FR-028 (F-G2b) re-entry amnesty policy identifier per the #235 vocabulary.
export const RE_ENTRY_POLICY_ID = "re_entry.v1" as const;

export interface ReEntryDeferralRecordInput {
  area_id: string | null;
  /** "task" when a whole task was deferred to backlog, "calendar_block" for a lone unplan. */
  subject_type: "task" | "calendar_block";
  subject_id: string;
  /** Deterministic action applied; enumerated in the while-you-were-out summary. */
  action: "task_to_backlog" | "block_unplanned";
  /** ISO end times of the lapsed block(s) this deferral covered. */
  lapsed_block_end_ats: string[];
  absence_days: number;
  resolved_at: string;
}

/**
 * Record one FR-028 auto-deferral (fire-and-forget; a learning-write failure
 * must never affect the return ritual). Status "accepted" + decided_by
 * "system": the deferral is a deterministic bounded-rule transition that has
 * already been applied and enumerated to the user — not a pending proposal.
 */
export function recordReEntryDeferral(
  client: MinimalSupabaseClient | null,
  input: ReEntryDeferralRecordInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id:
      input.area_id && uuidPattern.test(input.area_id) ? input.area_id : null,
    policy_identifier: RE_ENTRY_POLICY_ID,
    suggestion_type: "re_entry_defer",
    subject_type: input.subject_type,
    subject_id: uuidPattern.test(input.subject_id) ? input.subject_id : null,
    suggestion_json: {
      action: input.action,
      subject_id: input.subject_id,
      lapsed_block_end_ats: input.lapsed_block_end_ats,
      absence_days: input.absence_days,
    },
    status: "accepted",
    decided_by: "system",
    resolved_at: input.resolved_at,
  });
}

// S9 (#261) policy identifier for duration-recalibration decisions (#235 vocab).
export const DURATION_RECALIBRATION_POLICY_ID =
  "planning.duration_estimate" as const;

export interface PolicyProposalDecisionInput {
  area_id: string | null;
  /** The policy the override-pattern scan proposed changing (already a #235 key). */
  policy_identifier: string;
  decision: "accepted" | "declined";
  evidence: string;
  examined: number;
  override_count: number;
  latest_override_type: string;
  resolved_at: string;
}

/**
 * Record the user's decision on an override-pattern policy proposal (S9). The
 * proposal is propose->approve: NOTHING mutates a default here — this row IS the
 * recorded decision the "zero policy mutation without a recorded decision"
 * invariant requires. Fire-and-forget so a learning-write failure never affects
 * the review flow (NS-INV-3).
 */
export function recordPolicyProposalDecision(
  client: MinimalSupabaseClient | null,
  input: PolicyProposalDecisionInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id:
      input.area_id && uuidPattern.test(input.area_id) ? input.area_id : null,
    policy_identifier: input.policy_identifier,
    suggestion_type: "policy_change",
    subject_type: "policy",
    subject_id: null,
    suggestion_json: {
      evidence: input.evidence,
      examined: input.examined,
      override_count: input.override_count,
      latest_override_type: input.latest_override_type,
    },
    status: input.decision === "accepted" ? "accepted" : "rejected",
    decided_by: "user",
    resolved_at: input.resolved_at,
  });
}

export interface DurationRecalibrationDecisionInput {
  area_id: string | null;
  decision: "accepted" | "dismissed";
  multiplier: number;
  sample_count: number;
  estimate_minutes: number;
  adjusted_minutes: number;
  resolved_at: string;
}

/**
 * Record the user's decision on a sourced duration recalibration (S9). Accept
 * means the user agrees the estimate should reflect their actuals; dismiss keeps
 * the original. Either way ONLY the decision is recorded (NS-INV-3) — nothing
 * re-times the block or writes a stored default (that lands with the future
 * duration_profiles store). Fire-and-forget.
 */
export function recordDurationRecalibrationDecision(
  client: MinimalSupabaseClient | null,
  input: DurationRecalibrationDecisionInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id:
      input.area_id && uuidPattern.test(input.area_id) ? input.area_id : null,
    policy_identifier: DURATION_RECALIBRATION_POLICY_ID,
    suggestion_type: "duration_recalibration",
    subject_type: "time_block_proposal",
    subject_id: null,
    suggestion_json: {
      multiplier: input.multiplier,
      sample_count: input.sample_count,
      estimate_minutes: input.estimate_minutes,
      adjusted_minutes: input.adjusted_minutes,
    },
    status: input.decision === "accepted" ? "accepted" : "rejected",
    decided_by: "user",
    resolved_at: input.resolved_at,
  });
}

// S3 (#255) meta-learning policy identifiers for person/commitment proposals.
// Stable lowercase keys per the #235 vocabulary (`<domain>.<policy>`), designed
// to survive schema evolution; not foreign keys.
export const PERSON_LINK_POLICY_ID = "person.link_proposal" as const;
export const COMMITMENT_POLICY_ID = "commitment.detection" as const;

export interface PersonMentionProposalInput {
  area_id: string | null;
  draft_id: string;
  name: string;
  role: "waiting_on" | "committed_to" | "mention";
  confidence: number;
  /** Resolution against existing people, decided by the resolver (not the UI). */
  match: "matched" | "new";
  matched_person_id?: string | null;
}

export interface CommitmentProposalInput {
  area_id: string | null;
  draft_id: string;
  title: string;
  confidence?: number | null;
}

/**
 * Instrument a proposed person link at birth (NS-INV-3). One pending
 * suggestion_records row per mention; fire-and-forget so a learning-write
 * failure never blocks the parse/triage flow. Nothing is persisted to `people`
 * here — this only records that the AI proposed the link.
 */
export function recordPersonMentionProposal(
  client: MinimalSupabaseClient | null,
  input: PersonMentionProposalInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: PERSON_LINK_POLICY_ID,
    // Generated at parse time, so the parse_result suggestion type is the
    // accurate #235 vocabulary value.
    suggestion_type: "parse_result",
    subject_type: "person_mention",
    subject_id: uuidPattern.test(input.draft_id) ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      name: input.name,
      role: input.role,
      match: input.match,
      matched_person_id: input.matched_person_id ?? null,
    },
    confidence: input.confidence,
    status: "pending",
  });
}

/**
 * Instrument a detected commitment at birth (NS-INV-3). Fire-and-forget.
 */
export function recordCommitmentProposal(
  client: MinimalSupabaseClient | null,
  input: CommitmentProposalInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: COMMITMENT_POLICY_ID,
    suggestion_type: "parse_result",
    subject_type: "task_draft",
    subject_id: uuidPattern.test(input.draft_id) ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      title: input.title,
      is_commitment: true,
    },
    confidence: input.confidence ?? null,
    status: "pending",
  });
}

export interface PersonLinkRejectionInput {
  area_id: string | null;
  draft_id: string;
  name: string;
  role: "waiting_on" | "committed_to" | "mention";
}

/**
 * Record that the user rejected a proposed person link. The mention degrades to
 * no link — the task stays a plain task (NS-INV-4). This ALWAYS fires (unlike an
 * override, which requires a persisted uuid subject the local draft lacks):
 * following the `recordRejectedTaskDraft` precedent, the rejection is captured
 * as a resolved suggestion (`status: "rejected"`) with a nullable `subject_id`,
 * which also resolves the dangling pending person-link proposal. When a uuid
 * subject exists we additionally write a true override_records row. Both are
 * fire-and-forget: a learning-write failure never affects the triage flow.
 */
export function recordPersonLinkRejection(
  client: MinimalSupabaseClient | null,
  input: PersonLinkRejectionInput,
): void {
  if (!client) return;

  const isPersistedSubject = uuidPattern.test(input.draft_id);

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: PERSON_LINK_POLICY_ID,
    suggestion_type: "parse_result",
    subject_type: "person_mention",
    subject_id: isPersistedSubject ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      name: input.name,
      role: input.role,
      status: "rejected",
      degraded_to_plain_task: true,
    },
    status: "rejected",
    resolved_at: new Date().toISOString(),
  });

  // A true override row requires a uuid subject; only write one for persisted
  // subjects. Local drafts are covered by the resolved suggestion above.
  if (isPersistedSubject) {
    recordOverrideFireAndForget(client, {
      area_id: input.area_id,
      policy_identifier: PERSON_LINK_POLICY_ID,
      subject_type: "person_mention",
      subject_id: input.draft_id,
      override_type: "rejected",
      old_value_json: {
        name: input.name,
        role: input.role,
        proposed_link: true,
      },
      new_value_json: {
        proposed_link: false,
        degraded_to_plain_task: true,
      },
    });
  }
}

export interface OverrideRecordsResult {
  provider: DataProvider;
  overrideRecords: OverrideRecord[];
}

// S9 (#261): read the user's override_records for the deterministic override-
// pattern scan (learning-loop consumer). Read-only; most-recent first.
export async function listOverrideRecords(
  client: MinimalSupabaseClient | null,
): Promise<OverrideRecordsResult> {
  if (!client) {
    return { provider: "mock", overrideRecords: [] };
  }

  await requireSupabaseUser(client, "Sign in before loading learning history.");

  const query = client.from("override_records") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(overrideRecordColumns)
    .order("created_at", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    overrideRecords: OverrideRecordSchema.array().parse(
      normalizeSupabaseRows(data),
    ),
  };
}

export interface SuggestionRecordsResult {
  provider: DataProvider;
  suggestionRecords: SuggestionRecord[];
}

// E2 (#261 follow-up): read the user's suggestion_records so a decision recorded
// in a prior session (e.g. a policy_change accept/decline) keeps its proposal
// suppressed across reloads — not just within the session that made it.
// Read-only; most-recent first.
export async function listSuggestionRecords(
  client: MinimalSupabaseClient | null,
): Promise<SuggestionRecordsResult> {
  if (!client) {
    return { provider: "mock", suggestionRecords: [] };
  }

  await requireSupabaseUser(client, "Sign in before loading learning history.");

  const query = client.from("suggestion_records") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(suggestionRecordColumns)
    .order("created_at", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    suggestionRecords: SuggestionRecordSchema.array().parse(
      normalizeSupabaseRows(data),
    ),
  };
}
