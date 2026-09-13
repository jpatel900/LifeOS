import { describe, expect, it } from "vitest";
import type { Task, Project } from "@lifeos/schemas";
import type { Phase2MockTask } from "@/lib/types";
import { createInitialWorkflowState, type WorkflowState } from "./shared";
import {
  applyTaskEditPatch,
  editBacklogTaskInState,
  isProjectAreaBlocked,
  normalizeTaskEditInput,
  validateTaskEditInput,
} from "./taskEditing";

const CREATED = "2026-07-04T09:00:00.000Z";
const AREA_MAIN = "area-main-job";
const AREA_PERSONAL = "area-personal";
const AREA_MISSING = "area-does-not-exist";

function makeTask(overrides: Partial<Phase2MockTask> & { id: string }): Task {
  return {
    user_id: "user-1",
    area_id: AREA_MAIN,
    project_id: null,
    source_capture_item_id: null,
    title: "Original title",
    description: null,
    status: "backlog",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  } as Task;
}

function makeProject(
  overrides: Partial<Project> & { id: string; area_id: string },
): Project {
  return {
    user_id: "user-1",
    title: "A project",
    description: null,
    status: "active",
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  } as Project;
}

function stateWith(overrides: Partial<WorkflowState>): WorkflowState {
  return { ...createInitialWorkflowState(), ...overrides };
}

describe("normalizeTaskEditInput", () => {
  it("trims the title and folds a blank description into null", () => {
    const result = normalizeTaskEditInput({
      title: "  Buy milk  ",
      description: "   ",
      area_id: AREA_MAIN,
    });

    expect(result).toEqual({
      title: "Buy milk",
      description: null,
      area_id: AREA_MAIN,
    });
  });

  // The description is NOT trimmed once it is non-blank — only the
  // whitespace check that decides null-vs-kept looks at the trimmed form.
  it("preserves a non-blank description's own whitespace exactly, untrimmed", () => {
    const result = normalizeTaskEditInput({
      title: "Buy milk",
      description: "  2%, not skim  ",
      area_id: AREA_MAIN,
    });

    expect(result.description).toBe("  2%, not skim  ");
  });

  it("preserves internal newlines and indentation in a real description", () => {
    const description = "Step 1: prep\n  Step 2: bake\nStep 3: cool";
    const result = normalizeTaskEditInput({
      title: "Buy milk",
      description,
      area_id: AREA_MAIN,
    });

    expect(result.description).toBe(description);
  });

  it("still trims the title even when the description is preserved verbatim", () => {
    const result = normalizeTaskEditInput({
      title: "  Buy milk  ",
      description: "  keep me  ",
      area_id: AREA_MAIN,
    });

    expect(result.title).toBe("Buy milk");
    expect(result.description).toBe("  keep me  ");
  });
});

describe("validateTaskEditInput", () => {
  const context = { availableAreaIds: [AREA_MAIN, AREA_PERSONAL] };

  it("rejects a blank title", () => {
    const result = validateTaskEditInput(
      { title: "   ", description: null, area_id: AREA_MAIN },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeTruthy();
    }
  });

  it("rejects an area that is not available", () => {
    const result = validateTaskEditInput(
      { title: "Buy milk", description: null, area_id: AREA_MISSING },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.area_id).toBeTruthy();
    }
  });

  it("accepts a valid edit and returns the normalized patch", () => {
    const result = validateTaskEditInput(
      { title: "  Buy milk  ", description: "", area_id: AREA_PERSONAL },
      context,
    );

    expect(result).toEqual({
      ok: true,
      patch: { title: "Buy milk", description: null, area_id: AREA_PERSONAL },
    });
  });
});

describe("isProjectAreaBlocked", () => {
  it("is false when the area is unchanged", () => {
    expect(isProjectAreaBlocked(AREA_MAIN, AREA_MAIN, AREA_PERSONAL)).toBe(
      false,
    );
  });

  it("is false when there is no project area to protect", () => {
    expect(isProjectAreaBlocked(AREA_MAIN, AREA_PERSONAL, null)).toBe(false);
  });

  it("is false when the requested area matches the project's area", () => {
    expect(isProjectAreaBlocked(AREA_MAIN, AREA_PERSONAL, AREA_PERSONAL)).toBe(
      false,
    );
  });

  it("is true when the requested area differs from both the task's and the project's area", () => {
    expect(isProjectAreaBlocked(AREA_MAIN, AREA_PERSONAL, AREA_MAIN)).toBe(
      true,
    );
  });
});

describe("applyTaskEditPatch", () => {
  it("preserves id, source capture, project link, status and scheduling", () => {
    const task = makeTask({
      id: "task-1",
      project_id: "project-1",
      source_capture_item_id: "capture-1",
      status: "backlog",
      due_at: "2026-08-01T00:00:00.000Z",
      first_tiny_step: "Open the drawer",
    });

    const { task: nextTask } = applyTaskEditPatch(
      task,
      { title: "New title", description: "New notes", area_id: AREA_MAIN },
      AREA_MAIN,
    );

    expect(nextTask.id).toBe("task-1");
    expect(nextTask.source_capture_item_id).toBe("capture-1");
    expect(nextTask.project_id).toBe("project-1");
    expect(nextTask.status).toBe("backlog");
    expect(nextTask.due_at).toBe("2026-08-01T00:00:00.000Z");
    expect(nextTask.first_tiny_step).toBe("Open the drawer");
    expect(nextTask.title).toBe("New title");
    expect(nextTask.description).toBe("New notes");
  });

  it("drops a project-inconsistent area change but keeps the title/description edit", () => {
    const task = makeTask({
      id: "task-1",
      project_id: "project-1",
      area_id: AREA_MAIN,
    });

    const { task: nextTask, areaChangeBlocked } = applyTaskEditPatch(
      task,
      { title: "New title", description: null, area_id: AREA_PERSONAL },
      AREA_MAIN,
    );

    expect(areaChangeBlocked).toBe(true);
    expect(nextTask.area_id).toBe(AREA_MAIN);
    expect(nextTask.title).toBe("New title");
  });

  it("allows the area change when it matches the project's area", () => {
    const task = makeTask({
      id: "task-1",
      project_id: "project-1",
      area_id: AREA_MAIN,
    });

    const { task: nextTask, areaChangeBlocked } = applyTaskEditPatch(
      task,
      { title: "New title", description: null, area_id: AREA_PERSONAL },
      AREA_PERSONAL,
    );

    expect(areaChangeBlocked).toBe(false);
    expect(nextTask.area_id).toBe(AREA_PERSONAL);
  });
});

describe("editBacklogTaskInState", () => {
  it("returns the state unchanged (task: null) when the task does not exist", () => {
    const state = stateWith({ tasks: [] });

    const result = editBacklogTaskInState(state, "missing-task", {
      title: "New title",
      description: null,
      area_id: AREA_MAIN,
    });

    expect(result.task).toBeNull();
    expect(result.state).toBe(state);
  });

  it("edits the task, bumps updated_at, and leaves other tasks untouched", () => {
    const other = makeTask({ id: "task-2", title: "Other task" });
    const target = makeTask({ id: "task-1", title: "Old title" });
    const state = stateWith({ tasks: [target, other] });

    const result = editBacklogTaskInState(state, "task-1", {
      title: "New title",
      description: "Notes",
      area_id: AREA_MAIN,
    });

    expect(result.task?.title).toBe("New title");
    expect(result.task?.description).toBe("Notes");
    expect(result.task?.updated_at).not.toBe(CREATED);
    expect(result.state.tasks.find((t) => t.id === "task-2")).toEqual(other);
  });

  it("resolves the project's area from state.projects before blocking an area change", () => {
    const project = makeProject({ id: "project-1", area_id: AREA_MAIN });
    const target = makeTask({
      id: "task-1",
      project_id: "project-1",
      area_id: AREA_MAIN,
    });
    const state = stateWith({ tasks: [target], projects: [project] });

    const result = editBacklogTaskInState(state, "task-1", {
      title: "New title",
      description: null,
      area_id: AREA_PERSONAL,
    });

    expect(result.areaChangeBlocked).toBe(true);
    expect(result.task?.area_id).toBe(AREA_MAIN);
  });
});
