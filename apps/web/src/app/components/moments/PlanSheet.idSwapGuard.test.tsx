// #886 regression guard — PlanSheet's "To place" task list keyed its rows
// on raw `task.id` while its own proposal list already used `stableWorkflowKey`
// (#844), and the `firstMoveDrafts` dictionary was keyed by raw id too. A task
// born on this device gets a NEW id the moment the account catches up
// (`mergePersistedRows` retires the local row for its account twin), so
// without the fix React tears the row down and rebuilds it — losing selection
// mid-tap — and any first-move text typed under the old id is orphaned in a
// dictionary keyed by an id nothing renders under anymore.
//
// Drives the REAL `WorkflowProvider` + `PlanSheet`, mocking only the
// data-layer reads `refreshPersistedWorkflow` calls, mirroring
// `WorkflowContext.personLinks.test.tsx`'s scaffold. The alias itself
// (`accountIdByLocalId.tasks`) is seeded directly into the hydrated state —
// how it gets recorded is covered by `localRowRetirementGuard.test.ts` and
// the personLinks suite; this test is about what the SWAP does to the live
// DOM and to `firstMoveDrafts`, which neither of those exercises.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  acceptLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { PlanSheet } from "./PlanSheet";

const AREA = GOLDEN_AREA_ID;
const ACCOUNT_TASK_ID = "99999999-9999-4999-8999-999999999999";

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
} = vi.hoisted(() => ({
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

/**
 * One local (device-born) task, ready to place, with no first move yet —
 * built by driving the SAME reducer transitions the app drives (capture ->
 * accept), then handed to the provider through its device-storage hydration
 * path, exactly like PlanSheet.test.tsx's seed. The alias is pre-recorded —
 * the state a device is in right after an account create resolves but
 * before the next full re-sync has landed.
 */
function seedState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Renew the volunteer insurance certificate");
  state = acceptLatestDraft(state);
  const task = { ...state.tasks.at(-1)!, first_tiny_step: null };
  return {
    ...state,
    tasks: [task],
    timeBlockProposals: [],
    calendarBlocks: [],
    accountIdByLocalId: {
      captures: {},
      tasks: { [task.id]: ACCOUNT_TASK_ID },
      proposals: {},
      blocks: {},
      sessions: {},
    },
  };
}

function accountTaskFrom(local: ReturnType<typeof seedState>["tasks"][number]) {
  // Persisted-space shape: `toWorkflowTask` remaps `area_id` back through
  // `persistedArea` to the workflow area id, so this carries the DB area id.
  return { ...local, id: ACCOUNT_TASK_ID, area_id: persistedArea.id };
}

function RefreshHarness() {
  const { refreshPersistedWorkflow } = useWorkflow();
  return (
    <button type="button" onClick={() => void refreshPersistedWorkflow()}>
      refresh
    </button>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockListAreas.mockResolvedValue({
    provider: "supabase",
    areas: [persistedArea],
  });
  mockListCaptureItems.mockResolvedValue({
    provider: "supabase",
    captures: [],
  });
  mockListPlanningItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    proposals: [],
    blocks: [],
  });
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

describe("#886 guard: PlanSheet's task list and first-move drafts survive the id swap", () => {
  it("keeps the same DOM node and the typed first-move text after the local task becomes an account row", async () => {
    const SEED = seedState();
    const localTask = SEED.tasks[0];
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));

    // Nothing on the account yet — the local row is still the only copy.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    render(
      <WorkflowProvider>
        <RefreshHarness />
        <PlanSheet
          open
          onClose={vi.fn()}
          selectedAreaId={AREA}
          blocks={[]}
          timeDisplay="clock"
          now={new Date("2026-08-20T09:30:00")}
        />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId(`plan-sheet-task-${localTask.id}`),
      ).toBeInTheDocument(),
    );
    const beforeNode = screen.getByTestId(`plan-sheet-task-${localTask.id}`);

    // Type a first-move draft while the task still carries its local id.
    fireEvent.change(
      screen.getByTestId(`plan-sheet-first-move-input-${localTask.id}`),
      { target: { value: "Find last year's certificate" } },
    );

    // The account catches up: the next sync's payload carries the task's
    // account twin, and the reducer retires the local row for it (the alias
    // was seeded above).
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [accountTaskFrom(localTask)],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() =>
      expect(
        screen.getByTestId(`plan-sheet-task-${ACCOUNT_TASK_ID}`),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId(`plan-sheet-task-${localTask.id}`),
    ).not.toBeInTheDocument();

    // THE DISCRIMINATOR — the SAME DOM node, not a destroy-and-recreate that
    // merely looks the same. Before the #886 fix the list key was the raw
    // (now swapped) task id, so React would have torn this element down and
    // rebuilt it, losing focus/selection mid-tap (the #844 class).
    expect(screen.getByTestId(`plan-sheet-task-${ACCOUNT_TASK_ID}`)).toBe(
      beforeNode,
    );

    // The typed first-move text is still there under the swapped id — the
    // `firstMoveDrafts` alias-aware lookup, not just the react key. Before
    // the fix this dictionary was still keyed by the old local id, and the
    // input read from the new (account) id would come back empty.
    expect(
      screen.getByTestId(`plan-sheet-first-move-input-${ACCOUNT_TASK_ID}`),
    ).toHaveValue("Find last year's certificate");
  });
});
