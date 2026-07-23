import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import AreasSettingsPage from "../app/settings/areas/page";
import TodayPage from "../app/today/page";
import { AreaSelector } from "../app/components/moments/AreaSelector";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";

// #691: area selection has ONE source of truth (WorkflowContext
// `selectedAreaId`) — these tests pin the contract: a change made through
// any picker is what every other surface displays, "nothing selected" means
// All areas everywhere, the selection survives a provider remount (reload),
// and the cockpit's retired localStorage copy can no longer override it.

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: vi.fn() }),
}));

const SELECTED_AREA_KEY = "lifeos.phase2.selectedArea";

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
    expect(window.sessionStorage.getItem(SELECTED_AREA_KEY)).toBe(
      JSON.stringify("area-personal"),
    );
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
    expect(window.sessionStorage.getItem(SELECTED_AREA_KEY)).toBe(
      JSON.stringify(null),
    );
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

  it("the cockpit's old localStorage areaId can no longer override the shared selection", async () => {
    window.localStorage.setItem(
      "lifeos.cockpit.preferences",
      JSON.stringify({ dark: false, areaId: "area-personal", stage: "today" }),
    );

    render(
      <WorkflowProvider>
        <SelectionProbe />
        <TodayPage />
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
