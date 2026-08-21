// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { fireEvent, screen } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

// #292 brief view instrumentation: hoisted so both vi.mock's factory (which
// runs before this file's other module-scope code) and the dedicated
// describe block below can reference the same spy. lib/reEntry/briefView.ts
// itself (the recorder's real once-per-day gate + upsert logic) is unit
// tested directly in briefView.test.ts; mocking it here isolates TodayMoments'
// own wiring (calls it while Start is the rendered surface) from Supabase
// client/network concerns.
const { recordBriefViewIfNeeded } = vi.hoisted(() => ({
  recordBriefViewIfNeeded: vi.fn(),
}));
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: recordBriefViewIfNeeded }),
}));

import {
  FIXED_NOW,
  renderToday,
} from "@/__tests__/helpers/todayMomentsHarness";

/**
 * #292 Stage-2 entry gate instrumentation: the daily brief-view record must
 * fire on the surface a non-absent, daily-engaged user actually sees — the
 * Start moment — not only the rarer post-absence re-entry ritual (that path
 * is covered separately in useReEntryRitual.test.ts). `recordIfNeeded` is
 * mocked at the module boundary so this proves TodayMoments' own wiring
 * (calls it while Start is showing, not while another moment/ritual owns
 * the screen) without depending on Supabase or network behavior, which
 * lib/reEntry/briefView.test.ts already covers directly.
 */
describe("TodayMoments — #292 brief view instrumentation", () => {
  beforeEach(() => {
    recordBriefViewIfNeeded.mockClear();
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

  it("records a brief view once the Start moment is the rendered surface", () => {
    renderToday({ initialMoment: "start" });

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).toHaveBeenCalledWith(null, FIXED_NOW);
  });

  it("does not record while Flow or Close is the rendered surface", () => {
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).not.toHaveBeenCalled();
  });

  it("records once switching to Start from another moment", () => {
    renderToday({ initialMoment: "close" });
    expect(recordBriefViewIfNeeded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("moment-switcher-start"));

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).toHaveBeenCalledWith(null, FIXED_NOW);
  });
});
