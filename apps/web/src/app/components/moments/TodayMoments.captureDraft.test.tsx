// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import {
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";

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

import {
  pressCaptureShortcut,
  renderToday,
} from "@/__tests__/helpers/todayMomentsHarness";

/**
 * SP-5: never lose typed capture text. Unsaved capture input must survive
 * an accidental close/reopen within a session via sessionStorage (not
 * localStorage, so it does not haunt a brand-new session), and must be
 * cleared only on a successful save. Palette persistence is explicitly out
 * of scope — palettes conventionally reset — so no equivalent test exists
 * for CommandPalette.
 */
describe("TodayMoments — SP-5 capture draft preservation", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("preserves typed text through Esc/close and reopen, with the cursor at the end and a restored hint", async () => {
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "three words lost" },
    });

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();

    // Sessions-worth persistence: the draft is in sessionStorage, not
    // localStorage, per the SP-5 contract.
    expect(window.sessionStorage.getItem("lifeos.moments.captureDraft")).toBe(
      "three words lost",
    );
    expect(
      window.localStorage.getItem("lifeos.moments.captureDraft"),
    ).toBeNull();

    await pressCaptureShortcut();
    const reopened = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(reopened).toHaveFocus();
    });
    expect(reopened.value).toBe("three words lost");
    expect(reopened.selectionStart).toBe("three words lost".length);
    expect(
      screen.getByTestId("capture-overlay-draft-restored"),
    ).toBeInTheDocument();
  });

  it("clears the draft only after a successful save, and the captured text reaches workflow state", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.change(textarea, {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Held in context through the wait — the draft is cleared and the
    // overlay closes only once the parse truly resolves, never the instant
    // Enter is pressed.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );
    expect(
      window.sessionStorage.getItem("lifeos.moments.captureDraft"),
    ).toBeNull();

    await pressCaptureShortcut();
    const reopened = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    expect(reopened.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();

    restoreFetch();
  });

  it("fresh mount with empty sessionStorage shows an empty box and no false restored hint", async () => {
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;

    expect(textarea.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();
  });
});
