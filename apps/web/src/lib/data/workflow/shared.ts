import {
  AreaSchema,
  CalendarBlockSchema,
  CaptureItemSchema,
  DurationProfileSchema,
  ExecutionSessionSchema,
  ProjectSchema,
  ReviewEntrySchema,
  RollupSummarySchema,
  TaskSchema,
  TimeBlockProposalSchema,
  WinRecordSchema,
  type Area,
  type CalendarBlock,
  type CaptureItem,
  type DurationProfile,
  type ExecutionSession,
  type Project,
  type ReviewEntry,
  type RollupSummary,
  type Task,
  type TimeBlockProposal,
  type WinRecord,
} from "@lifeos/schemas";
import {
  normalizeSupabaseRow,
  normalizeSupabaseRows,
} from "../supabaseRowNormalization";

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

export const mockUserId = "00000000-0000-4000-8000-000000000001";

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

export const projectColumns =
  "id,user_id,area_id,title,description,status,created_at,updated_at";

export const timeBlockProposalColumns =
  "id,user_id,area_id,task_id,proposed_start,proposed_end,rationale_json,conflict_flag,conflict_details_json,status,created_at";

export const calendarBlockColumns =
  "id,user_id,area_id,proposal_id,task_id,google_event_id,start_at,end_at,status,created_at,updated_at";

export const executionSessionColumns =
  "id,user_id,area_id,task_id,calendar_block_id,planned_minutes,actual_minutes,paused_minutes,distraction_minutes,productivity_rating,energy_rating,outcome,cap_outcome,notes,created_at";

export const reviewEntryColumns =
  "id,user_id,area_id,review_type,period_start,period_end,summary_json,created_at";

export const winRecordColumns =
  "id,user_id,area_id,source_task_id,source_project_id,title,detail,occurred_at,review_entry_id,created_at";

export const rollupSummaryColumns =
  "id,user_id,area_id,period_type,period_start,period_end,summary,created_at";

export const suggestionRecordColumns =
  "id,user_id,area_id,policy_identifier,schema_version,suggestion_type,subject_type,subject_id,suggestion_json,confidence,status,resolution_reason,decided_by,created_at,resolved_at";

export const durationProfileColumns =
  "id,user_id,area_id,task_type,estimate_stats_json,sample_count,last_updated_at";

export const overrideRecordColumns =
  "id,user_id,area_id,policy_identifier,schema_version,suggestion_id,subject_type,subject_id,override_type,old_value_json,new_value_json,reason,created_at";

export function parseAreas(rows: unknown) {
  return AreaSchema.array().parse(normalizeSupabaseRows(rows));
}

function slugifyAreaName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base.length > 0 ? base : "area";
}

export function uniqueAreaSlug(name: string, existingSlugs: string[]) {
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

export function parseCapture(row: unknown) {
  return CaptureItemSchema.parse(normalizeSupabaseRow(row));
}

export function parseCaptures(rows: unknown) {
  return CaptureItemSchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseTask(row: unknown) {
  return TaskSchema.parse(normalizeSupabaseRow(row));
}

export function parseProject(row: unknown) {
  return ProjectSchema.parse(normalizeSupabaseRow(row));
}

export function parseTimeBlockProposal(row: unknown) {
  return TimeBlockProposalSchema.parse(normalizeSupabaseRow(row));
}

export function parseTimeBlockProposals(rows: unknown) {
  return TimeBlockProposalSchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseCalendarBlock(row: unknown) {
  return CalendarBlockSchema.parse(normalizeSupabaseRow(row));
}

export function parseCalendarBlocks(rows: unknown) {
  return CalendarBlockSchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseExecutionSession(row: unknown) {
  return ExecutionSessionSchema.parse(normalizeSupabaseRow(row));
}

export function parseExecutionSessions(rows: unknown) {
  return ExecutionSessionSchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseReviewEntry(row: unknown) {
  return ReviewEntrySchema.parse(normalizeSupabaseRow(row));
}

export function parseReviewEntries(rows: unknown) {
  return ReviewEntrySchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseWinRecord(row: unknown) {
  return WinRecordSchema.parse(normalizeSupabaseRow(row));
}

export function parseWinRecords(rows: unknown) {
  return WinRecordSchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseRollupSummary(row: unknown) {
  return RollupSummarySchema.parse(normalizeSupabaseRow(row));
}

export function parseRollupSummaries(rows: unknown) {
  return RollupSummarySchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseDurationProfile(row: unknown) {
  return DurationProfileSchema.parse(normalizeSupabaseRow(row));
}

export function parseDurationProfiles(rows: unknown) {
  return DurationProfileSchema.array().parse(normalizeSupabaseRows(rows));
}

export function parseTasks(rows: unknown) {
  return TaskSchema.array().parse(normalizeSupabaseRows(rows));
}

export function getSupabaseMessage(error: unknown) {
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

export async function requireSupabaseUser(
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

export function logLearningWriteFailure(
  error: unknown,
  context: Record<string, unknown>,
) {
  console.warn("LifeOS meta-learning write failed; user action preserved.", {
    error: getSupabaseMessage(error),
    ...context,
  });
}
