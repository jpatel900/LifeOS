import { useEffect, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import type { TaskEditResult } from "@/lib/workflowContext/types";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import type { Area, Task } from "@lifeos/schemas";
import {
  GOLDEN_AREA_ID,
  backlogLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "./helpers/workflowReachability";

/**
 * Issue #984 — accepted-backlog task editor, exercised through the real
 * WorkflowProvider (not the persistenceSync unit seams). Demo-mode
 * assertions run the REAL local patch + sessionStorage-confirm path;
 * account-mode assertions override `persistBacklogTaskEdit` at the
 * persistence-sync seam only (same technique as `reviewClosureTruth.test.tsx`
 * and `WorkflowContext.areas.test.tsx`), so `createSupabaseBrowserClient`
 * only needs to report present/absent — its real methods are never called by
 * this file's account-mode cases.
 */

const OTHER_AREA_ID = "area-personal";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

const { mockCreateSupabaseBrowserClient } = vi.hoisted(() => ({
  mockCreateSupabaseBrowserClient: vi.fn(() => null as unknown),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

type PersistOverrideResult =
  | { status: "persisted"; task: Task }
  | { status: "persisted-refresh-pending"; task: Task; sameSession: boolean }
  | { status: "conflict" }
  | { status: "unreachable" };

type PersistBacklogTaskEditArgs = Parameters<
  import("@/lib/workflowContext/persistenceSync").PersistenceSyncOps["persistBacklogTaskEdit"]
>;

const persistBacklogTaskEditOverride = vi.hoisted(() => ({
  current: null as
    | ((...args: PersistBacklogTaskEditArgs) => Promise<PersistOverrideResult>)
    | null,
}));

vi.mock("@/lib/workflowContext/persistenceSync", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/workflowContext/persistenceSync")
    >();
  return {
    ...actual,
    createPersistenceSync: (
      ...args: Parameters<typeof actual.createPersistenceSync>
    ) => {
      const ops = actual.createPersistenceSync(...args);
      return {
        ...ops,
        persistBacklogTaskEdit: (
          ...opArgs: Parameters<typeof ops.persistBacklogTaskEdit>
        ) =>
          persistBacklogTaskEditOverride.current
            ? persistBacklogTaskEditOverride.current(...opArgs)
            : ops.persistBacklogTaskEdit(...opArgs),
      };
    },
  };
});

function seedBacklogTask() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Reorganize the garage shelving.");
  state = backlogLatestDraft(state);
  const task = state.tasks.find((item) => item.status === "backlog");
  if (!task) {
    throw new Error("Seed produced no backlog task.");
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return task;
}

function seedProjectLinkedBacklogTask() {
  let state = workflowSeed();
  const project = {
    id: "project-1",
    user_id: "user-demo",
    area_id: GOLDEN_AREA_ID,
    title: "A project",
    description: null,
    status: "active" as const,
    created_at: "2026-07-04T09:00:00.000Z",
    updated_at: "2026-07-04T09:00:00.000Z",
  };
  const task: Task = {
    id: "task-project-linked",
    user_id: "user-demo",
    area_id: GOLDEN_AREA_ID,
    project_id: project.id,
    source_capture_item_id: null,
    title: "Project task",
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
    created_at: "2026-07-04T09:00:00.000Z",
    updated_at: "2026-07-04T09:00:00.000Z",
  };
  state = { ...state, projects: [project], tasks: [task] };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return task;
}

function EditProbe({
  taskId,
  areaId,
  title = "New title",
  syncAreas,
}: {
  taskId: string;
  areaId: string;
  title?: string;
  /** Populates `persistedAreasRef`/`state.areas` once, as a real account
   * sign-in would — needed to prove `savedAreaId`'s alias mapping against a
   * REAL persisted area row rather than the empty table every other test in
   * this file leaves untouched. */
  syncAreas?: Area[];
}) {
  const { state, editBacklogTask, syncPersistedAreas } = useWorkflow();
  const [result, setResult] = useState<TaskEditResult | null>(null);
  const [pending, setPending] = useState(false);
  const task = state.tasks.find((item) => item.id === taskId);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncAreas && !syncedRef.current) {
      syncedRef.current = true;
      syncPersistedAreas(syncAreas);
    }
  }, [syncAreas, syncPersistedAreas]);

  return (
    <div>
      <span data-testid="task-title">{task?.title ?? ""}</span>
      <span data-testid="task-description">{task?.description ?? ""}</span>
      <span data-testid="task-area">{task?.area_id ?? ""}</span>
      <span data-testid="task-updated-at">{task?.updated_at ?? ""}</span>
      <span data-testid="result-status">{result?.status ?? ""}</span>
      <span data-testid="result-json">
        {result ? JSON.stringify(result) : ""}
      </span>
      <button
        type="button"
        disabled={pending || !task}
        onClick={async () => {
          if (!task) return;
          setPending(true);
          const outcome = await editBacklogTask(taskId, {
            title,
            description: "New notes",
            area_id: areaId,
            expected_updated_at: task.updated_at,
          });
          setResult(outcome);
          setPending(false);
        }}
      >
        Save
      </button>
    </div>
  );
}

function renderProbe(
  taskId: string,
  areaId: string,
  title?: string,
  syncAreas?: Area[],
) {
  return render(
    <WorkflowProvider>
      <EditProbe
        taskId={taskId}
        areaId={areaId}
        title={title}
        syncAreas={syncAreas}
      />
    </WorkflowProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockCreateSupabaseBrowserClient.mockReset();
  mockCreateSupabaseBrowserClient.mockReturnValue(null);
  persistBacklogTaskEditOverride.current = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("editBacklogTask — demo (no account)", () => {
  it("saves title/description/area, confirms the sessionStorage snapshot, and reports success", async () => {
    const task = seedBacklogTask();
    renderProbe(task.id, OTHER_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("success");
    });
    expect(screen.getByTestId("task-title")).toHaveTextContent("New title");
    expect(screen.getByTestId("task-area")).toHaveTextContent(OTHER_AREA_ID);
    const parsed = JSON.parse(
      screen.getByTestId("result-json").textContent ?? "{}",
    );
    expect(parsed.deliveryTier).toBe("demo");
    expect(parsed.savedAreaId).toBe(OTHER_AREA_ID);

    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    const storedTask = stored.tasks.find((item: Task) => item.id === task.id);
    expect(storedTask.title).toBe("New title");
    expect(storedTask.area_id).toBe(OTHER_AREA_ID);
    // Preserved, not touched by the edit.
    expect(storedTask.status).toBe("backlog");
    expect(storedTask.id).toBe(task.id);
  });

  it("rejects a blank title, leaving the canonical task unchanged", async () => {
    const task = seedBacklogTask();
    renderProbe(task.id, GOLDEN_AREA_ID, "   ");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("invalid");
    });
    expect(screen.getByTestId("task-title")).toHaveTextContent(task.title);
  });

  it('reports "conflict" and leaves the task unchanged when it changed underneath the editor', async () => {
    const task = seedBacklogTask();
    render(
      <WorkflowProvider>
        <EditProbeWithStaleTimestamp taskId={task.id} />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("conflict");
    });
    expect(screen.getByTestId("task-title")).toHaveTextContent(task.title);
  });

  it("blocks a project-inconsistent area change but still saves the title", async () => {
    const task = seedProjectLinkedBacklogTask();
    renderProbe(task.id, OTHER_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("success");
    });
    expect(
      JSON.parse(screen.getByTestId("result-json").textContent ?? "{}"),
    ).toMatchObject({ areaChangeBlocked: true });
    expect(screen.getByTestId("task-title")).toHaveTextContent("New title");
    // Area kept — the project lives in GOLDEN_AREA_ID, not OTHER_AREA_ID.
    expect(screen.getByTestId("task-area")).toHaveTextContent(GOLDEN_AREA_ID);
  });
});

function EditProbeWithStaleTimestamp({ taskId }: { taskId: string }) {
  const { state, editBacklogTask } = useWorkflow();
  const [result, setResult] = useState<TaskEditResult | null>(null);
  const task = state.tasks.find((item) => item.id === taskId);

  return (
    <div>
      <span data-testid="task-title">{task?.title ?? ""}</span>
      <span data-testid="result-status">{result?.status ?? ""}</span>
      <button
        type="button"
        onClick={async () => {
          const outcome = await editBacklogTask(taskId, {
            title: "New title",
            description: null,
            area_id: GOLDEN_AREA_ID,
            expected_updated_at: "1999-01-01T00:00:00.000Z",
          });
          setResult(outcome);
        }}
      >
        Save
      </button>
    </div>
  );
}

describe("editBacklogTask — configured account", () => {
  beforeEach(() => {
    mockCreateSupabaseBrowserClient.mockReturnValue({ mocked: true });
  });

  it("reports success with the server-confirmed task and never writes local state itself", async () => {
    const task = seedBacklogTask();
    const confirmedTask: Task = { ...task, title: "New title" };
    persistBacklogTaskEditOverride.current = () =>
      Promise.resolve({ status: "persisted", task: confirmedTask });
    renderProbe(task.id, GOLDEN_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("success");
    });
    expect(
      JSON.parse(screen.getByTestId("result-json").textContent ?? "{}").task
        .title,
    ).toBe("New title");
  });

  it("reports success with deliveryTier 'account' and savedAreaId resolved from the SERVER's own returned row, not the request", async () => {
    const task = seedBacklogTask();
    // A real persisted-space area row — "personal" is one of the known
    // slugs `workflowAreaIdForPersistedAreaId` maps back to "area-personal".
    // Synced via `syncPersistedAreas`, exactly as a real account sign-in
    // would populate `persistedAreasRef`/`state.areas`.
    const persistedArea: Area = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: "user-1",
      name: "Personal",
      slug: "personal",
      description: null,
      color: "#16a34a",
      icon: null,
      sort_order: 0,
      is_active: true,
      created_at: "2026-07-04T09:00:00.000Z",
      updated_at: "2026-07-04T09:00:00.000Z",
    };
    // The server's row deliberately carries THIS persisted area — different
    // from `GOLDEN_AREA_ID` ("area-main-job") requested below — so a
    // `savedAreaId` of "area-personal" can only have come from mapping
    // `persisted.task.area_id`, never from echoing the local request
    // (root review clarification point 3).
    const confirmedTask: Task = {
      ...task,
      title: "New title",
      area_id: persistedArea.id,
    };
    persistBacklogTaskEditOverride.current = () =>
      Promise.resolve({ status: "persisted", task: confirmedTask });
    renderProbe(task.id, GOLDEN_AREA_ID, undefined, [persistedArea]);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("success");
    });
    const parsed = JSON.parse(
      screen.getByTestId("result-json").textContent ?? "{}",
    );
    expect(parsed.deliveryTier).toBe("account");
    expect(parsed.savedAreaId).toBe("area-personal");
  });

  it("reports success (not failure) with refreshPending, and does NOT reflect the row locally when the session no longer checks out", async () => {
    const task = seedBacklogTask();
    const confirmedTask: Task = { ...task, title: "New title" };
    persistBacklogTaskEditOverride.current = () =>
      Promise.resolve({
        status: "persisted-refresh-pending",
        task: confirmedTask,
        sameSession: false,
      });
    renderProbe(task.id, GOLDEN_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("success");
    });
    const parsed = JSON.parse(
      screen.getByTestId("result-json").textContent ?? "{}",
    );
    expect(parsed.refreshPending).toBe(true);
    // Never grafted onto this tab's own canonical state — the title this
    // tab shows stays the ORIGINAL one until a real resync confirms it.
    expect(screen.getByTestId("task-title")).toHaveTextContent(task.title);
  });

  it("reflects the EXACT server-returned fields and updated_at (never a freshly minted local timestamp), and a subsequent edit uses that exact version as its own guard token", async () => {
    const task = seedBacklogTask();
    // A version clearly distinguishable from anything `Date.now()` could
    // produce in this test run — proves the reflected value came from the
    // server's row, not a local `nowIso()`.
    const SERVER_UPDATED_AT = "2030-01-01T00:00:00.000Z";
    // Deliberately different from what this tab's own patch would have
    // produced verbatim, simulating server-side normalization of the
    // written fields.
    const confirmedTask: Task = {
      ...task,
      title: "Server-normalized Title",
      description: "Server note",
      updated_at: SERVER_UPDATED_AT,
    };
    const persistCalls: PersistBacklogTaskEditArgs[] = [];
    persistBacklogTaskEditOverride.current = (...args) => {
      persistCalls.push(args);
      return Promise.resolve({
        status: "persisted-refresh-pending",
        task: confirmedTask,
        sameSession: true,
      });
    };
    renderProbe(task.id, GOLDEN_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("success");
    });

    await waitFor(() => {
      expect(screen.getByTestId("task-title")).toHaveTextContent(
        "Server-normalized Title",
      );
    });
    expect(screen.getByTestId("task-description")).toHaveTextContent(
      "Server note",
    );
    expect(screen.getByTestId("task-updated-at")).toHaveTextContent(
      SERVER_UPDATED_AT,
    );

    // A second edit reads the CURRENT local task's updated_at as its own
    // guard token — which must now be the server's exact value, or the
    // account's own `.eq("updated_at", …)` guard would reject an honest,
    // immediately-following edit as a false conflict.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(persistCalls).toHaveLength(2);
    });
    const [, , secondExpectedUpdatedAt] = persistCalls[1];
    expect(secondExpectedUpdatedAt).toBe(SERVER_UPDATED_AT);
  });

  it("reports conflict and leaves the canonical task unchanged", async () => {
    const task = seedBacklogTask();
    persistBacklogTaskEditOverride.current = () =>
      Promise.resolve({ status: "conflict" });
    renderProbe(task.id, GOLDEN_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("conflict");
    });
    expect(screen.getByTestId("task-title")).toHaveTextContent(task.title);
  });

  it("reports failure (not a silent local save) when the task never reached the account", async () => {
    const task = seedBacklogTask();
    persistBacklogTaskEditOverride.current = () =>
      Promise.resolve({ status: "unreachable" });
    renderProbe(task.id, GOLDEN_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("failure");
    });
    expect(screen.getByTestId("task-title")).toHaveTextContent(task.title);
  });

  it("reports failure and leaves the canonical task unchanged when the write throws (e.g. signed out)", async () => {
    const task = seedBacklogTask();
    persistBacklogTaskEditOverride.current = () =>
      Promise.reject(new Error("Sign in before saving task edits."));
    renderProbe(task.id, GOLDEN_AREA_ID);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("result-status")).toHaveTextContent("failure");
    });
    expect(screen.getByTestId("task-title")).toHaveTextContent(task.title);
  });
});
