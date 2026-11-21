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

import type { SupabaseClient } from "@supabase/supabase-js";

const { recordBriefViewIfNeeded, browser } = vi.hoisted(() => ({
  recordBriefViewIfNeeded: vi.fn(),
  browser: { client: null as SupabaseClient | null },
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => browser.client,
}));
vi.mock("@/lib/reEntry/briefView", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/reEntry/briefView")>();
  return {
    ...actual,
    createBriefViewRecorder() {
      const recorder = actual.createBriefViewRecorder();
      return {
        recordIfNeeded(...args: Parameters<typeof recorder.recordIfNeeded>) {
          recordBriefViewIfNeeded(...args);
          recorder.recordIfNeeded(...args);
        },
      };
    },
  };
});

import {
  FIXED_NOW,
  renderToday,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";

// C2-S13 (#687 round-7): FILE-LEVEL, applies regardless of describe nesting
// — every split file that mounts TodayMoments more than once needs this
// reset (deepLink.ts's module-level remount-tracking flag survives across
// `it()`s in the same file); see the harness export's own doc comment for
// the full mechanism.
afterEach(() => {
  resetTodayMomentsMountTracking();
});

/**
 * #292 Stage-2 entry gate instrumentation: the daily brief-view record must
 * fire on the surface a non-absent, daily-engaged user actually sees — the
 * Start moment — not only the rarer post-absence re-entry ritual (that path
 * is covered separately in useReEntryRitual.test.ts). `recordIfNeeded` is
 * observed at the module boundary and runs against a local auth fixture.
 */
describe("TodayMoments — #292 brief view instrumentation", () => {
  beforeEach(() => {
    browser.client = null;
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
    expect(recordBriefViewIfNeeded).toHaveBeenCalledWith(null, FIXED_NOW, null);
  });

  it("does not record while Flow or Close is the rendered surface", () => {
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).not.toHaveBeenCalled();
  });

  it("attributes Start to the visitor even when verification switches accounts", async () => {
    renderToday({ initialMoment: "flow" });
    let visitor = "X";
    let verified = "X";
    type Listener = (event: string, session: { user: { id: string } }) => void;
    const listeners = new Set<Listener>();
    const getUser = vi.fn(async () => ({
      data: { user: { id: verified } },
      error: null,
    }));
    const upsert = vi.fn(async (_row: { user_id: string }) => ({
      error: null,
    }));
    const recordedAccounts = () =>
      upsert.mock.calls.map(([row]) => row.user_id);
    browser.client = {
      auth: {
        getUser,
        getSession: async () => ({
          data: { session: { user: { id: visitor } } },
          error: null,
        }),
        onAuthStateChange(listener: Listener) {
          listeners.add(listener);
          return {
            data: {
              subscription: { unsubscribe: () => listeners.delete(listener) },
            },
          };
        },
      },
      from: () => ({ upsert }),
    } as unknown as SupabaseClient;
    const go = (moment: string) =>
      fireEvent.click(screen.getByTestId(`moment-switcher-${moment}`));

    go("start");
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(recordedAccounts()).toEqual(["X"]);
    go("flow");
    visitor = "A";
    verified = "B";
    await act(async () => {
      for (const notify of listeners)
        notify("SIGNED_IN", { user: { id: visitor } });
    });
    getUser.mockClear();
    await act(async () => {
      go("start");
    });
    expect(getUser).toHaveBeenCalled();
    expect(recordedAccounts()).toEqual(["X"]);

    go("flow");
    verified = "A";
    go("start");
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(recordedAccounts()).toEqual(["X", "A"]);
  });

  it("records once switching to Start from another moment", () => {
    renderToday({ initialMoment: "close" });
    expect(recordBriefViewIfNeeded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("moment-switcher-start"));

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).toHaveBeenCalledWith(null, FIXED_NOW, null);
  });
});
