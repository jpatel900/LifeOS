// #853 regression guard — an action taken right after a reload, before the
// first account sync lands, must still reach the account.
//
// The device -> account id twinship is recorded twice (`recordAccountAlias`):
// in per-mount refs that every persist path reads, and in
// `state.accountIdByLocalId`, which rides `sessionStorage` through a reload.
// The restore path brought the state copy back but never refilled the refs,
// so until the first post-reload sync swapped the rows to their account ids,
// the Plan rail showed the block under its device-local id and an unplan
// tapped in that window was journalled with no account id. With the
// placement already delivered there was nothing to annul either, so the
// write sat queued forever ("its account block is not known on this device")
// while the account kept the block — `plan-port-truth.spec.ts`'s
// place -> reload -> take it off step, failing about 1 run in 10.
//
// Scaffold (real `WorkflowProvider` + `PlanSheet`, data-layer calls mocked)
// mirrors `PlanSheet.idSwapGuard.test.tsx`.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { planTaskAtHour, type WorkflowState } from "@/lib/workflow";
import {
  acceptLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { PlanSheet } from "./PlanSheet";

const AREA = GOLDEN_AREA_ID;
const ACCOUNT_TASK_ID = "99999999-9999-4999-8999-999999999999";
const ACCOUNT_BLOCK_ID = "77777777-7777-4777-8777-777777777777";

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockListWinRecords,
  mockListOverrideRecords,
  mockListDurationProfiles,
  mockListSuggestionRecords,
  mockCreateSupabaseBrowserClient,
  mockUnplanCalendarBlock,
} = vi.hoisted(() => ({
  mockUnplanCalendarBlock: vi.fn<
    (client: unknown, blockId: string) => Promise<{ provider: "supabase" }>
  >(async () => ({ provider: "supabase" })),
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
  // These reads are only ever called with the mocked functions above (never
  // real supabase-js methods), so the "client" only needs to be truthy.
  mockCreateSupabaseBrowserClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/workflow")>(
    "@/lib/data/workflow",
  );
  return {
    ...actual,
    listAreas: mockListAreas,
    listCaptureItems: mockListCaptureItems,
    listPlanningItems: mockListPlanningItems,
    listExecutionReviewItems: mockListExecutionReviewItems,
    listWinRecords: mockListWinRecords,
    listOverrideRecords: mockListOverrideRecords,
    listDurationProfiles: mockListDurationProfiles,
    listSuggestionRecords: mockListSuggestionRecords,
    unplanCalendarBlock: mockUnplanCalendarBlock,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

const persistedArea = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Main Job",
  slug: "main-job",
  description: "Persisted area",
  color: "#2563eb",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

const BLOCK_HOUR = 10;

/**
 * What `sessionStorage` holds after a placement was delivered and before the
 * reload: a device-born task and block, both still under their local ids,
 * with their account twins recorded in the state's alias map.
 */
function seedPlacedBeforeReload(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "Renew the volunteer insurance certificate");
  state = acceptLatestDraft(state);
  const task = { ...state.tasks.at(-1)!, first_tiny_step: "Open the folder" };
  state = planTaskAtHour(
    { ...state, tasks: [task], timeBlockProposals: [], calendarBlocks: [] },
    task.id,
    BLOCK_HOUR,
  );
  const block = state.calendarBlocks[0];
  return {
    ...state,
    accountIdByLocalId: {
      captures: {},
      tasks: { [task.id]: ACCOUNT_TASK_ID },
      proposals: {},
      blocks: { [block.id]: ACCOUNT_BLOCK_ID },
      sessions: {},
    },
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockListAreas.mockResolvedValue({
    provider: "supabase",
    areas: [persistedArea],
  });
  // The first post-reload sync never lands: everything below happens in the
  // window before it, which is exactly where the bug lived.
  const never = () => new Promise<never>(() => {});
  mockListCaptureItems.mockImplementation(never);
  mockListPlanningItems.mockImplementation(never);
  mockListExecutionReviewItems.mockImplementation(never);
  mockListWinRecords.mockResolvedValue({ provider: "mock", winRecords: [] });
  mockListOverrideRecords.mockResolvedValue({
    provider: "mock",
    overrideRecords: [],
  });
  mockListDurationProfiles.mockResolvedValue({
    provider: "mock",
    durationProfiles: [],
  });
  mockListSuggestionRecords.mockResolvedValue({
    provider: "mock",
    suggestionRecords: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("#853 guard: the restored alias map reaches the persist paths", () => {
  it("sends an unplan tapped before the first post-reload sync to the account block", async () => {
    const seed = seedPlacedBeforeReload();
    expect(seed.calendarBlocks[0].id).not.toBe(ACCOUNT_BLOCK_ID);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

    render(
      <WorkflowProvider>
        <PlanSheet
          open
          onClose={vi.fn()}
          selectedAreaId={AREA}
          blocks={[]}
          timeDisplay="clock"
          now={new Date()}
        />
      </WorkflowProvider>,
    );

    const hour = await screen.findByTestId(`plan-sheet-hour-${BLOCK_HOUR}`);
    await waitFor(() => expect(hour).toHaveTextContent("Tap to take it off"));
    expect(mockListExecutionReviewItems).toHaveBeenCalled();

    fireEvent.click(hour);

    await waitFor(() =>
      expect(
        screen.getByTestId(`plan-sheet-hour-${BLOCK_HOUR}`),
      ).not.toHaveTextContent("Tap to take it off"),
    );
    await waitFor(() =>
      expect(mockUnplanCalendarBlock).toHaveBeenCalledWith(
        expect.anything(),
        ACCOUNT_BLOCK_ID,
      ),
    );
  });
});
