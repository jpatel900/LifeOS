// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

// #292 brief view instrumentation: TodayMoments.tsx unconditionally calls
// createBriefViewRecorder() at module scope, so every split file mocks
// @/lib/reEntry/briefView the same way the original single file did — this
// isolates these tests from Supabase client/network concerns. Only
// TodayMoments.briefView.test.tsx needs the hoisted-spy form below to assert
// on recordIfNeeded directly.
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";

import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";

import {
  pressCaptureShortcut,
  renderToday,
} from "@/__tests__/helpers/todayMomentsHarness";

/**
 * The core moment-switching journeys: start -> first move -> Flow, ending a
 * Flow session (including the cap-decision and split-truth deferral edge
 * cases), capture-during-flow, and the close-day journey.
 */
describe("TodayMoments — moment-switching journeys", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("start-to-first-move journey: Start now switches to Flow with a running countdown", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    expect(screen.getByTestId("start-moment-empty")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));

    await waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("first-move-start"));

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
    expect(screen.getByTestId("current-block-hero-time")).toHaveTextContent(
      /\d+:\d{2}/,
    );

    restoreFetch();
  });

  it("keeps the Moments end sheet draft open when the cap decision is cancelled", async () => {
    vi.useFakeTimers();
    const restoreFetch = stubParseCaptureFetch();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("seed-submit"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));

    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000 + 1000);
    });
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.change(screen.getByTestId("end-session-note"), {
      target: { value: "Keep my working note" },
    });
    fireEvent.click(screen.getByTestId("end-session-save"));
    await act(async () => {});

    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("end-session-note")).toHaveValue(
      "Keep my working note",
    );
    restoreFetch();
  });

  it("closes the Moments sheet with split truth when the session saves but deferral is unconfirmed", async () => {
    // Narrowed `toFake` since #737 C1 card 1: ending a session journals the
    // outcome to IndexedDB before anything else, and `fake-indexeddb` drives
    // its request callbacks with `setImmediate`. Faking that (vitest's
    // default) freezes the journal write, so the sheet would sit on "Saving…"
    // forever. Same remedy #737-A slice 2 applied to the close-day toast:
    // fake only the timers this test's subject uses.
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    const restoreFetch = stubParseCaptureFetch();
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("defer")
      .mockReturnValueOnce("Continue tomorrow");
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("seed-submit"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));
    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000 + 1000);
    });
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    // The journal write resolves on real `setImmediate` — drain that queue
    // until the save result lands and the sheet closes.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
      if (screen.getByTestId("today-moments-toast").textContent) break;
    }

    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Session saved — deferral not yet confirmed",
    );
    restoreFetch();
  });

  // #556 FR-026: the overlay now holds the user through the parse wait
  // (raw text + hook stay visible, no second submit possible) instead of
  // closing the instant Enter is pressed — this drives that wait through to
  // its "back to: <hook>" conclusion before asserting the old post-save
  // assertions (overlay closed, toast shown).
  it("capture-during-flow: pressing C opens capture from Flow, saving keeps the moment on Flow", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("flow-moment-empty")).toBeInTheDocument();

    await pressCaptureShortcut();
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    // #703: no parse wait at capture any more — the save is synchronous and
    // the overlay goes straight to its "back to: <hook>" conclusion. It is
    // still not released the instant Enter is pressed.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-overlay-parsing")).toBeNull();
    expect(screen.getByTestId("capture-overlay-conclusion")).toBeVisible();

    await waitFor(
      () => {
        expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );

    restoreFetch();
  });

  it("close-day journey: Close moment renders counts and Close the day fires without crashing", async () => {
    renderToday({ initialMoment: "close" });

    expect(screen.getByTestId("close-moment-completed")).toHaveTextContent("0");
    expect(screen.getByTestId("close-moment-missed")).toHaveTextContent("0");

    fireEvent.click(screen.getByTestId("close-moment-close-day"));

    // #588: mock mode has no account, so the resolved save result is
    // local-only and the toast states that truth (not a bare "Day closed").
    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        `Day closed — ${SAVED_ON_THIS_DEVICE_SHORT}`,
      );
    });
  });
});
