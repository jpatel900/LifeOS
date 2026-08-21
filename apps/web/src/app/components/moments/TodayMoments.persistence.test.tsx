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

// #292 brief view instrumentation: TodayMoments.tsx unconditionally calls
// createBriefViewRecorder() at module scope, so every split file mocks
// @/lib/reEntry/briefView the same way the original single file did — this
// isolates these tests from Supabase client/network concerns. Only
// TodayMoments.briefView.test.tsx needs the hoisted-spy form below to assert
// on recordIfNeeded directly.
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

import { renderToday } from "@/__tests__/helpers/todayMomentsHarness";

describe("TodayMoments — stored preference persistence (#687 round-4, C2-S10 hydration)", () => {
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

  it("persists timeDisplay and moment through localStorage and reads them back", () => {
    const { unmount } = renderToday();

    fireEvent.click(screen.getByTestId("countdown-clock-toggle-clock"));
    fireEvent.click(screen.getByTestId("moment-switcher-close"));

    const stored = JSON.parse(
      window.localStorage.getItem("lifeos.moments.preferences") ?? "{}",
    );
    expect(stored).toEqual({ moment: "close", timeDisplay: "clock" });

    unmount();

    // Re-mount with no initialMoment so the persisted values are read.
    renderToday({ initialMoment: undefined });
    expect(screen.getByTestId("close-moment")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-clock-toggle-clock")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // C2-S10 (#687 round-4 judge — the SECOND infection site of the C2-S8
  // hydration disease): `readStoredPreferences()` used to be read inside
  // `resolvedInitialMoment`'s own synchronous `useState` initializer, which
  // runs during SSR too — where `window`/`localStorage` do not exist. A
  // return visit after ever switching moments (or the time display) once
  // reproduced a server/client mismatch on EVERY reload of a bare `/`.
  // Root-caused via a direct SSR curl of a bare `/` with
  // `lifeos.moments.preferences` primed: the raw HTML always showed the
  // wall-clock heuristic's answer while the hydrated DOM showed the
  // remembered one (confirmed live in a browser: "Hydration failed ... the
  // tree will be regenerated on the client" on every reload before the fix,
  // zero errors after). Fixed the same shape as C2-S8's `?moment=`
  // mismatch: the synchronous tier is now deterministic between server and
  // client (both fall to the same heuristic when nothing more explicit is
  // present); the stored preference is adopted in a client-only effect
  // AFTER hydration, via `adoptMomentFromUrl`/`setTimeDisplay` +
  // `replaceState` for `moment` (never `pushState` — this finishes the same
  // initial resolution a beat late, it is not a user-initiated switch, so
  // it must not grow history). jsdom cannot reproduce the SSR/CSR split
  // itself (there is only one environment here) — these tests pin the
  // OBSERVABLE contract the fix depends on: the remembered value still
  // wins when nothing more explicit is present, an explicit signal still
  // outranks it, and adopting it never pushes a history entry.
  describe("stored moment/time-display preference (#687 round-4, C2-S10 hydration fix)", () => {
    it("adopts a stored moment preference after mount, without growing history", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "flow", timeDisplay: "countdown" }),
      );
      const push = vi.spyOn(window.history, "pushState");

      renderToday();

      expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
      expect(new URL(window.location.href).searchParams.get("moment")).toBe(
        "flow",
      );
      expect(push).not.toHaveBeenCalled();
      push.mockRestore();
    });

    it("a URL-provided ?moment= still outranks a stored preference", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "close", timeDisplay: "countdown" }),
      );
      window.history.replaceState(null, "", "/?moment=start");

      renderToday();

      expect(screen.getByTestId("start-moment")).toBeInTheDocument();
      expect(new URL(window.location.href).searchParams.get("moment")).toBe(
        "start",
      );
    });

    it("deepLink.moment also outranks a stored preference", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "close", timeDisplay: "countdown" }),
      );

      renderToday({ deepLink: { moment: "flow" } });

      expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    });

    it("the initialMoment test-override prop outranks a stored preference", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "close", timeDisplay: "countdown" }),
      );

      renderToday({ initialMoment: "start" });

      expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    });

    it("adopts a stored time-display preference after mount", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "start", timeDisplay: "clock" }),
      );

      renderToday({ initialMoment: "start" });

      expect(
        screen.getByTestId("countdown-clock-toggle-clock"),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("no stored preference at all — the deterministic heuristic default renders with zero errors", () => {
      // No localStorage.setItem call — a genuinely fresh device/session.
      renderToday({ initialMoment: "start" });

      expect(screen.getByTestId("start-moment")).toBeInTheDocument();
      expect(
        screen.getByTestId("countdown-clock-toggle-countdown"),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});
