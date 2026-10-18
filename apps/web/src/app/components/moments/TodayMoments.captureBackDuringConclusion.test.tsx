import "fake-indexeddb/auto";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/reEntry/briefView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reEntry/briefView")>()),
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

import {
  pressCaptureShortcut,
  renderToday,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";

/**
 * Bug hunt #7 — pressing browser Back during the short "back to:" line
 * after a save closed the overlay without finishing the save's follow-up,
 * so the already-saved thought came back as "Draft restored" and saving it
 * again made a duplicate.
 */
describe("TodayMoments — Back during the capture conclusion (bug hunt #7)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    resetTodayMomentsMountTracking();
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  it("does not bring the saved thought back as a restored draft", async () => {
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.change(textarea, { target: { value: "Call the landlord" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    // The conclusion is on screen; the person presses Back right away.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    await act(async () => {
      window.history.back();
    });
    await waitFor(() =>
      expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument(),
    );

    expect(
      window.sessionStorage.getItem("lifeos.moments.captureDraft"),
    ).toBeNull();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );

    await pressCaptureShortcut();
    const reopened = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    expect(reopened.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();
  });
});
