// #853 regression guard — a tap that lands between a sync's commit and React's
// passive effects must act on the state the user is looking at.
//
// The account sync dispatches straight into the reducer. `stateRef` (the
// synchronous copy every action handler reads as "previous") used to be
// refreshed in a passive `useEffect`, so for a moment after the sync's commit
// the DOM — and the handler closures it carries — already showed the ACCOUNT
// ids while `stateRef` still held the device-local ones. React does not flush
// pending passive effects before a discrete event, so a tap in that window
// looked its target up in stale state, found nothing, and silently did
// nothing ("Block drafted" toast, no proposal, no account write). That is the
// nondeterministic `plan-port-truth.spec.ts` failure #853 tracked.
//
// The tap is made deterministic here: a MutationObserver callback is a
// microtask, so it runs right after the commit that swapped the ids and before
// the passive-effect task. Each case also has a control tapping after effects
// have flushed, so a failure points at the window and not at the harness.
//
// Scaffold (real `WorkflowProvider` + `PlanSheet`, data-layer reads mocked)
// mirrors `PlanSheet.idSwapGuard.test.tsx`.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkflowState } from "@/lib/workflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { accountSnapshotKey } from "@/lib/workflowContext/accountSnapshot";
import {
  acceptLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { PlanSheet } from "./PlanSheet";

const AREA = GOLDEN_AREA_ID;
const ACCOUNT_TASK_ID = "99999999-9999-4999-8999-999999999999";
const ACCOUNT_PROPOSAL_ID = "88888888-8888-4888-8888-888888888888";

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
  mockCreateTimeBlockProposal,
} = vi.hoisted(() => ({
  // Never settles: the test is about whether the create is ATTEMPTED, and a
  // pending promise keeps the follow-up sync out of the picture.
  mockCreateTimeBlockProposal: vi.fn<
    (client: unknown, input: { task_id: string }) => Promise<never>
  >(() => new Promise(() => {})),
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
  mockCreateSupabaseBrowserClient: vi.fn(() => ({
    mocked: true,
    auth: {
      getUser: async () => ({
        data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
        error: null,
      }),
    },
  })),
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
    createTimeBlockProposal: mockCreateTimeBlockProposal,
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

const NOW = new Date("2026-08-20T09:30:00");

function localTaskState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Renew the volunteer insurance certificate");
  state = acceptLatestDraft(state);
  const task = { ...state.tasks.at(-1)!, first_tiny_step: "Open the folder" };
  return {
    ...state,
    tasks: [task],
    timeBlockProposals: [],
    calendarBlocks: [],
  };
}

/** A device-born task whose account twin is already known (alias recorded). */
function seedLocalTask() {
  const state = localTaskState();
  return {
    ...state,
    accountIdByLocalId: {
      captures: {},
      tasks: { [state.tasks[0].id]: ACCOUNT_TASK_ID },
      proposals: {},
      blocks: {},
      sessions: {},
    },
  };
}

/**
 * An account-backed task holding one device-born proposal whose account twin
 * is already known — the state right after the proposal's create resolved and
 * before the next full sync landed.
 */
function seedLocalProposal() {
  const state = localTaskState();
  const task = { ...state.tasks[0], id: ACCOUNT_TASK_ID };
  const start = new Date(NOW);
  start.setHours(14, 0, 0, 0);
  const proposal = {
    id: "proposal-900",
    user_id: task.user_id,
    area_id: task.area_id,
    task_id: ACCOUNT_TASK_ID,
    proposed_start: start.toISOString(),
    proposed_end: new Date(start.getTime() + 45 * 60 * 1000).toISOString(),
    rationale: "Drafted a block for 2p.",
    conflict_flag: false,
    status: "proposed" as const,
    created_at: "2026-08-20T09:00:00.000Z",
  };
  return {
    ...state,
    tasks: [task],
    timeBlockProposals: [proposal],
    accountIdByLocalId: {
      captures: {},
      tasks: {},
      proposals: { [proposal.id]: ACCOUNT_PROPOSAL_ID },
      blocks: {},
      sessions: {},
    },
  };
}

function accountTask(task: WorkflowState["tasks"][number]) {
  return { ...task, id: ACCOUNT_TASK_ID, area_id: persistedArea.id };
}

function accountProposal(
  proposal: WorkflowState["timeBlockProposals"][number],
) {
  return {
    id: ACCOUNT_PROPOSAL_ID,
    user_id: proposal.user_id,
    area_id: persistedArea.id,
    task_id: proposal.task_id,
    proposed_start: proposal.proposed_start,
    proposed_end: proposal.proposed_end,
    rationale_json: { note: proposal.rationale },
    conflict_flag: false,
    conflict_details_json: null,
    status: "proposed",
    created_at: proposal.created_at,
  };
}

function RefreshHarness() {
  const { refreshPersistedWorkflow } = useWorkflow();
  return (
    <button type="button" onClick={() => void refreshPersistedWorkflow()}>
      refresh
    </button>
  );
}

function renderPlan(seed: object, toasts: string[] = []) {
  window.sessionStorage.setItem(
    accountSnapshotKey(`account:${persistedArea.user_id}`),
    JSON.stringify(seed),
  );
  render(
    <WorkflowProvider>
      <RefreshHarness />
      <PlanSheet
        open
        onClose={vi.fn()}
        selectedAreaId={AREA}
        blocks={[]}
        timeDisplay="clock"
        now={NOW}
        onToast={(message) => toasts.push(message)}
      />
    </WorkflowProvider>,
  );
}

/**
 * Sync the account, and tap `tapTestId` as soon as `swappedTestId` (the row
 * under its ACCOUNT id) is in the DOM — either inside the commit-to-effects
 * window (`inWindow`) or after effects have flushed (the control).
 */
async function syncThenTap(
  swappedTestId: string,
  tapTestId: () => string,
  inWindow: boolean,
) {
  let tapped = false;
  const tap = () => {
    tapped = true;
    (
      document.querySelector(
        `[data-testid="${tapTestId()}"]`,
      ) as HTMLButtonElement
    ).click();
  };
  const observer = new MutationObserver(() => {
    if (tapped) return;
    if (!document.querySelector(`[data-testid="${swappedTestId}"]`)) return;
    observer.disconnect();
    if (inWindow) tap();
    else setTimeout(tap, 50);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() => expect(tapped).toBe(true));
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
  mockListExecutionReviewItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
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

describe("#853 guard: a tap right after a sync's commit acts on what is on screen", () => {
  describe.each([
    ["inside the commit-to-effects window", true],
    ["after effects have flushed (control)", false],
  ])("Draft a block, tapped %s", (_label, inWindow) => {
    it("drafts the block and sends its create to the account", async () => {
      const seed = seedLocalTask();
      const toasts: string[] = [];
      renderPlan(seed, toasts);
      await waitFor(() =>
        expect(
          screen.getByTestId(`plan-sheet-task-${seed.tasks[0].id}`),
        ).toBeInTheDocument(),
      );

      // The account catches up: the task's twin arrives and the local row is
      // retired for it, so the screen now carries the account id.
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [accountTask(seed.tasks[0])],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      await syncThenTap(
        `plan-sheet-task-${ACCOUNT_TASK_ID}`,
        () => "plan-sheet-draft-block",
        inWindow,
      );

      expect(toasts).toContain("Block drafted");
      await waitFor(() =>
        expect(
          screen.getByTestId("plan-sheet-proposals").querySelectorAll("li"),
        ).toHaveLength(1),
      );
      await waitFor(() =>
        expect(mockCreateTimeBlockProposal).toHaveBeenCalledTimes(1),
      );
      expect(mockCreateTimeBlockProposal.mock.calls[0][1]).toMatchObject({
        task_id: ACCOUNT_TASK_ID,
      });
    });
  });

  describe.each([
    ["inside the commit-to-effects window", true],
    ["after effects have flushed (control)", false],
  ])("Accept a drafted block, tapped %s", (_label, inWindow) => {
    it("puts the block on the rail", async () => {
      const seed = seedLocalProposal();
      // This task already belongs to the account. Keep it in the initial
      // account read while the local proposal is waiting for its own twin.
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [accountTask(seed.tasks[0])],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      renderPlan(seed);
      await waitFor(() =>
        expect(
          screen.getByTestId(
            `plan-sheet-proposal-accept-${seed.timeBlockProposals[0].id}`,
          ),
        ).toBeInTheDocument(),
      );

      // The account catches up: the proposal's twin arrives and the local
      // card is retired for it, so its accept control now carries the
      // account id.
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [accountTask(seed.tasks[0])],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      mockListPlanningItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        proposals: [accountProposal(seed.timeBlockProposals[0])],
        blocks: [],
      });
      const accept = `plan-sheet-proposal-accept-${ACCOUNT_PROPOSAL_ID}`;
      await syncThenTap(accept, () => accept, inWindow);

      await waitFor(() =>
        expect(screen.getByTestId("plan-sheet-hour-14")).toHaveTextContent(
          "Tap to take it off",
        ),
      );
    });
  });
});
