// #737-A slice 2: the polyfill IS the subject here — these tests assert that
// a confirmed win and a saved review reach IndexedDB, so a regression to a
// memory-only path fails CI.
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import { useEffect, useRef, useState } from "react";
import { useCloseMomentRollups } from "@/app/components/moments/useCloseMomentRollups";

/**
 * REGRESSION GUARD — wins and reviews must stay device-durable (#737-A S2).
 *
 * ## What broke, and why a guard is the right shape of fix
 *
 * Before this slice `confirmWin` opened with `if (!client) return;`. Signed
 * out or in mock mode a confirmed win was written NOWHERE — not to the
 * reducer, not to `sessionStorage`, not to a device store — while the UI
 * toasted "Win logged" and the sync banner said the win was "saved on this
 * device". A saved review was only marginally better: it reached the reducer,
 * whose `sessionStorage` mirror is scoped to ONE TAB, so closing the tab lost
 * it with no warning.
 *
 * Both failures are invisible from the outside. The screen looks identical
 * whether the write landed or evaporated, which is exactly why a unit test on
 * the dispatcher is not enough on its own: someone could reintroduce the early
 * return in `WorkflowContext` and every dispatcher test would stay green.
 *
 * ## What these tests pin
 *
 * They drive the REAL provider (mock mode, no Supabase client — the state the
 * old code lost work in) and then read the pending-writes journal directly.
 * IndexedDB survives tab close, so a write present here is a write a new tab
 * can find. If either path regresses to memory-only, the journal is empty and
 * these fail.
 *
 * Deliberately NOT asserted here: that the write reaches the account. That is
 * the dispatcher's and the data layer's job, covered in
 * `lib/durability/durableWrites.test.ts` and `lib/data/workflow.test.ts`.
 */

const navigationMock = vi.hoisted(() => ({
  pathname: "/today",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

interface HarnessResult {
  win: string | null;
  review: string | null;
}

/**
 * Drives the two real context actions once, on mount, and renders what they
 * resolved with. Going through `useWorkflow` (rather than calling the modules
 * directly) is the point — it is the path a regression would break.
 */
function DurabilityHarness({ taskId }: { taskId: string }) {
  const { confirmWin, saveReview } = useWorkflow();
  const [result, setResult] = useState<HarnessResult>({
    win: null,
    review: null,
  });
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    void (async () => {
      const win = await confirmWin({
        taskId,
        title: "Shipped the durable-writes slice",
      });
      const review = await saveReview();
      setResult({ win, review });
    })();
  }, [confirmWin, saveReview, taskId]);

  return (
    <div>
      <span data-testid="win-result">{result.win ?? ""}</span>
      <span data-testid="review-result">{result.review ?? ""}</span>
    </div>
  );
}

/**
 * Drives the REAL Close-moment hook, not a re-implementation of it, so the
 * optimistic-add-then-roll-back logic under test is the shipped one.
 */
function CloseMomentWinHarness() {
  const { state, confirmWin, confirmRollup, listApprovedRollups } =
    useWorkflow();
  const [toast, setToast] = useState("");
  const hasRun = useRef(false);

  const { handleConfirmWin, confirmedWins } = useCloseMomentRollups({
    state,
    closeVM: {
      completedToday: 1,
      missedToday: 0,
      carryForward: [],
      tomorrowFirstMove: null,
      loggedWinsToday: [],
      winCandidates: [
        {
          taskId: "task-guard-1",
          title: "Shipped the durable-writes slice",
          areaLabel: "Work",
        },
      ],
      rollupDrafts: [],
      // Audit P0#4: this harness is about the WIN write path, which is
      // unaffected by whether the day is closed. An open day keeps it
      // describing the same thing it always did.
      dayClose: null,
    },
    now: new Date("2026-05-08T18:00:00.000Z"),
    showToast: (message: string) => setToast(message),
    confirmWin,
    confirmRollup,
    listApprovedRollups,
  });

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    handleConfirmWin("task-guard-1", "Shipped the durable-writes slice");
  }, [handleConfirmWin]);

  return (
    <div>
      <span data-testid="toast">{toast}</span>
      <span data-testid="confirmed-count">{confirmedWins.length}</span>
    </div>
  );
}

beforeEach(async () => {
  // Mock mode: no Supabase client. This is precisely the configuration the old
  // code silently dropped wins in.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  await clearPendingWrites();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearPendingWrites();
});

describe("#737-A guard: wins and reviews are device-durable", () => {
  it("journals a confirmed win to IndexedDB even with no account reachable", async () => {
    render(
      <WorkflowProvider>
        <DurabilityHarness taskId="task-guard-1" />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("win-result")).toHaveTextContent("device-only"),
    );

    const journalled = await listPendingWrites("win");
    expect(journalled).toHaveLength(1);
    expect(journalled[0]!.payload).toMatchObject({
      workflow_task_id: "task-guard-1",
      title: "Shipped the durable-writes slice",
    });
    // The idempotency key the account write will carry must exist from the
    // moment the win is journalled, not be minted at send time.
    expect(journalled[0]!.client_write_id).toEqual(expect.any(String));
    expect(journalled[0]!.client_write_id.length).toBeGreaterThan(0);
  });

  it("journals a saved review to IndexedDB and reports local-only, not persisted", async () => {
    render(
      <WorkflowProvider>
        <DurabilityHarness taskId="task-guard-1" />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("review-result")).toHaveTextContent(
        "local-only",
      ),
    );

    const journalled = await listPendingWrites("review");
    expect(journalled).toHaveLength(1);
    expect(journalled[0]!.payload).toMatchObject({ review_type: "daily" });
    // Never "persisted" with no account: the word may only be used once the
    // account genuinely has the row.
    expect(screen.getByTestId("review-result")).not.toHaveTextContent(
      "persisted",
    );
  });

  it("reports failure and rolls the win back when the device refuses to store it", async () => {
    // The one state where nothing holds the win: a browser with no usable
    // IndexedDB (private mode, a blocking extension, a storage quota). This
    // is the branch the truth map rests two rows on, so it is tested rather
    // than reasoned about. Removing the global is the honest simulation --
    // it is exactly what `hasIndexedDb()` checks.
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global to simulate a browser
    // that does not provide it.
    delete globalThis.indexedDB;

    try {
      render(
        <WorkflowProvider>
          <DurabilityHarness taskId="task-guard-1" />
        </WorkflowProvider>,
      );

      await waitFor(() =>
        expect(screen.getByTestId("win-result")).toHaveTextContent("failure"),
      );
      // Never the comforting answer. Both other outcomes claim the win is
      // somewhere; it is not.
      expect(screen.getByTestId("win-result")).not.toHaveTextContent(
        "device-only",
      );

      await waitFor(() =>
        expect(screen.getByTestId("review-result")).toHaveTextContent(
          "failure",
        ),
      );
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });

  it("takes the confirmed win back out of the list when the device refuses it", async () => {
    // The Close moment adds the win optimistically so the moment does not
    // stutter. On the one outcome where nothing holds the win, that optimistic
    // row must not be left standing beside a message saying it failed.
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error see above.
    delete globalThis.indexedDB;

    try {
      render(
        <WorkflowProvider>
          <CloseMomentWinHarness />
        </WorkflowProvider>,
      );

      await waitFor(() =>
        expect(screen.getByTestId("toast")).toHaveTextContent(
          "Couldn't log the win — it isn't saved yet",
        ),
      );
      expect(screen.getByTestId("confirmed-count")).toHaveTextContent("0");
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });

  it("keeps the journalled win readable after the provider unmounts", async () => {
    // Standing in for a tab close: React state and the sessionStorage mirror
    // both die with the tree, IndexedDB does not.
    const view = render(
      <WorkflowProvider>
        <DurabilityHarness taskId="task-guard-1" />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("win-result")).toHaveTextContent("device-only"),
    );

    view.unmount();
    window.sessionStorage.clear();

    const survivors = await listPendingWrites("win");
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.payload).toMatchObject({
      title: "Shipped the durable-writes slice",
    });
  });
});
