import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestRollupProseResult } from "@/lib/ai/rollupProseClient";
import { useRollupProseSummaries } from "./useRollupProseSummaries";
import type { RollupDraftVM } from "./momentsViewModel";

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

function draft(areaId: string): RollupDraftVM {
  return {
    areaId,
    areaLabel: areaId,
    periodStart: "2026-07-20",
    periodEnd: "2026-07-26",
    periodLabel: "July 20–26",
    summary: {
      highlights: [`Private summary for ${areaId}`],
      misses: [],
      counts: { completed: 1 },
    },
  };
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.requestProse.mockReset();
});

describe.each(["week", "month"] as const)("%s queued prose auth", (period) => {
  it("handles a later batch's session rejection while the first request is pending", async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "test-token-a" } },
      })
      .mockRejectedValue(new Error("Session unavailable"));
    const first = deferred<RequestRollupProseResult>();
    mocks.requestProse.mockReturnValue(first.promise);
    const firstDraft = draft("first");
    const { rerender } = renderHook(
      (drafts) => useRollupProseSummaries(drafts, period),
      { initialProps: [firstDraft] },
    );
    await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
    rerender([firstDraft, draft("queued")]);
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
    expect(mocks.requestProse).toHaveBeenCalledTimes(1);
    await act(async () =>
      first.resolve({ enhanced: true, summary: firstDraft.summary }),
    );
    expect(mocks.requestProse).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "keeps queued A drafts on A's token after switching to B (refresh: %s)",
    async (refresh) => {
      let accessToken = "test-token-account-a";
      mocks.getSession.mockImplementation(async () => ({
        data: { session: { access_token: accessToken } },
      }));
      const first = deferred<RequestRollupProseResult>();
      mocks.requestProse
        .mockReturnValueOnce(first.promise)
        .mockImplementation(async (input) => ({
          enhanced: true,
          summary: input.draft,
        }));
      const accountADrafts = [draft("a-first"), draft("a-queued")];
      const { rerender } = renderHook(
        (drafts) => useRollupProseSummaries(drafts, period),
        { initialProps: accountADrafts },
      );
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(1));
      expect(mocks.requestProse.mock.calls[0][1]).toEqual({
        accessToken: "test-token-account-a",
      });

      // Both A drafts remain mounted while authentication changes to B.
      accessToken = "test-token-account-b";
      if (refresh) rerender([...accountADrafts]);
      await act(async () =>
        first.resolve({ enhanced: true, summary: accountADrafts[0].summary }),
      );
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(2));
      expect(mocks.requestProse.mock.calls[1]).toEqual([
        {
          areaLabel: "a-queued",
          periodType: period,
          periodLabel: "July 20–26",
          draft: accountADrafts[1].summary,
        },
        { accessToken: "test-token-account-a" },
      ]);

      // A later batch must capture B's token, not reuse a mount-wide token.
      const accountBDraft = draft("b-new");
      rerender([accountBDraft]);
      await waitFor(() => expect(mocks.requestProse).toHaveBeenCalledTimes(3));
      expect(mocks.requestProse.mock.calls[2][0].draft).toEqual(
        accountBDraft.summary,
      );
      expect(mocks.requestProse.mock.calls[2][1]).toEqual({
        accessToken: "test-token-account-b",
      });
    },
  );
});
