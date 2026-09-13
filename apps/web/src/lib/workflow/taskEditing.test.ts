import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@lifeos/schemas";
import type { Phase2MockTask } from "@/lib/types";
import {
  workflowReducer,
  type PersistedWorkflowPayload,
} from "@/lib/workflowContext/reducerCore";
import {
  GOLDEN_AREA_ID,
  backlogLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import {
  applyTaskEditPatch,
  editBacklogTaskInState,
  isProjectAreaBlocked,
  normalizeTaskEditInput,
  validateTaskEditInput,
} from "./taskEditing";
import { acceptProjectDraft } from "./triage";

const CREATED = "2026-07-04T09:00:00.000Z";
const EDITED = "2026-07-04T10:00:00.000Z";
const AREA_MAIN = GOLDEN_AREA_ID;
const AREA_PERSONAL = "area-personal";
const AREA_MISSING = "area-does-not-exist";
const ACCOUNT_TASK_ID = "11111111-1111-4111-8111-111111111111";
// Account-shaped project id that no local project carries: the realistic
// shape of a synced task whose project details this state does not hold.
const ACCOUNT_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

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

/** An account sync payload, same shape `localRowRetirementGuard.test.ts` uses. */
function syncPayload(
  overrides: Partial<PersistedWorkflowPayload> = {},
): PersistedWorkflowPayload {
  return {
    captures: [],
    tasks: [],
    proposals: [],
    blocks: [],
    sessions: [],
    reviewLog: [],
    idAliases: {
      captures: new Map<string, string>(),
      tasks: new Map<string, string>(),
      proposals: new Map<string, string>(),
      blocks: new Map<string, string>(),
      sessions: new Map<string, string>(),
    },
    ...overrides,
  };
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

  // A null project area is "nothing known to compare against" for this
  // comparator; the linked-but-unknown-project rule lives in
  // `applyTaskEditPatch` (tested below).
  it("is false when no project area is given to compare against", () => {
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

  it("keeps the area of a project-linked task whose project's area is unknown, but still saves title and description", () => {
    const task = makeTask({
      id: "task-1",
      project_id: ACCOUNT_PROJECT_ID,
      source_capture_item_id: "capture-1",
      area_id: AREA_MAIN,
    });

    const { task: nextTask, areaChangeBlocked } = applyTaskEditPatch(
      task,
      { title: "New title", description: "New notes", area_id: AREA_PERSONAL },
      null,
    );

    expect(areaChangeBlocked).toBe(true);
    expect(nextTask.area_id).toBe(AREA_MAIN);
    expect(nextTask.title).toBe("New title");
    expect(nextTask.description).toBe("New notes");
    expect(nextTask.id).toBe("task-1");
    expect(nextTask.source_capture_item_id).toBe("capture-1");
    expect(nextTask.project_id).toBe(ACCOUNT_PROJECT_ID);
    expect(nextTask.status).toBe("backlog");
  });

  it("does not report a block for an unknown-project task when the area is unchanged", () => {
    const task = makeTask({
      id: "task-1",
      project_id: ACCOUNT_PROJECT_ID,
      area_id: AREA_MAIN,
    });

    const { task: nextTask, areaChangeBlocked } = applyTaskEditPatch(
      task,
      { title: "New title", description: null, area_id: AREA_MAIN },
      null,
    );

    expect(areaChangeBlocked).toBe(false);
    expect(nextTask.area_id).toBe(AREA_MAIN);
    expect(nextTask.title).toBe("New title");
  });

  it("lets a task with no project link move area freely", () => {
    const task = makeTask({ id: "task-1", area_id: AREA_MAIN });

    const { task: nextTask, areaChangeBlocked } = applyTaskEditPatch(
      task,
      { title: "New title", description: null, area_id: AREA_PERSONAL },
      null,
    );

    expect(areaChangeBlocked).toBe(false);
    expect(nextTask.area_id).toBe(AREA_PERSONAL);
  });
});

// Every state below is built through `workflowSeed()` and real transitions
// (capture -> backlog, project-draft accept, account sync), never a
// hand-assembled `WorkflowState`. `Date` is pinned so the fixtures' own
// timestamps are CREATED and the edit's are EDITED, deterministically.
describe("editBacklogTaskInState", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(CREATED));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the state unchanged (task: null) when the task does not exist", () => {
    const state = workflowSeed();
    expect(state.tasks).toEqual([]);

    const result = editBacklogTaskInState(state, "missing-task", {
      title: "New title",
      description: null,
      area_id: AREA_MAIN,
    });

    expect(result.task).toBeNull();
    expect(result.state).toBe(state);
  });

  it("edits the task, bumps updated_at, and leaves other tasks untouched", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Sort the garage shelves.");
    state = backlogLatestDraft(state);
    const target = state.tasks.find((task) => task.status === "backlog");
    state = captureWorkflow(state, "Label the storage bins.");
    state = backlogLatestDraft(state);
    const other = state.tasks.find(
      (task) => task.status === "backlog" && task.id !== target?.id,
    );
    expect(target).toBeDefined();
    expect(other).toBeDefined();
    expect(target!.updated_at).toBe(CREATED);

    vi.setSystemTime(new Date(EDITED));
    const result = editBacklogTaskInState(state, target!.id, {
      title: "New title",
      description: "Notes",
      area_id: AREA_MAIN,
    });

    expect(result.task?.title).toBe("New title");
    expect(result.task?.description).toBe("Notes");
    expect(result.task?.updated_at).not.toBe(CREATED);
    expect(result.task?.updated_at).toBe(EDITED);
    expect(result.state.tasks.find((t) => t.id === other!.id)).toEqual(other);
  });

  it("resolves the project's area from state.projects before blocking an area change", () => {
    // One capture yields both a project draft (the text says "roadmap") and a
    // task draft; accepting the project and backlogging the task are the real
    // local transitions for each.
    let state = workflowSeed();
    state = captureWorkflow(state, "Draft the quarterly roadmap.", AREA_MAIN);
    const projectDraft = state.projectDrafts.find(
      (draft) => draft.status === "pending",
    );
    expect(projectDraft).toBeDefined();
    state = acceptProjectDraft(state, projectDraft!.id);
    state = backlogLatestDraft(state);
    const project = state.projects[0];
    const localTask = state.tasks.find((task) => task.status === "backlog");
    expect(project?.area_id).toBe(AREA_MAIN);
    expect(localTask).toBeDefined();

    // No local transition links a task to a project, so the link rides in on
    // a synced row through the real sync reducer. Pointing that row at a
    // LOCAL project id is a lookup fixture only: it proves the area is read
    // from `state.projects` when the project is there, not that production
    // produces this pairing (account project ids are not aliased locally;
    // the unknown-project tests below cover the shape production produces).
    state = workflowReducer(state, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        tasks: [
          { ...localTask!, id: ACCOUNT_TASK_ID, project_id: project!.id },
        ],
      }),
    });
    const linked = state.tasks.find((task) => task.id === ACCOUNT_TASK_ID);
    expect(linked?.project_id).toBe(project!.id);
    expect(linked?.area_id).toBe(AREA_MAIN);

    const result = editBacklogTaskInState(state, ACCOUNT_TASK_ID, {
      title: "New title",
      description: null,
      area_id: AREA_PERSONAL,
    });

    expect(result.areaChangeBlocked).toBe(true);
    expect(result.task?.area_id).toBe(AREA_MAIN);
  });

  it("allows a linked task's area move when the known project lives in the requested area", () => {
    // Same lookup fixture as above, with the project captured in Personal
    // while the synced task sits in Main Job: the move toward the project's
    // own area is allowed, which an unknown project would never permit.
    let state = workflowSeed();
    state = captureWorkflow(
      state,
      "Draft the quarterly roadmap.",
      AREA_PERSONAL,
    );
    const projectDraft = state.projectDrafts.find(
      (draft) => draft.status === "pending",
    );
    expect(projectDraft).toBeDefined();
    state = acceptProjectDraft(state, projectDraft!.id);
    state = backlogLatestDraft(state);
    const project = state.projects[0];
    const localTask = state.tasks.find((task) => task.status === "backlog");
    expect(project?.area_id).toBe(AREA_PERSONAL);
    expect(localTask).toBeDefined();

    state = workflowReducer(state, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        tasks: [
          {
            ...localTask!,
            id: ACCOUNT_TASK_ID,
            area_id: AREA_MAIN,
            project_id: project!.id,
          },
        ],
      }),
    });

    const result = editBacklogTaskInState(state, ACCOUNT_TASK_ID, {
      title: "New title",
      description: null,
      area_id: AREA_PERSONAL,
    });

    expect(result.areaChangeBlocked).toBe(false);
    expect(result.task?.area_id).toBe(AREA_PERSONAL);
  });

  // The shape production can actually hold today: a synced account task
  // whose `project_id` is an account id that no local project carries.
  function syncedUnknownProjectState() {
    let state = workflowSeed();
    state = captureWorkflow(state, "Sort the garage shelves.");
    state = backlogLatestDraft(state);
    const localTask = state.tasks.find((task) => task.status === "backlog");
    expect(localTask).toBeDefined();
    state = workflowReducer(state, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        tasks: [
          {
            ...localTask!,
            id: ACCOUNT_TASK_ID,
            project_id: ACCOUNT_PROJECT_ID,
          },
        ],
      }),
    });
    const synced = state.tasks.find((task) => task.id === ACCOUNT_TASK_ID);
    expect(synced?.project_id).toBe(ACCOUNT_PROJECT_ID);
    expect(
      state.projects.some((project) => project.id === ACCOUNT_PROJECT_ID),
    ).toBe(false);
    return { state, synced: synced! };
  }

  it("keeps a synced task's area when its account project is not in this state, while title and description still save", () => {
    const { state, synced } = syncedUnknownProjectState();
    expect(synced.area_id).toBe(AREA_MAIN);

    vi.setSystemTime(new Date(EDITED));
    const result = editBacklogTaskInState(state, ACCOUNT_TASK_ID, {
      title: "Sort and label the garage shelves",
      description: "Top shelf first.",
      area_id: AREA_PERSONAL,
    });

    expect(result.areaChangeBlocked).toBe(true);
    expect(result.task?.area_id).toBe(AREA_MAIN);
    expect(result.task?.title).toBe("Sort and label the garage shelves");
    expect(result.task?.description).toBe("Top shelf first.");
    expect(result.task?.id).toBe(ACCOUNT_TASK_ID);
    expect(result.task?.source_capture_item_id).toBe(
      synced.source_capture_item_id,
    );
    expect(result.task?.status).toBe("backlog");
    expect(result.task?.project_id).toBe(ACCOUNT_PROJECT_ID);
    expect(result.task?.updated_at).toBe(EDITED);
  });

  it("does not report a block for that synced unknown-project task when its area is left unchanged", () => {
    const { state } = syncedUnknownProjectState();

    const result = editBacklogTaskInState(state, ACCOUNT_TASK_ID, {
      title: "Sort and label the garage shelves",
      description: null,
      area_id: AREA_MAIN,
    });

    expect(result.areaChangeBlocked).toBe(false);
    expect(result.task?.area_id).toBe(AREA_MAIN);
    expect(result.task?.title).toBe("Sort and label the garage shelves");
  });
});
