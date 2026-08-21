// #737-A slice 2: the review now goes to the DEVICE JOURNAL (IndexedDB)
// before any account write, so "local-only" is only reachable when the device
// can actually hold it. jsdom ships no IndexedDB, so without this polyfill
// every local-only case below would take the new "the device refused it"
// branch and this file would be testing the wrong state.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewPage from "../app/review/page";
import { TodayMoments } from "../app/components/moments/TodayMoments";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";

/**
 * #588 — report day closure only after persistence resolves.
 *
 * `saveReview` now returns Promise<"persisted" | "local-only" | "failure">
 * and BOTH shells gate their verdict copy on that result:
 * - persisted  -> closure verdict ("Day closed…")
 * - local-only -> truthful local-fallback copy (no unqualified closure claim)
 * - failure    -> recovery copy, never a closure claim
 *
 * These tests are RED against the pre-#588 behavior (both shells toasted an
 * unconditional verdict synchronously, before any persistence result
 * existed, and had no local-only/failure branches at all).
 *
 * Outcome control: only `persistReviewEntry` is overridden, at the
 * persistence-sync seam; everything else in the provider runs for real (in
 * mock mode). Leaving the override null exercises the REAL local-only
 * fallback path (no Supabase client).
 */

const navigationMock = vi.hoisted(() => ({
  pathname: "/review",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

const persistReviewEntryOverride = vi.hoisted(() => ({
  current: null as (() => Promise<"persisted" | "local-only">) | null,
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
        persistReviewEntry: (
          ...opArgs: Parameters<typeof ops.persistReviewEntry>
        ) =>
          persistReviewEntryOverride.current
            ? persistReviewEntryOverride.current()
            : ops.persistReviewEntry(...opArgs),
      };
    },
  };
});

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  // C2-S6 (#687): `/review` is a flag-gated redirect shim now — this file
  // exercises the LEGACY cockpit review screen directly, which only renders
  // under the #590 rollback.
  vi.stubEnv("NEXT_PUBLIC_MOMENTS_HOME", "false");
  window.localStorage.clear();
  window.sessionStorage.clear();
  navigationMock.pathname = "/review";
  navigationMock.push = vi.fn();
  persistReviewEntryOverride.current = null;
  // #861: the "local-only (real fallback path)" cases below deliberately
  // exercise the REAL persistReviewEntry (no override), which journals a
  // device-durable write keyed by the REAL calendar day
  // (`localIsoDate(new Date())` in WorkflowContext's `saveReview`) — NOT the
  // fixed `now` this file passes to the component for its view-model counts.
  // Left uncleared, that write survives: `fake-indexeddb/auto` backs one
  // module-global store shared by every `it` in this file, so it is read
  // back by the NEXT test's `WorkflowProvider` mount effect
  // (`refreshJournalledDurableState`, fired un-awaited on mount) and makes
  // that test's OWN close look already-closed for real, underneath its own
  // view (whose `closeVM.dayClose` stays null because the leaked entry's day
  // key doesn't match the fixed `now`). That is exactly the #861 race: the
  // retry test's second `saveReview()` call hit `saveReview`'s own
  // already-closed guard instead of the mocked `persistReviewEntry`, so
  // `calls` stayed 1 forever. Clearing the journal here is what
  // `durableWinsReviewsGuard.test.tsx` already does for the same store.
  await clearPendingWrites();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
  window.sessionStorage.clear();
  await clearPendingWrites();
});

describe("#588 cockpit review shell: verdict gated on the resolved save", () => {
  // ReviewPage is an async Server Component (Next 15 `searchParams` is a
  // Promise) — resolve it before handing the element to `render`.
  async function renderReview() {
    const reviewPageElement = await ReviewPage({
      searchParams: Promise.resolve({}),
    });
    render(<WorkflowProvider>{reviewPageElement}</WorkflowProvider>);
  }

  function clickSave() {
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
  }

  it("persisted: claims closure and navigates only after the save resolves", async () => {
    let resolveSave: (value: "persisted") => void = () => {};
    persistReviewEntryOverride.current = () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      });
    await renderReview();

    clickSave();

    // Persistence has NOT resolved yet: no verdict, no navigation.
    expect(screen.queryByTestId("cockpit-toast")).toBeNull();
    expect(navigationMock.push).not.toHaveBeenCalled();

    resolveSave("persisted");

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-toast")).toHaveTextContent(
        "Day closed — review saved",
      );
    });
    expect(navigationMock.push).toHaveBeenCalledWith("/today");
  });

  it("local-only (real fallback path): truthful local copy, no unqualified closure claim", async () => {
    // No override: mock mode has no Supabase client, so the genuine
    // persistReviewEntry local-only branch (markLocalOnly) runs. Since
    // #737-A slice 2 this branch is also where the review is genuinely
    // DEVICE-DURABLE — journalled to IndexedDB, readable from a new tab —
    // which is what makes the "saved on this device" wording true.
    await renderReview();

    clickSave();

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-toast")).toHaveTextContent(
        `Review ${SAVED_ON_THIS_DEVICE_SHORT}`,
      );
    });
    expect(navigationMock.push).toHaveBeenCalledWith("/today");
  });

  it("failure: recovery copy, no closure claim, stays on review", async () => {
    persistReviewEntryOverride.current = () =>
      Promise.reject(new Error("persist blew up"));
    await renderReview();

    clickSave();

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-toast")).toHaveTextContent(
        "Couldn't save the review — day not closed yet",
      );
    });
    expect(screen.getByTestId("cockpit-toast")).not.toHaveTextContent(
      "Day closed —",
    );
    // Recovery-oriented: the user stays on review so Save can be retried.
    expect(navigationMock.push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Save review" }),
    ).toBeInTheDocument();
  });
});

describe("#588 moments close shell: verdict gated on the resolved save", () => {
  function renderClose() {
    render(
      <WorkflowProvider>
        <TodayMoments
          now={new Date("2026-07-14T18:00:00")}
          initialMoment="close"
        />
      </WorkflowProvider>,
    );
  }

  function clickCloseDay() {
    fireEvent.click(screen.getByTestId("close-moment-close-day"));
  }

  it("persisted: toasts the closure verdict only after the save resolves", async () => {
    let resolveSave: (value: "persisted") => void = () => {};
    persistReviewEntryOverride.current = () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      });
    renderClose();

    clickCloseDay();

    // Not resolved yet: no premature "Day closed".
    expect(screen.getByTestId("today-moments-toast").textContent).toBe("");

    resolveSave("persisted");

    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        "Day closed",
      );
    });
    expect(screen.getByTestId("today-moments-toast").textContent).toBe(
      "Day closed",
    );
  });

  it("local-only (real fallback path): truthful local copy", async () => {
    renderClose();

    clickCloseDay();

    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        `Day closed — ${SAVED_ON_THIS_DEVICE_SHORT}`,
      );
    });
  });

  it("failure: recovery copy, never a closure claim", async () => {
    persistReviewEntryOverride.current = () =>
      Promise.reject(new Error("persist blew up"));
    renderClose();

    clickCloseDay();

    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        "Couldn't close the day — review not saved yet",
      );
    });
    expect(screen.getByTestId("today-moments-toast").textContent).not.toContain(
      "Day closed",
    );
  });

  // Final UX Loop C1, Target Cards 1+7 (audit P0#4).
  it("two presses inside one render write ONE review, not two", async () => {
    // The state guard reads `accountClosedDays`/`journalledClosedDays` out of
    // the render closure, so two clicks landing before anything re-renders
    // would both see an open day. The database converges that (23505 ->
    // terminal success), but OFFLINE nothing does, and the journal would hold
    // two entries for a day the card says was closed once. The in-flight latch
    // is what makes "exactly once" true at this tier too.
    let calls = 0;
    let resolveSave: (value: "persisted") => void = () => {};
    persistReviewEntryOverride.current = () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    };
    renderClose();

    clickCloseDay();
    clickCloseDay();
    clickCloseDay();

    expect(calls).toBe(1);

    resolveSave("persisted");

    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        "Day closed",
      );
    });
    expect(calls).toBe(1);
  });

  it("a failed close releases the latch so it can genuinely be retried", async () => {
    // The latch must not turn a failure into a permanently unclosable day.
    let calls = 0;
    persistReviewEntryOverride.current = () => {
      calls += 1;
      return Promise.reject(new Error("persist blew up"));
    };
    renderClose();

    clickCloseDay();
    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        "Couldn't close the day — review not saved yet",
      );
    });

    clickCloseDay();
    await waitFor(() => {
      expect(calls).toBe(2);
    });
  });
});
