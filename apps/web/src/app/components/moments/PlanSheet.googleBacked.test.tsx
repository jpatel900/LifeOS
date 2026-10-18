import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { applyGoogleCalendarWriteResult } from "@/lib/workflow";
import { GOOGLE_BACKED_BLOCK_CHANGE_REFUSED } from "@/lib/statusVocabulary";
import {
  GOLDEN_AREA_ID,
  acceptLatestDraft,
  captureWorkflow,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { PlanSheet } from "./PlanSheet";

/**
 * Calendar hunt #2 (what the person sees): tapping a rail hour that holds a
 * block already on Google Calendar used to say "Taken off the rail" while the
 * account refused the change and the Google event stayed. It must point to
 * "Cancel Google event" instead and leave the block alone.
 */
const NOW = new Date("2026-08-03T09:30:00");

function seed() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-03T07:00:00"));
  let state = acceptLatestDraft(
    captureWorkflow(workflowSeed(), "Prepare the board update"),
  );
  state = planLatestActiveTask(state, 9);
  const block = state.calendarBlocks.find((b) => b.status === "scheduled")!;
  state = applyGoogleCalendarWriteResult(
    state,
    block.proposal_id!,
    "lifeosevent9",
  );
  vi.useRealTimers();
  return state;
}

function OpenBlocks() {
  const { state } = useWorkflow();
  return (
    <span data-testid="probe-open-blocks">
      {state.calendarBlocks.filter((b) => b.status === "scheduled").length}
    </span>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("PlanSheet — a Google-backed rail block (calendar hunt #2)", () => {
  it("points to 'Cancel Google event' instead of taking it off the rail", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seed()));
    const onToast = vi.fn();
    render(
      <WorkflowProvider>
        <OpenBlocks />
        <PlanSheet
          open
          onClose={vi.fn()}
          selectedAreaId={GOLDEN_AREA_ID}
          blocks={[]}
          timeDisplay="clock"
          now={NOW}
          onToast={onToast}
        />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("probe-open-blocks")).toHaveTextContent("1");
    fireEvent.click(screen.getByTestId("plan-sheet-hour-9"));

    expect(onToast).toHaveBeenCalledWith(GOOGLE_BACKED_BLOCK_CHANGE_REFUSED);
    expect(onToast).not.toHaveBeenCalledWith("Taken off the rail");
    expect(screen.getByTestId("probe-open-blocks")).toHaveTextContent("1");
  });
});
