import {
  MockParseCaptureResponseSchema,
  Phase2TimeBlockProposalSchema,
  type MockParseCaptureResponse,
  type Phase2AmbiguityAssessmentResponse,
  type Phase2CaptureItem,
  type Phase2ProjectDraft,
  type Phase2TaskDraft,
  type Phase2TimeBlockProposal,
  type Phase2TimeBlockProposalDraft,
} from "@lifeos/schemas";
import { areas, healthChecks, MOCK_USER_ID } from "./mockData";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockProject,
  Phase2MockTask,
} from "./types";
import type { ParsedWorkflowResult } from "./ai/parseCaptureWorkflow";

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
}

interface ParseCaptureInput {
  rawText: string;
  areaId?: string | null;
}

interface SubmitCaptureInput extends ParseCaptureInput {
  existingCapture?: Phase2CaptureItem;
}

interface AddAreaInput {
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

function makeProjectTitle(rawText: string) {
  return makeTitle(rawText)
    .replace(/^(?:need\s+)?a\s+project\s+to\s+/i, "")
    .trim();
}

function shouldCreateProjectDraft(rawText: string) {
  const lower = rawText.toLowerCase();
  return (
    lower.includes(" project") ||
    lower.includes("system") ||
    lower.includes("roadmap") ||
    lower.includes("initiative")
  );
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
  };
}

export function mockParseCapture(
  input: ParseCaptureInput,
): MockParseCaptureResponse {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required.");
  }

  const createdAt = nowIso();
  const areaId = inferAreaId(rawText, input.areaId);
  const captureItemId = nextId("capture");
  const taskDraftId = nextId("task-draft");
  const projectDraftId = shouldCreateProjectDraft(rawText)
    ? nextId("project-draft")
    : null;
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
      breakdown: {
        steps: [
          {
            order: 1,
            title: firstMove,
            estimated_minutes: 10,
            depends_on_orders: [],
            on_critical_path: true,
          },
          {
            order: 2,
            title: `Do the core work for: ${title}`,
            estimated_minutes: 30,
            depends_on_orders: [1],
            on_critical_path: true,
          },
          {
            order: 3,
            title: `Confirm the outcome and capture follow-ups for: ${title}`,
            estimated_minutes: 10,
            depends_on_orders: [2],
            on_critical_path: true,
          },
        ],
        sequence_summary:
          "Clarify the step, do the core work, then confirm the outcome.",
        kickstart_step: `Open the capture and write one sentence defining done for: ${title}`,
      },
      status: "pending",
      created_at: createdAt,
    },
    projectDraft: projectDraftId
      ? {
          id: projectDraftId,
          user_id: MOCK_USER_ID,
          capture_item_id: captureItemId,
          area_id: areaId,
          title: makeProjectTitle(rawText),
          description: `Draft created from capture: ${rawText}`,
          confidence: 0.66,
          status: "pending",
          created_at: createdAt,
        }
      : null,
    ambiguityAssessment: {
      id: nextId("ambiguity"),
      user_id: MOCK_USER_ID,
      area_id: areaId,
      source_capture_item_id: captureItemId,
      likely_objective: title,
      possible_workstreams: [
        "Clarify goal",
        "Identify owner",
        "Schedule first move",
      ],
      knowns: [rawText],
      unknowns: ["Exact deadline", "Definition of done"],
      assumptions: ["This should become a task before being scheduled."],
      constraints: ["No external calendar write in mock mode."],
      risks: ["Scheduling before clarifying details may create rework."],
      dependencies: ["User review in triage."],
      recommended_first_move: firstMove,
      what_not_to_do_yet: [
        "Do not create a full plan before clarifying the first move.",
      ],
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

export function createRawCaptureItem(
  input: ParseCaptureInput,
): Phase2CaptureItem {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required.");
  }

  return {
    id: nextId("capture"),
    user_id: MOCK_USER_ID,
    area_id: input.areaId ?? null,
    raw_text: rawText,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: nowIso(),
  };
}

export function appendRawCapture(
  state: WorkflowState,
  capture: Phase2CaptureItem,
): WorkflowState {
  return {
    ...state,
    captureItems: [capture, ...state.captureItems],
    reviewLog: [`Captured raw text: ${capture.raw_text}`, ...state.reviewLog],
  };
}

export function submitCapture(
  state: WorkflowState,
  input: SubmitCaptureInput,
): WorkflowState {
  const parsed = mockParseCapture(input);
  const captureItem = input.existingCapture
    ? {
        ...parsed.captureItem,
        id: input.existingCapture.id,
        created_at: input.existingCapture.created_at,
      }
    : parsed.captureItem;
  const taskDraft = {
    ...parsed.taskDraft,
    capture_item_id: captureItem.id,
  };
  const projectDraft = parsed.projectDraft
    ? {
        ...parsed.projectDraft,
        capture_item_id: captureItem.id,
      }
    : null;
  const ambiguityAssessment = {
    ...parsed.ambiguityAssessment,
    source_capture_item_id: captureItem.id,
  };
  const timeBlockProposalDraft = {
    ...parsed.timeBlockProposalDraft,
    capture_item_id: captureItem.id,
    task_draft_id: taskDraft.id,
  };

  return {
    ...state,
    captureItems: [
      captureItem,
      ...state.captureItems.filter((item) => item.id !== captureItem.id),
    ],
    taskDrafts: [taskDraft, ...state.taskDrafts],
    projectDrafts: projectDraft
      ? [projectDraft, ...state.projectDrafts]
      : state.projectDrafts,
    ambiguityAssessments: [ambiguityAssessment, ...state.ambiguityAssessments],
    timeBlockProposalDrafts: [
      timeBlockProposalDraft,
      ...state.timeBlockProposalDrafts,
    ],
    reviewLog: [`Captured: ${parsed.taskDraft.title}`, ...state.reviewLog],
  };
}

/**
 * Raw-save-first: stages only the capture item so the raw text is in state
 * (and persistable) before any parse attempt. Drafts arrive later via
 * `appendParsedWorkflowResult` once /api/parse-capture returns.
 */
export function submitRawCapture(
  state: WorkflowState,
  input: SubmitCaptureInput,
): WorkflowState {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new Error("Capture text is required.");
  }

  const captureItem: Phase2CaptureItem = {
    id: nextId("capture"),
    user_id: MOCK_USER_ID,
    area_id: inferAreaId(rawText, input.areaId),
    raw_text: rawText,
    capture_mode: "text",
    inferred_area_confidence: input.areaId ? 1 : 0.74,
    status: "new",
    created_at: nowIso(),
  };

  return {
    ...state,
    captureItems: [captureItem, ...state.captureItems],
    reviewLog: [`Captured: ${makeTitle(rawText)}`, ...state.reviewLog],
  };
}

export function appendParsedWorkflowResult(
  state: WorkflowState,
  parsed: ParsedWorkflowResult,
): WorkflowState {
  const captureExists = state.captureItems.some(
    (item) => item.id === parsed.captureItem.id,
  );

  return {
    ...state,
    captureItems: captureExists
      ? state.captureItems.map((item) =>
          item.id === parsed.captureItem.id ? parsed.captureItem : item,
        )
      : [parsed.captureItem, ...state.captureItems],
    taskDrafts: [...parsed.taskDrafts, ...state.taskDrafts],
    projectDrafts: [...parsed.projectDrafts, ...state.projectDrafts],
    ambiguityAssessments: parsed.ambiguityAssessment
      ? [parsed.ambiguityAssessment, ...state.ambiguityAssessments]
      : state.ambiguityAssessments,
    timeBlockProposalDrafts: [
      ...parsed.timeBlockProposalDrafts,
      ...state.timeBlockProposalDrafts,
    ],
    reviewLog: [
      `Parsed capture: ${parsed.captureItem.raw_text}`,
      ...state.reviewLog,
    ],
  };
}

export function editDraft(
  state: WorkflowState,
  draftId: string,
  changes: Partial<
    Pick<
      Phase2TaskDraft,
      "title" | "description" | "area_id" | "first_tiny_step"
    >
  >,
): WorkflowState {
  const nextDraft = state.taskDrafts.find((draft) => draft.id === draftId);
  if (!nextDraft) {
    return state;
  }

  const nextAreaId = changes.area_id ?? nextDraft.area_id;
  return {
    ...state,
    taskDrafts: state.taskDrafts.map((draft) =>
      draft.id === draftId ? { ...draft, ...changes } : draft,
    ),
    timeBlockProposalDrafts: state.timeBlockProposalDrafts.map((proposal) =>
      proposal.task_draft_id === draftId
        ? { ...proposal, area_id: nextAreaId }
        : proposal,
    ),
    ambiguityAssessments: state.ambiguityAssessments.map((assessment) =>
      assessment.source_capture_item_id === nextDraft.capture_item_id
        ? { ...assessment, area_id: nextAreaId }
        : assessment,
    ),
    reviewLog: [`Edited draft: ${nextDraft.title}`, ...state.reviewLog],
  };
}

/**
 * S3 (#255): reject a proposed person link on a draft. The mention at
 * `mentionIndex` is removed; if it was a `committed_to` mention and no other
 * commitment mention remains, `is_commitment` degrades to false. The draft
 * itself survives as a plain task (NS-INV-4) — the raw capture is never lost.
 */
export function rejectPersonMention(
  state: WorkflowState,
  draftId: string,
  mentionIndex: number,
): WorkflowState {
  const draft = state.taskDrafts.find((item) => item.id === draftId);
  if (
    !draft ||
    mentionIndex < 0 ||
    mentionIndex >= draft.person_mentions.length
  ) {
    return state;
  }

  const nextMentions = draft.person_mentions.filter(
    (_, index) => index !== mentionIndex,
  );
  const stillCommitted = nextMentions.some(
    (mention) => mention.role === "committed_to",
  );

  return {
    ...state,
    taskDrafts: state.taskDrafts.map((item) =>
      item.id === draftId
        ? {
            ...item,
            person_mentions: nextMentions,
            is_commitment: item.is_commitment && stillCommitted,
          }
        : item,
    ),
    reviewLog: [
      `Removed proposed person link on: ${draft.title}`,
      ...state.reviewLog,
    ],
  };
}

export function splitDraft(
  state: WorkflowState,
  draftId: string,
  titles: [string, string],
): WorkflowState {
  const draft = state.taskDrafts.find(
    (item) => item.id === draftId && item.status === "pending",
  );
  const [firstTitle, secondTitle] = titles.map((title) => title.trim());
  if (!draft || !firstTitle || !secondTitle) {
    return state;
  }

  const createdAt = nowIso();
  const makeDraft = (title: string): Phase2TaskDraft => ({
    ...draft,
    id: nextId("task-draft"),
    title,
    description: draft.description
      ? `${draft.description}\n\nSplit from: ${draft.title}`
      : `Split from: ${draft.title}`,
    confidence: Math.min(draft.confidence, 0.72),
    first_tiny_step: `Clarify the first move for: ${title}`,
    // The parsed breakdown described the original scope; a split changes it.
    breakdown: null,
    status: "pending",
    created_at: createdAt,
  });

  return {
    ...state,
    taskDrafts: [
      makeDraft(firstTitle),
      makeDraft(secondTitle),
      ...state.taskDrafts.map((item) =>
        item.id === draftId ? { ...item, status: "rejected" as const } : item,
      ),
    ],
    timeBlockProposalDrafts: state.timeBlockProposalDrafts.map((proposal) =>
      proposal.task_draft_id === draftId
        ? { ...proposal, status: "rejected" as const }
        : proposal,
    ),
    reviewLog: [`Split draft: ${draft.title}`, ...state.reviewLog],
  };
}

export function mergeDrafts(
  state: WorkflowState,
  primaryDraftId: string,
  secondaryDraftId: string,
): WorkflowState {
  if (primaryDraftId === secondaryDraftId) {
    return state;
  }

  const primary = state.taskDrafts.find(
    (item) => item.id === primaryDraftId && item.status === "pending",
  );
  const secondary = state.taskDrafts.find(
    (item) => item.id === secondaryDraftId && item.status === "pending",
  );
  if (!primary || !secondary) {
    return state;
  }

  const mergedTitle = `${primary.title}; ${secondary.title}`;
  const mergedDescription = [primary.description, secondary.description]
    .filter(Boolean)
    .join("\n\n");

  return {
    ...state,
    taskDrafts: state.taskDrafts.map((draft) => {
      if (draft.id === primaryDraftId) {
        return {
          ...draft,
          title: mergedTitle,
          description: mergedDescription || null,
          confidence: Math.min(primary.confidence, secondary.confidence),
          first_tiny_step:
            primary.first_tiny_step ??
            secondary.first_tiny_step ??
            `Clarify the first move for: ${mergedTitle}`,
          // The parsed breakdown described one draft's scope; a merge changes it.
          breakdown: null,
        };
      }
      if (draft.id === secondaryDraftId) {
        return { ...draft, status: "rejected" as const };
      }
      return draft;
    }),
    timeBlockProposalDrafts: state.timeBlockProposalDrafts.map((proposal) =>
      proposal.task_draft_id === secondaryDraftId
        ? { ...proposal, status: "rejected" as const }
        : proposal,
    ),
    reviewLog: [
      `Merged drafts: ${primary.title} + ${secondary.title}`,
      ...state.reviewLog,
    ],
  };
}

export function rejectDraft(
  state: WorkflowState,
  draftId: string,
): WorkflowState {
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

export function rejectProjectDraft(
  state: WorkflowState,
  draftId: string,
): WorkflowState {
  const draft = state.projectDrafts.find((d) => d.id === draftId);
  return {
    ...state,
    projectDrafts: state.projectDrafts.map((item) =>
      item.id === draftId ? { ...item, status: "rejected" } : item,
    ),
    reviewLog: draft
      ? [`Rejected project draft: ${draft.title}`, ...state.reviewLog]
      : state.reviewLog,
  };
}

export function acceptProjectDraft(
  state: WorkflowState,
  draftId: string,
): WorkflowState {
  const draft = state.projectDrafts.find((item) => item.id === draftId);
  if (!draft || draft.status !== "pending") {
    return state;
  }

  const existingProject = state.projects.find(
    (project) =>
      project.title === draft.title && project.area_id === draft.area_id,
  );
  if (existingProject) {
    return state;
  }

  const createdAt = nowIso();
  const project: Phase2MockProject = {
    id: nextId("project"),
    user_id: draft.user_id,
    area_id: draft.area_id,
    title: draft.title,
    description: draft.description,
    status: "active",
    created_at: createdAt,
    updated_at: createdAt,
  };

  return {
    ...state,
    captureItems: state.captureItems.map((capture) =>
      capture.id === draft.capture_item_id
        ? { ...capture, status: "resolved" }
        : capture,
    ),
    projectDrafts: state.projectDrafts.map((item) =>
      item.id === draftId ? { ...item, status: "accepted" } : item,
    ),
    projects: [project, ...state.projects],
    reviewLog: [`Accepted project: ${project.title}`, ...state.reviewLog],
  };
}

export function acceptDraft(
  state: WorkflowState,
  draftId: string,
): WorkflowState {
  return acceptDraftWithStatus(state, draftId, "active");
}

export function addWorkflowArea(
  state: WorkflowState,
  input: AddAreaInput,
): WorkflowState {
  const name = input.name.trim();
  if (!name) {
    return state;
  }
  const createdAt = nowIso();
  const area: Phase2MockArea = {
    id: nextId("area"),
    user_id: MOCK_USER_ID,
    name,
    color: input.color,
    created_at: createdAt,
  };

  return {
    ...state,
    areas: [...state.areas, area],
    reviewLog: [`Added area: ${area.name}`, ...state.reviewLog],
  };
}

export function updateWorkflowAreaColor(
  state: WorkflowState,
  areaId: string,
  color: string,
): WorkflowState {
  if (!state.areas.some((area) => area.id === areaId)) {
    return state;
  }

  return {
    ...state,
    areas: state.areas.map((area) =>
      area.id === areaId ? { ...area, color } : area,
    ),
  };
}

export function backlogDraft(
  state: WorkflowState,
  draftId: string,
): WorkflowState {
  return acceptDraftWithStatus(state, draftId, "backlog");
}

function acceptDraftWithStatus(
  state: WorkflowState,
  draftId: string,
  status: "active" | "backlog",
): WorkflowState {
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

  const task: Phase2MockTask = {
    id: nextId("task"),
    user_id: draft.user_id,
    area_id: draft.area_id,
    project_id: null,
    source_capture_item_id: draft.capture_item_id,
    title: draft.title,
    description: draft.description,
    status,
    priority_score: 2,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: draft.estimated_minutes_low,
    estimated_minutes_high: draft.estimated_minutes_high,
    due_at: null,
    first_tiny_step: draft.first_tiny_step,
    definition_of_done: "Complete the first useful move and note the outcome.",
    // S3 (#255): the local demo path has no people store, so person-id links
    // (waiting_on_person_id / committed_to_person_id) degrade to null — a
    // graceful no-link degrade. The person-less commitment flag is still honored
    // so an accepted commitment draft reads back as a commitment locally.
    waiting_on_person_id: null,
    waiting_on_since: null,
    is_commitment: draft.is_commitment,
    committed_to_person_id: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const matchingProposalDraft =
    status === "active"
      ? state.timeBlockProposalDrafts.find(
          (proposal) => proposal.task_draft_id === draft.id,
        )
      : null;

  const proposal = matchingProposalDraft
    ? Phase2TimeBlockProposalSchema.parse({
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
    reviewLog: [
      status === "backlog"
        ? `Backlogged task: ${task.title}`
        : `Accepted task: ${task.title}`,
      ...state.reviewLog,
    ],
  };
}

export function promoteBacklogTask(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "backlog",
  );
  if (!task) {
    return state;
  }

  return {
    ...state,
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "active", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Moved to today: ${task.title}`, ...state.reviewLog],
  };
}

export function planTaskAtHour(
  state: WorkflowState,
  taskId: string,
  hour: number,
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "active",
  );
  if (!task || hour < 8 || hour > 18) {
    return state;
  }

  const start = new Date();
  start.setHours(hour, 0, 0, 0);
  const minutes =
    task.estimated_minutes_high ?? task.estimated_minutes_low ?? 45;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const createdAt = nowIso();
  const proposalId = nextId("proposal");
  const proposal = Phase2TimeBlockProposalSchema.parse({
    id: proposalId,
    user_id: task.user_id,
    area_id: task.area_id,
    task_id: task.id,
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
    rationale: `Placed on the local hour rail at ${hour}:00.`,
    conflict_flag: false,
    status: "accepted",
    created_at: createdAt,
  });
  const block: Phase2MockCalendarBlock = {
    id: nextId("block"),
    user_id: task.user_id,
    area_id: task.area_id,
    task_id: task.id,
    proposal_id: proposalId,
    google_event_id: null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: "scheduled",
    created_at: createdAt,
    updated_at: createdAt,
  };

  return {
    ...state,
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "scheduled", updated_at: createdAt }
        : item,
    ),
    timeBlockProposals: [proposal, ...state.timeBlockProposals],
    calendarBlocks: [block, ...state.calendarBlocks],
    reviewLog: [`Planned task: ${task.title}`, ...state.reviewLog],
  };
}

export function unplanTask(
  state: WorkflowState,
  blockId: string,
): WorkflowState {
  const block = state.calendarBlocks.find(
    (item) => item.id === blockId && item.status === "scheduled",
  );
  if (!block?.task_id) {
    return state;
  }

  const task = state.tasks.find((item) => item.id === block.task_id);
  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === blockId
        ? { ...item, status: "cancelled", updated_at: nowIso() }
        : item,
    ),
    tasks: state.tasks.map((item) =>
      item.id === block.task_id
        ? { ...item, status: "active", updated_at: nowIso() }
        : item,
    ),
    reviewLog: task
      ? [`Unplanned task: ${task.title}`, ...state.reviewLog]
      : state.reviewLog,
  };
}

export function createLocalProposalFromTask(
  state: WorkflowState,
  taskId: string,
  input: {
    proposed_start: string;
    proposed_end: string;
    rationale: string;
  },
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "active",
  );
  if (!task) {
    return state;
  }

  const proposal = Phase2TimeBlockProposalSchema.parse({
    id: nextId("proposal"),
    user_id: task.user_id,
    area_id: task.area_id,
    task_id: task.id,
    proposed_start: input.proposed_start,
    proposed_end: input.proposed_end,
    rationale: input.rationale,
    conflict_flag: false,
    status: "proposed",
    created_at: nowIso(),
  });

  return {
    ...state,
    timeBlockProposals: [proposal, ...state.timeBlockProposals],
    reviewLog: [
      `Drafted local block for task: ${task.title}`,
      ...state.reviewLog,
    ],
  };
}

export function updateProposal(
  state: WorkflowState,
  proposalId: string,
  changes: Pick<
    Phase2TimeBlockProposal,
    "proposed_start" | "proposed_end" | "rationale"
  >,
): WorkflowState {
  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((proposal) =>
      proposal.id === proposalId
        ? Phase2TimeBlockProposalSchema.parse({
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
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
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
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
  if (!proposal || proposal.status === "accepted") {
    return state;
  }

  const createdAt = nowIso();
  const block: Phase2MockCalendarBlock = {
    id: nextId("block"),
    user_id: proposal.user_id,
    area_id: proposal.area_id,
    task_id: proposal.task_id,
    proposal_id: proposal.id,
    google_event_id: null,
    start_at: proposal.proposed_start,
    end_at: proposal.proposed_end,
    status: "scheduled",
    created_at: createdAt,
    updated_at: createdAt,
  };

  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((item) =>
      item.id === proposalId ? { ...item, status: "accepted" } : item,
    ),
    tasks: state.tasks.map((task) =>
      task.id === proposal.task_id
        ? { ...task, status: "scheduled", updated_at: createdAt }
        : task,
    ),
    calendarBlocks: [block, ...state.calendarBlocks],
    reviewLog: [
      `Accepted local proposal for task ${proposal.task_id}`,
      ...state.reviewLog,
    ],
  };
}

/**
 * Records the outcome of an approved, server-executed Google Calendar event
 * insert. The external write itself happens only in the server route after
 * explicit approval; this transition just mirrors the result locally.
 */
export function applyGoogleCalendarWriteResult(
  state: WorkflowState,
  proposalId: string,
  googleEventId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
  if (
    !proposal ||
    !["proposed", "edited", "accepted"].includes(proposal.status)
  ) {
    return state;
  }

  const task = state.tasks.find((item) => item.id === proposal.task_id);
  const updatedAt = nowIso();
  const existingBlock = state.calendarBlocks.find(
    (block) => block.proposal_id === proposal.id,
  );
  const block: Phase2MockCalendarBlock = existingBlock
    ? {
        ...existingBlock,
        google_event_id: googleEventId,
        updated_at: updatedAt,
      }
    : {
        id: nextId("block"),
        user_id: proposal.user_id,
        area_id: proposal.area_id,
        task_id: proposal.task_id,
        proposal_id: proposal.id,
        google_event_id: googleEventId,
        start_at: proposal.proposed_start,
        end_at: proposal.proposed_end,
        status: "scheduled",
        created_at: updatedAt,
        updated_at: updatedAt,
      };

  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((item) =>
      item.id === proposalId ? { ...item, status: "accepted" } : item,
    ),
    tasks: state.tasks.map((item) =>
      item.id === proposal.task_id
        ? { ...item, status: "scheduled", updated_at: updatedAt }
        : item,
    ),
    calendarBlocks: existingBlock
      ? state.calendarBlocks.map((item) =>
          item.id === existingBlock.id ? block : item,
        )
      : [block, ...state.calendarBlocks],
    reviewLog: [
      `Approved Google Calendar event: ${task?.title ?? proposal.task_id}`,
      ...state.reviewLog,
    ],
  };
}

/**
 * Records the outcome of an approved, server-executed Google Calendar event
 * cancel. Only blocks that still carry a Google event id qualify; the task is
 * released back to the plannable pool like a local unplan.
 */
export function applyGoogleCalendarCancelResult(
  state: WorkflowState,
  blockId: string,
): WorkflowState {
  const block = state.calendarBlocks.find(
    (item) =>
      item.id === blockId &&
      ["scheduled", "running"].includes(item.status) &&
      Boolean(item.google_event_id),
  );
  if (!block) {
    return state;
  }

  const task = state.tasks.find((item) => item.id === block.task_id);
  const updatedAt = nowIso();
  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === blockId
        ? { ...item, status: "cancelled", updated_at: updatedAt }
        : item,
    ),
    tasks: state.tasks.map((item) =>
      item.id === block.task_id
        ? { ...item, status: "active", updated_at: updatedAt }
        : item,
    ),
    reviewLog: [
      `Cancelled Google Calendar event: ${task?.title ?? block.id}`,
      ...state.reviewLog,
    ],
  };
}

export function startExecutionSession(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "scheduled",
  );
  if (!task) {
    return state;
  }

  const block =
    state.calendarBlocks.find(
      (item) =>
        item.task_id === taskId &&
        ["scheduled", "running"].includes(item.status),
    ) ?? null;
  const session: Phase2MockExecutionSession = {
    id: nextId("session"),
    user_id: task.user_id,
    area_id: task.area_id ?? "area-main-job",
    task_id: task.id,
    calendar_block_id: block?.id ?? null,
    planned_minutes: task.estimated_minutes_high,
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
  status: Phase2MockExecutionSession["status"],
  options: { actualMinutes?: number } = {},
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
            actual_minutes:
              status === "paused"
                ? session.actual_minutes
                : status === "completed" ||
                    status === "missed" ||
                    status === "stuck" ||
                    status === "stopped" ||
                    status === "distracted"
                  ? (options.actualMinutes ?? session.actual_minutes ?? 0)
                  : session.actual_minutes,
            distraction_minutes:
              status === "distracted" ? 10 : session.distraction_minutes,
            paused_minutes: status === "paused" ? 5 : session.paused_minutes,
            productivity_rating:
              status === "completed" ? 4 : session.productivity_rating,
            notes:
              status === "stuck" ? "Need a smaller next step." : session.notes,
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
        : task.id === current.task_id && status === "stuck"
          ? { ...task, status: "blocked" }
          : task,
    ),
    reviewLog: [`Session marked ${status}`, ...state.reviewLog],
  };
}

function cancelOpenBlocksForTask(state: WorkflowState, taskId: string) {
  return state.calendarBlocks.map((block) =>
    block.task_id === taskId && ["scheduled", "running"].includes(block.status)
      ? { ...block, status: "cancelled" as const, updated_at: nowIso() }
      : block,
  );
}

export function carryForwardTask(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  return {
    ...state,
    calendarBlocks: cancelOpenBlocksForTask(state, taskId),
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "active", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Carried forward: ${task.title}`, ...state.reviewLog],
  };
}

export function deferTask(state: WorkflowState, taskId: string): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  return {
    ...state,
    calendarBlocks: cancelOpenBlocksForTask(state, taskId),
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "backlog", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Deferred: ${task.title}`, ...state.reviewLog],
  };
}

export function dropTask(state: WorkflowState, taskId: string): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  return {
    ...state,
    calendarBlocks: cancelOpenBlocksForTask(state, taskId),
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "dropped", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Dropped: ${task.title}`, ...state.reviewLog],
  };
}

export function saveReview(state: WorkflowState): WorkflowState {
  return {
    ...state,
    reviewLog: [`Review saved: ${nowIso()}`, ...state.reviewLog],
  };
}
