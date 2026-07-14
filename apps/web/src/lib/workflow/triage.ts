import {
  Phase2TimeBlockProposalSchema,
  type Phase2TaskDraft,
} from "@lifeos/schemas";
import { MOCK_USER_ID } from "../mockData";
import type {
  Phase2MockArea,
  Phase2MockProject,
  Phase2MockTask,
} from "../types";
import {
  hasLaunchSequenceStep,
  nextId,
  nowIso,
  type AddAreaInput,
  type WorkflowState,
} from "./shared";
import { canAdmitWipTask, withWipRefusal } from "./wip";

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

  if (status === "active" && !hasLaunchSequenceStep(draft.first_tiny_step)) {
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
    task_type: draft.task_type ?? "task",
    is_reversible:
      draft.task_type === "decision" ? (draft.is_reversible ?? null) : null,
    energy_type: null,
    estimated_minutes_low: draft.estimated_minutes_low,
    estimated_minutes_high: draft.estimated_minutes_high,
    due_at: draft.due_at ?? null,
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

  if (status === "active" && !canAdmitWipTask(state)) {
    return withWipRefusal(state, draft, "triage_accept_to_today");
  }

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

  if (!hasLaunchSequenceStep(task.first_tiny_step)) {
    return state;
  }

  if (!canAdmitWipTask(state)) {
    return withWipRefusal(state, task, "triage_accept_to_today");
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
