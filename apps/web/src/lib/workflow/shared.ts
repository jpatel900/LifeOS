import type {
  Phase2AmbiguityAssessmentResponse,
  Phase2CaptureItem,
  Phase2ProjectDraft,
  Phase2TaskDraft,
  Phase2TimeBlockProposal,
  Phase2TimeBlockProposalDraft,
} from "@lifeos/schemas";
import { areas, healthChecks } from "../mockData";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockProject,
  Phase2MockTask,
} from "../types";

export const WIP_ENFORCEMENT_POLICY_ID = "wip_enforcement.v1";
export const WIP_ENFORCEMENT_LIMIT = 3;

export interface WipSlotHolder {
  task_id: string;
  title: string;
  status: Phase2MockTask["status"];
  block_id: string | null;
}

export interface WipRefusal {
  policy_id: typeof WIP_ENFORCEMENT_POLICY_ID;
  refused_task_id: string;
  refused_task_title: string;
  activation_path:
    | "triage_accept_to_today"
    | "plan_scheduling"
    | "execute_start";
  slot_holders: WipSlotHolder[];
  created_at: string;
}

/**
 * The device -> account identity record, one map per row family.
 *
 * Every row this app creates is minted under a DEVICE-LOCAL id (`task-3`,
 * `proposal-7`) and later twinned with the account row's uuid. Before this
 * field existed, that twinship lived only in per-mount `useRef` maps while the
 * rows themselves were mirrored to `sessionStorage` — so any reload restored
 * the rows and lost the twinship, and the account twin merged in as a second,
 * permanently unretirable row (the "Needs a decision" triple card; the
 * measured `["794b7d18-…", "session-1"]` session double).
 *
 * Living IN the state puts the alias at exactly the durability tier of the
 * rows it protects: it hydrates atomically with them and dies with them when
 * the tab closes, so it can never outlive its local id into a new tab where
 * `nextId` recycles the suffix.
 */
export interface AccountIdAliases {
  captures: Record<string, string>;
  tasks: Record<string, string>;
  proposals: Record<string, string>;
  blocks: Record<string, string>;
  sessions: Record<string, string>;
}

export type AccountIdAliasFamily = keyof AccountIdAliases;

export function createEmptyAccountIdAliases(): AccountIdAliases {
  return {
    captures: {},
    tasks: {},
    proposals: {},
    blocks: {},
    sessions: {},
  };
}

export interface WorkflowState {
  areas: Phase2MockArea[];
  captureItems: Phase2CaptureItem[];
  taskDrafts: Phase2TaskDraft[];
  projectDrafts: Phase2ProjectDraft[];
  ambiguityAssessments: Phase2AmbiguityAssessmentResponse[];
  timeBlockProposalDrafts: Phase2TimeBlockProposalDraft[];
  projects: Phase2MockProject[];
  tasks: Phase2MockTask[];
  timeBlockProposals: Phase2TimeBlockProposal[];
  calendarBlocks: Phase2MockCalendarBlock[];
  executionSessions: Phase2MockExecutionSession[];
  healthChecks: typeof healthChecks;
  reviewLog: string[];
  wipRefusal: WipRefusal | null;
  accountIdByLocalId: AccountIdAliases;
}

export interface ParseCaptureInput {
  rawText: string;
  areaId?: string | null;
  returnHook?: string | null;
}

export interface SubmitCaptureInput extends ParseCaptureInput {
  existingCapture?: Phase2CaptureItem;
}

export interface AddAreaInput {
  name: string;
  color: string;
}

let idCounter = 0;

/** IDs produced by `nextId` use these prefixes; used to resync the counter after hydration. */
const WORKFLOW_GENERATED_ID =
  /^(?:area|capture|task-draft|project-draft|proposal-draft|ambiguity|task|project|proposal|block|session)-(\d+)$/;

function maxWorkflowGeneratedIdSuffix(state: WorkflowState): number {
  let max = 0;
  const consider = (id: string | null | undefined) => {
    if (!id) return;
    const match = id.match(WORKFLOW_GENERATED_ID);
    if (!match) return;
    const n = Number.parseInt(match[1] ?? "0", 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  };

  for (const item of state.captureItems) consider(item.id);
  for (const item of state.areas) consider(item.id);
  for (const item of state.taskDrafts) consider(item.id);
  for (const item of state.projectDrafts) consider(item.id);
  for (const item of state.ambiguityAssessments) consider(item.id);
  for (const item of state.timeBlockProposalDrafts) consider(item.id);
  for (const item of state.projects) consider(item.id);
  for (const item of state.tasks) consider(item.id);
  for (const item of state.timeBlockProposals) consider(item.id);
  for (const item of state.calendarBlocks) consider(item.id);
  for (const item of state.executionSessions) consider(item.id);

  // Alias KEYS count too: a local row retired by the merge leaves its alias
  // behind (React keys need it to stay stable across the swap), and if the
  // counter could fall below that suffix, `nextId` would re-mint the same
  // local id and the stale alias would twin it to the WRONG account row.
  for (const family of Object.values(
    state.accountIdByLocalId ?? createEmptyAccountIdAliases(),
  )) {
    for (const localId of Object.keys(family)) consider(localId);
  }

  return max;
}

/**
 * Sets the module id counter from existing workflow entities (e.g. after sessionStorage restore
 * or reset) so `nextId` never reuses a suffix already present in state.
 */
export function syncWorkflowIdCounterFromState(state: WorkflowState): void {
  idCounter = maxWorkflowGeneratedIdSuffix(state);
}

export function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createInitialWorkflowState(): WorkflowState {
  return {
    areas,
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks,
    reviewLog: [],
    wipRefusal: null,
    accountIdByLocalId: createEmptyAccountIdAliases(),
  };
}

export function hasLaunchSequenceStep(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
