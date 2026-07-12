import {
  AreaSchema,
  OperatorProfileSchema,
  PersonSchema,
  CalendarBlockSchema,
  CheckTimeBlockProposalConflictInputSchema,
  CaptureItemSchema,
  CreateAreaInputSchema,
  CreateExecutionSessionInputSchema,
  CreateGoogleCalendarEventInputSchema,
  CreateDurationProfileInputSchema,
  CreateOverrideRecordInputSchema,
  CreateSuggestionRecordInputSchema,
  CreateTimeBlockProposalInputSchema,
  EditTimeBlockProposalInputSchema,
  CreatePersonInputSchema,
  CreateProjectInputSchema,
  CreateCaptureItemInputSchema,
  CreateReviewEntryInputSchema,
  CreateWinRecordInputSchema,
  CreateRollupSummaryInputSchema,
  CreateTaskInputSchema,
  ExecutionSessionSchema,
  MarkExecutionSessionInputSchema,
  META_LEARNING_EVENT_SCHEMA_VERSION_V2,
  ProjectSchema,
  ReviewEntrySchema,
  WinRecordSchema,
  RollupSummarySchema,
  DurationProfileSchema,
  OverrideRecordSchema,
  SuggestionRecordSchema,
  SoftDeleteAreaInputSchema,
  TaskSchema,
  TimeBlockProposalSchema,
  UpdateAreaColorInputSchema,
  type Area,
  type CalendarBlock,
  type CaptureItem,
  type CreateAreaInput,
  type CreateExecutionSessionInput,
  type CreateGoogleCalendarEventInput,
  type CreateDurationProfileInput,
  type CreateOverrideRecordInput,
  type CreateSuggestionRecordInput,
  type CreateTimeBlockProposalInput,
  type EditTimeBlockProposalInput,
  type CreatePersonInput,
  type CreateProjectInput,
  type CreateCaptureItemInput,
  type CreateReviewEntryInput,
  type CreateWinRecordInput,
  type CreateRollupSummaryInput,
  type CreateTaskInput,
  type ExecutionSession,
  type MarkExecutionSessionInput,
  type Project,
  type ReviewEntry,
  type WinRecord,
  type RollupSummary,
  type DurationProfile,
  type OverrideRecord,
  type SuggestionRecord,
  type SoftDeleteAreaInput,
  type Task,
  type TimeBlockProposal,
  type UpdateAreaColorInput,
  type OperatorProfile,
  type Person,
} from "@lifeos/schemas";
import {
  normalizeSupabaseRow,
  normalizeSupabaseRows,
} from "./supabaseRowNormalization";
import { validateTaskMapForPersistence } from "../taskmap/persistence";
import {
  carryForwardNodeCompletion,
  toggleNodeCompletion,
} from "../taskmap/collapse";
import type { TaskMapGraph } from "../taskmap/graph";

export type DataProvider = "mock" | "supabase";

export interface DataResult<T> {
  provider: DataProvider;
  data: T;
}

export interface AreaListResult {
  provider: DataProvider;
  areas: Area[];
}

export interface AreaCreateResult {
  provider: DataProvider;
  area: Area;
}

export interface AreaSoftDeleteResult {
  provider: DataProvider;
  area: Area;
}

export interface AreaColorUpdateResult {
  provider: DataProvider;
  area: Area;
}

export interface CaptureCreateResult {
  provider: DataProvider;
  capture: CaptureItem;
}

export interface CaptureListResult {
  provider: DataProvider;
  captures: CaptureItem[];
}

export interface TaskCreateResult {
  provider: DataProvider;
  task: Task;
}

export interface ProjectCreateResult {
  provider: DataProvider;
  project: Project;
}

export interface PlanningItemsResult {
  provider: DataProvider;
  tasks: Task[];
  proposals: TimeBlockProposal[];
  blocks: CalendarBlock[];
}

export interface TimeBlockProposalCreateResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
}

export interface TimeBlockProposalUpdateResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
}

export interface TimeBlockProposalAcceptResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
  block: CalendarBlock;
  task: Task | null;
}

export interface TimeBlockProposalConflictCheckResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
  hasConflict: boolean;
  checkedAt: string;
}

export interface GoogleCalendarEventCreateResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
  block: CalendarBlock;
  googleEventId: string;
}

export class GoogleCalendarEventCreateError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleCalendarEventCreateError";
    this.status = status;
  }
}

export interface ExecutionReviewItemsResult {
  provider: DataProvider;
  tasks: Task[];
  blocks: CalendarBlock[];
  sessions: ExecutionSession[];
  reviewEntries: ReviewEntry[];
}

export interface ExecutionSessionCreateResult {
  provider: DataProvider;
  session: ExecutionSession;
  block: CalendarBlock | null;
}

export interface ExecutionSessionMarkResult {
  provider: DataProvider;
  session: ExecutionSession;
  block: CalendarBlock | null;
  task: Task | null;
}

export interface ReviewEntryCreateResult {
  provider: DataProvider;
  reviewEntry: ReviewEntry;
}

// S7 wins & evidence log (issue #259). A harvest candidate is a completed task
// or project surfaced at review time; the user confirms/edits/skips it into a
// win_record. occurred_at is a calendar date (YYYY-MM-DD) derived from the
// source completion (updated_at), since neither table carries a completed_at.
export interface WinHarvestCandidate {
  source_type: "task" | "project";
  source_id: string;
  area_id: string;
  title: string;
  occurred_at: string;
}

export interface WinHarvestCandidatesResult {
  provider: DataProvider;
  candidates: WinHarvestCandidate[];
}

export interface WinRecordCreateResult {
  provider: DataProvider;
  winRecord: WinRecord;
}

export interface WinRecordsResult {
  provider: DataProvider;
  winRecords: WinRecord[];
}

export interface RollupSummaryCreateResult {
  provider: DataProvider;
  rollupSummary: RollupSummary;
}

export interface RollupSummariesResult {
  provider: DataProvider;
  rollupSummaries: RollupSummary[];
}

export interface DurationProfileUpsertResult {
  provider: DataProvider;
  durationProfile: DurationProfile;
}

export interface DurationProfilesResult {
  provider: DataProvider;
  durationProfiles: DurationProfile[];
}

export type ReviewTaskTargetStatus = Extract<
  Task["status"],
  "active" | "backlog" | "dropped"
>;

export interface CalendarBlockUnplanResult {
  provider: DataProvider;
  block: CalendarBlock;
  task: Task | null;
}

export interface TaskReviewTransitionResult {
  provider: DataProvider;
  task: Task;
  blocks: CalendarBlock[];
}

export interface MinimalSupabaseClient {
  from: (table: string) => unknown;
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  auth?: {
    getSession?: () => Promise<{
      data: {
        session: {
          access_token: string;
        } | null;
      };
      error: { message: string } | null;
    }>;
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
}

const mockUserId = "00000000-0000-4000-8000-000000000001";

export const mockAreas: Area[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    user_id: mockUserId,
    name: "Main Job",
    slug: "main-job",
    description: "Work commitments and job-related projects.",
    color: "#2563eb",
    icon: "briefcase",
    sort_order: 0,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    user_id: mockUserId,
    name: "Personal",
    slug: "personal",
    description: "Home, health, errands, and personal admin.",
    color: "#16a34a",
    icon: "home",
    sort_order: 1,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    user_id: mockUserId,
    name: "Volunteer Work",
    slug: "volunteer-work",
    description: "Community commitments and volunteer follow-ups.",
    color: "#9333ea",
    icon: "heart",
    sort_order: 2,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    user_id: mockUserId,
    name: "Side Project",
    slug: "side-project",
    description: "Independent builds, experiments, and optional projects.",
    color: "#f97316",
    icon: "rocket",
    sort_order: 3,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
];

// S3 (#255): `charter_text` is now selected so the live parse read path can
// send per-area charters through the NS-INV-1 context-assembly module. S2
// added the column and injection; this slice wires the request-time read.
// Exported (not just module-private) so another server-only reader (e.g. the
// telegram brief loader in workflowServerLoad.ts) can select the SAME columns
// as these RLS-scoped readers, in the same order, without duplicating the
// literal strings. Additive export only — no behavior change to this file.
export const areaColumns =
  "id,user_id,name,slug,description,color,icon,sort_order,is_active,charter_text,charter_updated_at,created_at,updated_at";

export const captureColumns =
  "id,user_id,area_id,raw_text,raw_audio_ref,return_hook,client_capture_id,capture_mode,inferred_area_confidence,status,created_at";

// S3 (#255): the person/commitment link columns are now selected so the accept
// path can return them and S4 aging can read populated values. Additive — every
// task reader parses through TaskSchema, which optional-accepts these columns.
// FR-031 slice 3 (20260711120000): progression_map/map_status/
// map_schema_version/map_approved_at appended for the same reason — additive,
// optional-accepted by TaskSchema.
export const taskColumns =
  "id,user_id,area_id,project_id,source_capture_item_id,title,description,status,priority_score,priority_confidence,task_type,is_reversible,energy_type,estimated_minutes_low,estimated_minutes_high,due_at,definition_of_done,first_tiny_step,waiting_on_person_id,waiting_on_since,is_commitment,committed_to_person_id,progression_map,map_status,map_schema_version,map_approved_at,created_at,updated_at";

const projectColumns =
  "id,user_id,area_id,title,description,status,created_at,updated_at";

export const timeBlockProposalColumns =
  "id,user_id,area_id,task_id,proposed_start,proposed_end,rationale_json,conflict_flag,conflict_details_json,status,created_at";

export const calendarBlockColumns =
  "id,user_id,area_id,proposal_id,task_id,google_event_id,start_at,end_at,status,created_at,updated_at";

export const executionSessionColumns =
  "id,user_id,area_id,task_id,calendar_block_id,planned_minutes,actual_minutes,paused_minutes,distraction_minutes,productivity_rating,energy_rating,outcome,cap_outcome,notes,created_at";

export const reviewEntryColumns =
  "id,user_id,area_id,review_type,period_start,period_end,summary_json,created_at";

const winRecordColumns =
  "id,user_id,area_id,source_task_id,source_project_id,title,detail,occurred_at,review_entry_id,created_at";

const rollupSummaryColumns =
  "id,user_id,area_id,period_type,period_start,period_end,summary,created_at";

const suggestionRecordColumns =
  "id,user_id,area_id,policy_identifier,schema_version,suggestion_type,subject_type,subject_id,suggestion_json,confidence,status,resolution_reason,decided_by,created_at,resolved_at";

const durationProfileColumns =
  "id,user_id,area_id,task_type,estimate_stats_json,sample_count,last_updated_at";

const overrideRecordColumns =
  "id,user_id,area_id,policy_identifier,schema_version,suggestion_id,subject_type,subject_id,override_type,old_value_json,new_value_json,reason,created_at";

function parseAreas(rows: unknown) {
  return AreaSchema.array().parse(normalizeSupabaseRows(rows));
}

function slugifyAreaName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base.length > 0 ? base : "area";
}

function uniqueAreaSlug(name: string, existingSlugs: string[]) {
  const normalizedExisting = new Set(existingSlugs);
  const base = slugifyAreaName(name);

  if (!normalizedExisting.has(base)) {
    return base;
  }

  let suffix = 2;
  while (normalizedExisting.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function parseCapture(row: unknown) {
  return CaptureItemSchema.parse(normalizeSupabaseRow(row));
}

function parseCaptures(rows: unknown) {
  return CaptureItemSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseTask(row: unknown) {
  return TaskSchema.parse(normalizeSupabaseRow(row));
}

function parseProject(row: unknown) {
  return ProjectSchema.parse(normalizeSupabaseRow(row));
}

function parseTimeBlockProposal(row: unknown) {
  return TimeBlockProposalSchema.parse(normalizeSupabaseRow(row));
}

function parseTimeBlockProposals(rows: unknown) {
  return TimeBlockProposalSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseCalendarBlock(row: unknown) {
  return CalendarBlockSchema.parse(normalizeSupabaseRow(row));
}

function parseCalendarBlocks(rows: unknown) {
  return CalendarBlockSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseExecutionSession(row: unknown) {
  return ExecutionSessionSchema.parse(normalizeSupabaseRow(row));
}

function parseExecutionSessions(rows: unknown) {
  return ExecutionSessionSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseReviewEntry(row: unknown) {
  return ReviewEntrySchema.parse(normalizeSupabaseRow(row));
}

function parseReviewEntries(rows: unknown) {
  return ReviewEntrySchema.array().parse(normalizeSupabaseRows(rows));
}

function parseWinRecord(row: unknown) {
  return WinRecordSchema.parse(normalizeSupabaseRow(row));
}

function parseWinRecords(rows: unknown) {
  return WinRecordSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseRollupSummary(row: unknown) {
  return RollupSummarySchema.parse(normalizeSupabaseRow(row));
}

function parseRollupSummaries(rows: unknown) {
  return RollupSummarySchema.array().parse(normalizeSupabaseRows(rows));
}

function parseDurationProfile(row: unknown) {
  return DurationProfileSchema.parse(normalizeSupabaseRow(row));
}

function parseDurationProfiles(rows: unknown) {
  return DurationProfileSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseTasks(rows: unknown) {
  return TaskSchema.array().parse(normalizeSupabaseRows(rows));
}

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

async function requireSupabaseUser(
  client: MinimalSupabaseClient,
  unauthenticatedMessage: string,
) {
  if (!client.auth) {
    throw new Error("Supabase auth is unavailable.");
  }

  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError) {
    throw new Error(getSupabaseMessage(userError));
  }

  if (!userData.user) {
    throw new Error(unauthenticatedMessage);
  }

  return userData.user;
}

function logLearningWriteFailure(
  error: unknown,
  context: Record<string, unknown>,
) {
  console.warn("LifeOS meta-learning write failed; user action preserved.", {
    error: getSupabaseMessage(error),
    ...context,
  });
}

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

function recordSuggestionFireAndForget(
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

function recordOverrideFireAndForget(
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
const uuidPattern =
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

// FR-031 slice 4: task-map v1 AI graph draft, born instrumented per NS-INV-3.
export const TASK_MAP_DRAFT_POLICY_ID = "task_map.v1" as const;

export interface TaskMapDraftSuggestionNodeCounts {
  required: number;
  optional: number;
  red: number;
}

export interface TaskMapDraftSuggestionInput {
  area_id: string | null;
  task_id: string;
  node_counts: TaskMapDraftSuggestionNodeCounts;
  node_titles: string[];
  confidence?: number | null;
  /** FR-031 slice 8 — "initial" for the first draft on a task, "regen" for
   * an explicit user-requested revision of an already-approved map.
   * Defaults to "initial" for callers that predate slice 8. */
  generated_from?: "initial" | "regen";
}

export interface TaskMapDraftSuggestionResult {
  provider: DataProvider;
  suggestionId: string | null;
}

/**
 * Instrument a generated task-map draft at birth (NS-INV-3): one pending
 * suggestion_records row per generation. Unlike the other recorders in this
 * file, this one is awaited (with full error containment, never throwing) —
 * the caller (the one-pass approve path) needs the row id back to resolve it
 * later, so a truly detached fire-and-forget write would lose that id. A
 * write failure still never breaks the generation response: it degrades to a
 * null suggestionId, and the draft is returned to the caller either way.
 */
export async function recordTaskMapDraftSuggestion(
  client: MinimalSupabaseClient | null,
  input: TaskMapDraftSuggestionInput,
): Promise<TaskMapDraftSuggestionResult> {
  try {
    const result = await createSuggestionRecord(client, {
      area_id: input.area_id,
      policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
      suggestion_type: "task_map_draft",
      subject_type: "task",
      subject_id: uuidPattern.test(input.task_id) ? input.task_id : null,
      suggestion_json: {
        node_counts: input.node_counts,
        node_titles: input.node_titles,
        generated_from: input.generated_from ?? "initial",
      },
      confidence: input.confidence ?? null,
      status: "pending",
    });

    const record = result.record as { id?: string } | null;
    return { provider: result.provider, suggestionId: record?.id ?? null };
  } catch (error) {
    logLearningWriteFailure(error, {
      table: "suggestion_records",
      policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
      suggestion_type: "task_map_draft",
    });
    return { provider: client ? "supabase" : "mock", suggestionId: null };
  }
}

interface SuggestionResolutionInput {
  id: string;
  status: "accepted" | "rejected";
  decided_by: "user" | "system";
  resolved_at: string;
}

async function updateSuggestionRecordStatus(
  client: MinimalSupabaseClient,
  input: SuggestionResolutionInput,
): Promise<void> {
  const query = client.from("suggestion_records") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { error } = await query
    .update({
      status: input.status,
      decided_by: input.decided_by,
      resolved_at: input.resolved_at,
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }
}

function recordSuggestionResolutionFireAndForget(
  client: MinimalSupabaseClient,
  input: SuggestionResolutionInput,
): void {
  void updateSuggestionRecordStatus(client, input).catch((error) => {
    logLearningWriteFailure(error, {
      table: "suggestion_records",
      policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
      action: "resolve",
    });
  });
}

interface TaskMapNodeLike {
  id: string;
  title: string;
  role: "required" | "optional" | "red";
  red_reason?: string;
  red_condition?: string;
}

type TaskMapNodeDiff =
  | {
      override_type: "node_removed";
      old_value: TaskMapNodeLike;
      new_value: null;
    }
  | { override_type: "node_added"; old_value: null; new_value: TaskMapNodeLike }
  | {
      override_type: "node_edited";
      old_value: TaskMapNodeLike;
      new_value: TaskMapNodeLike;
    };

/**
 * Diffs the AI draft's nodes against the (possibly user-edited) approved
 * graph's nodes, keyed by node id. Unchanged nodes produce no diff entry —
 * only actual removals/edits/additions are instrumented, per NS-INV-3.
 */
function diffTaskMapNodes(
  aiNodes: TaskMapNodeLike[],
  approvedNodes: TaskMapNodeLike[],
): TaskMapNodeDiff[] {
  const aiById = new Map(aiNodes.map((node) => [node.id, node]));
  const approvedById = new Map(approvedNodes.map((node) => [node.id, node]));
  const diffs: TaskMapNodeDiff[] = [];

  for (const node of aiNodes) {
    if (!approvedById.has(node.id)) {
      diffs.push({
        override_type: "node_removed",
        old_value: node,
        new_value: null,
      });
    }
  }

  for (const node of approvedNodes) {
    const aiNode = aiById.get(node.id);
    if (!aiNode) {
      diffs.push({
        override_type: "node_added",
        old_value: null,
        new_value: node,
      });
      continue;
    }

    const changed =
      aiNode.title !== node.title ||
      aiNode.role !== node.role ||
      (aiNode.red_reason ?? null) !== (node.red_reason ?? null) ||
      (aiNode.red_condition ?? null) !== (node.red_condition ?? null);

    if (changed) {
      diffs.push({
        override_type: "node_edited",
        old_value: aiNode,
        new_value: node,
      });
    }
  }

  return diffs;
}

export interface ApproveTaskMapAiDraft {
  nodes: TaskMapNodeLike[];
  edges: { from: string; to: string }[];
}

export interface ApproveTaskMapInput {
  task_id: string;
  area_id: string | null;
  /** The (possibly user-edited) graph to persist; validated before write. */
  graph: unknown;
  /** The original AI draft, kept for override diffing. Null when the map was
   * hand-built with no AI draft to diff against (no diffs are recorded). */
  ai_draft: ApproveTaskMapAiDraft | null;
  /** The pending suggestion_records row from generation, if one exists. */
  suggestion_record_id?: string | null;
  /** FR-031 slice 8 — the previously approved graph, when this approval is
   * a regen revision of an already-approved map. Null/omitted for a
   * first-time approve. Used ONLY to carry `completed_at`/`done` forward
   * for surviving node ids (`carryForwardNodeCompletion`); it plays no
   * part in override diffing (that stays `ai_draft` vs. the persisted
   * graph, per slice 4). An unparseable `previous_graph` degrades to no
   * carry-forward rather than blocking the approve. */
  previous_graph?: unknown | null;
}

export interface TaskMapApproveResult {
  provider: DataProvider;
  task: Task;
}

/**
 * FR-031 slice 4 one-pass approve path (NS-INV-4: no AI-drafted map persists
 * without approval). Runs `validateTaskMapForPersistence` — schema AND graph
 * validation — before ever touching `tasks.progression_map`; rejects on
 * failure instead of writing anything. Every successful approval here
 * writes `map_status: "approved"` directly — `superseded` stays reserved.
 * Scope decision (slice 8): `tasks.progression_map` is a single jsonb
 * column, one map per task, so an approved revision overwrites the prior
 * content rather than modeling row-level map history; `superseded` has no
 * row to apply to in v1 and is not invented one here (no new tables — that
 * is v2 territory). The prior content is not lost: it lives in the
 * `suggestion_records`/`override_records` instrumentation trail from its
 * own approval, just not as a live "superseded map" row.
 *
 * FR-031 slice 8: when `input.previous_graph` is supplied (a regen
 * revision), `carryForwardNodeCompletion` runs on the validated graph
 * before it is written, so a completed node that survives the revision
 * (same id, non-red in the new graph) keeps its `done`/`completed_at`.
 */
export async function approveTaskMap(
  client: MinimalSupabaseClient | null,
  input: ApproveTaskMapInput,
): Promise<TaskMapApproveResult> {
  const validation = validateTaskMapForPersistence(input.graph);
  if (!validation.ok) {
    throw new Error(
      `Task map failed validation and was not saved: ${validation.errors.join("; ")}`,
    );
  }

  let graph = validation.graph;
  if (input.previous_graph) {
    const previousValidation = validateTaskMapForPersistence(
      input.previous_graph,
    );
    if (previousValidation.ok) {
      graph = carryForwardNodeCompletion(
        previousValidation.graph as TaskMapGraph,
        graph as TaskMapGraph,
      ) as typeof graph;
    }
    // An unparseable previous_graph degrades to no carry-forward rather
    // than blocking the approve — the same NFR-004 posture as every other
    // task-map degrade path in this file.
  }

  if (!client) {
    throw new Error("Mock task-map approval uses the local workflow context.");
  }

  await requireSupabaseUser(client, "Sign in before approving task maps.");

  const approvedAt = new Date().toISOString();
  const query = client.from("tasks") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      progression_map: graph,
      map_status: "approved",
      map_schema_version: graph.schema_version,
      map_approved_at: approvedAt,
    })
    .eq("id", input.task_id)
    .select(taskColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const task = parseTask(data);

  if (input.suggestion_record_id) {
    recordSuggestionResolutionFireAndForget(client, {
      id: input.suggestion_record_id,
      status: "accepted",
      decided_by: "user",
      resolved_at: approvedAt,
    });
  }

  if (input.ai_draft) {
    const diffs = diffTaskMapNodes(input.ai_draft.nodes, graph.nodes);
    for (const diff of diffs) {
      recordOverrideFireAndForget(client, {
        area_id: input.area_id,
        policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
        suggestion_id: input.suggestion_record_id ?? null,
        subject_type: "task_map_node",
        subject_id: task.id,
        override_type: diff.override_type,
        old_value_json: diff.old_value ?? {},
        new_value_json: diff.new_value ?? {},
        reason: null,
      });
    }
  }

  return { provider: "supabase", task };
}

export interface SetTaskMapNodeCompletionInput {
  task_id: string;
  node_id: string;
  /** The current approved graph (pre-toggle), as already loaded by the
   * caller (WorkflowContext holds the persisted task's `progression_map` in
   * local state). Re-validated here before any mutation is computed or
   * written — this function is the sole choke point for a completion write,
   * mirroring `approveTaskMap`. */
  graph: unknown;
  /** ISO timestamp of the user action, supplied by the caller so the write
   * is deterministic and testable (no ambient `Date.now`). */
  now: string;
}

export interface TaskMapNodeCompletionResult {
  provider: DataProvider;
  task: Task;
}

/**
 * FR-031 slice 6 — user-action-only node completion on an already-approved
 * map. Never AI-invoked, never instrumented (a completion tap is not an AI
 * suggestion resolution, so no suggestion_records/override_records write
 * happens here). Gate-first: the incoming graph is validated with
 * `validateTaskMapForPersistence` before the pure `toggleNodeCompletion`
 * (apps/web/src/lib/taskmap/collapse.ts) computes the mutated graph, which
 * is re-validated before it ever reaches `tasks.progression_map`. Red nodes
 * and unknown node ids are rejected (`toggleNodeCompletion` no-ops and this
 * function throws instead of writing silently).
 */
export async function setTaskMapNodeCompletion(
  client: MinimalSupabaseClient | null,
  input: SetTaskMapNodeCompletionInput,
): Promise<TaskMapNodeCompletionResult> {
  const validation = validateTaskMapForPersistence(input.graph);
  if (!validation.ok) {
    throw new Error(
      `Task map failed validation and completion was not saved: ${validation.errors.join("; ")}`,
    );
  }

  const currentNode = validation.graph.nodes.find(
    (node) => node.id === input.node_id,
  );
  if (!currentNode) {
    throw new Error(`Task map node not found: ${input.node_id}`);
  }
  if (currentNode.role === "red") {
    throw new Error("Red task-map nodes cannot be marked done.");
  }

  const updatedGraph = toggleNodeCompletion(
    validation.graph as TaskMapGraph,
    input.node_id,
    input.now,
  );

  const revalidation = validateTaskMapForPersistence(updatedGraph);
  if (!revalidation.ok) {
    throw new Error(
      `Task map completion failed validation and was not saved: ${revalidation.errors.join("; ")}`,
    );
  }

  if (!client) {
    throw new Error(
      "Mock task-map completion uses the local workflow context.",
    );
  }

  await requireSupabaseUser(client, "Sign in before updating task maps.");

  const query = client.from("tasks") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({ progression_map: revalidation.graph })
    .eq("id", input.task_id)
    .select(taskColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return { provider: "supabase", task: parseTask(data) };
}

const peopleColumns =
  "id,user_id,display_name,normalized_name,notes,created_at,updated_at,archived_at";

/**
 * S3 (#255): live read of the user's people so a proposed person mention can
 * resolve against an existing person (normalized_name matching) instead of
 * always proposing a new person. Returns an empty list in mock mode. Excludes
 * archived people from matching is left to the resolver; this returns all rows
 * so the caller can decide.
 */
export async function listPeople(
  client: MinimalSupabaseClient | null,
): Promise<Person[]> {
  if (!client) {
    return [];
  }

  await requireSupabaseUser(client, "Sign in before loading people.");

  const query = client.from("people") as {
    select: (columns: string) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data, error } = await query.select(peopleColumns);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return PersonSchema.array().parse(normalizeSupabaseRows(data));
}

export interface PersonFindOrCreateResult {
  provider: DataProvider;
  person: Person | null;
}

/**
 * S3 (#255): user-approved person creation (FR-017), idempotent per
 * normalized_name. Called from the triage accept path only, after the user
 * approved a proposed person link (NS-INV-4). Re-checks for an existing person
 * at accept time (another accept may have created them), inserting only when no
 * match exists. Returns null in mock mode — the local demo path has no people
 * store, so a person link there degrades to no-link.
 *
 * Matching is exact on the normalized key, mirroring the pure resolver. There is
 * no unique index on (user_id, normalized_name), so this is select-then-insert:
 * a concurrent duplicate is narrowed, not fully closed — acceptable under the
 * single-user model and the "re-check at accept time" contract.
 */
export async function findOrCreatePerson(
  client: MinimalSupabaseClient | null,
  input: CreatePersonInput,
): Promise<PersonFindOrCreateResult> {
  const parsedInput = CreatePersonInputSchema.parse(input);

  if (!client) {
    return { provider: "mock", person: null };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating people.",
  );

  const selectQuery = client.from("people") as {
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

  const { data: existing, error: existingError } = await selectQuery
    .select(peopleColumns)
    .eq("user_id", user.id)
    .eq("normalized_name", parsedInput.normalized_name)
    .maybeSingle();

  if (existingError) {
    throw new Error(getSupabaseMessage(existingError));
  }

  if (existing) {
    return {
      provider: "supabase",
      person: PersonSchema.parse(normalizeSupabaseRow(existing)),
    };
  }

  const insertQuery = client.from("people") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await insertQuery
    .insert({
      user_id: user.id,
      display_name: parsedInput.display_name,
      normalized_name: parsedInput.normalized_name,
    })
    .select(peopleColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    person: PersonSchema.parse(normalizeSupabaseRow(data)),
  };
}

export interface PersonLinkAcceptanceInput {
  area_id: string | null;
  draft_id: string;
  name: string;
  role: "waiting_on" | "committed_to" | "mention";
  matched_person_id?: string | null;
}

/**
 * S3 (#255): record that the user ACCEPTED a proposed person link. Mirrors
 * `recordPersonLinkRejection` — inserts a terminal-status (`accepted`) suggestion
 * row that resolves the dangling pending person-link proposal, fire-and-forget so
 * a learning-write failure never affects the accept flow (NS-INV-3). A true
 * override row is not written here: an accepted proposal is the default action,
 * not an override.
 */
export function recordPersonLinkAcceptance(
  client: MinimalSupabaseClient | null,
  input: PersonLinkAcceptanceInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: PERSON_LINK_POLICY_ID,
    suggestion_type: "parse_result",
    subject_type: "person_mention",
    subject_id: uuidPattern.test(input.draft_id) ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      name: input.name,
      role: input.role,
      status: "accepted",
      linked_person_id: input.matched_person_id ?? null,
    },
    status: "accepted",
    resolved_at: new Date().toISOString(),
  });
}

const operatorProfileColumns =
  "id,user_id,profile_text,compensation_rules,created_at,updated_at";

/**
 * S3 (#255): live read of the single operator profile so the parse request can
 * carry it through the NS-INV-1 context-assembly module. Returns null when no
 * profile row exists (the empty-profile parity case). Never throws for a
 * missing profile — a personalization read must not break parsing.
 */
export async function getOperatorProfile(
  client: MinimalSupabaseClient | null,
): Promise<OperatorProfile | null> {
  if (!client) {
    return null;
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading the operator profile.",
  );

  const query = client.from("operator_profiles") as {
    select: (columns: string) => {
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data, error } = await query
    .select(operatorProfileColumns)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  if (!data) {
    return null;
  }

  return OperatorProfileSchema.parse(normalizeSupabaseRow(data));
}

export async function listAreas(
  client: MinimalSupabaseClient | null,
  options: { includeInactive?: boolean } = {},
): Promise<AreaListResult> {
  if (!client) {
    return {
      provider: "mock",
      areas: options.includeInactive
        ? mockAreas
        : mockAreas.filter((area) => area.is_active),
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading areas from Supabase.",
  );

  let data: unknown;
  let error: unknown;

  if (options.includeInactive) {
    const query = client.from("areas") as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };

    ({ data, error } = await query
      .select(areaColumns)
      .order("sort_order", { ascending: true }));
  } else {
    const query = client.from("areas") as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          eq: (
            column: string,
            value: boolean,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };

    ({ data, error } = await query
      .select(areaColumns)
      .order("sort_order", { ascending: true })
      .eq("is_active", true));
  }

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    areas: parseAreas(data),
  };
}

export async function createArea(
  client: MinimalSupabaseClient | null,
  input: CreateAreaInput,
): Promise<AreaCreateResult> {
  const parsedInput = CreateAreaInputSchema.parse(input);

  if (!client) {
    const now = new Date().toISOString();
    const slug = uniqueAreaSlug(
      parsedInput.name,
      mockAreas.map((area) => area.slug),
    );

    return {
      provider: "mock",
      area: AreaSchema.parse({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        name: parsedInput.name,
        slug,
        description: parsedInput.description,
        color: parsedInput.color ?? null,
        icon: null,
        sort_order: mockAreas.length,
        is_active: true,
        created_at: now,
        updated_at: now,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating areas in Supabase.",
  );

  const listQuery = client.from("areas") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data: existingData, error: existingError } = await listQuery
    .select(areaColumns)
    .order("sort_order", { ascending: true });

  if (existingError) {
    throw new Error(getSupabaseMessage(existingError));
  }

  const existingAreas = parseAreas(existingData);
  const slug = uniqueAreaSlug(
    parsedInput.name,
    existingAreas.map((area) => area.slug),
  );
  const sortOrder =
    existingAreas.reduce(
      (maxSortOrder, area) => Math.max(maxSortOrder, area.sort_order),
      -1,
    ) + 1;

  const query = client.from("areas") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      user_id: user.id,
      name: parsedInput.name,
      slug,
      description: parsedInput.description,
      color: parsedInput.color ?? null,
      icon: null,
      sort_order: sortOrder,
      is_active: true,
    })
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function softDeleteArea(
  client: MinimalSupabaseClient | null,
  input: SoftDeleteAreaInput,
): Promise<AreaSoftDeleteResult> {
  const parsedInput = SoftDeleteAreaInputSchema.parse(input);

  if (!client) {
    const area = mockAreas.find((item) => item.id === parsedInput.area_id);

    if (!area) {
      throw new Error("Area not found.");
    }

    return {
      provider: "mock",
      area: AreaSchema.parse({
        ...area,
        is_active: false,
        updated_at: new Date().toISOString(),
      }),
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before removing areas from Supabase.",
  );

  const query = client.from("areas") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      is_active: false,
    })
    .eq("id", parsedInput.area_id)
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function updateAreaColor(
  client: MinimalSupabaseClient | null,
  input: UpdateAreaColorInput,
): Promise<AreaColorUpdateResult> {
  const parsedInput = UpdateAreaColorInputSchema.parse(input);

  if (!client) {
    const area = mockAreas.find((item) => item.id === parsedInput.area_id);

    if (!area) {
      throw new Error("Area not found.");
    }

    const updatedArea = AreaSchema.parse({
      ...area,
      color: parsedInput.color,
      updated_at: new Date().toISOString(),
    });
    const index = mockAreas.findIndex(
      (item) => item.id === parsedInput.area_id,
    );
    mockAreas.splice(index, 1, updatedArea);

    return {
      provider: "mock",
      area: updatedArea,
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before updating area colors in Supabase.",
  );

  const query = client.from("areas") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      color: parsedInput.color,
    })
    .eq("id", parsedInput.area_id)
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function createCaptureItem(
  client: MinimalSupabaseClient | null,
  input: CreateCaptureItemInput,
): Promise<CaptureCreateResult> {
  const parsedInput = CreateCaptureItemInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      capture: parseCapture({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        raw_text: parsedInput.raw_text,
        raw_audio_ref: null,
        return_hook: parsedInput.return_hook ?? null,
        client_capture_id: parsedInput.client_capture_id ?? null,
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving captures to Supabase.",
  );

  const query = client.from("capture_items") as {
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
      raw_text: parsedInput.raw_text,
      return_hook: parsedInput.return_hook ?? null,
      client_capture_id: parsedInput.client_capture_id ?? null,
      capture_mode: "text",
      status: "new",
    })
    .select(captureColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    capture: parseCapture(data),
  };
}

export interface SyncQueuedCaptureInput {
  raw_text: string;
  area_id: string | null;
  return_hook: string | null;
  client_capture_id: string;
}

/**
 * FR-027 (F-G1a): push one offline-queued raw capture to the spine on reconnect.
 * Idempotent by construction — an upsert on the `(user_id, client_capture_id)`
 * unique index with `ignoreDuplicates`, so a replayed sync (the queue drained
 * twice, or a capture that already reached the server before) is a no-op rather
 * than a duplicate row or a thrown unique-violation. Returns mock when Supabase
 * is unconfigured (the queue simply stays local until sign-in).
 */
export async function syncQueuedCapture(
  client: MinimalSupabaseClient | null,
  input: SyncQueuedCaptureInput,
): Promise<{ provider: "mock" | "supabase" }> {
  if (!client) return { provider: "mock" };

  const user = await requireSupabaseUser(
    client,
    "Sign in to sync offline captures.",
  );

  const query = client.from("capture_items") as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => PromiseLike<{ error: unknown }>;
  };

  const { error } = await query.upsert(
    {
      user_id: user.id,
      area_id: input.area_id,
      raw_text: input.raw_text,
      return_hook: input.return_hook,
      client_capture_id: input.client_capture_id,
      capture_mode: "text",
      status: "new",
    },
    { onConflict: "user_id,client_capture_id", ignoreDuplicates: true },
  );

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase" };
}

export async function listCaptureItems(
  client: MinimalSupabaseClient | null,
): Promise<CaptureListResult> {
  if (!client) {
    return { provider: "mock", captures: [] };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading captures from Supabase.",
  );

  const query = client.from("capture_items") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data, error } = await query
    .select(captureColumns)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    captures: parseCaptures(data),
  };
}

export async function createTask(
  client: MinimalSupabaseClient | null,
  input: CreateTaskInput,
): Promise<TaskCreateResult> {
  const parsedInput = CreateTaskInputSchema.parse(input);

  if (!client) {
    const createdAt = new Date().toISOString();
    return {
      provider: "mock",
      task: parseTask({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        project_id: parsedInput.project_id,
        source_capture_item_id: parsedInput.source_capture_item_id,
        title: parsedInput.title,
        description: parsedInput.description,
        status: parsedInput.status,
        priority_score: parsedInput.priority_score,
        priority_confidence: parsedInput.priority_confidence,
        task_type: parsedInput.task_type,
        is_reversible: parsedInput.is_reversible,
        energy_type: parsedInput.energy_type,
        estimated_minutes_low: parsedInput.estimated_minutes_low,
        estimated_minutes_high: parsedInput.estimated_minutes_high,
        due_at: parsedInput.due_at,
        definition_of_done: parsedInput.definition_of_done,
        first_tiny_step: parsedInput.first_tiny_step,
        waiting_on_person_id: parsedInput.waiting_on_person_id ?? null,
        waiting_on_since: parsedInput.waiting_on_since ?? null,
        is_commitment: parsedInput.is_commitment ?? false,
        committed_to_person_id: parsedInput.committed_to_person_id ?? null,
        created_at: createdAt,
        updated_at: createdAt,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving tasks to Supabase.",
  );

  const query = client.from("tasks") as {
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
      project_id: parsedInput.project_id,
      source_capture_item_id: parsedInput.source_capture_item_id,
      title: parsedInput.title,
      description: parsedInput.description,
      status: parsedInput.status,
      priority_score: parsedInput.priority_score,
      priority_confidence: parsedInput.priority_confidence,
      task_type: parsedInput.task_type,
      is_reversible: parsedInput.is_reversible,
      energy_type: parsedInput.energy_type,
      estimated_minutes_low: parsedInput.estimated_minutes_low,
      estimated_minutes_high: parsedInput.estimated_minutes_high,
      due_at: parsedInput.due_at,
      definition_of_done: parsedInput.definition_of_done,
      first_tiny_step: parsedInput.first_tiny_step,
      // S3 (#255): person/commitment link columns. Only ever non-default when
      // the accept path resolved an approved link; omit-as-null/false otherwise
      // so plain tasks are unchanged. The DB default for is_commitment is false.
      waiting_on_person_id: parsedInput.waiting_on_person_id ?? null,
      waiting_on_since: parsedInput.waiting_on_since ?? null,
      is_commitment: parsedInput.is_commitment ?? false,
      committed_to_person_id: parsedInput.committed_to_person_id ?? null,
    })
    .select(taskColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const task = parseTask(data);
  recordSuggestionFireAndForget(client, {
    area_id: task.area_id,
    policy_identifier: "triage.default_accept_task",
    suggestion_type: "triage_suggestion",
    subject_type: "task",
    subject_id: task.id,
    suggestion_json: {
      title: task.title,
      status: task.status,
      source_capture_item_id: task.source_capture_item_id,
    },
    confidence: task.priority_confidence,
    status: "accepted",
    resolved_at: new Date().toISOString(),
  });

  return {
    provider: "supabase",
    task,
  };
}

export async function createProject(
  client: MinimalSupabaseClient | null,
  input: CreateProjectInput,
): Promise<ProjectCreateResult> {
  const parsedInput = CreateProjectInputSchema.parse(input);

  if (!client) {
    const createdAt = new Date().toISOString();
    return {
      provider: "mock",
      project: parseProject({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        title: parsedInput.title,
        description: parsedInput.description,
        status: "active",
        created_at: createdAt,
        updated_at: createdAt,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving projects to Supabase.",
  );

  const query = client.from("projects") as {
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
      title: parsedInput.title,
      description: parsedInput.description,
      status: "active",
    })
    .select(projectColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    project: parseProject(data),
  };
}

export async function listPlanningItems(
  client: MinimalSupabaseClient | null,
): Promise<PlanningItemsResult> {
  if (!client) {
    return {
      provider: "mock",
      tasks: [],
      proposals: [],
      blocks: [],
    };
  }

  await requireSupabaseUser(client, "Sign in before loading planning rows.");

  // Intentionally returns only active tasks. Planned-block joins MUST use
  // listExecutionReviewItems' task list; see KNOWN_ISSUES row 11.
  const tasksQuery = client.from("tasks") as {
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
  const proposalsQuery = client.from("time_block_proposals") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const blocksQuery = client.from("calendar_blocks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data: tasks, error: tasksError } = await tasksQuery
    .select(taskColumns)
    .order("updated_at", { ascending: false })
    .eq("status", "active");
  if (tasksError) {
    throw new Error(getSupabaseMessage(tasksError));
  }

  const { data: proposals, error: proposalsError } = await proposalsQuery
    .select(timeBlockProposalColumns)
    .order("proposed_start", { ascending: true });
  if (proposalsError) {
    throw new Error(getSupabaseMessage(proposalsError));
  }

  const { data: blocks, error: blocksError } = await blocksQuery
    .select(calendarBlockColumns)
    .order("start_at", { ascending: true });
  if (blocksError) {
    throw new Error(getSupabaseMessage(blocksError));
  }

  return {
    provider: "supabase",
    tasks: parseTasks(tasks),
    proposals: parseTimeBlockProposals(proposals),
    blocks: parseCalendarBlocks(blocks),
  };
}

export async function createTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  input: CreateTimeBlockProposalInput,
): Promise<TimeBlockProposalCreateResult> {
  const parsedInput = CreateTimeBlockProposalInputSchema.parse(input);

  if (!client) {
    const createdAt = new Date().toISOString();
    return {
      provider: "mock",
      proposal: parseTimeBlockProposal({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: mockAreas[0]?.id,
        task_id: parsedInput.task_id,
        proposed_start: parsedInput.proposed_start,
        proposed_end: parsedInput.proposed_end,
        rationale_json: { note: parsedInput.rationale_note },
        conflict_flag: false,
        conflict_details_json: null,
        status: "proposed",
        created_at: createdAt,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating planning proposals.",
  );

  const taskQuery = client.from("tasks") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data: taskData, error: taskError } = await taskQuery
    .select(taskColumns)
    .eq("id", parsedInput.task_id)
    .single();
  if (taskError) {
    throw new Error(getSupabaseMessage(taskError));
  }
  const task = parseTask(taskData);

  const proposalQuery = client.from("time_block_proposals") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await proposalQuery
    .insert({
      user_id: user.id,
      area_id: task.area_id,
      task_id: task.id,
      proposed_start: parsedInput.proposed_start,
      proposed_end: parsedInput.proposed_end,
      rationale_json: { note: parsedInput.rationale_note },
      conflict_flag: false,
      conflict_details_json: null,
      status: "proposed",
    })
    .select(timeBlockProposalColumns)
    .single();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const proposal = parseTimeBlockProposal(data);
  recordSuggestionFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    suggestion_type: "time_block_proposal",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    suggestion_json: {
      task_id: proposal.task_id,
      proposed_start: proposal.proposed_start,
      proposed_end: proposal.proposed_end,
      rationale_json: proposal.rationale_json,
    },
    confidence: null,
    status: "pending",
  });

  return {
    provider: "supabase",
    proposal,
  };
}

export async function editTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
  input: EditTimeBlockProposalInput,
): Promise<TimeBlockProposalUpdateResult> {
  const parsedInput = EditTimeBlockProposalInputSchema.parse(input);

  if (!client) {
    throw new Error("Mock proposal edits use the local workflow context.");
  }

  await requireSupabaseUser(
    client,
    "Sign in before editing planning proposals.",
  );

  const query = client.from("time_block_proposals") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      proposed_start: parsedInput.proposed_start,
      proposed_end: parsedInput.proposed_end,
      status: "edited",
    })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const proposal = parseTimeBlockProposal(data);
  recordOverrideFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    override_type: "edited",
    old_value_json: {},
    new_value_json: {
      proposed_start: proposal.proposed_start,
      proposed_end: proposal.proposed_end,
      status: proposal.status,
    },
    reason: "User edited a local time-block proposal.",
  });

  return {
    provider: "supabase",
    proposal,
  };
}

export async function rejectTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalUpdateResult> {
  if (!client) {
    throw new Error("Mock proposal rejection uses the local workflow context.");
  }

  await requireSupabaseUser(
    client,
    "Sign in before rejecting planning proposals.",
  );

  const query = client.from("time_block_proposals") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const proposal = parseTimeBlockProposal(data);
  recordOverrideFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    override_type: "rejected",
    old_value_json: { status: "proposed" },
    new_value_json: { status: proposal.status },
    reason: "User rejected a local time-block proposal.",
  });

  return {
    provider: "supabase",
    proposal,
  };
}

export async function acceptTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalAcceptResult> {
  if (!client) {
    throw new Error(
      "Mock proposal acceptance uses the local workflow context.",
    );
  }

  await requireSupabaseUser(
    client,
    "Sign in before accepting planning proposals.",
  );

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("accept_time_block_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const proposal = parseTimeBlockProposal(result.proposal);
  const block = parseCalendarBlock(result.block);
  recordOverrideFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    override_type: "accepted",
    old_value_json: { status: "proposed" },
    new_value_json: {
      status: proposal.status,
      calendar_block_id: block.id,
      start_at: block.start_at,
      end_at: block.end_at,
    },
    reason: "User accepted a local time-block proposal.",
  });

  return {
    provider: "supabase",
    proposal,
    block,
    task: result.task ? parseTask(result.task) : null,
  };
}

export async function checkTimeBlockProposalConflict(
  client: MinimalSupabaseClient | null,
  proposalId: string,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): Promise<TimeBlockProposalConflictCheckResult> {
  const parsedInput = CheckTimeBlockProposalConflictInputSchema.parse({
    proposal_id: proposalId,
    timezone,
  });

  if (!client) {
    throw new Error(
      "Google Calendar conflict checks require Supabase configuration.",
    );
  }

  if (!client.auth?.getSession) {
    throw new Error("Supabase auth is unavailable.");
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const accessToken = data.session?.access_token?.trim();

  if (!accessToken) {
    throw new Error("Sign in before checking Google Calendar conflicts.");
  }

  const response = await fetch("/api/google-calendar/freebusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedInput),
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Google Calendar conflict check failed.",
    );
  }

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(payload?.proposal),
    hasConflict: Boolean(payload?.has_conflict),
    checkedAt:
      typeof payload?.checked_at === "string"
        ? payload.checked_at
        : new Date().toISOString(),
  };
}

export async function createGoogleCalendarEventFromProposal(
  client: MinimalSupabaseClient | null,
  input: CreateGoogleCalendarEventInput,
): Promise<GoogleCalendarEventCreateResult> {
  const parsedInput = CreateGoogleCalendarEventInputSchema.parse(input);

  if (!client) {
    throw new Error(
      "Google Calendar event creation requires Supabase configuration.",
    );
  }

  if (!client.auth?.getSession) {
    throw new Error("Supabase auth is unavailable.");
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const accessToken = data.session?.access_token?.trim();

  if (!accessToken) {
    throw new Error("Sign in before creating Google Calendar events.");
  }

  const response = await fetch("/api/google-calendar/create-event", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedInput),
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new GoogleCalendarEventCreateError(
      typeof payload?.error === "string"
        ? payload.error
        : "Google Calendar event could not be created.",
      response.status,
    );
  }

  const block = parseCalendarBlock(payload?.block);
  const googleEventId =
    typeof payload?.google_event_id === "string"
      ? payload.google_event_id
      : block.google_event_id;

  if (!googleEventId) {
    throw new Error(
      "Google Calendar event response did not include an event id.",
    );
  }

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(payload?.proposal),
    block,
    googleEventId,
  };
}

function mockExecutionSession(input: CreateExecutionSessionInput) {
  return parseExecutionSession({
    id: crypto.randomUUID(),
    user_id: mockUserId,
    area_id: mockAreas[0]?.id,
    task_id: input.task_id,
    calendar_block_id: input.calendar_block_id ?? null,
    planned_minutes: null,
    actual_minutes: null,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    energy_rating: null,
    outcome: "partial",
    cap_outcome: null,
    notes: null,
    created_at: new Date().toISOString(),
  });
}

export async function listExecutionReviewItems(
  client: MinimalSupabaseClient | null,
): Promise<ExecutionReviewItemsResult> {
  if (!client) {
    return {
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    };
  }

  await requireSupabaseUser(client, "Sign in before loading execution rows.");

  const tasksQuery = client.from("tasks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const blocksQuery = client.from("calendar_blocks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const sessionsQuery = client.from("execution_sessions") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const reviewsQuery = client.from("review_entries") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data: tasks, error: tasksError } = await tasksQuery
    .select(taskColumns)
    .order("updated_at", { ascending: false });
  if (tasksError) throw new Error(getSupabaseMessage(tasksError));

  const { data: blocks, error: blocksError } = await blocksQuery
    .select(calendarBlockColumns)
    .order("start_at", { ascending: true });
  if (blocksError) throw new Error(getSupabaseMessage(blocksError));

  const { data: sessions, error: sessionsError } = await sessionsQuery
    .select(executionSessionColumns)
    .order("created_at", { ascending: false });
  if (sessionsError) throw new Error(getSupabaseMessage(sessionsError));

  const { data: reviews, error: reviewsError } = await reviewsQuery
    .select(reviewEntryColumns)
    .order("created_at", { ascending: false });
  if (reviewsError) throw new Error(getSupabaseMessage(reviewsError));

  return {
    provider: "supabase",
    tasks: parseTasks(tasks),
    blocks: parseCalendarBlocks(blocks),
    sessions: parseExecutionSessions(sessions),
    reviewEntries: parseReviewEntries(reviews),
  };
}

export async function createExecutionSession(
  client: MinimalSupabaseClient | null,
  input: CreateExecutionSessionInput,
): Promise<ExecutionSessionCreateResult> {
  const parsedInput = CreateExecutionSessionInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      session: mockExecutionSession(parsedInput),
      block: null,
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before starting execution sessions.",
  );

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("start_execution_session", {
    p_task_id: parsedInput.task_id,
    p_calendar_block_id: parsedInput.calendar_block_id ?? null,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    session: parseExecutionSession(result.session),
    block: result.block ? parseCalendarBlock(result.block) : null,
  };
}

function executionMarkPatch(
  session: ExecutionSession,
  input: MarkExecutionSessionInput,
) {
  if (input.status === "paused") {
    return {
      outcome: "partial",
      actual_minutes: session.actual_minutes,
      paused_minutes: session.paused_minutes ?? 0,
      distraction_minutes: session.distraction_minutes ?? 0,
      productivity_rating: session.productivity_rating,
      cap_outcome: session.cap_outcome ?? null,
      notes: session.notes,
    };
  }

  return {
    outcome: input.outcome,
    actual_minutes: input.actual_minutes,
    paused_minutes: session.paused_minutes ?? 0,
    distraction_minutes: session.distraction_minutes ?? 0,
    productivity_rating: input.productivity_rating,
    cap_outcome: input.cap_outcome ?? null,
    notes: input.notes,
  };
}

export async function markExecutionSession(
  client: MinimalSupabaseClient | null,
  sessionId: string,
  input: MarkExecutionSessionInput,
): Promise<ExecutionSessionMarkResult> {
  const parsedInput = MarkExecutionSessionInputSchema.parse(input);

  if (!client) {
    const mockBaseSession = mockExecutionSession({
      task_id: crypto.randomUUID(),
    });
    const mockPatch = executionMarkPatch(mockBaseSession, parsedInput);
    const session = parseExecutionSession({
      id: sessionId,
      user_id: mockUserId,
      area_id: mockAreas[0]?.id,
      task_id: null,
      calendar_block_id: null,
      planned_minutes: null,
      actual_minutes: mockPatch.actual_minutes,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: mockPatch.productivity_rating,
      energy_rating: null,
      outcome: mockPatch.outcome,
      cap_outcome: mockPatch.cap_outcome,
      notes: mockPatch.notes,
      created_at: new Date().toISOString(),
    });
    return { provider: "mock", session, block: null, task: null };
  }

  await requireSupabaseUser(
    client,
    "Sign in before updating execution sessions.",
  );

  const sessionReadQuery = client.from("execution_sessions") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data: sessionData, error: sessionReadError } = await sessionReadQuery
    .select(executionSessionColumns)
    .eq("id", sessionId)
    .single();
  if (sessionReadError) throw new Error(getSupabaseMessage(sessionReadError));
  const currentSession = parseExecutionSession(sessionData);

  const patch = executionMarkPatch(currentSession, parsedInput);

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("apply_execution_session_outcome", {
    p_session_id: sessionId,
    p_outcome: patch.outcome,
    p_actual_minutes: patch.actual_minutes,
    p_paused_minutes: patch.paused_minutes,
    p_distraction_minutes: patch.distraction_minutes,
    p_productivity_rating: patch.productivity_rating,
    p_notes: patch.notes,
    p_cap_outcome: patch.cap_outcome,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    session: parseExecutionSession(result.session),
    block: result.block ? parseCalendarBlock(result.block) : null,
    task: result.task ? parseTask(result.task) : null,
  };
}

export async function unplanCalendarBlock(
  client: MinimalSupabaseClient | null,
  blockId: string,
): Promise<CalendarBlockUnplanResult> {
  if (!client) {
    throw new Error("Mock unplanning uses the local workflow context.");
  }

  await requireSupabaseUser(client, "Sign in before unplanning blocks.");

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("unplan_calendar_block", {
    p_block_id: blockId,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    block: parseCalendarBlock(result.block),
    task: result.task ? parseTask(result.task) : null,
  };
}

export async function applyTaskReviewTransition(
  client: MinimalSupabaseClient | null,
  taskId: string,
  targetStatus: ReviewTaskTargetStatus,
): Promise<TaskReviewTransitionResult> {
  if (!client) {
    throw new Error("Mock review task transitions use local workflow state.");
  }

  if (!["active", "backlog", "dropped"].includes(targetStatus)) {
    throw new Error("Review task target status is not supported.");
  }

  await requireSupabaseUser(
    client,
    "Sign in before saving review task choices.",
  );

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("apply_task_review_transition", {
    p_task_id: taskId,
    p_target_status: targetStatus,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    task: parseTask(result.task),
    blocks: parseCalendarBlocks(result.blocks ?? []),
  };
}

export async function createReviewEntry(
  client: MinimalSupabaseClient | null,
  input: CreateReviewEntryInput,
): Promise<ReviewEntryCreateResult> {
  const parsedInput = CreateReviewEntryInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      reviewEntry: parseReviewEntry({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        review_type: parsedInput.review_type,
        period_start: parsedInput.period_start,
        period_end: parsedInput.period_end,
        summary_json: parsedInput.summary_json,
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating review entries.",
  );

  const query = client.from("review_entries") as {
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
      review_type: parsedInput.review_type,
      period_start: parsedInput.period_start,
      period_end: parsedInput.period_end,
      summary_json: parsedInput.summary_json,
    })
    .select(reviewEntryColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    reviewEntry: parseReviewEntry(data),
  };
}

// Wins are only ever written on explicit user confirm (issue #259). No AI drafts
// or auto-harvest here: this records a single user-confirmed win.
export async function createWinRecord(
  client: MinimalSupabaseClient | null,
  input: CreateWinRecordInput,
): Promise<WinRecordCreateResult> {
  const parsedInput = CreateWinRecordInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      winRecord: parseWinRecord({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        source_task_id: parsedInput.source_task_id,
        source_project_id: parsedInput.source_project_id,
        title: parsedInput.title,
        detail: parsedInput.detail,
        occurred_at: parsedInput.occurred_at,
        review_entry_id: parsedInput.review_entry_id,
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before recording wins.",
  );

  const query = client.from("win_records") as {
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
      source_task_id: parsedInput.source_task_id,
      source_project_id: parsedInput.source_project_id,
      title: parsedInput.title,
      detail: parsedInput.detail,
      occurred_at: parsedInput.occurred_at,
      review_entry_id: parsedInput.review_entry_id,
    })
    .select(winRecordColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    winRecord: parseWinRecord(data),
  };
}

// Candidate wins for the weekly-review harvest step: tasks and projects the user
// marked done since `since` (the review period start) that have not already been
// harvested into a win_record. RLS bounds every read to the signed-in user.
export async function listWinHarvestCandidates(
  client: MinimalSupabaseClient | null,
  since: string,
): Promise<WinHarvestCandidatesResult> {
  if (!client) {
    return { provider: "mock", candidates: [] };
  }

  await requireSupabaseUser(client, "Sign in before harvesting wins.");

  type DoneQuery = {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        gte: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
  const tasksQuery = client.from("tasks") as DoneQuery;
  const projectsQuery = client.from("projects") as DoneQuery;
  const winsQuery = client.from("win_records") as {
    select: (columns: string) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data: tasks, error: tasksError } = await tasksQuery
    .select(taskColumns)
    .eq("status", "done")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });
  if (tasksError) throw new Error(getSupabaseMessage(tasksError));

  const { data: projects, error: projectsError } = await projectsQuery
    .select(projectColumns)
    .eq("status", "done")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });
  if (projectsError) throw new Error(getSupabaseMessage(projectsError));

  const { data: existingWins, error: winsError } = await winsQuery.select(
    "source_task_id,source_project_id",
  );
  if (winsError) throw new Error(getSupabaseMessage(winsError));

  const harvestedTaskIds = new Set<string>();
  const harvestedProjectIds = new Set<string>();
  for (const row of normalizeSupabaseRows(existingWins) as Array<
    Record<string, unknown>
  >) {
    if (typeof row.source_task_id === "string")
      harvestedTaskIds.add(row.source_task_id);
    if (typeof row.source_project_id === "string")
      harvestedProjectIds.add(row.source_project_id);
  }

  const toCalendarDate = (iso: string) =>
    new Date(iso).toISOString().slice(0, 10);

  const candidates: WinHarvestCandidate[] = [
    ...parseTasks(tasks)
      .filter((task) => !harvestedTaskIds.has(task.id))
      .map((task) => ({
        source_type: "task" as const,
        source_id: task.id,
        area_id: task.area_id,
        title: task.title,
        occurred_at: toCalendarDate(task.updated_at),
      })),
    ...ProjectSchema.array()
      .parse(normalizeSupabaseRows(projects))
      .filter((project) => !harvestedProjectIds.has(project.id))
      .map((project) => ({
        source_type: "project" as const,
        source_id: project.id,
        area_id: project.area_id,
        title: project.title,
        occurred_at: toCalendarDate(project.updated_at),
      })),
  ];

  return { provider: "supabase", candidates };
}

// The wins reading section for weekly/monthly review: most-recent first.
export async function listWinRecords(
  client: MinimalSupabaseClient | null,
): Promise<WinRecordsResult> {
  if (!client) {
    return { provider: "mock", winRecords: [] };
  }

  await requireSupabaseUser(client, "Sign in before loading wins.");

  const query = client.from("win_records") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(winRecordColumns)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return { provider: "supabase", winRecords: parseWinRecords(data) };
}

// S8 (#260): persist a user-APPROVED rollup (NS-INV-4 — drafts never reach
// here; only an approved rollup is written). Weekly or monthly.
export async function createRollupSummary(
  client: MinimalSupabaseClient | null,
  input: CreateRollupSummaryInput,
): Promise<RollupSummaryCreateResult> {
  const parsedInput = CreateRollupSummaryInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      rollupSummary: parseRollupSummary({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        period_type: parsedInput.period_type,
        period_start: parsedInput.period_start,
        period_end: parsedInput.period_end,
        summary: parsedInput.summary,
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving rollups.",
  );

  const query = client.from("rollup_summaries") as {
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
      period_type: parsedInput.period_type,
      period_start: parsedInput.period_start,
      period_end: parsedInput.period_end,
      summary: parsedInput.summary,
    })
    .select(rollupSummaryColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    rollupSummary: parseRollupSummary(data),
  };
}

// Approved rollups for the review reading section (week-vs-week / month-over-
// month) and as the rollup context source (NS-INV-1). Most-recent first.
export async function listRollupSummaries(
  client: MinimalSupabaseClient | null,
): Promise<RollupSummariesResult> {
  if (!client) {
    return { provider: "mock", rollupSummaries: [] };
  }

  await requireSupabaseUser(client, "Sign in before loading rollups.");

  const query = client.from("rollup_summaries") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(rollupSummaryColumns)
    .order("period_start", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    rollupSummaries: parseRollupSummaries(data),
  };
}

export async function listDurationProfiles(
  client: MinimalSupabaseClient | null,
): Promise<DurationProfilesResult> {
  if (!client) {
    return { provider: "mock", durationProfiles: [] };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading duration profiles.",
  );

  const query = client.from("duration_profiles") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(durationProfileColumns)
    .order("last_updated_at", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    durationProfiles: parseDurationProfiles(data),
  };
}

export async function upsertDurationProfile(
  client: MinimalSupabaseClient | null,
  input: CreateDurationProfileInput,
): Promise<DurationProfileUpsertResult> {
  const parsedInput = CreateDurationProfileInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      durationProfile: parseDurationProfile({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        task_type: parsedInput.task_type,
        estimate_stats_json: parsedInput.estimate_stats,
        sample_count: parsedInput.sample_count,
        last_updated_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving duration profiles.",
  );

  const query = client.from("duration_profiles") as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data, error } = await query
    .upsert(
      {
        user_id: user.id,
        area_id: parsedInput.area_id,
        task_type: parsedInput.task_type,
        estimate_stats_json: parsedInput.estimate_stats,
        sample_count: parsedInput.sample_count,
      },
      { onConflict: "user_id,area_id,task_type" },
    )
    .select(durationProfileColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    durationProfile: parseDurationProfile(data),
  };
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
