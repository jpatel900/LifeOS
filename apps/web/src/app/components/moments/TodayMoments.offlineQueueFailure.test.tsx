import "fake-indexeddb/auto";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/reEntry/briefView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reEntry/briefView")>()),
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

const { mockEnqueueCapture } = vi.hoisted(() => ({
  mockEnqueueCapture: vi.fn(),
}));

vi.mock("@/lib/capture/offlineQueue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capture/offlineQueue")>()),
  enqueueCapture: mockEnqueueCapture,
}));

import {
  pressCaptureShortcut,
  renderToday,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

/**
 * Bug hunt #4 (what the person reads): when the offline device queue
 * refuses the thought, the toast must not claim it is saved on this device.
 */
describe("TodayMoments — offline capture the device refused (bug hunt #4)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockEnqueueCapture.mockRejectedValue(
      new DOMException("Quota exceeded", "QuotaExceededError"),
    );
  });

  afterEach(() => {
    resetTodayMomentsMountTracking();
    vi.unstubAllEnvs();
    setOnline(true);
    window.sessionStorage.clear();
  });

  it("says the thought is only in this tab instead of 'saved on this device'", async () => {
    renderToday({ initialMoment: "start" });
    setOnline(false);

    await pressCaptureShortcut();
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.change(textarea, { target: { value: "Book physio" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(
      () =>
        expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    const toast = screen.getByTestId("today-moments-toast");
    expect(toast).not.toHaveTextContent("saved on this device");
    expect(toast).toHaveTextContent("only in this tab");
  });
});
