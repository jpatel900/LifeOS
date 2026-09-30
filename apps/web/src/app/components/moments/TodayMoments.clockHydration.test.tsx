import "fake-indexeddb/auto";
import { act, fireEvent } from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { TodayMoments } from "./TodayMoments";
import { resetTodayMomentsMountTracking } from "@/__tests__/helpers/todayMomentsHarness";
import { formatMastheadDate } from "./formatMastheadDate";
import { deepLinkTargetFromParams } from "./deepLink";
import {
  MOMENTS_PREFS_COOKIE_NAME,
  parseMomentsPrefsCookie,
} from "@/lib/momentsPreferencesCookie";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => null,
}));
vi.mock("@/lib/reEntry/briefView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reEntry/briefView")>()),
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

// Vitest worker threads keep their native timezone after process.env.TZ
// changes. Supply local date getters from real Intl timezone conversion;
// epoch time stays identical, and workflow state is never mocked.
function timezoneInput() {
  let zone = "UTC";
  const parts = (date: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        day: "numeric",
        month: "numeric",
        hour: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
  vi.spyOn(Date.prototype, "getDate").mockImplementation(function (this: Date) {
    return Number(parts(this).day);
  });
  vi.spyOn(Date.prototype, "getMonth").mockImplementation(function (
    this: Date,
  ) {
    return Number(parts(this).month) - 1;
  });
  vi.spyOn(Date.prototype, "getHours").mockImplementation(function (
    this: Date,
  ) {
    return Number(parts(this).hour);
  });
  vi.spyOn(Date.prototype, "getDay").mockImplementation(function (this: Date) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts(this).weekday,
    );
  });
  return (next: string) => {
    zone = next;
  };
}

for (const scenario of [
  { id: "Flow noon", moment: "flow", client: "2026-09-28T12:00:00.000Z" },
  { id: "Flow evening", moment: "flow", client: "2026-09-28T22:00:00.000Z" },
  { id: "Start noon", moment: "start", client: "2026-09-28T12:00:00.000Z" },
  { id: "Start evening", moment: "start", client: "2026-09-28T22:00:00.000Z" },
  {
    id: "same instant, different timezone",
    moment: "flow",
    client: "2026-09-28T23:30:00.000Z",
    timezones: true,
  },
  {
    id: "clock-selected moment",
    moment: undefined,
    client: "2026-09-28T22:00:00.000Z",
  },
  {
    id: "legacy remembered moment",
    moment: undefined,
    client: "2026-09-28T22:00:00.000Z",
    source: "legacy",
  },
  {
    id: "explicit URL",
    moment: "flow",
    client: "2026-09-28T22:00:00.000Z",
    source: "url",
  },
  {
    id: "explicit deep link",
    moment: "flow",
    client: "2026-09-28T22:00:00.000Z",
    source: "deepLink",
  },
  {
    id: "remembered cookie",
    moment: "flow",
    client: "2026-09-28T22:00:00.000Z",
    source: "cookie",
  },
] as const) {
  it(`hydrates ${scenario.id} without clock or timezone errors`, async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_SEED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    resetTodayMomentsMountTracking();
    document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=; Path=/; Max-Age=0`;
    const source = "source" in scenario ? scenario.source : undefined;
    if (source === "legacy")
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "flow", timeDisplay: "countdown" }),
      );
    if (source === "url" || source === "deepLink")
      window.history.replaceState(null, "", "/?moment=flow");
    if (source === "cookie")
      document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ moment: "flow" }))}; Path=/`;
    vi.useFakeTimers({ toFake: ["Date"] });
    const browserWindow = window;
    const tree = (
      <StrictMode>
        <WorkflowProvider>
          <TodayMoments
            initialMoment={source ? undefined : scenario.moment}
            deepLink={
              source === "url" || source === "deepLink"
                ? deepLinkTargetFromParams({ moment: "flow" })
                : undefined
            }
            cookieMoment={source === "cookie" ? "flow" : undefined}
          />
        </WorkflowProvider>
      </StrictMode>
    );
    const container = document.createElement("div");
    const errors: unknown[] = [];
    const cookieWrites = vi.spyOn(Document.prototype, "cookie", "set");
    const replacements = vi.spyOn(window.history, "replaceState");
    const pushes = vi.spyOn(window.history, "pushState");
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      const timezoneScenario = "timezones" in scenario;
      const setZone = timezoneScenario ? timezoneInput() : undefined;
      vi.setSystemTime(
        new Date(
          timezoneScenario ? scenario.client : "2026-09-30T12:00:00.000Z",
        ),
      );
      if (timezoneScenario)
        expect([new Date().getDate(), new Date().getHours()]).toEqual([28, 23]);
      vi.stubGlobal("window", undefined);
      container.innerHTML = renderToString(tree);
      vi.stubGlobal("window", browserWindow);
      document.body.append(container);
      vi.setSystemTime(new Date(scenario.client));
      if (timezoneScenario) {
        const epoch = new Date().getTime();
        setZone!("Asia/Tokyo");
        expect([new Date().getDate(), new Date().getHours()]).toEqual([29, 8]);
        expect(new Date().getTime()).toBe(epoch);
      }
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(errors).toEqual([]);
      expect(
        container.querySelector('[data-testid="today-moments-date"]')
          ?.textContent,
      ).toBe(formatMastheadDate(new Date()));
      const expected =
        source === "legacy" ? "flow" : (scenario.moment ?? "close");
      expect(
        container
          .querySelector(`[data-testid="moment-switcher-${expected}"]`)
          ?.getAttribute("aria-selected"),
      ).toBe("true");
      const savedMoments = cookieWrites.mock.calls
        .filter(([text]) => text.startsWith(`${MOMENTS_PREFS_COOKIE_NAME}=`))
        .map(
          ([text]) =>
            parseMomentsPrefsCookie(
              decodeURIComponent(
                text.split(";")[0]!.slice(MOMENTS_PREFS_COOKIE_NAME.length + 1),
              ),
            )?.moment,
        )
        .filter(Boolean);
      if (scenario.moment === undefined) {
        expect(savedMoments.length).toBeGreaterThan(0);
        expect(savedMoments.every((moment) => moment === expected)).toBe(true);
        const published = replacements.mock.calls
          .map((call) =>
            new URL(
              String(call[2]),
              "https://example.invalid",
            ).searchParams.get("moment"),
          )
          .filter(Boolean);
        // The provider subsequently adds the seeded area to this URL. It
        // preserves the moment; only one transition may resolve the moment.
        expect(published.every((moment) => moment === expected)).toBe(true);
        expect(
          published.filter((moment, index) => moment !== published[index - 1]),
        ).toEqual([expected]);
        expect(new URL(window.location.href).searchParams.get("moment")).toBe(
          expected,
        );
        expect(pushes).not.toHaveBeenCalled();
        fireEvent.click(
          container.querySelector('[data-testid="moment-switcher-start"]')!,
        );
        await act(async () => {
          root!.render(tree);
        });
        expect(
          container
            .querySelector('[data-testid="moment-switcher-start"]')
            ?.getAttribute("aria-selected"),
        ).toBe("true");
        expect(pushes).toHaveBeenCalledTimes(1);
        await act(async () => {
          window.history.replaceState(null, "", `/?moment=${expected}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
          root!.render(tree);
        });
        expect(
          container
            .querySelector(`[data-testid="moment-switcher-${expected}"]`)
            ?.getAttribute("aria-selected"),
        ).toBe("true");
      }
    } finally {
      vi.stubGlobal("window", browserWindow);
      await act(async () => root?.unmount());
      container.remove();
      vi.restoreAllMocks();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.history.replaceState(null, "", "/");
      document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=; Path=/; Max-Age=0`;
      resetTodayMomentsMountTracking();
    }
  });
}
