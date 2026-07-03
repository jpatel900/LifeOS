import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import CalendarPage from "../app/calendar/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "./helpers/workflowReachability";

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

    expect(await screen.findAllByText(/Draft agenda/i)).toHaveLength(2);
    expect(screen.getAllByText("Drop here")).toHaveLength(11);

    fireEvent.click(screen.getByRole("button", { name: /10a\s+Drop here/i }));

    const tenAmSlot = screen.getByRole("button", {
      name: /10a\s+Draft agenda/i,
    });
    expect(within(tenAmSlot).getByText("Tap to unplan")).toBeDefined();
    expect(screen.queryByText(/No do-today tasks waiting/i)).toBeDefined();
  });
});
