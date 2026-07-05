import type {
  CaptureItem,
  ParseCaptureResponse,
  Phase2AmbiguityAssessmentResponse,
  Phase2CaptureItem,
  Phase2ProjectDraft,
  Phase2TaskDraft,
  Phase2TimeBlockProposalDraft,
} from "@lifeos/schemas";

export interface ParsedWorkflowResult {
  captureItem: Phase2CaptureItem;
  taskDrafts: Phase2TaskDraft[];
  projectDrafts: Phase2ProjectDraft[];
  ambiguityAssessment: Phase2AmbiguityAssessmentResponse | null;
  timeBlockProposalDrafts: Phase2TimeBlockProposalDraft[];
  triageReasons: string[];
  clarificationQuestions: string[];
}

interface BuildParsedWorkflowResultInput {
  response: ParseCaptureResponse;
  capture: Pick<CaptureItem, "id" | "user_id" | "raw_text" | "created_at">;
  workflowAreaId: string | null;
}

const WORKFLOW_AREA_BY_SLUG: Record<string, string> = {
  "main-job": "area-main-job",
  personal: "area-personal",
  "volunteer-work": "area-volunteer",
  "side-project": "area-side-project",
};

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function resolveWorkflowAreaId(
  suggestedSlug: string | null,
  workflowAreaId: string | null,
) {
  if (suggestedSlug && WORKFLOW_AREA_BY_SLUG[suggestedSlug]) {
    return WORKFLOW_AREA_BY_SLUG[suggestedSlug];
  }

  return workflowAreaId ?? "area-main-job";
}

export function buildParsedWorkflowResult(
  input: BuildParsedWorkflowResultInput,
): ParsedWorkflowResult {
  const triageRequired =
    input.response.triage_required ||
    input.response.parse_status === "low_confidence" ||
    input.response.parse_status === "needs_clarification" ||
    input.response.parse_status === "unsupported" ||
    input.response.overall_confidence < 0.7 ||
    input.response.drafts.some((draft) => draft.confidence < 0.7);

  const captureItem: Phase2CaptureItem = {
    id: input.capture.id,
    user_id: input.capture.user_id,
    area_id: input.workflowAreaId,
    raw_text: input.capture.raw_text,
    capture_mode: "text",
    inferred_area_confidence: input.response.overall_confidence,
    status: triageRequired ? "triage_required" : "parsed",
    created_at: input.capture.created_at,
  };

  const taskDrafts: Phase2TaskDraft[] = input.response.drafts
    .filter((draft) => draft.draft_type === "task_draft")
    .map((draft) => ({
      id: makeId("task-draft"),
      user_id: input.capture.user_id,
      capture_item_id: input.capture.id,
      area_id: resolveWorkflowAreaId(
        draft.area_slug_suggestion,
        input.workflowAreaId,
      ),
      title: draft.title,
      description: draft.description,
      confidence: draft.confidence,
      estimated_minutes_low: draft.estimated_minutes_low,
      estimated_minutes_high: draft.estimated_minutes_high,
      first_tiny_step: draft.first_tiny_step,
      breakdown: draft.breakdown,
      // S3 (#255): carry the person/commitment signals through untouched so the
      // triage flow can propose a person link; a plain task with no mentions
      // stays a plain task.
      person_mentions: draft.person_mentions,
      is_commitment: draft.is_commitment,
      status: "pending",
      created_at: new Date().toISOString(),
    }));

  const projectDrafts: Phase2ProjectDraft[] = input.response.drafts
    .filter((draft) => draft.draft_type === "project_draft")
    .map((draft) => ({
      id: makeId("project-draft"),
      user_id: input.capture.user_id,
      capture_item_id: input.capture.id,
      area_id: resolveWorkflowAreaId(
        draft.area_slug_suggestion,
        input.workflowAreaId,
      ),
      title: draft.title,
      description: draft.description,
      confidence: draft.confidence,
      status: "pending",
      created_at: new Date().toISOString(),
    }));

  const assessment = input.response.ambiguity_assessment;
  const ambiguityAssessment: Phase2AmbiguityAssessmentResponse | null =
    assessment
      ? {
          id: makeId("ambiguity"),
          user_id: input.capture.user_id,
          area_id: input.workflowAreaId,
          source_capture_item_id: input.capture.id,
          likely_objective:
            assessment.likely_objective ?? input.capture.raw_text,
          possible_workstreams: input.response.drafts.map(
            (draft) => draft.title,
          ),
          knowns: assessment.knowns,
          unknowns: assessment.unknowns,
          assumptions: assessment.assumptions,
          constraints: assessment.constraints,
          risks: assessment.risks,
          dependencies: assessment.dependencies,
          recommended_first_move:
            assessment.recommended_first_move ??
            input.response.clarification_questions[0] ??
            "Review this capture in triage.",
          what_not_to_do_yet: assessment.what_not_to_do_yet,
          confidence_score: assessment.confidence,
          review_trigger:
            assessment.review_trigger ??
            input.response.triage_reasons[0] ??
            "Review in triage.",
          created_at: new Date().toISOString(),
        }
      : null;

  // Local planning scaffolding, mirroring the mock parse path: one draft
  // focus block per task draft. These are deterministic client-side drafts
  // (status "draft", user decides), not AI output — without them the Plan
  // stage renders parsed tasks with an empty Proposals list.
  const timeBlockProposalDrafts: Phase2TimeBlockProposalDraft[] =
    taskDrafts.map((taskDraft) => {
      const proposedStart = new Date(Date.now() + 60 * 60 * 1000);
      const proposedEnd = new Date(proposedStart.getTime() + 45 * 60 * 1000);
      return {
        id: makeId("proposal-draft"),
        user_id: input.capture.user_id,
        area_id: taskDraft.area_id,
        capture_item_id: input.capture.id,
        task_draft_id: taskDraft.id,
        proposed_start: proposedStart.toISOString(),
        proposed_end: proposedEnd.toISOString(),
        rationale: "Create one local focus block for the first useful move.",
        conflict_flag: false,
        status: "draft",
        created_at: new Date().toISOString(),
      };
    });

  return {
    captureItem,
    taskDrafts,
    projectDrafts,
    ambiguityAssessment,
    timeBlockProposalDrafts,
    triageReasons: input.response.triage_reasons,
    clarificationQuestions: input.response.clarification_questions,
  };
}
