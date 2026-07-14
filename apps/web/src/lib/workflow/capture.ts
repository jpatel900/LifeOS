import {
  MockParseCaptureResponseSchema,
  type MockParseCaptureResponse,
  type Phase2CaptureItem,
} from "@lifeos/schemas";
import { MOCK_USER_ID } from "../mockData";
import type { ParsedWorkflowResult } from "../ai/parseCaptureWorkflow";
import {
  nextId,
  nowIso,
  type ParseCaptureInput,
  type SubmitCaptureInput,
  type WorkflowState,
} from "./shared";

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
      return_hook: input.returnHook?.trim() || null,
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
    return_hook: input.returnHook?.trim() || null,
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
    return_hook: input.returnHook?.trim() || null,
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
