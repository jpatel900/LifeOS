import type {
  Phase2AmbiguityAssessmentResponse,
  Phase2CaptureItem,
  Phase2ProjectDraft,
  Phase2TaskDraft,
  Phase2TimeBlockProposal,
  Phase2TimeBlockProposalDraft,
} from "@lifeos/schemas";
import {
  areas,
  healthChecks,
  buildDemoSeedCalendarBlocks,
  buildDemoSeedCaptureItems,
  buildDemoSeedExecutionSessions,
  buildDemoSeedReviewLog,
  buildDemoSeedTaskDrafts,
  buildDemoSeedTasks,
  buildDemoSeedTimeBlockProposals,
  hasDemoSeedId,
} from "../mockData";
import { isSupabaseConfigured } from "../supabase/config";
import { isDemoSeedEnabled } from "../flags";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockProject,
  Phase2MockTask,
} from "../types";

export const WIP_ENFORCEMENT_POLICY_ID = "wip_enforcement.v1";
export const WIP_ENFORCEMENT_LIMIT = 3;

// Moved here (from workflowContext/reducerCore.ts, which now re-exports it
// unchanged) so `createInitialWorkflowState` below can read this tab's
// existing snapshot synchronously without an import cycle — reducerCore.ts
// already imports from this module, not the other way around.
export const STORAGE_KEY = "lifeos.phase2.workflow";

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

/**
 * The genuinely-empty shape — no captures, drafts, tasks, blocks, sessions,
 * or review log, whatever else is going on. This is what "start fresh"
 * (`resetWorkflow` -> the reducer's `reset` case) always returns, even when
 * the seeded demo below is what a first visit shows: a reset must produce a
 * state a person can trust is actually cleared, not the sample content again.
 */
export function createEmptyWorkflowState(): WorkflowState {
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

// See `workflowStateHasDemoSeed` below for why this tracks the seed's own
// reviewLog array by reference.
let lastDemoSeedReviewLog: readonly string[] | null = null;

/**
 * The empty shape with the #687 demo-seed sample layered on top — a handful
 * of captures across triage states, one pending draft, a planned task with a
 * scheduled time block, a completed win with its own focus session, and a
 * closed daily review. See `lib/mockData.ts`'s `buildDemoSeed*` builders for
 * the content and why every id is `demo-seed-`-prefixed.
 *
 * Independent verifier round 1: each builder is a FUNCTION, called here
 * fresh on every invocation (not a module-level constant computed once at
 * import time) — see `lib/mockData.ts`'s header comment on why a frozen
 * "now" goes stale for the life of the server process.
 */
export function createSeededDemoWorkflowState(): WorkflowState {
  const reviewLog = buildDemoSeedReviewLog();
  lastDemoSeedReviewLog = reviewLog;
  return {
    ...createEmptyWorkflowState(),
    captureItems: buildDemoSeedCaptureItems(),
    taskDrafts: buildDemoSeedTaskDrafts(),
    tasks: buildDemoSeedTasks(),
    timeBlockProposals: buildDemoSeedTimeBlockProposals(),
    calendarBlocks: buildDemoSeedCalendarBlocks(),
    executionSessions: buildDemoSeedExecutionSessions(),
    reviewLog,
  };
}

// #687 demo-seed, independent verifier round 1 finding 2 — "Reset this
// browser" (LocalResetPanel.tsx) says "This browser now starts from empty
// local state", but the reducer's own snapshot lives in `sessionStorage`
// (per-TAB, reducerCore.ts's STORAGE_KEY), so a genuinely new tab after a
// reset would see the sample again, falsifying the word "browser" the copy
// already uses. This is a `localStorage` marker instead — it survives new
// tabs, matching what the sentence actually promises. Written once, by
// `resetWorkflow` (WorkflowContext.tsx) itself, and never cleared: a person
// who resets is choosing "not this again", not "reseed me on my next visit".
const DEMO_SEED_CLEARED_KEY = "lifeos.demoSeed.cleared";

export function markDemoSeedCleared(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_SEED_CLEARED_KEY, "true");
  } catch {
    // Storage blocked (private mode, quota) — the reset itself (the reducer
    // dispatch) still succeeds; only the "stay cleared in a new tab" promise
    // is unmet, same degrade-quietly posture `loadStoredStateFromSession`
    // already uses for a blocked session store.
  }
}

function hasDemoSeedBeenCleared(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_SEED_CLEARED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * The reducer's real initial state.
 *
 * Independent verifier round 1 finding 4 (hydration race): the previous
 * version always returned this same answer regardless of `window`, so the
 * seed-or-not decision only ever became correct once a LATER `useEffect`
 * (`WorkflowContext.tsx`'s sessionStorage-hydrate effect) dispatched a
 * correction — after first paint. A fast reader (or a scan/measurement tool)
 * landing between those two moments saw the WRONG answer: the seed on a
 * surface meant to be measured empty, live and clickable. Fixed at the root
 * instead of papered over with timing: this function now makes the whole
 * decision SYNCHRONOUSLY, inside the same `useReducer` lazy initializer call
 * that produces the very first render (`createSyncedInitialState`,
 * `WorkflowContext.tsx`) — there is no second, later correction to race.
 *
 * - On the server (`typeof window === "undefined"`, every SSR pass) this
 *   ALWAYS returns empty — the server cannot know about this tab's
 *   `sessionStorage` or this browser's `localStorage` marker, and guessing
 *   would be a lie one of the two renders would have to correct anyway.
 * - On the client, the seed applies only to a genuinely fresh tab: no
 *   existing `sessionStorage` snapshot for this tab (an existing snapshot
 *   means either a real reload — that snapshot's own content, not the seed,
 *   is what should show, same as before this fix — or another surface
 *   already decided the state this tab starts from, e.g. the e2e no-sample
 *   seam in `tests/e2e/helpers/pinnedSurfaces.ts`) AND the
 *   `DEMO_SEED_CLEARED_KEY` marker has never been set.
 */
export function createInitialWorkflowState(): WorkflowState {
  if (typeof window === "undefined") {
    return createEmptyWorkflowState();
  }
  if (
    !isSupabaseConfigured() &&
    isDemoSeedEnabled() &&
    !hasDemoSeedBeenCleared()
  ) {
    let hasExistingSnapshot = false;
    try {
      hasExistingSnapshot = window.sessionStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      hasExistingSnapshot = false;
    }
    if (!hasExistingSnapshot) {
      return createSeededDemoWorkflowState();
    }
  }
  return createEmptyWorkflowState();
}

/**
 * True when any row family in `state` still holds a #687 demo-seed row.
 *
 * Six of the seven checks are id-based and durable (ids survive a
 * `sessionStorage` JSON round-trip on reload). `reviewLog` has no id — its
 * check instead tracks the exact array reference `createSeededDemoWorkflowState`
 * last produced (declared above), which is necessarily best-effort: it only
 * recognizes the seed's line on the render that built it, not after a
 * reload re-parses it into a new array with equal content. That is an
 * acceptable gap — this function decides only whether the demo banner
 * mentions sample data, never anything load-bearing — and the other six
 * checks below carry the real signal.
 */
export function workflowStateHasDemoSeed(state: WorkflowState): boolean {
  return (
    state.captureItems.some((item) => hasDemoSeedId(item.id)) ||
    state.taskDrafts.some((draft) => hasDemoSeedId(draft.id)) ||
    state.tasks.some((task) => hasDemoSeedId(task.id)) ||
    state.calendarBlocks.some((block) => hasDemoSeedId(block.id)) ||
    state.timeBlockProposals.some((proposal) => hasDemoSeedId(proposal.id)) ||
    state.executionSessions.some((session) => hasDemoSeedId(session.id)) ||
    state.reviewLog === lastDemoSeedReviewLog
  );
}

export function hasLaunchSequenceStep(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
