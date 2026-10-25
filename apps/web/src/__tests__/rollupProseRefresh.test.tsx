import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCloseMomentRollups } from "@/app/components/moments/useCloseMomentRollups";
import { createInitialWorkflowState } from "@/lib/workflow";
import type {
  CloseVM,
  RollupDraftVM,
} from "@/app/components/moments/momentsViewModel";
import type { ApprovedRollupSummary } from "@/lib/review/approvedRollups";
import type { RequestRollupProseResult } from "@/lib/ai/rollupProseClient";

const { requestProse, getSession } = vi.hoisted(() => ({
  requestProse: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/ai/rollupProseClient", () => ({
  requestRollupProse: requestProse,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession },
  }),
}));

const now = new Date("2026-09-16T14:00:00Z");
const draft: RollupDraftVM = {
  areaId: "area-work",
  areaLabel: "Work",
  periodStart: "2026-09-10",
  periodEnd: "2026-09-16",
  periodLabel: "This week",
  summary: { highlights: ["Shipped work"], misses: [], counts: { wins: 1 } },
};
const enhanced: RequestRollupProseResult = {
  enhanced: true,
  summary: { ...draft.summary, highlights: ["You shipped the work."] },
};

function mountRollups(period: "week" | "month" = "week") {
  const approvedRows: ApprovedRollupSummary[] =
    period === "month"
      ? [
          {
            id: "rollup-one",
            user_id: "account-a",
            area_id: draft.areaId,
            period_type: "week",
            period_start: draft.periodStart,
            period_end: draft.periodEnd,
            summary: draft.summary,
            created_at: now.toISOString(),
          },
        ]
      : [];
  const stableOptions = {
    now,
    showToast: vi.fn(),
    confirmWin: async () => "device-only" as const,
    confirmRollup: async () => {},
    listApprovedRollups: async () => approvedRows,
    areasReadbackSettled: true,
  };
  function props(rollupDrafts = period === "week" ? [draft] : []) {
    const closeVM: CloseVM = {
      completedToday: 1,
      missedToday: 0,
      carryForward: [],
      tomorrowFirstMove: null,
      winCandidates: [],
      loggedWinsToday: [],
      rollupDrafts,
      dayClose: null,
    };
    return {
      state: {
        ...createInitialWorkflowState(),
        areas: [
          {
            id: draft.areaId,
            user_id: "account-a",
            name: "Work",
            color: "#2563eb",
            created_at: now.toISOString(),
          },
        ],
      },
      closeVM,
      journalledRollupKeys: [] as string[],
      workflowAreaIdByPersistedId: {},
    };
  }
  const hook = renderHook(
    (value) => useCloseMomentRollups({ ...stableOptions, ...value }),
    { initialProps: props() },
  );
  return {
    ...hook,
    refresh: (rollupDrafts?: RollupDraftVM[]) =>
      hook.rerender(props(rollupDrafts)),
    displayed: () =>
      period === "week"
        ? hook.result.current.displayedRollups
        : hook.result.current.displayedMonthlyRollups,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  requestProse.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
});

describe("rollup prose survives equivalent account projection refreshes", () => {
  it.each(["week", "month"] as const)(
    "retains the pending %s response across equivalent refreshes",
    async (period) => {
      let resolve!: (value: RequestRollupProseResult) => void;
      requestProse.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const hook = mountRollups(period);
      await waitFor(() => expect(requestProse).toHaveBeenCalledTimes(1));
      hook.refresh();
      hook.refresh();
      await act(async () => resolve(enhanced));
      await waitFor(() => expect(hook.displayed()[0]?.enhanced).toBe(true));
      expect(hook.displayed()[0]?.summary.highlights).toEqual(
        enhanced.summary.highlights,
      );
      expect(requestProse).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "does not apply prose to a changed draft (resolved first: %s)",
    async (resolvedFirst) => {
      let resolve!: (value: RequestRollupProseResult) => void;
      requestProse.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const hook = mountRollups();
      await waitFor(() => expect(requestProse).toHaveBeenCalledTimes(1));
      if (resolvedFirst) await act(async () => resolve(enhanced));
      const changed = {
        ...draft,
        summary: { ...draft.summary, highlights: ["Different work"] },
      };
      hook.refresh([changed]);
      if (!resolvedFirst) await act(async () => resolve(enhanced));
      expect(hook.displayed()[0]?.summary.highlights).toEqual([
        "Different work",
      ]);
      expect(hook.displayed()[0]?.enhanced).toBe(false);
      expect(requestProse).toHaveBeenCalledTimes(1);
    },
  );

  it("holds a response while the draft is absent and reuses it when the same draft returns", async () => {
    let resolve!: (value: RequestRollupProseResult) => void;
    requestProse.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const hook = mountRollups();
    await waitFor(() => expect(requestProse).toHaveBeenCalledTimes(1));
    hook.refresh([]);
    await act(async () => resolve(enhanced));
    expect(hook.displayed()).toEqual([]);
    hook.refresh([draft]);
    await waitFor(() => expect(hook.displayed()[0]?.enhanced).toBe(true));
    expect(requestProse).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a fallback request on equivalent refreshes", async () => {
    requestProse.mockResolvedValue({ enhanced: false, summary: draft.summary });
    const hook = mountRollups();
    await waitFor(() => expect(requestProse).toHaveBeenCalledTimes(1));
    hook.refresh();
    await act(async () => {});
    expect(hook.displayed()[0]?.enhanced).toBe(false);
    expect(requestProse).toHaveBeenCalledTimes(1);
  });

  it("does not start a request after unmount while session lookup is pending", async () => {
    let resolve!: (value: { data: { session: null } }) => void;
    getSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const hook = mountRollups();
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));
    hook.unmount();
    await act(async () => resolve({ data: { session: null } }));
    expect(requestProse).not.toHaveBeenCalled();
  });

  it("does not start queued areas after unmount", async () => {
    let resolve!: (value: RequestRollupProseResult) => void;
    requestProse.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const hook = mountRollups();
    hook.refresh([draft, { ...draft, areaId: "area-home", areaLabel: "Home" }]);
    await waitFor(() => expect(requestProse).toHaveBeenCalledTimes(1));
    hook.unmount();
    await act(async () => resolve(enhanced));
    expect(requestProse).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});
