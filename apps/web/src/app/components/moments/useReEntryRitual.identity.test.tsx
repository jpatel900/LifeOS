import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { useReEntryRitual } from "./useReEntryRitual";

const mocks = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  execute: vi.fn(),
  opened: vi.fn(),
  resolved: vi.fn(),
  edited: vi.fn(),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => mocks.client,
}));
vi.mock("@/lib/reEntry/defer", async (original) => ({
  ...(await original<typeof import("@/lib/reEntry/defer")>()),
  executeReEntryDeferrals: mocks.execute,
}));
vi.mock("@/lib/reEntry/returnRecord", () => ({
  recordReturnOpened: mocks.opened,
  recordRecoveryResolution: mocks.resolved,
  recordRecoveryEdit: mocks.edited,
}));
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

const A = "00000000-0000-4000-8000-000000000011";
const B = "00000000-0000-4000-8000-000000000012";
const NOW = new Date("2026-09-29T12:00:00.000Z");
const OLD = "2026-09-25T12:00:00.000Z";
type Listener = (
  event: string,
  session: { user: { id: string } } | null,
) => void;
function authFixture() {
  let user: string | null = A;
  const listeners = new Set<Listener>();
  const getUser = vi.fn(async () => ({
    data: { user: user ? { id: user } : null },
    error: null,
  }));
  const onAuthStateChange = vi.fn((listener: Listener) => {
    listeners.add(listener);
    return {
      data: { subscription: { unsubscribe: () => listeners.delete(listener) } },
    };
  });
  mocks.client = {
    auth: { getUser, onAuthStateChange },
  } as unknown as SupabaseClient;
  return {
    getUser,
    onAuthStateChange,
    listeners,
    emit(next: string | null) {
      user = next;
      for (const listener of listeners)
        listener(
          next ? "SIGNED_IN" : "SIGNED_OUT",
          next ? { user: { id: next } } : null,
        );
    },
  };
}
function accountState(owner: string) {
  const seed = acceptLatestDraft(
    captureWorkflow(workflowSeed(), "Prepare a synthetic draft"),
  );
  return {
    ...seed,
    areas: seed.areas.map((area) => ({ ...area, user_id: owner })),
    tasks: seed.tasks.map((task) => ({
      ...task,
      user_id: owner,
      created_at: OLD,
      updated_at: OLD,
    })),
    captureItems: seed.captureItems.map((item) => ({
      ...item,
      user_id: owner,
      created_at: OLD,
    })),
    taskDrafts: seed.taskDrafts.map((item) => ({ ...item, created_at: OLD })),
    timeBlockProposals: seed.timeBlockProposals.map((item) => ({
      ...item,
      user_id: owner,
      created_at: OLD,
    })),
  };
}
describe("return identity and ready-visit boundaries", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.client = null;
    mocks.execute.mockResolvedValue([]);
  });
  afterEach(() => {
    mocks.client = null;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("continuous open does not become an absence when the clock ticks forward", async () => {
    const state = accountState(A);
    const start = new Date("2026-09-26T12:00:00.000Z");
    const hook = renderHook(({ now }) => useReEntryRitual({ state, now }), {
      initialProps: { now: start },
    });
    expect(hook.result.current.status).toBe("idle");
    hook.rerender({ now: NOW });
    expect(hook.result.current.status).toBe("idle");
    hook.unmount();
    const returned = renderHook(() => useReEntryRitual({ state, now: NOW }));
    await waitFor(() => expect(returned.result.current.status).toBe("ready"));
    expect(returned.result.current.summary?.absenceDays).toBe(3);
  });

  it("disabled readiness does not write an open that hides an eligible return", async () => {
    const state = accountState(A);
    const hook = renderHook(
      ({ enabled }) => useReEntryRitual({ state, now: NOW, enabled }),
      { initialProps: { enabled: false } },
    );
    expect(window.localStorage.length).toBe(0);
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  });

  it("auth listeners fan out and delayed initial lookup cannot overwrite a newer account", async () => {
    const auth = authFixture();
    const providerListener = vi.fn();
    const providerSubscription = auth.onAuthStateChange(providerListener);
    let resolveInitial!: (
      value: Awaited<ReturnType<typeof auth.getUser>>,
    ) => void;
    auth.getUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        }),
    );
    const hook = renderHook(() =>
      useReEntryRitual({ state: accountState(B), now: NOW }),
    );
    expect(window.localStorage.length).toBe(0);
    expect(auth.listeners.size).toBe(2);
    await act(async () => auth.emit(B));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    await act(async () =>
      resolveInitial({ data: { user: { id: A } }, error: null }),
    );
    expect(hook.result.current.checkpoint?.scope).toBe(B);
    expect(providerListener).toHaveBeenCalledOnce();
    hook.unmount();
    expect(auth.listeners.size).toBe(1);
    providerSubscription.data.subscription.unsubscribe();
    expect(auth.listeners.size).toBe(0);
  });

  it("account B with settled but stale account A rows cannot read or write a ritual", async () => {
    const auth = authFixture();
    const hook = renderHook(() =>
      useReEntryRitual({ state: accountState(A), now: NOW }),
    );
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    await act(async () => auth.emit(B));
    expect(hook.result.current.status).toBe("idle");
    expect(hook.result.current.summary).toBeNull();
    expect(hook.result.current.checkpoint).toBeNull();
    expect(
      window.localStorage.getItem(`lifeos.moments.reentry.${B}.unfinished`),
    ).toBeNull();
    expect(
      window.localStorage.getItem(`lifeos.moments.reentry.${B}.lastOpen`),
    ).toBeNull();
    act(() => hook.result.current.complete());
    expect(mocks.resolved).not.toHaveBeenCalled();
    expect(mocks.opened).toHaveBeenCalledTimes(1);
  });

  it("old deferral results cannot land after an A-to-B-to-A session generation change", async () => {
    const auth = authFixture();
    let finish!: (
      value: {
        kind: "task_to_backlog";
        subjectId: string;
        ok: boolean;
        error: null;
      }[],
    ) => void;
    mocks.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const hook = renderHook(() =>
      useReEntryRitual({ state: accountState(A), now: NOW }),
    );
    await waitFor(() => expect(hook.result.current.status).toBe("deferring"));
    await act(async () => {
      auth.emit(null);
      auth.emit(B);
      auth.emit(A);
    });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    await act(async () =>
      finish([
        {
          kind: "task_to_backlog",
          subjectId: "old-task",
          ok: true,
          error: null,
        },
      ]),
    );
    expect(hook.result.current.outcomes).toEqual([]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.opened).toHaveBeenCalledTimes(1);
  });

  it("maps normalized workflow areas back to account UUIDs for edits and resolution", async () => {
    authFixture();
    const state = accountState(A);
    const task = state.tasks[0];
    const areaId = "00000000-0000-4000-8000-000000000101";
    const hook = renderHook(() =>
      useReEntryRitual({
        state,
        now: NOW,
        workflowAreaIdByPersistedId: { [areaId]: task.area_id },
      }),
    );
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    act(() =>
      hook.result.current.editRecovery(task.id, "Open", "Write one line"),
    );
    expect(mocks.edited).toHaveBeenCalledWith(
      mocks.client,
      expect.any(Object),
      task.id,
      "Open",
      "Write one line",
      areaId,
    );
    act(() =>
      hook.result.current.complete({
        decision: "accepted",
        taskId: task.id,
        areaId: task.area_id,
        firstStep: "Write one line",
        edited: true,
      }),
    );
    expect(mocks.resolved).toHaveBeenCalledWith(
      mocks.client,
      expect.any(Object),
      expect.objectContaining({ areaId }),
    );
  });

  it("demo resolution records edited local metadata once without claiming account delivery", async () => {
    const state = accountState(A);
    const hook = renderHook(() => useReEntryRitual({ state, now: NOW }));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    const taskId = state.tasks[0].id;
    act(() =>
      hook.result.current.editRecovery(taskId, "Open", "Write one line"),
    );
    act(() =>
      hook.result.current.complete({
        decision: "accepted",
        taskId,
        firstStep: "Write one line",
        edited: true,
      }),
    );
    act(() => hook.result.current.complete());
    const local = JSON.parse(
      window.localStorage.getItem(
        `lifeos.moments.reentry.${A}.lastResolution`,
      ) ?? "null",
    );
    expect(local).toMatchObject({
      decision: "accepted",
      firstStep: "Write one line",
      edited: true,
      scope: "device_activation",
      accountSaveConfirmed: false,
    });
    expect(mocks.resolved).toHaveBeenCalledTimes(1);
  });
});
