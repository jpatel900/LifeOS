import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "../app/calendar/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "./helpers/workflowReachability";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn() }),
}));

const STORAGE_KEY = "lifeos.phase2.workflow";

function renderCalendarWithStoredJourney() {
  let state = workflowSeed();
  state = captureWorkflow(
    state,
    "Draft agenda for tomorrow's project check-in.",
  );
  state = acceptLatestDraft(state);
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  return render(
    <WorkflowProvider>
      <CalendarPage />
    </WorkflowProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/calendar");
});

describe("cockpit plan flow", () => {
  it("schedules the only ready task from the hour rail without selecting it first", async () => {
    renderCalendarWithStoredJourney();

    // To place, Proposals, launch-step commitment display, and Google approvals
    // each show the ready task context.
    expect(await screen.findAllByText(/Draft agenda/i)).toHaveLength(4);
    expect(screen.getAllByText("Drop here")).toHaveLength(11);

    fireEvent.click(screen.getByRole("button", { name: /10a\s+Drop here/i }));

    const tenAmSlot = screen.getByRole("button", {
      name: /10a\s+Draft agenda/i,
    });
    expect(within(tenAmSlot).getByText("Tap to unplan")).toBeDefined();
    expect(screen.queryByText(/No do-today tasks waiting/i)).toBeDefined();
  });

  // #580: mobile task-first Plan — the hour rail collapses empty hours
  // behind a disclosure below `sm:`; at `sm:` and up every row stays
  // visible via a `sm:grid` override, so this only asserts class state
  // (jsdom doesn't evaluate the media query itself).
  it("collapses empty hour rows behind a 'show empty hours' disclosure until toggled", async () => {
    renderCalendarWithStoredJourney();
    await screen.findAllByText(/Draft agenda/i);

    const emptyRow = screen.getByTestId("hour-row-11");
    expect(emptyRow).toHaveClass("hidden");
    expect(emptyRow).toHaveClass("sm:grid");

    const toggle = screen.getByTestId("show-empty-hours-toggle");
    expect(toggle).toHaveClass("sm:hidden");
    expect(toggle).toHaveTextContent("Show 11 empty hours");

    fireEvent.click(toggle);

    expect(screen.getByTestId("hour-row-11")).not.toHaveClass("hidden");
    expect(screen.queryByTestId("show-empty-hours-toggle")).toBeNull();
  });

  it("never collapses an hour row that already has a placed block", async () => {
    renderCalendarWithStoredJourney();
    await screen.findAllByText(/Draft agenda/i);

    fireEvent.click(screen.getByRole("button", { name: /10a\s+Drop here/i }));

    const placedRow = screen.getByTestId("hour-row-10");
    expect(placedRow).not.toHaveClass("hidden");
    // The remaining ten empty hours are still collapsible.
    expect(screen.getByTestId("show-empty-hours-toggle")).toHaveTextContent(
      "Show 10 empty hours",
    );
  });
});
