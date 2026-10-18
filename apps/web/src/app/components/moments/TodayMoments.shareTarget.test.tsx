import "fake-indexeddb/auto";
import { screen } from "@testing-library/react";
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
  renderToday,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";

/**
 * Bug hunt #13 — sharing a page to LifeOS from Android sends the title and
 * the link as two `shared_text` values. Only the first (the title) was kept;
 * the link was dropped, and any unsaved capture draft was replaced.
 */
describe("TodayMoments — share target keeps everything shared (bug hunt #13)", () => {
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
    window.history.replaceState(null, "", "/");
  });

  it("keeps the title and the link", async () => {
    window.history.replaceState(
      null,
      "",
      "/?shared_text=Great%20article&shared_text=https%3A%2F%2Fexample.com%2Fa",
    );

    renderToday();

    const textarea = (await screen.findByTestId(
      "capture-overlay-textarea",
    )) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Great article");
    expect(textarea.value).toContain("https://example.com/a");
    expect(window.location.search).not.toContain("shared_text");
  });

  it("adds the shared text to an unsaved draft instead of replacing it", async () => {
    window.sessionStorage.setItem(
      "lifeos.moments.captureDraft",
      "Half-typed thought",
    );
    window.history.replaceState(null, "", "/?shared_text=Great%20article");

    renderToday();

    const textarea = (await screen.findByTestId(
      "capture-overlay-textarea",
    )) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Half-typed thought");
    expect(textarea.value).toContain("Great article");
  });
});
