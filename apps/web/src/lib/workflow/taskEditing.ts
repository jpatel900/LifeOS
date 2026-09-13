import type { Task } from "@lifeos/schemas";
import { nowIso, type WorkflowState } from "./shared";

/**
 * Issue #984 — accepted-backlog task editor: title, description, area only.
 * Id, source capture, project link, status, and scheduling are never touched
 * here (see `applyTaskEditPatch`), matching the contract's preservation
 * requirement.
 */
export interface TaskEditFormInput {
  title: string;
  description: string | null;
  area_id: string;
}

export interface TaskEditFieldErrors {
  title?: string;
  area_id?: string;
}

export type TaskEditValidation =
  | { ok: true; patch: TaskEditFormInput }
  | { ok: false; errors: TaskEditFieldErrors };

/**
 * Trim title (blank rejected by the caller), and fold a blank description
 * into `null` — the same "blank string means absent" convention
 * `workflow/triage.ts`'s `mergedDescription || null` already uses, so the
 * schema's `description: string | null` never receives an empty string on
 * this path.
 *
 * The blank check is whitespace-only: it decides null-vs-kept, nothing more.
 * A NON-blank description is returned exactly as typed — leading/trailing
 * whitespace, indentation, and internal newlines all survive untouched.
 * Trimming a non-blank description would silently eat a user's intentional
 * formatting; only the title has a "trim it" rule.
 */
export function normalizeTaskEditInput(
  input: TaskEditFormInput,
): TaskEditFormInput {
  const title = input.title.trim();
  const rawDescription = input.description ?? "";
  const isBlank = rawDescription.trim().length === 0;
  return {
    title,
    description: isBlank ? null : rawDescription,
    area_id: input.area_id,
  };
}

export function validateTaskEditInput(
  input: TaskEditFormInput,
  context: { availableAreaIds: readonly string[] },
): TaskEditValidation {
  const normalized = normalizeTaskEditInput(input);
  const errors: TaskEditFieldErrors = {};

  if (!normalized.title) {
    errors.title = "Title can't be blank.";
  }

  if (
    !normalized.area_id ||
    !context.availableAreaIds.includes(normalized.area_id)
  ) {
    errors.area_id = "Pick an area that still exists.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, patch: normalized };
}

/**
 * A project keeps its own area; a task edit is not allowed to silently move
 * it. True only when the edit actually asks for a different area than the
 * task already has AND that area is not the project's area.
 */
export function isProjectAreaBlocked(
  currentAreaId: string,
  nextAreaId: string,
  projectAreaId: string | null,
): boolean {
  return (
    projectAreaId !== null &&
    nextAreaId !== currentAreaId &&
    nextAreaId !== projectAreaId
  );
}

export interface TaskEditPatchResult {
  task: Task;
  areaChangeBlocked: boolean;
}

/**
 * Preserves everything except title/description/area — id, source capture,
 * project link, status, scheduling, and every other column ride through the
 * spread untouched. When the requested area would move a project-linked task
 * away from its project's area, the area edit is dropped (title/description
 * still apply) and `areaChangeBlocked` tells the caller to say so.
 */
export function applyTaskEditPatch(
  task: Task,
  patch: TaskEditFormInput,
  projectAreaId: string | null,
): TaskEditPatchResult {
  const areaChangeBlocked =
    task.project_id !== null &&
    isProjectAreaBlocked(task.area_id, patch.area_id, projectAreaId);

  return {
    task: {
      ...task,
      title: patch.title,
      description: patch.description,
      area_id: areaChangeBlocked ? task.area_id : patch.area_id,
    },
    areaChangeBlocked,
  };
}

export interface TaskEditStateResult {
  state: WorkflowState;
  task: Task | null;
  areaChangeBlocked: boolean;
}

/**
 * The local-state half of the edit: looks the task up fresh (callers pass the
 * freshest `state` they have so a race with another action is never
 * overwritten), resolves its project's area, applies the patch, and bumps
 * `updated_at` exactly like the other review transitions in `review.ts`.
 * Returns `task: null` unchanged when the task no longer exists.
 */
export function editBacklogTaskInState(
  state: WorkflowState,
  taskId: string,
  patch: TaskEditFormInput,
): TaskEditStateResult {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return { state, task: null, areaChangeBlocked: false };
  }

  const project = task.project_id
    ? (state.projects.find((item) => item.id === task.project_id) ?? null)
    : null;

  const { task: patchedTask, areaChangeBlocked } = applyTaskEditPatch(
    task,
    patch,
    project?.area_id ?? null,
  );
  const nextTask: Task = { ...patchedTask, updated_at: nowIso() };

  return {
    state: {
      ...state,
      tasks: state.tasks.map((item) => (item.id === taskId ? nextTask : item)),
      reviewLog: [`Edited backlog task: ${nextTask.title}`, ...state.reviewLog],
    },
    task: nextTask,
    areaChangeBlocked,
  };
}
