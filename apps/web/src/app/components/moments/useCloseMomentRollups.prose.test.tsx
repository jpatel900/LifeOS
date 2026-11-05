import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialWorkflowState } from "@/lib/workflow";
import type { RequestRollupProseResult } from "@/lib/ai/rollupProseClient";
import { useCloseMomentRollups } from "./useCloseMomentRollups";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestProse: vi.fn(),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: mocks.getSession },
  }),
}));
vi.mock("@/lib/ai/rollupProseClient", () => ({
  requestRollupProse: mocks.requestProse,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function options(periodType: "week" | "month") {
  const summary = {
    highlights: ["Finished a task"],
    misses: [],
    counts: { completed: 1 },
  };
  const draft = {
    areaId: "area-test",
    areaLabel: "Work",
    periodStart: "2026-07-20",
    periodEnd: "2026-07-26",
    periodLabel: "July 20–26",
    summary,
  };
  return {
    state: createInitialWorkflowState(),
    closeVM: {
      completedToday: 1,
      missedToday: 0,
      carryForward: [],
      tomorrowFirstMove: null,
      loggedWinsToday: [],
      winCandidates: [],
      dayClose: null,
      rollupDrafts: periodType === "week" ? [draft] : [],
    },
    now: new Date("2026-07-29T20:30:00Z"),
    showToast: vi.fn(),
    confirmWin: async () => "device-only" as const,
    confirmRollup: async () => {},
    listApprovedRollups: async () =>
      periodType === "week"
        ? []
        : [
            {
              id: "weekly-row",
              user_id: "test-user",
              area_id: "area-test",
              period_type: "week" as const,
              period_start: draft.periodStart,
              period_end: draft.periodEnd,
              summary,
              created_at: "2026-07-26T20:00:00Z",
            },
          ],
    journalledRollupKeys: [] as string[],
    workflowAreaIdByPersistedId: {},
    areasReadbackSettled: true,
  } satisfies Parameters<typeof useCloseMomentRollups>[0];
}

function refreshed(input: ReturnType<typeof options>) {
  return {
    ...input,
    closeVM: {
      ...input.closeVM,
      rollupDrafts: [...input.closeVM.rollupDrafts],
    },
    journalledRollupKeys: [],
  };
}

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  mocks.requestProse.mockReset();
});

describe.each(["week", "month"] as const)(
  "%s rollup prose lifetime",
  (period) => {
    const drafts = (value: ReturnType<typeof useCloseMomentRollups>) =>
      period === "week"
        ? value.displayedRollups
        : value.displayedMonthlyRollups;
    const dismiss = (value: ReturnType<typeof useCloseMomentRollups>) =>
      (period === "week"
        ? value.handleDismissRollup
        : value.handleDismissMonthlyRollup)("area-test");

    it("keeps the pending response through an equivalent projection refresh", async () => {
      const pending = deferred<RequestRollupProseResult>();
      mocks.requestProse.mockReturnValue(pending.promise);
      const input = options(period);
      const { result, rerender } = renderHook(useCloseMomentRollups, {
        initialProps: input,
      });
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
      rerender(refreshed(input));
      await act(async () =>
        pending.resolve({
          enhanced: true,
          summary: {
            ...mocks.requestProse.mock.calls[0][0].draft,
            highlights: ["AI-polished task"],
          },
        }),
      );
      expect(drafts(result.current)[0]).toMatchObject({
        enhanced: true,
        summary: { highlights: ["AI-polished task"] },
      });
      expect(mocks.requestProse).toHaveBeenCalledTimes(1);
    });

    it("continues the same request when session lookup spans a projection refresh", async () => {
      const session = deferred<{ data: { session: null } }>();
      mocks.getSession.mockReturnValue(session.promise);
      mocks.requestProse.mockImplementation(async (input) => ({
        enhanced: true,
        summary: input.draft,
      }));
      const input = options(period);
      const { result, rerender } = renderHook(useCloseMomentRollups, {
        initialProps: input,
      });
      await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));
      rerender(refreshed(input));
      await act(async () => session.resolve({ data: { session: null } }));
      expect(mocks.requestProse).toHaveBeenCalledTimes(1);
      expect(drafts(result.current)[0]?.enhanced).toBe(true);
    });

    it("does not restore a dismissed draft when its response arrives", async () => {
      const pending = deferred<RequestRollupProseResult>();
      mocks.requestProse.mockReturnValue(pending.promise);
      const { result } = renderHook(useCloseMomentRollups, {
        initialProps: options(period),
      });
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
      act(() => dismiss(result.current));
      await act(async () =>
        pending.resolve({
          enhanced: true,
          summary: mocks.requestProse.mock.calls[0][0].draft,
        }),
      );
      expect(drafts(result.current)).toEqual([]);
      expect(mocks.requestProse).toHaveBeenCalledTimes(1);
    });

    it("does not start prose after unmount during session lookup", async () => {
      const session = deferred<{ data: { session: null } }>();
      mocks.getSession.mockReturnValue(session.promise);
      const { unmount } = renderHook(useCloseMomentRollups, {
        initialProps: options(period),
      });
      await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));
      unmount();
      await act(async () => session.resolve({ data: { session: null } }));
      expect(mocks.requestProse).not.toHaveBeenCalled();
    });

    it("keeps a deterministic fallback without repeated requests", async () => {
      mocks.requestProse.mockImplementation(async (input) => ({
        enhanced: false,
        summary: input.draft,
      }));
      const input = options(period);
      const { result, rerender } = renderHook(useCloseMomentRollups, {
        initialProps: input,
      });
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
      rerender(refreshed(input));
      expect(drafts(result.current)[0]?.enhanced).toBe(false);
      expect(mocks.requestProse).toHaveBeenCalledTimes(1);
    });

    it("ignores prose that resolves after unmount", async () => {
      const pending = deferred<RequestRollupProseResult>();
      mocks.requestProse.mockReturnValue(pending.promise);
      const { result, unmount } = renderHook(useCloseMomentRollups, {
        initialProps: options(period),
      });
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
      const before = result.current;
      unmount();
      await act(async () =>
        pending.resolve({
          enhanced: true,
          summary: mocks.requestProse.mock.calls[0][0].draft,
        }),
      );
      expect(result.current).toBe(before);
      expect(drafts(result.current)[0]?.enhanced).toBe(false);
    });

    it("keeps deterministic prose when session lookup rejects", async () => {
      mocks.getSession.mockRejectedValue(new Error("Session unavailable"));
      const { result } = renderHook(useCloseMomentRollups, {
        initialProps: options(period),
      });
      await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));
      expect(drafts(result.current)[0]?.enhanced).toBe(false);
      expect(mocks.requestProse).not.toHaveBeenCalled();
    });
  },
);

it("continues later areas when the first draft disappears during session lookup", async () => {
  const session = deferred<{ data: { session: null } }>();
  mocks.getSession.mockReturnValue(session.promise);
  mocks.requestProse.mockImplementation(async (input) => ({
    enhanced: true,
    summary: input.draft,
  }));
  const input = options("week");
  input.closeVM.rollupDrafts.push({
    ...input.closeVM.rollupDrafts[0],
    areaId: "area-second",
  });
  const { result, rerender } = renderHook(useCloseMomentRollups, {
    initialProps: input,
  });
  await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));
  rerender({
    ...input,
    closeVM: {
      ...input.closeVM,
      rollupDrafts: input.closeVM.rollupDrafts.slice(1),
    },
  });
  await act(async () => session.resolve({ data: { session: null } }));
  expect(result.current.displayedRollups).toMatchObject([
    { areaId: "area-second", enhanced: true },
  ]);
  expect(mocks.requestProse).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "rejects stale prose when weekly draft changes (already resolved: %s)",
  async (resolved) => {
    const pending = deferred<RequestRollupProseResult>();
    mocks.requestProse.mockReturnValue(pending.promise);
    const input = options("week");
    const { result, rerender } = renderHook(useCloseMomentRollups, {
      initialProps: input,
    });
    await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
    const response = {
      enhanced: true,
      summary: mocks.requestProse.mock.calls[0][0].draft,
    };
    if (resolved) await act(async () => pending.resolve(response));
    rerender({
      ...input,
      closeVM: {
        ...input.closeVM,
        rollupDrafts: input.closeVM.rollupDrafts.map((draft) => ({
          ...draft,
          summary: { ...draft.summary, highlights: ["A different task"] },
        })),
      },
    });
    if (!resolved) await act(async () => pending.resolve(response));
    expect(result.current.displayedRollups[0]).toMatchObject({
      enhanced: false,
      summary: { highlights: ["A different task"] },
    });
    expect(mocks.requestProse).toHaveBeenCalledTimes(1);
  },
);
