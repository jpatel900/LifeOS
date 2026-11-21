import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, CalendarBlock, Task } from "@lifeos/schemas";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { accountSnapshotKey } from "@/lib/workflowContext/accountSnapshot";
import {
  GOOGLE_BACKED_BLOCK_CHANGE_REFUSED,
  SAVED_ON_THIS_DEVICE_SHORT,
} from "@/lib/statusVocabulary";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { ReviewSheet } from "./ReviewSheet";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listAreas: vi.fn(),
  listCaptures: vi.fn(),
  listPlanning: vi.fn(),
  listExecution: vi.fn(),
  listWins: vi.fn(),
  listOverrides: vi.fn(),
  listDurations: vi.fn(),
  listSuggestions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createClient,
}));
vi.mock("@/lib/data/workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/workflow")>()),
  listAreas: mocks.listAreas,
  listCaptureItems: mocks.listCaptures,
  listPlanningItems: mocks.listPlanning,
  listExecutionReviewItems: mocks.listExecution,
  listWinRecords: mocks.listWins,
  listOverrideRecords: mocks.listOverrides,
  listDurationProfiles: mocks.listDurations,
  listSuggestionRecords: mocks.listSuggestions,
}));

const USER_ID = "22222222-2222-4222-8222-222222222222";
const AREA_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const BLOCK_ID = "44444444-4444-4444-8444-444444444444";
// The exact refusal `apply_task_review_transition` raises (migration
// 20260929120000) for a task whose open block is on Google Calendar.
const GOOGLE_BLOCK_REFUSAL =
  "Google-backed blocks require calendar approval before changing this task.";
const area = {
  id: AREA_ID,
  user_id: USER_ID,
  name: "Main Job",
  slug: "main-job",
  description: null,
  color: null,
  icon: null,
  sort_order: 0,
  is_active: true,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
} satisfies Area;

function accountTask(status: "active" | "backlog" | "blocked"): Task {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title: "Synthetic review task",
    description: null,
    status,
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
  };
}

// What `record_execution_session` leaves behind after a focus session on an
// approved Google block ends "Stuck": the task is blocked, the block is still
// scheduled and still carries its LifeOS-created Google event.
function googleBackedBlock(
  status: "scheduled" | "cancelled" = "scheduled",
): CalendarBlock {
  return {
    id: BLOCK_ID,
    user_id: USER_ID,
    area_id: AREA_ID,
    proposal_id: null,
    task_id: TASK_ID,
    google_event_id: "lifeos0123456789abcdef0123456789abcdef",
    start_at: "2026-09-29T15:00:00.000Z",
    end_at: "2026-09-29T16:00:00.000Z",
    status,
    created_at: "2026-09-29T12:00:00.000Z",
    updated_at: "2026-09-29T12:00:00.000Z",
  };
}

let workflow: ReturnType<typeof useWorkflow>;
function TaskStatusProbe() {
  workflow = useWorkflow();
  const { state, areasReadbackSettled, syncStatus } = workflow;
  return (
    <div>
      <span data-testid="account-read-settled">
        {String(areasReadbackSettled)}
      </span>
      <span data-testid="account-message">{syncStatus.message}</span>
      <span data-testid="account-status">{syncStatus.account}</span>
      <span data-testid="task-status">
        {state.tasks.find((task) => task.id === TASK_ID)?.status ?? "missing"}
      </span>
      <span data-testid="block-status">
        {state.calendarBlocks.find((block) => block.id === BLOCK_ID)?.status ??
          "missing"}
      </span>
    </div>
  );
}

const toast = vi.fn();
function mountReview() {
  return render(
    <WorkflowProvider>
      <TaskStatusProbe />
      <ReviewSheet
        open
        onClose={vi.fn()}
        selectedAreaId={null}
        now={new Date("2026-09-29T18:00:00.000Z")}
        dayClose={null}
        onCloseDay={vi.fn()}
        onToast={toast}
      />
    </WorkflowProvider>,
  );
}

describe("ReviewSheet account save truth", () => {
  let storedTask: Task;
  let storedBlocks: CalendarBlock[] = [];
  let finishAccountWrite: (result: {
    data: { task: Task; blocks: [] } | null;
    error: { message: string } | null;
  }) => void = () => {
    throw new Error("Review transition RPC was not called.");
  };
  const rpc = vi.fn();
  let client: unknown;

  beforeEach(async () => {
    await clearPendingWrites();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    toast.mockClear();
    rpc.mockReset();
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAccountWrite = resolve;
        }),
    );
    client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        })),
      },
      rpc,
    };
    mocks.createClient.mockReturnValue(client);
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.listCaptures.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
    mocks.listPlanning.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      proposals: [],
      blocks: [],
    });
    storedBlocks = [];
    mocks.listExecution.mockImplementation(async () => ({
      provider: "supabase",
      tasks: [{ ...storedTask }],
      blocks: storedBlocks.map((block) => ({ ...block })),
      sessions: [],
      reviewEntries: [],
    }));
    mocks.listWins.mockResolvedValue({ provider: "supabase", winRecords: [] });
    mocks.listOverrides.mockResolvedValue({
      provider: "supabase",
      overrideRecords: [],
    });
    mocks.listDurations.mockResolvedValue({
      provider: "supabase",
      durationProfiles: [],
    });
    mocks.listSuggestions.mockResolvedValue({
      provider: "supabase",
      suggestionRecords: [],
    });
  });

  afterEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    await clearPendingWrites();
    vi.clearAllMocks();
  });

  it("control: a confirmed account transition is visible after remount", async () => {
    storedTask = accountTask("backlog");
    const view = mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("backlog");

    fireEvent.click(
      screen.getByTestId(`review-sheet-carry-forward-${TASK_ID}`),
    );
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    storedTask = accountTask("active");
    await act(async () => {
      finishAccountWrite({
        data: { task: storedTask, blocks: [] },
        error: null,
      });
    });

    view.unmount();
    window.sessionStorage.clear();
    mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
  });

  it.each([
    {
      initial: "backlog" as const,
      action: "carry-forward",
      optimistic: "active",
      success: "Carried forward",
    },
    {
      initial: "active" as const,
      action: "defer",
      optimistic: "backlog",
      success: "Put off for later",
    },
  ])(
    "does not claim $action reached the account when its write fails, including after remount",
    async ({ initial, action, optimistic, success }) => {
      storedTask = accountTask(initial);
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("task-status")).toHaveTextContent(initial),
      );
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );

      fireEvent.click(screen.getByTestId(`review-sheet-${action}-${TASK_ID}`));
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("apply_task_review_transition", {
          p_task_id: TASK_ID,
          p_target_status: optimistic,
        }),
      );
      const toastBeforeAccountAnswer = toast.mock.calls.map(
        ([message]) => message,
      );

      // From here on the account is modelled: any further transition call
      // really changes the stored row. So a silent retry or replay of the
      // refused choice would show up in `storedTask` below.
      rpc.mockImplementation(
        async (
          _name: string,
          args: { p_target_status: "active" | "backlog" },
        ) => {
          storedTask = accountTask(args.p_target_status);
          return { data: { task: storedTask, blocks: [] }, error: null };
        },
      );
      await act(async () => {
        finishAccountWrite({
          data: null,
          error: { message: "Forced account refusal" },
        });
      });
      expect(toast).toHaveBeenCalledWith(
        "Could not save your choice to your account. Try again.",
      );
      // The refused choice is taken back off the screen at once: the row
      // shows what the account holds, not what was asked for.
      expect(screen.getByTestId("task-status")).toHaveTextContent(initial);
      // Nothing is left only on this device, so the banner must not say so.
      expect(screen.getByTestId("account-message").textContent).not.toContain(
        SAVED_ON_THIS_DEVICE_SHORT,
      );

      view.unmount();
      // A fresh document reads the account, not the optimistic tab copy.
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent(initial);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(storedTask.status).toBe(initial);
      expect(toastBeforeAccountAnswer).not.toContain(success);
      expect(toast).not.toHaveBeenCalledWith(success);
    },
  );

  it.each([
    { action: "defer", label: "put off" },
    { action: "carry-forward", label: "carried forward" },
  ] as const)(
    "a stuck task's Google event refusal ($action) rolls back and names the real recovery",
    async ({ action, label }) => {
      storedTask = accountTask("blocked");
      storedBlocks = [googleBackedBlock()];
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      const row = screen.getByTestId(`review-sheet-decision-${TASK_ID}`);
      expect(row).toHaveTextContent("got stuck");
      // The recovery is offered on the row itself, before any refusal.
      expect(
        screen.getByTestId(`review-sheet-cancel-google-${TASK_ID}`),
      ).toBeVisible();

      // #1091 calendar C2: the screen already knows this block is on Google
      // Calendar, so the choice is refused up front and never sent to the
      // account. A refusal the screen could not foresee is still mapped to
      // "Not <label>. … Cancel that event first" (taskReviewRefusal.test.ts).
      fireEvent.click(screen.getByTestId(`review-sheet-${action}-${TASK_ID}`));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledExactlyOnceWith(
          GOOGLE_BACKED_BLOCK_CHANGE_REFUSED,
        ),
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(GOOGLE_BACKED_BLOCK_CHANGE_REFUSED).not.toMatch(/try again/i);
      void label;
      // Rolled back: the task and its block read as the account holds them.
      expect(screen.getByTestId("task-status")).toHaveTextContent("blocked");
      expect(screen.getByTestId("block-status")).toHaveTextContent("scheduled");
      expect(screen.getByTestId("account-status")).not.toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("account-message").textContent).not.toContain(
        SAVED_ON_THIS_DEVICE_SHORT,
      );
      expect(storedTask.status).toBe("blocked");
      expect(
        screen.getByTestId(`review-sheet-cancel-google-${TASK_ID}`),
      ).toBeVisible();
    },
  );

  // #1089 follow-up: Drop is settled and rolled back exactly like put off
  // and carry forward. The Google refusal here is one the screen could not
  // foresee (the block was placed from another device), so it reaches the
  // account and must come back as the real way out, not "try again".
  it.each([
    {
      refusal: "Forced account refusal",
      expected: "Could not save your choice to your account. Try again.",
    },
    {
      refusal: GOOGLE_BLOCK_REFUSAL,
      expected:
        "Not dropped. This task still has an event on your Google Calendar. Cancel that event first, then choose again.",
    },
  ])(
    "rolls a refused drop back and does not claim it ($refusal)",
    async ({ refusal, expected }) => {
      storedTask = accountTask("active");
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent("active");

      fireEvent.click(screen.getByTestId(`review-sheet-drop-${TASK_ID}`));
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("apply_task_review_transition", {
          p_task_id: TASK_ID,
          p_target_status: "dropped",
        }),
      );
      // Optimistic until the account answers, and no "Dropped" yet.
      expect(screen.getByTestId("task-status")).toHaveTextContent("dropped");
      expect(toast).not.toHaveBeenCalled();

      await act(async () => {
        finishAccountWrite({ data: null, error: { message: refusal } });
      });

      await waitFor(() => expect(toast).toHaveBeenCalledWith(expected));
      expect(toast).not.toHaveBeenCalledWith("Dropped");
      // Rolled back to what the account holds.
      expect(screen.getByTestId("task-status")).toHaveTextContent("active");
      expect(screen.getByTestId("account-message").textContent).not.toContain(
        SAVED_ON_THIS_DEVICE_SHORT,
      );

      view.unmount();
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent("active");
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("says Dropped only after the account confirms the drop", async () => {
    storedTask = accountTask("active");
    mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    fireEvent.click(screen.getByTestId(`review-sheet-drop-${TASK_ID}`));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(toast).not.toHaveBeenCalled();
    storedTask = { ...accountTask("active"), status: "dropped" };
    await act(async () => {
      finishAccountWrite({
        data: { task: storedTask, blocks: [] },
        error: null,
      });
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Dropped"));
  });

  // #1091 follow-up: "put off" at the end of a focus session. The end-session
  // policy refuses it first (endSessionPolicy.test.ts); this is the
  // WorkflowContext backstop for any other caller.
  it("refuses a session put-off for a Google-backed task and changes nothing", async () => {
    storedTask = accountTask("blocked");
    storedBlocks = [googleBackedBlock()];
    mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    const before = workflow.state;
    let result: string | undefined;
    await act(async () => {
      result = await workflow.deferTaskWithSession(TASK_ID, 25, null);
    });
    expect(result).toBe("failure");
    expect(workflow.state).toBe(before);
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByTestId("task-status")).toHaveTextContent("blocked");
    expect(screen.getByTestId("block-status")).toHaveTextContent("scheduled");
  });

  it("cancelling the stuck task's Google event clears the way to put it off", async () => {
    storedTask = accountTask("blocked");
    storedBlocks = [googleBackedBlock()];
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: "synthetic-token" } },
      error: null,
    }));
    (client as { auth: Record<string, unknown> }).auth.getSession = getSession;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/google-calendar/cancel-event");
      storedBlocks = [googleBackedBlock("cancelled")];
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      fireEvent.click(
        screen.getByTestId(`review-sheet-cancel-google-${TASK_ID}`),
      );
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          "Google Calendar event cancelled. You can put this task off or carry it forward now.",
        ),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(JSON.parse(String(init.body))).toEqual({
        calendar_block_id: BLOCK_ID,
        approved: true,
      });
      await waitFor(() =>
        expect(screen.getByTestId("block-status")).toHaveTextContent(
          "cancelled",
        ),
      );
      expect(
        screen.queryByTestId(`review-sheet-cancel-google-${TASK_ID}`),
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    {
      action: "carry-forward",
      initial: "backlog",
      target: "active",
      success: "Carried forward",
    },
    {
      action: "defer",
      initial: "active",
      target: "backlog",
      success: "Put off for later",
    },
  ] as const)(
    "waits for $action account confirmation and reloads the confirmed task",
    async ({ action, initial, target, success }) => {
      storedTask = accountTask(initial);
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      fireEvent.click(
        screen.getByTestId("review-sheet-" + action + "-" + TASK_ID),
      );
      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("task-status")).toHaveTextContent(target);
      expect(storedTask.status).toBe(initial);
      expect(toast).not.toHaveBeenCalled();
      storedTask = accountTask(target);
      await act(async () =>
        finishAccountWrite({
          data: { task: storedTask, blocks: [] },
          error: null,
        }),
      );
      expect(toast).toHaveBeenCalledWith(success);
      view.unmount();
      window.sessionStorage.clear();
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent(target);
      expect(
        workflow.state.tasks.find((task) => task.id === TASK_ID)?.title,
      ).toBe("Synthetic review task");
    },
  );

  it.each([
    { action: "carry-forward", initial: "backlog", target: "active" },
    { action: "defer", initial: "active", target: "backlog" },
  ] as const)(
    "reports a confirmed $action write separately from a failed readback",
    async ({ action, initial, target }) => {
      storedTask = accountTask(initial);
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      fireEvent.click(
        screen.getByTestId("review-sheet-" + action + "-" + TASK_ID),
      );
      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      expect(toast).not.toHaveBeenCalled();
      mocks.listExecution.mockRejectedValueOnce(
        new Error("Synthetic private read failure"),
      );
      storedTask = accountTask(target);
      await act(async () =>
        finishAccountWrite({
          data: { task: storedTask, blocks: [] },
          error: null,
        }),
      );
      expect(toast).toHaveBeenCalledWith(
        "Saved to your account. The latest view could not load. Try refreshing.",
      );
      expect(toast).not.toHaveBeenCalledWith(
        "Could not save your choice to your account. Try again.",
      );
      expect(screen.getByTestId("account-status")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("account-message").textContent).not.toContain(
        "Synthetic private",
      );
      view.unmount();
      window.sessionStorage.clear();
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent(target);
    },
  );

  it.each(["carryForwardTask", "deferTask"] as const)(
    "returns unchanged for %s when the task is absent",
    async (action) => {
      storedTask = accountTask("backlog");
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      const before = workflow.state;
      await act(async () =>
        expect(await workflow[action]("missing-task")).toBe("unchanged"),
      );
      expect(workflow.state).toBe(before);
      expect(rpc).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    },
  );

  it.each([
    { action: "carry-forward", hasClient: false },
    { action: "defer", hasClient: false },
    { action: "carry-forward", hasClient: true },
    { action: "defer", hasClient: true },
  ])(
    "reports $action locally without an account receipt (client: $hasClient)",
    async ({ action, hasClient }) => {
      mocks.createClient.mockReturnValue(null);
      const state = backlogLatestDraft(
        captureWorkflow(workflowSeed(), "Synthetic local review task"),
      );
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const taskId = state.tasks[0]!.id;
      mountReview();
      await waitFor(() =>
        expect(
          screen.getByTestId("review-sheet-" + action + "-" + taskId),
        ).toBeVisible(),
      );
      if (hasClient) mocks.createClient.mockReturnValue(client);
      fireEvent.click(
        screen.getByTestId("review-sheet-" + action + "-" + taskId),
      );
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          `${action === "defer" ? "Put off for later" : "Carried forward"} — ${SAVED_ON_THIS_DEVICE_SHORT}`,
        ),
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(
        workflow.state.tasks.find((task) => task.id === taskId)?.title,
      ).toBe("Synthetic local review task");
    },
  );

  function afterEarlierTriageRefusal(state = workflowSeed()) {
    for (let index = 0; index < 3; index += 1) {
      state = acceptLatestDraft(
        captureWorkflow(state, "Synthetic active task " + index),
      );
    }
    state = acceptLatestDraft(
      captureWorkflow(state, "Synthetic earlier refused draft"),
    );
    expect(state.wipRefusal?.activation_path).toBe("triage_accept_to_today");
    expect(state.wipRefusal?.slot_holders).toHaveLength(3);
    return state;
  }

  it("a stale triage refusal does not block a confirmed carry-forward account write", async () => {
    storedTask = accountTask("backlog");
    const state = afterEarlierTriageRefusal();
    window.sessionStorage.setItem(
      accountSnapshotKey(`account:${USER_ID}`),
      JSON.stringify(state),
    );
    const view = mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);
    expect(screen.getByTestId("task-status")).toHaveTextContent("backlog");

    fireEvent.click(
      screen.getByTestId("review-sheet-carry-forward-" + TASK_ID),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("apply_task_review_transition", {
        p_task_id: TASK_ID,
        p_target_status: "active",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(storedTask.status).toBe("backlog");
    expect(toast).not.toHaveBeenCalled();
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);

    storedTask = accountTask("active");
    await act(async () => {
      finishAccountWrite({
        data: { task: storedTask, blocks: [] },
        error: null,
      });
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith("Carried forward");
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);
    view.unmount();
    window.sessionStorage.clear();
    mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
    expect(
      workflow.state.tasks.find((task) => task.id === TASK_ID)?.title,
    ).toBe(storedTask.title);
  });

  it("a stale triage refusal reports the actual local-only carry-forward result", async () => {
    mocks.createClient.mockReturnValue(null);
    const initial = backlogLatestDraft(
      captureWorkflow(workflowSeed(), "Synthetic local review task"),
    );
    const task = initial.tasks[0]!;
    const state = afterEarlierTriageRefusal(initial);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    mountReview();
    await waitFor(() =>
      expect(
        screen.getByTestId("review-sheet-carry-forward-" + task.id),
      ).toBeVisible(),
    );
    expect(
      workflow.state.tasks.find((item) => item.id === task.id)?.status,
    ).toBe("backlog");
    fireEvent.click(
      screen.getByTestId("review-sheet-carry-forward-" + task.id),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledExactlyOnceWith(
        `Carried forward — ${SAVED_ON_THIS_DEVICE_SHORT}`,
      ),
    );
    expect(
      workflow.state.tasks.find((item) => item.id === task.id)?.status,
    ).toBe("active");
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);
    expect(rpc).not.toHaveBeenCalled();
  });
});
