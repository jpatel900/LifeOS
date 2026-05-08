import {
  MockParseCaptureResponseSchema,
  TimeBlockProposalSchema,
  type AmbiguityAssessmentResponse,
  type CaptureItem,
  type MockParseCaptureResponse,
  type TaskDraft,
  type TimeBlockProposal,
  type TimeBlockProposalDraft,
} from "@lifeos/schemas";
import { areas, healthChecks, MOCK_USER_ID } from "./mockData";
import type { Area, CalendarBlock, ExecutionSession, Task } from "./types";

export interface WorkflowState {
  areas: Area[];
  captureItems: CaptureItem[];
  taskDrafts: TaskDraft[];
  ambiguityAssessments: AmbiguityAssessmentResponse[];
  timeBlockProposalDrafts: TimeBlockProposalDraft[];
  tasks: Task[];
  timeBlockProposals: TimeBlockProposal[];
  calendarBlocks: CalendarBlock[];
  executionSessions: ExecutionSession[];
  healthChecks: typeof healthChecks;
  reviewLog: string[];
}

interface ParseCaptureInput {
  rawText: string;
  areaId?: string | null;
}

interface SubmitCaptureInput extends ParseCaptureInput {}

let idCounter = 0;

/** IDs produced by `nextId` use these prefixes; used to resync the counter after hydration. */
const WORKFLOW_GENERATED_ID =
  /^(?:capture|task-draft|proposal-draft|ambiguity|task|proposal|block|session)-(\d+)$/;

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
  for (const item of state.taskDrafts) consider(item.id);
  for (const item of state.ambiguityAssessments) consider(item.id);
  for (const item of state.timeBlockProposalDrafts) consider(item.id);
  for (const item of state.tasks) consider(item.id);
  for (const item of state.timeBlockProposals) consider(item.id);
  for (const item of state.calendarBlocks) consider(item.id);
  for (const item of state.executionSessions) consider(item.id);

  return max;
}

/**
 * Sets the module id counter from existing workflow entities (e.g. after sessionStorage restore
 * or reset) so `nextId` never reuses a suffix already present in state.
 */
export function syncWorkflowIdCounterFromState(state: WorkflowState): void {
  idCounter = maxWorkflowGeneratedIdSuffix(state);
}

function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function nowIso() {
  return new Date().toISOString();
}

function inferAreaId(rawText: string, requestedAreaId?: string | null) {
  if (requestedAreaId) {
    return requestedAreaId;
  }

  const lower = rawText.toLowerCase();
  if (lower.includes("volunteer") || lower.includes("sponsor")) {
    return "area-volunteer";
  }
  if (lower.includes("dentist") || lower.includes("personal")) {
    return "area-personal";
  }
  return "area-main-job";
}

function makeTitle(rawText: string) {
  const normalized = rawText
    .trim()
    .replace(/^need to\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");

  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 69).trim()}...`;
}

export function createInitialWorkflowState(): WorkflowState {
  return {
    areas,
    captureItems: [],
    taskDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    tasks: [],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks,
    reviewLog: [],
  };
}

export function mockParseCapture(input: ParseCaptureInput): MockParseCaptureResponse {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required.");
  }

  const createdAt = nowIso();
  const areaId = inferAreaId(rawText, input.areaId);
  const captureItemId = nextId("capture");
  const taskDraftId = nextId("task-draft");
  const proposalDraftId = nextId("proposal-draft");
  const title = makeTitle(rawText);
  const proposedStart = new Date(Date.now() + 60 * 60 * 1000);
  const proposedEnd = new Date(proposedStart.getTime() + 45 * 60 * 1000);
  const firstMove = `Clarify the next concrete step for: ${title}`;

  const response = {
    schema_version: "phase2.mock.v1",
    captureItem: {
      id: captureItemId,
      user_id: MOCK_USER_ID,
      area_id: areaId,
      raw_text: rawText,
      capture_mode: "text",
      inferred_area_confidence: input.areaId ? 1 : 0.74,
      status: "triage_required",
      created_at: createdAt,
    },
    taskDraft: {
      id: taskDraftId,
      user_id: MOCK_USER_ID,
      capture_item_id: captureItemId,
      area_id: areaId,
      title,
      description: `Draft created from capture: ${rawText}`,
      confidence: 0.78,
      estimated_minutes_low: 30,
      estimated_minutes_high: 60,
      first_tiny_step: firstMove,
      status: "pending",
      created_at: createdAt,
    },
    ambiguityAssessment: {
      id: nextId("ambiguity"),
      user_id: MOCK_USER_ID,
      area_id: areaId,
      source_capture_item_id: captureItemId,
      likely_objective: title,
      possible_workstreams: ["Clarify goal", "Identify owner", "Schedule first move"],
      knowns: [rawText],
      unknowns: ["Exact deadline", "Definition of done"],
      assumptions: ["This should become a task before being scheduled."],
      constraints: ["No external calendar write in mock mode."],
      risks: ["Scheduling before clarifying details may create rework."],
      dependencies: ["User review in triage."],
      recommended_first_move: firstMove,
      what_not_to_do_yet: ["Do not create a full plan before clarifying the first move."],
      confidence_score: 0.72,
      review_trigger: "Review in triage before committing task.",
      created_at: createdAt,
    },
    firstSuggestedAction: firstMove,
    timeBlockProposalDraft: {
      id: proposalDraftId,
      user_id: MOCK_USER_ID,
      area_id: areaId,
      capture_item_id: captureItemId,
      task_draft_id: taskDraftId,
      proposed_start: proposedStart.toISOString(),
      proposed_end: proposedEnd.toISOString(),
      rationale: "Create one local focus block for the first useful move.",
      conflict_flag: false,
      status: "draft",
      created_at: createdAt,
    },
  };

  return MockParseCaptureResponseSchema.parse(response);
}

export function submitCapture(
  state: WorkflowState,
  input: SubmitCaptureInput,
): WorkflowState {
  const parsed = mockParseCapture(input);

  return {
    ...state,
    captureItems: [parsed.captureItem, ...state.captureItems],
    taskDrafts: [parsed.taskDraft, ...state.taskDrafts],
    ambiguityAssessments: [
      parsed.ambiguityAssessment,
      ...state.ambiguityAssessments,
    ],
    timeBlockProposalDrafts: [
      parsed.timeBlockProposalDraft,
      ...state.timeBlockProposalDrafts,
    ],
    reviewLog: [`Captured: ${parsed.taskDraft.title}`, ...state.reviewLog],
  };
}

export function editDraft(
  state: WorkflowState,
  draftId: string,
  changes: Pick<TaskDraft, "title" | "description">,
): WorkflowState {
  return {
    ...state,
    taskDrafts: state.taskDrafts.map((draft) =>
      draft.id === draftId ? { ...draft, ...changes } : draft,
    ),
  };
}

export function rejectDraft(state: WorkflowState, draftId: string): WorkflowState {
  const draft = state.taskDrafts.find((d) => d.id === draftId);
  return {
    ...state,
    taskDrafts: state.taskDrafts.map((item) =>
      item.id === draftId ? { ...item, status: "rejected" } : item,
    ),
    timeBlockProposalDrafts: state.timeBlockProposalDrafts.map((proposal) =>
      proposal.task_draft_id === draftId
        ? { ...proposal, status: "rejected" }
        : proposal,
    ),
    reviewLog: draft
      ? [`Rejected draft: ${draft.title}`, ...state.reviewLog]
      : state.reviewLog,
  };
}

export function acceptDraft(state: WorkflowState, draftId: string): WorkflowState {
  const draft = state.taskDrafts.find((item) => item.id === draftId);
  if (!draft || draft.status !== "pending") {
    return state;
  }

  const existingTask = state.tasks.find(
    (task) => task.source_capture_item_id === draft.capture_item_id,
  );
  if (existingTask) {
    return state;
  }

  const task: Task = {
    id: nextId("task"),
    user_id: draft.user_id,
    area_id: draft.area_id,
    project_id: null,
    source_capture_item_id: draft.capture_item_id,
    title: draft.title,
    description: draft.description,
    status: "active",
    priority: 2,
    estimate_minutes_low: draft.estimated_minutes_low,
    estimate_minutes_high: draft.estimated_minutes_high,
    first_tiny_step: draft.first_tiny_step,
    definition_of_done: "Complete the first useful move and note the outcome.",
    created_at: nowIso(),
  };

  const matchingProposalDraft = state.timeBlockProposalDrafts.find(
    (proposal) => proposal.task_draft_id === draft.id,
  );

  const proposal = matchingProposalDraft
    ? TimeBlockProposalSchema.parse({
        id: nextId("proposal"),
        user_id: matchingProposalDraft.user_id,
        area_id: matchingProposalDraft.area_id,
        task_id: task.id,
        proposed_start: matchingProposalDraft.proposed_start,
        proposed_end: matchingProposalDraft.proposed_end,
        rationale: matchingProposalDraft.rationale,
        conflict_flag: matchingProposalDraft.conflict_flag,
        status: "proposed",
        created_at: nowIso(),
      })
    : null;

  return {
    ...state,
    captureItems: state.captureItems.map((capture) =>
      capture.id === draft.capture_item_id
        ? { ...capture, status: "resolved" }
        : capture,
    ),
    taskDrafts: state.taskDrafts.map((item) =>
      item.id === draftId ? { ...item, status: "accepted" } : item,
    ),
    timeBlockProposalDrafts: state.timeBlockProposalDrafts.map((item) =>
      item.task_draft_id === draftId ? { ...item, status: "accepted" } : item,
    ),
    tasks: [task, ...state.tasks],
    timeBlockProposals: proposal
      ? [proposal, ...state.timeBlockProposals]
      : state.timeBlockProposals,
    reviewLog: [`Accepted task: ${task.title}`, ...state.reviewLog],
  };
}

export function updateProposal(
  state: WorkflowState,
  proposalId: string,
  changes: Pick<TimeBlockProposal, "proposed_start" | "proposed_end" | "rationale">,
): WorkflowState {
  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((proposal) =>
      proposal.id === proposalId
        ? TimeBlockProposalSchema.parse({
            ...proposal,
            ...changes,
            status: "edited",
          })
        : proposal,
    ),
  };
}

export function rejectProposal(
  state: WorkflowState,
  proposalId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find((item) => item.id === proposalId);
  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((item) =>
      item.id === proposalId ? { ...item, status: "rejected" } : item,
    ),
    reviewLog: proposal
      ? [`Rejected proposal for task ${proposal.task_id}`, ...state.reviewLog]
      : state.reviewLog,
  };
}

export function acceptProposal(
  state: WorkflowState,
  proposalId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status === "accepted") {
    return state;
  }

  const block: CalendarBlock = {
    id: nextId("block"),
    user_id: proposal.user_id,
    area_id: proposal.area_id,
    task_id: proposal.task_id,
    proposal_id: proposal.id,
    start_at: proposal.proposed_start,
    end_at: proposal.proposed_end,
    status: "scheduled",
  };

  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((item) =>
      item.id === proposalId ? { ...item, status: "accepted" } : item,
    ),
    calendarBlocks: [block, ...state.calendarBlocks],
    reviewLog: [`Accepted local proposal for task ${proposal.task_id}`, ...state.reviewLog],
  };
}

export function startExecutionSession(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  const block = state.calendarBlocks.find((item) => item.task_id === taskId) ?? null;
  const session: ExecutionSession = {
    id: nextId("session"),
    user_id: task.user_id,
    area_id: task.area_id ?? "area-main-job",
    task_id: task.id,
    calendar_block_id: block?.id ?? null,
    planned_minutes: task.estimate_minutes_high,
    actual_minutes: null,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    status: "running",
    outcome: "partial",
    notes: null,
  };

  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === block?.id ? { ...item, status: "running" } : item,
    ),
    executionSessions: [session, ...state.executionSessions],
    reviewLog: [`Started session: ${task.title}`, ...state.reviewLog],
  };
}

export function markCurrentSession(
  state: WorkflowState,
  status: ExecutionSession["status"],
): WorkflowState {
  const current = state.executionSessions[0];
  if (!current) {
    return state;
  }

  const outcome =
    status === "completed"
      ? "completed"
      : status === "missed"
        ? "skipped"
        : status === "distracted"
          ? "distracted"
          : status === "stuck"
            ? "blocked"
            : current.outcome;

  return {
    ...state,
    executionSessions: state.executionSessions.map((session, index) =>
      index === 0
        ? {
            ...session,
            status,
            outcome,
            actual_minutes: status === "completed" ? 45 : session.actual_minutes,
            distraction_minutes:
              status === "distracted" ? 10 : session.distraction_minutes,
            paused_minutes: status === "paused" ? 5 : session.paused_minutes,
            productivity_rating: status === "completed" ? 4 : session.productivity_rating,
            notes:
              status === "stuck"
                ? "Need a smaller next step."
                : session.notes,
          }
        : session,
    ),
    calendarBlocks: state.calendarBlocks.map((block) =>
      block.id === current.calendar_block_id && status === "completed"
        ? { ...block, status: "completed" }
        : block.id === current.calendar_block_id && status === "missed"
          ? { ...block, status: "missed" }
          : block,
    ),
    tasks: state.tasks.map((task) =>
      task.id === current.task_id && status === "completed"
        ? { ...task, status: "done" }
        : task,
    ),
    reviewLog: [`Session marked ${status}`, ...state.reviewLog],
  };
}

