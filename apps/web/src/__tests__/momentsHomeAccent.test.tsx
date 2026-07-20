import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { TodayMoments } from "../app/components/moments/TodayMoments";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

const FIXED_NOW = new Date("2026-07-05T15:00:00.000Z");

// Test-only bridge: flip the selected area through the real WorkflowContext
// setter (the same one the masthead AreaSelector drives), so the accent
// assertion exercises the production selection path without depending on the
// combobox's open/close interaction.
function AreaBridge() {
  const { setSelectedAreaId } = useWorkflow();
  return (
    <button
      type="button"
      data-testid="select-side-project"
      onClick={() => setSelectedAreaId("area-side-project")}
    >
      select side project
    </button>
  );
}

function renderHome() {
  return render(
    <WorkflowProvider>
      <AreaBridge />
      <TodayMoments now={FIXED_NOW} initialMoment="start" />
    </WorkflowProvider>,
  );
}

describe("moments home screen accent (#690 Part 2)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
  });

  it("scopes the --acc token family to the active area, not the fixed default", () => {
    renderHome();

    const root = screen.getByTestId("today-moments");
    // Default selection resolves to the first area (Main Job, #4c80cd) — the
    // same default the stage cockpit (buildCockpitAccentStyle) lands on — and
    // crucially NOT the fixed .lifeos-cockpit default (#6d8bff) it showed
    // before this wiring.
    expect(root.style.getPropertyValue("--acc")).toBe("#4c80cd");
    expect(root.style.getPropertyValue("--acc")).not.toBe("#6d8bff");
    // The derived surface/ring/on-accent tokens ship too (both-theme safe).
    expect(root.style.getPropertyValue("--on-acc")).not.toBe("");
    expect(root.style.getPropertyValue("--acc-sf")).not.toBe("");
  });

  it("retints the screen accent when the active area changes", () => {
    renderHome();

    const root = screen.getByTestId("today-moments");
    expect(root.style.getPropertyValue("--acc")).toBe("#4c80cd");

    fireEvent.click(screen.getByTestId("select-side-project"));

    // Side Project (#d87248) — the accent follows the area at the view scope.
    expect(root.style.getPropertyValue("--acc")).toBe("#d87248");
  });
});
