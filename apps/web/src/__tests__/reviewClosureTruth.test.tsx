import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewPage from "../app/review/page";
import { TodayMoments } from "../app/components/moments/TodayMoments";
import { WorkflowProvider } from "@/lib/WorkflowContext";

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

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.localStorage.clear();
  window.sessionStorage.clear();
  navigationMock.pathname = "/review";
  navigationMock.push = vi.fn();
  persistReviewEntryOverride.current = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("#588 cockpit review shell: verdict gated on the resolved save", () => {
  function renderReview() {
    render(
      <WorkflowProvider>
        <ReviewPage />
      </WorkflowProvider>,
    );
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
    renderReview();

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
    // persistReviewEntry local-only branch (markLocalOnly) runs.
    renderReview();

    clickSave();

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-toast")).toHaveTextContent(
        "Review saved locally — account sync pending",
      );
    });
    expect(navigationMock.push).toHaveBeenCalledWith("/today");
  });

  it("failure: recovery copy, no closure claim, stays on review", async () => {
    persistReviewEntryOverride.current = () =>
      Promise.reject(new Error("persist blew up"));
    renderReview();

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
        "Day closed locally — account sync pending",
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
});
