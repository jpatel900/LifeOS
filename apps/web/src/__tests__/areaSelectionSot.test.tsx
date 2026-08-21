import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import AreasSettingsPage from "../app/settings/areas/page";
import TodayPage from "../app/today/page";
import { AreaSelector } from "../app/components/moments/AreaSelector";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import {
  MOMENTS_PREFS_COOKIE_NAME,
  readMomentsPrefsCookieClient,
} from "@/lib/momentsPreferencesCookie";

const SELECTED_AREA_KEY = "lifeos.phase2.selectedArea";

function clearMomentsPrefsCookie(): void {
  document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=; Max-Age=0; Path=/`;
}

// #691: area selection has ONE source of truth (WorkflowContext
// `selectedAreaId`) — these tests pin the contract: a change made through
// any picker is what every other surface displays, "nothing selected" means
// All areas everywhere, the selection survives a provider remount (reload),
// and the cockpit's retired localStorage copy can no longer override it.
//
// C2-S14 (#687 round-8, defect 3): the persisted selection moved from
// `sessionStorage` to the `lifeos_moments_prefs` cookie (shared with
// `moment`, see `lib/momentsPreferencesCookie.ts`) so a second tab no longer
// silently resets the area while the moment survives — these tests read the
// cookie now, not `window.sessionStorage`.

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: vi.fn() }),
}));

function readCookieArea(): string | null | undefined {
  return readMomentsPrefsCookieClient()?.area;
}

function SelectionProbe() {
  const { selectedAreaId, setSelectedAreaId } = useWorkflow();
  return (
    <div>
      <span data-testid="probe-selected">{selectedAreaId ?? "(all)"}</span>
      <button onClick={() => setSelectedAreaId("area-personal")}>
        probe-set-personal
      </button>
      <button onClick={() => setSelectedAreaId(null)}>probe-set-all</button>
    </div>
  );
}

// The moments masthead picker, wired to the context exactly the way
// TodayMoments wires it (read + write the shared selection).
function ContextAreaPicker() {
  const { state, selectedAreaId, setSelectedAreaId } = useWorkflow();
  return (
    <AreaSelector
      areas={state.areas.map((area) => ({
        id: area.id,
        name: area.name,
        color: area.color,
      }))}
      value={selectedAreaId}
      onChange={setSelectedAreaId}
      shortcutEnabled={false}
    />
  );
}

// #687: `/today` is a redirect shim into the moments home under the shipping
// config, so `TodayPage` renders the cockpit only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false). The localStorage-override test below
// needs the cockpit to actually mount, so pin the rollback config here —
// stubbing `redirect` instead would let the assertion pass without the
// surface under test ever rendering. beforeEach, not beforeAll: process.env
// is process-global and shared by every test file in a vitest worker.
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;

beforeEach(() => {
  process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
  window.sessionStorage.clear();
  window.localStorage.clear();
  clearMomentsPrefsCookie();
  // C2-S8 (#687 finding 1): `?area=` is now kept in sync with
  // `selectedAreaId` by `lib/WorkflowContext.tsx` itself, so a PRIOR test in
  // this file selecting an area writes it into `window.location` as a side
  // effect — jsdom's `window.location` persists across `it` blocks in the
  // same file, unlike sessionStorage/localStorage/the cookie above (which
  // this file already resets for the same reason). Reset it too, or a
  // leaked `?area=` from an earlier test outranks THIS test's own
  // cookie-only setup via the new URL-priority tier.
  window.history.replaceState(null, "", "/");
});

afterAll(() => {
  if (ORIGINAL_MOMENTS_HOME === undefined) {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  } else {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
  }
});

describe("area selection single source of truth (#691)", () => {
  it("selecting in the moments picker updates the settings badge", async () => {
    render(
      <WorkflowProvider>
        <ContextAreaPicker />
        <AreasSettingsPage />
      </WorkflowProvider>,
    );

    expect(await screen.findByText(/Current area: Main Job/)).toBeDefined();

    fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
    fireEvent.click(screen.getByTestId("area-selector-option-area-personal"));

    expect(await screen.findByText(/Current area: Personal/)).toBeDefined();
  });

  it("none selected is the same All-areas state on the picker and settings", async () => {
    render(
      <WorkflowProvider>
        <ContextAreaPicker />
        <AreasSettingsPage />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
    fireEvent.click(screen.getByTestId("area-selector-option-all"));

    expect(await screen.findByText(/Current area: All areas/)).toBeDefined();
    expect(
      screen.getByTestId("today-moments-area-switcher").textContent,
    ).toContain("All areas");
    expect(screen.queryByText(/None selected/)).toBeNull();
  });

  it("the selection survives a provider remount, including All areas", async () => {
    const first = render(
      <WorkflowProvider>
        <SelectionProbe />
      </WorkflowProvider>,
    );
    fireEvent.click(screen.getByText("probe-set-personal"));
    expect(screen.getByTestId("probe-selected").textContent).toBe(
      "area-personal",
    );
    expect(readCookieArea()).toBe("area-personal");
    first.unmount();
    cleanup();

    render(
      <WorkflowProvider>
        <SelectionProbe />
      </WorkflowProvider>,
    );
    expect(screen.getByTestId("probe-selected").textContent).toBe(
      "area-personal",
    );

    fireEvent.click(screen.getByText("probe-set-all"));
    expect(readCookieArea()).toBeNull();
    cleanup();

    render(
      <WorkflowProvider>
        <SelectionProbe />
      </WorkflowProvider>,
    );
    // All areas must persist as a real choice, not reset to the first area.
    expect(screen.getByTestId("probe-selected").textContent).toBe("(all)");
  });

  it("a stored id no longer in the area list falls back to the default", () => {
    window.sessionStorage.setItem(
      SELECTED_AREA_KEY,
      JSON.stringify("area-that-was-archived"),
    );
    render(
      <WorkflowProvider>
        <SelectionProbe />
      </WorkflowProvider>,
    );
    expect(screen.getByTestId("probe-selected").textContent).toBe(
      "area-main-job",
    );
  });

  // C2-S14 (#687 round-8, defect 3): the legacy sessionStorage key is a
  // one-time migration bridge only, for a browser that selected an area
  // before this fix shipped and has not closed its tab since. No cookie
  // present -> the legacy value is still honored (this test); once ANY
  // selection is made, `storeSelectedAreaId` only ever writes the cookie.
  it("a legacy sessionStorage selection is honored when no cookie exists yet (migration bridge)", () => {
    window.sessionStorage.setItem(
      SELECTED_AREA_KEY,
      JSON.stringify("area-personal"),
    );
    render(
      <WorkflowProvider>
        <SelectionProbe />
      </WorkflowProvider>,
    );
    expect(screen.getByTestId("probe-selected").textContent).toBe(
      "area-personal",
    );
  });

  it("a cookie-remembered area outranks a legacy sessionStorage value", () => {
    window.sessionStorage.setItem(
      SELECTED_AREA_KEY,
      JSON.stringify("area-personal"),
    );
    document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify({ area: null }),
    )}; Path=/`;
    render(
      <WorkflowProvider>
        <SelectionProbe />
      </WorkflowProvider>,
    );
    // The cookie explicitly remembers "All areas" (`area: null`) — it wins
    // over the stale sessionStorage value entirely, per the "cookie first"
    // read order in `loadStoredSelectedAreaId`.
    expect(screen.getByTestId("probe-selected").textContent).toBe("(all)");
  });

  it("the cockpit's old localStorage areaId can no longer override the shared selection", async () => {
    window.localStorage.setItem(
      "lifeos.cockpit.preferences",
      JSON.stringify({ dark: false, areaId: "area-personal", stage: "today" }),
    );

    // TodayPage is an async Server Component (Next 15 `searchParams` is a
    // Promise) — resolve it before handing the element to `render`.
    const todayPageElement = await TodayPage({
      searchParams: Promise.resolve({}),
    });
    render(
      <WorkflowProvider>
        <SelectionProbe />
        {todayPageElement}
      </WorkflowProvider>,
    );

    // The cockpit mounted with a stored areaId pointing at Personal; the
    // shared selection must stay the default, not be silently overridden.
    expect(await screen.findByText("probe-set-personal")).toBeDefined();
    expect(screen.getByTestId("probe-selected").textContent).toBe(
      "area-main-job",
    );
  });
});
