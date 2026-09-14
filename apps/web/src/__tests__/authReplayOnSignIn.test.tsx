// #960 defects 1+2 — integration pin.
//
// Root cause (adjudicated, see the comment on GitHub issue #960): the
// account-sync effect in `WorkflowContext.tsx` has an all-`[]`-stable dep
// array, so it runs EXACTLY ONCE per document. `WorkflowProvider` mounts from
// the root layout, wrapping every route including `/login` — so when that one
// run lands signed-out (the ordinary case for `/login`), `markSignedOutLocal`
// latches the posture and `persistedAreasRef` stays `[]` forever.
// `login/page.tsx`'s post-sign-in navigation is a client-side `router.push`,
// which never remounts the provider, so nothing ever gets a second chance to
// populate the refs or drain the journal — until this fix added an
// `onAuthStateChange` listener that re-runs the same sync body and, strictly
// afterward, replays the journal.
//
// This file drives the REAL `WorkflowProvider` with a Supabase client whose
// data-layer functions are mocked (not raw HTTP) — the same boundary
// `WorkflowContext.areas.test.tsx` and `durableWinsReviewsGuard.test.tsx` use.
// "POST /rest/v1/capture_items is issued" is proven at that boundary:
// `syncJournaledCapture` (the function that performs the actual PostgREST
// upsert — see `lib/data/workflow/capture.ts` and its own unit tests in
// `lib/data/workflow.test.ts` for the literal request shape) is invoked with
// the resolved account area id once the sign-in listener fires.
import "fake-indexeddb/auto";
import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import {
  journalPlanUnplacementWrite,
  journalWinWrite,
  journalReviewWrite,
} from "@/lib/durability/durableWrites";
import {
  ACCOUNT_NEEDS_APP_UPDATE,
  ACCOUNT_SAVE_FAILED,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
} from "@/lib/statusVocabulary";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { resolveDeviceSaveNotice } from "@/lib/deviceSaveNotice";
import { PersistenceWriteError } from "@/lib/persistenceFailureKind";

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: vi.fn() }),
}));

// A task that already synced in some EARLIER session — its id is a real
// account uuid, mirrored to `sessionStorage` the way every workflow write is
// (`WorkflowContext.tsx`'s state-mirror effect). This is what makes the win
// leg of the pin realistic rather than contrived: `resolveWinIds` (see
// `WorkflowContext.tsx`) resolves a task id straight through when it is
// already a uuid (`persistedIdForLocalId`), with no alias-map lookup needed —
// exactly the shape of a task the account already knows about, confirmed
// against while this device happens to be signed out right now.
const PRESYNCED_TASK_ID = "33333333-3333-4333-8333-333333333333";

// #967 follow-up review, finding 2: the real `listPendingWrites`, captured
// fresh each `beforeEach` via `vi.importActual` (which always bypasses
// `vi.mock`, regardless of call site) — so the one test that overrides
// `mockListPendingWrites` for its own `"review"` argument can still route
// every OTHER argument (and the no-arg call `replayPendingWritesUnlocked`
// makes) to the genuine implementation.
let listPendingWritesActual: (
  entity?: Parameters<typeof listPendingWrites>[0],
) => ReturnType<typeof listPendingWrites>;

function seedSessionStorageWithPresyncedTask() {
  const now = "2026-08-01T00:00:00.000Z";
  const seededState = {
    areas: [
      {
        id: "area-main-job",
        user_id: PERSISTED_AREA.user_id,
        name: "Main Job",
        color: "#4c80cd",
        created_at: now,
      },
    ],
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      {
        id: PRESYNCED_TASK_ID,
        user_id: PERSISTED_AREA.user_id,
        area_id: "area-main-job",
        project_id: null,
        source_capture_item_id: null,
        title: "Ship the onboarding flow",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        is_reversible: null,
        energy_type: null,
        estimated_minutes_low: null,
        estimated_minutes_high: null,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: null,
        created_at: now,
        updated_at: now,
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
    accountIdByLocalId: {},
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seededState));
}

const PERSISTED_AREA = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Main Job",
  slug: "main-job",
  description: null,
  color: "#4c80cd",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockListWinRecords,
  mockListOverrideRecords,
  mockListDurationProfiles,
  mockListSuggestionRecords,
  mockSyncJournaledCapture,
  mockSyncJournaledWin,
  mockSyncJournaledReviewEntry,
  mockCreateSupabaseBrowserClient,
  mockGetUser,
  mockListPendingWrites,
  authListener,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
  mockSyncJournaledCapture: vi.fn(),
  mockSyncJournaledWin: vi.fn(),
  mockSyncJournaledReviewEntry: vi.fn(),
  mockCreateSupabaseBrowserClient: vi.fn(),
  // #967 follow-up review, finding 2: lets ONE test fail the pre-replay
  // `listPendingWrites("review")` snapshot inside `runAccountSync` without
  // disturbing `replayPendingWritesUnlocked`'s own `listPendingWrites()`
  // (no-arg) call or `refreshJournalledDurableState`'s — every other call,
  // in every other test, is routed to the real implementation (see the
  // `beforeEach` passthrough below).
  mockListPendingWrites: vi.fn(),
  // #967 review: the identity `readbackAccountReviewClosedDays` checks
  // before/after its own account read. A single shared `vi.fn()` (not a
  // fresh one per `createSupabaseBrowserClient()` call) so a test can
  // sequence `.mockResolvedValueOnce()` across the two calls that ONE
  // readback makes, to simulate a session change mid-read.
  mockGetUser: vi.fn(),
  // Captures the callback `WorkflowProvider`'s auth listener registers, so
  // the test can fire a SIGNED_IN event without a remount — the exact shape
  // of `login/page.tsx`'s post-sign-in `router.push`.
  authListener: {
    callback: null as
      | ((event: string, session: { user: { id: string } } | null) => void)
      | null,
  },
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
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
    syncJournaledCapture: mockSyncJournaledCapture,
    syncJournaledWin: mockSyncJournaledWin,
    syncJournaledReviewEntry: mockSyncJournaledReviewEntry,
  };
});

vi.mock("@/lib/durability/pendingWriteJournal", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/durability/pendingWriteJournal")
  >("@/lib/durability/pendingWriteJournal");
  return {
    ...actual,
    listPendingWrites: mockListPendingWrites,
  };
});

function SIGNED_OUT_ERROR() {
  // Recognized by `isSignedOutError` (reducerCore.ts) — the real shape
  // `requireSupabaseUser` throws when a client exists but no session does.
  return new Error("Sign in before loading areas from Supabase.");
}

function Harness() {
  const {
    state,
    selectedAreaId,
    submitCaptureText,
    confirmWin,
    syncStatus,
    accountClosedDays,
    journalledClosedDays,
    journalledLoggedWins,
    journalledCompletedSessionDays,
    journalledRollupKeys,
    retryPendingAccountWrites,
    areasReadbackSettled,
  } = useWorkflow();
  const unsortedCapture = state.captureItems[0];
  // #967 root/independent review: assert the ACTUAL composed notice
  // (`resolveDeviceSaveNotice`), not only the raw `pendingSaveFailed` flag —
  // the flag alone does not prove the shared notice both real consumers
  // read actually changes.
  const notice = resolveDeviceSaveNotice(syncStatus);
  // #967 manual retry, root review: an explicit boundary for the WRAPPER
  // call's OWN settlement — `retryPendingAccountWrites()`'s in-flight guard
  // makes it resolve near-instantly when a pass is already running, so a
  // fixed sleep cannot reliably distinguish "the guard returned early" from
  // "a real pass ran". Tests wait on this count instead of a timer.
  const [retrySettledCount, setRetrySettledCount] = useState(0);

  return (
    <div>
      <span data-testid="sync-account">{syncStatus.account}</span>
      <span data-testid="sync-signed-out">
        {String(syncStatus.signedOut ?? false)}
      </span>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <span data-testid="capture-area">{unsortedCapture?.area_id ?? ""}</span>
      <span data-testid="account-closed-days">
        {accountClosedDays.join(",")}
      </span>
      <span data-testid="journalled-closed-days">
        {journalledClosedDays.join(",")}
      </span>
      <span data-testid="journalled-logged-wins">
        {journalledLoggedWins.map((win) => win.taskId).join(",")}
      </span>
      <span data-testid="journalled-completed-session-days">
        {journalledCompletedSessionDays.join(",")}
      </span>
      <span data-testid="journalled-rollup-keys">
        {journalledRollupKeys.join(",")}
      </span>
      <span data-testid="task-count">{state.tasks.length}</span>
      <span data-testid="pending-save-failed">
        {String(syncStatus.pendingSaveFailed ?? false)}
      </span>
      <span data-testid="pending-save-failure-kind">
        {syncStatus.pendingSaveFailureKind ?? ""}
      </span>
      <span data-testid="notice-tone">{notice?.tone ?? ""}</span>
      <span data-testid="notice-message">{notice?.message ?? ""}</span>
      <span data-testid="retry-settled-count">{retrySettledCount}</span>
      <span data-testid="areas-readback-settled">
        {String(areasReadbackSettled)}
      </span>
      <button
        type="button"
        onClick={() =>
          submitCaptureText("Call the landlord back", selectedAreaId)
        }
      >
        Capture
      </button>
      <button
        type="button"
        onClick={() => {
          void confirmWin({
            taskId: PRESYNCED_TASK_ID,
            title: "Shipped the onboarding flow",
          });
        }}
      >
        Confirm win
      </button>
      <button
        type="button"
        onClick={() => {
          void retryPendingAccountWrites().then(() => {
            setRetrySettledCount((count) => count + 1);
          });
        }}
      >
        Retry pending writes
      </button>
    </div>
  );
}

beforeEach(async () => {
  authListener.callback = null;

  mockGetUser.mockReset().mockResolvedValue({
    data: { user: { id: PERSISTED_AREA.user_id } },
    error: null,
  });

  mockCreateSupabaseBrowserClient.mockReset().mockReturnValue({
    mocked: true,
    auth: {
      onAuthStateChange: (
        callback: (
          event: string,
          session: { user: { id: string } } | null,
        ) => void,
      ) => {
        authListener.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getUser: mockGetUser,
    },
  });

  // The failing path, reproduced exactly: a client exists (the env is
  // configured) but no session does yet — every account read throws the
  // signed-out shape until the test fires SIGNED_IN.
  mockListAreas.mockReset().mockRejectedValue(SIGNED_OUT_ERROR());
  mockListCaptureItems
    .mockReset()
    .mockResolvedValue({ provider: "supabase", captures: [] });
  mockListPlanningItems.mockReset().mockResolvedValue({
    provider: "supabase",
    proposals: [],
  });
  mockListExecutionReviewItems.mockReset().mockResolvedValue({
    provider: "supabase",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  });
  mockListWinRecords.mockReset().mockResolvedValue({
    provider: "supabase",
    winRecords: [],
  });
  mockListOverrideRecords
    .mockReset()
    .mockResolvedValue({ provider: "supabase", overrideRecords: [] });
  mockListDurationProfiles
    .mockReset()
    .mockResolvedValue({ provider: "supabase", durationProfiles: [] });
  mockListSuggestionRecords
    .mockReset()
    .mockResolvedValue({ provider: "supabase", suggestionRecords: [] });
  mockSyncJournaledCapture.mockReset();
  mockSyncJournaledWin.mockReset();
  mockSyncJournaledReviewEntry.mockReset();

  // Default: every call routes straight through to the real journal, exactly
  // as if this module were never mocked. Only the one #967 follow-up-review
  // negative test below overrides this, and only for its own `"review"` arg.
  const actualPendingWriteJournal = await vi.importActual<
    typeof import("@/lib/durability/pendingWriteJournal")
  >("@/lib/durability/pendingWriteJournal");
  listPendingWritesActual = actualPendingWriteJournal.listPendingWrites;
  mockListPendingWrites.mockReset().mockImplementation(listPendingWritesActual);

  window.sessionStorage.clear();
  await clearPendingWrites();
});

afterEach(async () => {
  window.sessionStorage.clear();
  await clearPendingWrites();
});

describe("#967 cross-runtime compensation replay", () => {
  it("finds an acknowledged placement by its client write id, unplans it, and acknowledges the queued undo", async () => {
    const originalClientWriteId = "placement-acknowledged-by-other-runtime";
    const workflowBlockId = "local-block-with-no-tab-alias";
    const proposalId = "44444444-4444-4444-8444-444444444444";
    const blockId = "55555555-5555-4555-8555-555555555555";
    const taskId = "66666666-6666-4666-8666-666666666666";

    // Model the state left after another runtime acknowledged the original:
    // this tab sees only its later undo and has no block alias to reuse.
    await journalPlanUnplacementWrite({
      workflowBlockId,
      persistedBlockId: null,
      supersedesClientWriteId: originalClientWriteId,
    });
    const beforeReplay = await listPendingWrites();
    expect(beforeReplay).toHaveLength(1);
    expect(beforeReplay[0]?.entity).toBe("plan_unplacement");
    expect(beforeReplay[0]?.payload.supersedes_client_write_id).toBe(
      originalClientWriteId,
    );

    const proposalMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: proposalId },
      error: null,
    });
    const proposalClientWriteEq = vi.fn().mockReturnValue({
      maybeSingle: proposalMaybeSingle,
    });
    const proposalUserEq = vi.fn().mockReturnValue({
      eq: proposalClientWriteEq,
    });
    const proposalSelect = vi.fn().mockReturnValue({ eq: proposalUserEq });

    const blockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: blockId },
      error: null,
    });
    const blockProposalEq = vi.fn().mockReturnValue({
      maybeSingle: blockMaybeSingle,
    });
    const blockUserEq = vi.fn().mockReturnValue({ eq: blockProposalEq });
    const blockSelect = vi.fn().mockReturnValue({ eq: blockUserEq });

    const from = vi.fn((table: string) => {
      if (table === "time_block_proposals") {
        return { select: proposalSelect };
      }
      if (table === "calendar_blocks") return { select: blockSelect };
      throw new Error(`Unexpected account lookup table: ${table}`);
    });

    let accountBlockStatus = "scheduled";
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "unplan_calendar_block" || args.p_block_id !== blockId) {
        return { data: null, error: { message: "Unexpected RPC" } };
      }
      accountBlockStatus = "cancelled";
      return {
        data: {
          block: {
            id: blockId,
            user_id: PERSISTED_AREA.user_id,
            area_id: PERSISTED_AREA.id,
            proposal_id: proposalId,
            task_id: taskId,
            google_event_id: null,
            start_at: "2026-09-14T13:00:00.000Z",
            end_at: "2026-09-14T14:00:00.000Z",
            status: accountBlockStatus,
            created_at: "2026-09-14T12:00:00.000Z",
            updated_at: "2026-09-14T12:05:00.000Z",
          },
          task: null,
        },
        error: null,
      };
    });

    mockCreateSupabaseBrowserClient.mockReturnValue({
      from,
      rpc,
      auth: {
        onAuthStateChange: (
          callback: (
            event: string,
            session: { user: { id: string } } | null,
          ) => void,
        ) => {
          authListener.callback = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
        getUser: mockGetUser,
      },
    });
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    await waitFor(async () => {
      expect(await listPendingWrites("plan_unplacement")).toHaveLength(0);
    });

    expect(accountBlockStatus).toBe("cancelled");
    expect(from).toHaveBeenNthCalledWith(1, "time_block_proposals");
    expect(proposalSelect).toHaveBeenCalledWith("id");
    expect(proposalUserEq).toHaveBeenCalledWith(
      "user_id",
      PERSISTED_AREA.user_id,
    );
    expect(proposalClientWriteEq).toHaveBeenCalledWith(
      "client_write_id",
      originalClientWriteId,
    );
    expect(from).toHaveBeenNthCalledWith(2, "calendar_blocks");
    expect(blockSelect).toHaveBeenCalledWith("id");
    expect(blockUserEq).toHaveBeenCalledWith("user_id", PERSISTED_AREA.user_id);
    expect(blockProposalEq).toHaveBeenCalledWith("proposal_id", proposalId);
    expect(rpc).toHaveBeenCalledWith("unplan_calendar_block", {
      p_block_id: blockId,
    });
  });
});

describe("#960 defects 1+2: a session arriving without a remount drains the journal", () => {
  it("journals a capture and a win while signed out, then delivers both once SIGNED_IN fires with no remount", async () => {
    // A task from an earlier signed-in session is already mirrored to this
    // tab's storage — the realistic shape of "signed out right now, but the
    // account already knows this task".
    seedSessionStorageWithPresyncedTask();

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    // Baseline (#960 defect 2, negative control): the mount's one sync
    // attempt fails signed-out, and the masthead must say so plainly.
    await waitFor(() =>
      expect(screen.getByTestId("sync-signed-out")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("sync-message")).toHaveTextContent(
      SIGNED_OUT_SAVING_ON_THIS_DEVICE,
    );
    expect(mockListAreas).toHaveBeenCalledTimes(1);

    // A capture with an area selected, made while still signed out — the
    // exact #960 defect 3 window (a client exists, but the area cannot
    // resolve because defect 1 left `persistedAreasRef` empty).
    fireEvent.click(screen.getByText("Capture"));
    await waitFor(async () => {
      const pending = await listPendingWrites("capture");
      expect(pending).toHaveLength(1);
    });
    // RED against origin/main: the pre-fix `persistCapture` never journals
    // this at all (`markLocalOnly` and return), so this assertion — and every
    // one below it — fails on the pre-fix source.
    expect(mockSyncJournaledCapture).not.toHaveBeenCalled();

    // A win confirmed the same way — already durable since #737-A, but never
    // delivered because the mount's own replay ran before areas resolved.
    fireEvent.click(screen.getByText("Confirm win"));
    await waitFor(async () => {
      const pending = await listPendingWrites("win");
      expect(pending).toHaveLength(1);
    });
    expect(mockSyncJournaledWin).not.toHaveBeenCalled();

    // The session arrives. No remount: this is `login/page.tsx`'s
    // `router.push`, simulated by firing the SAME callback the provider's
    // listener registered.
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });
    // The account's own copy of the presynced task, keyed by the SAME uuid —
    // without this, `mergePersistedRows` (reducerCore.ts) retires the local
    // uuid-id row the instant this read lands (a uuid-id local row absent
    // from a fresh account read is treated as already migrated elsewhere),
    // and `resolveWinIds`'s task lookup would find nothing.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        {
          id: PRESYNCED_TASK_ID,
          user_id: PERSISTED_AREA.user_id,
          area_id: PERSISTED_AREA.id,
          project_id: null,
          source_capture_item_id: null,
          title: "Shipped the onboarding flow",
          description: null,
          status: "active",
          priority_score: null,
          priority_confidence: null,
          task_type: null,
          is_reversible: null,
          energy_type: null,
          estimated_minutes_low: null,
          estimated_minutes_high: null,
          due_at: null,
          definition_of_done: null,
          first_tiny_step: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mockSyncJournaledCapture.mockResolvedValue({
      provider: "supabase",
      captureId: "77777777-7777-4777-8777-777777777777",
    });
    mockSyncJournaledWin.mockResolvedValue({ provider: "supabase" });

    await act(async () => {
      authListener.callback?.("SIGNED_IN", {
        user: { id: PERSISTED_AREA.user_id },
      });
      // Flushes the async sync-then-replay chain the listener kicks off —
      // `waitFor` alone races ahead of `act`'s microtask flush here because
      // the listener callback itself is synchronous even though its body is
      // not (see this repo's own note: RTL `waitFor` does not flush effects).
      await Promise.resolve();
      await Promise.resolve();
    });

    // (a) the capture's write reaches the account layer — the POST this
    // pin's contract asks for, at the boundary this test can observe without
    // a raw HTTP mock (see `syncJournaledCapture`'s own request-shape unit
    // tests in `lib/data/workflow.test.ts`).
    await waitFor(() => expect(mockSyncJournaledCapture).toHaveBeenCalled());
    // `syncCapture` is wired as `(args) => syncJournaledCapture(client, args)`
    // — the client is the first argument, the request shape is the second.
    expect(mockSyncJournaledCapture).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        area_id: PERSISTED_AREA.id,
        raw_text: "Call the landlord back",
      }),
    );

    // (b) the win leaves the journal — ORDER was the bug: replay must run
    // strictly after `applyPersistedAreas`/`syncPersistedWorkflowRows`
    // populate the refs, or `winHandler` throws "not known on this device"
    // and re-queues itself forever.
    await waitFor(async () => {
      const pending = await listPendingWrites("win");
      expect(pending).toHaveLength(0);
    });
    expect(mockSyncJournaledWin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ area_id: PERSISTED_AREA.id }),
    );

    // The capture leaves the journal too, once its account id is known.
    await waitFor(async () => {
      const pending = await listPendingWrites("capture");
      expect(pending).toHaveLength(0);
    });

    // #960 defect 2: the stale signed-out posture clears — same event, same
    // sync body, `markAccountSynced` at the end of it.
    await waitFor(() =>
      expect(screen.getByTestId("sync-signed-out")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("sync-message")).not.toHaveTextContent(
      SIGNED_OUT_SAVING_ON_THIS_DEVICE,
    );

    // #960 review finding 1 — POSITIVE assertion, not merely "the signed-out
    // string is gone". `markAccountSynced` reads `pendingLocalChanges`
    // SYNCHRONOUSLY, so without `runAccountSync`'s post-replay
    // `refreshPendingLocalChanges()` call, a drain that fully emptied the
    // journal (proven above: both pending counts are 0) still left the
    // masthead holding the STALE "some of your work is saved on this
    // device" fallback from before the drain — a chip that keeps claiming
    // device-only when every write has in fact synced. The account posture
    // must read `synced` with nothing left to say.
    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
    });
    expect(screen.getByTestId("sync-message").textContent).toBe("");
  });

  it("companion assertion: a genuinely signed-out session keeps showing the signed-out sentence (the fix cannot pass by deleting the state)", async () => {
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("sync-signed-out")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("sync-message")).toHaveTextContent(
      SIGNED_OUT_SAVING_ON_THIS_DEVICE,
    );

    // No SIGNED_IN ever fires. Give any stray microtask a chance to run, then
    // confirm the sentence is still exactly what it was — the listener must
    // not clear a posture that is still true.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("sync-signed-out")).toHaveTextContent("true");
    expect(screen.getByTestId("sync-message")).toHaveTextContent(
      SIGNED_OUT_SAVING_ON_THIS_DEVICE,
    );
  });

  // #960 review finding 2 — completeness. The two tests above both start
  // from a SIGNED-OUT mount, which never reaches
  // `runAccountSync`'s posture guard at all on the way in (the guard only
  // matters for the LISTENER's decision to re-run). The bug this test pins
  // is different: an ORDINARY signed-in fresh load — `INITIAL_SESSION`
  // firing with a session already present, no prior signed-out posture, the
  // shape a real return visit or hard reload takes. `initialSyncStatus`
  // starts `account: "checking"`, which fails the listener's own
  // `local-only`/`signedOut` guard, so the listener does nothing here BY
  // DESIGN — the mount call itself must be the one that drains the journal,
  // ordered, with no separate un-awaited replay racing it. Red on the
  // pre-review-fix code: the mount call passed no `replayAfter`, so a win
  // journalled in an earlier session (device-durable, per #737-A) was left
  // to the old un-awaited "sync on mount" replay, which could fire BEFORE
  // `persistedAreasRef` populated and had no ordering guarantee at all.
  it("an ordinary signed-in fresh load (INITIAL_SESSION, no prior signed-out posture) still drains a journalled win with no user write", async () => {
    // A win journalled in an EARLIER session (e.g. the tab crashed or was
    // closed before the account took it) — present in the device journal
    // before this mount even starts, exactly like a real reload.
    await journalWinWrite({
      workflowTaskId: PRESYNCED_TASK_ID,
      persistedTaskId: PRESYNCED_TASK_ID,
      persistedAreaId: null,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: "2026-08-29",
    });

    seedSessionStorageWithPresyncedTask();

    // Signed in from the very first paint — `listAreas` succeeds on attempt
    // 1, never throwing the signed-out shape the other two tests rely on.
    //
    // Deliberately delayed (a real macrotask, not a microtask): without this,
    // every mocked promise in this file resolves in the same microtask tick,
    // and a race between two un-awaited calls can accidentally land in the
    // "lucky" order every single run — proving nothing about whether an
    // ORDERING GUARANTEE exists versus mere scheduling coincidence. Forcing
    // `listAreas` to resolve LATER than an un-awaited `replayJournaledWrites`
    // call would (fake-indexeddb's own round trip) is what makes this test
    // RED, deterministically, on the pre-review-fix mount effect (which fired
    // the replay independently of this call, so a slow `listAreas` meant the
    // replay ran first, found `persistedAreasRef` still empty, and had no
    // second chance) and GREEN, deterministically, once the mount path is a
    // single ordered chain (`runAccountSync({ replayAfter: true })`), which
    // by construction cannot run the replay before this promise settles no
    // matter how long it takes.
    mockListAreas.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ provider: "supabase", areas: [PERSISTED_AREA] }),
            30,
          );
        }),
    );
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        {
          id: PRESYNCED_TASK_ID,
          user_id: PERSISTED_AREA.user_id,
          area_id: PERSISTED_AREA.id,
          project_id: null,
          source_capture_item_id: null,
          title: "Shipped the onboarding flow",
          description: null,
          status: "active",
          priority_score: null,
          priority_confidence: null,
          task_type: null,
          is_reversible: null,
          energy_type: null,
          estimated_minutes_low: null,
          estimated_minutes_high: null,
          due_at: null,
          definition_of_done: null,
          first_tiny_step: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mockSyncJournaledWin.mockResolvedValue({ provider: "supabase" });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    // No click, no auth event fired by this test — the auth listener may or
    // may not fire INITIAL_SESSION on its own in this fake client (it never
    // does; `authListener.callback` is only invoked explicitly elsewhere in
    // this file), so this is deliberately proving the MOUNT path alone
    // drains the journal, exactly the completeness gap finding 2 named.
    await waitFor(async () => {
      const pending = await listPendingWrites("win");
      expect(pending).toHaveLength(0);
    });
    expect(mockSyncJournaledWin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source_task_id: PRESYNCED_TASK_ID }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
    });
  });

  // #967: a daily close journalled in an earlier session (device closed the
  // day while the account was unreachable) must not lose its closed-day
  // truth once the mount's own replay delivers it. Mirrors the win test
  // above's shape (a pre-seeded journal entry, a signed-in fresh mount) for
  // the review lane instead, with one addition wins don't need:
  // `syncPersistedWorkflowRows` (called BEFORE replay) already reads reviews
  // once, so the mock must answer that FIRST read with nothing and only a
  // LATER read with the delivered row — that sequencing is what proves the
  // transfer this fix adds, not merely that the review eventually reaches
  // the account.
  it("a successful daily-review replay transfers closed-day truth to the account before the journal refresh clears it (#967)", async () => {
    const day = "2026-08-29";

    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: day,
      periodEnd: day,
      summaryJson: {},
    });

    seedSessionStorageWithPresyncedTask();

    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });

    // The FIRST account read — inside `syncPersistedWorkflowRows`, which
    // `runAccountSync` calls BEFORE replay — sees no reviews yet, but DOES
    // carry the account's own copy of the presynced task, exactly like the
    // "ordinary signed-in fresh load" test above: without it, THIS read's own
    // (unrelated, real, always-dispatched) whole-workflow merge would retire
    // the uuid-id local task row on the spot, before replay even runs, and
    // the concurrent-state assertion below would prove nothing. This is the
    // exact "GET [] -> POST 201 -> no further GET" moment from the CI trace
    // (`pr987-signed-in-diagnosis.md`, finding 1) for reviews specifically.
    mockListExecutionReviewItems.mockResolvedValueOnce({
      provider: "supabase",
      tasks: [
        {
          id: PRESYNCED_TASK_ID,
          user_id: PERSISTED_AREA.user_id,
          area_id: PERSISTED_AREA.id,
          project_id: null,
          source_capture_item_id: null,
          title: "Shipped the onboarding flow",
          description: null,
          status: "active",
          priority_score: null,
          priority_confidence: null,
          task_type: null,
          is_reversible: null,
          energy_type: null,
          estimated_minutes_low: null,
          estimated_minutes_high: null,
          due_at: null,
          definition_of_done: null,
          first_tiny_step: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    // #967 CI repair (PR993, 34759295095): `journalled-closed-days` clears
    // in a SEPARATE, later step than `accountClosedDays` is set —
    // `runAccountSync` awaits `readbackAccountReviewClosedDays` (which sets
    // `accountClosedDays` directly) and only THEN, if confirmed, awaits
    // `refreshJournalledDurableState()`, whose OWN `listPendingWrites()`
    // read is what clears the device tier. Both tiers legitimately report
    // the day closed at once in between; that overlap is SAFE
    // (`resolveDayClose`'s union still reads "closed" either way) and is
    // exactly what #967 intends — only BOTH tiers empty is forbidden. A
    // synchronous assertion right after the first tier updates cannot tell
    // whether the second has run yet, which is what let CI fail here once.
    //
    // `accountReadbackResponded` is the named lifecycle gate: true once the
    // account readback's own `listExecutionReviewItems` call has been asked
    // to respond with the confirmed review rows — the one signal that
    // reliably precedes the specific `listPendingWrites()` call this test
    // needs to hold, regardless of how many other journal reads happen
    // before it.
    let accountReadbackResponded = false;
    // The SECOND account read is `readbackAccountReviewClosedDays`'s own —
    // this fix's seam. Its `tasks` come back EMPTY on purpose: if this seam
    // ever dispatched what it reads (the #984 failure mode it exists to
    // avoid), `mergePersistedRows` would retire the presynced task the
    // moment this response landed, and `task-count` below would drop to 0.
    mockListExecutionReviewItems.mockImplementation(async () => {
      accountReadbackResponded = true;
      return {
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            user_id: PERSISTED_AREA.user_id,
            area_id: null,
            review_type: "daily",
            period_start: day,
            period_end: day,
            summary_json: {},
            created_at: "2026-08-29T00:00:00.000Z",
          },
        ],
      };
    });
    mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

    // Defer the FIRST journal read that starts once the readback has
    // responded — the confirmation-gated `refreshJournalledDurableState()`
    // call, the only thing that can clear `journalledClosedDays`. Same
    // named `mockListPendingWrites` seam the stale-read/ordering tests
    // above use — no new mock, no sleep, no production hook.
    let releaseJournalRead!: (
      value: Awaited<ReturnType<typeof listPendingWrites>>,
    ) => void;
    let journalReadIntercepted = false;
    mockListPendingWrites.mockImplementation((entity) => {
      if (
        entity === undefined &&
        accountReadbackResponded &&
        !journalReadIntercepted
      ) {
        journalReadIntercepted = true;
        return new Promise((resolve) => {
          releaseJournalRead = resolve;
        });
      }
      return listPendingWritesActual(entity);
    });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    // The journalled review drains — the replay succeeded and reached the
    // account (the part that already worked before this fix).
    await waitFor(async () => {
      const pending = await listPendingWritesActual("review");
      expect(pending).toHaveLength(0);
    });
    expect(mockSyncJournaledReviewEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ review_type: "daily", period_start: day }),
    );

    // #967 — the regression this test pins: the day must read closed from
    // the ACCOUNT tier once the replay delivered it. Before this fix,
    // `accountClosedDays` stayed at its pre-replay (empty) snapshot forever
    // within this pass — nothing re-read it after the POST succeeded.
    await waitFor(() => {
      expect(screen.getByTestId("account-closed-days")).toHaveTextContent(day);
    });
    // SAFE OVERLAP, explicitly observed: with that read held open, the
    // device tier has NOT cleared yet — both tiers report the day closed at
    // once. This is the exact moment the old assertion (checked
    // synchronously, with no such hold) could land in and wrongly fail; here
    // it is the documented, asserted, correct intermediate state, not a race.
    await waitFor(() => {
      expect(journalReadIntercepted).toBe(true);
    });
    expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(day);
    // Concurrent unrelated state preservation holds THROUGH the overlap too.
    expect(screen.getByTestId("task-count")).toHaveTextContent("1");

    // Release the held read with the REAL current journal contents (the
    // review entry is already gone — replay drained it above) — the
    // no-loss handoff invariant completes: the device tier is now safe to
    // clear because the account tier already, verifiably, carries the day.
    releaseJournalRead(await listPendingWritesActual());

    await waitFor(() => {
      expect(
        screen.getByTestId("journalled-closed-days"),
      ).not.toHaveTextContent(day);
    });
    // Still there — the account tier is untouched by this release.
    expect(screen.getByTestId("account-closed-days")).toHaveTextContent(day);
    // Concurrent unrelated state preservation: the presynced task, confirmed
    // by the FIRST account read above, must still be there. This is the
    // #984 failure mode `readbackAccountReviewClosedDays` is deliberately
    // narrower to avoid — its own (empty-tasks) response must never reach
    // `mergePersistedRows`.
    expect(screen.getByTestId("task-count")).toHaveTextContent("1");
  });

  // #967 review, negative case 1/3: a successful account read is not itself
  // proof of the specific day replay just delivered — it must also NAME that
  // day among its daily reviews before the caller may treat device evidence
  // as safe to drop.
  it("a successful account read that OMITS the just-replayed day does not clear its device-tier evidence (#967 review)", async () => {
    const day = "2026-08-30";
    // A marker day, distinct from `day`, on the readback's own response —
    // its appearance in `account-closed-days` is the deterministic signal
    // that the readback has completed (a fixed sleep would otherwise be the
    // only way to know), without asserting anything about `day` itself yet.
    const marker = "1900-01-01";

    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: day,
      periodEnd: day,
      summaryJson: {},
    });

    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });
    mockListExecutionReviewItems.mockResolvedValueOnce({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    // The readback's own read answers `provider: "supabase"` (success) but
    // its `reviewEntries` do not include `day` — exactly the "delayed,
    // stale, or wrong read" scenario the contract named. The marker day
    // lets the test observe completion without asserting on `day` itself.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          user_id: PERSISTED_AREA.user_id,
          area_id: null,
          review_type: "daily",
          period_start: marker,
          period_end: marker,
          summary_json: {},
          created_at: "1900-01-01T00:00:00.000Z",
        },
      ],
    });
    mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    await waitFor(async () => {
      const pending = await listPendingWrites("review");
      expect(pending).toHaveLength(0);
    });
    // Deterministic completion signal for the readback itself (not just the
    // replay that precedes it).
    await waitFor(() => {
      expect(screen.getByTestId("account-closed-days")).toHaveTextContent(
        marker,
      );
    });

    // The account tier must not claim `day` — the read genuinely did not
    // confirm it.
    expect(screen.getByTestId("account-closed-days")).not.toHaveTextContent(
      day,
    );
    // The device tier's evidence for `day` — populated by the ordinary
    // "sync on mount" effect's own `refreshJournalledDurableState()` call
    // before replay drained the journal — must survive: the readback's
    // return value gated OFF the later refresh that would otherwise have
    // re-derived (and cleared) it from the now-empty journal.
    expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(day);
  });

  // #967 review, negative case 2/3: a thrown read must behave exactly like a
  // missing period — no account confirmation invented, no device evidence
  // dropped.
  it("a failed account read does not clear device-tier evidence and does not invent account confirmation (#967 review)", async () => {
    const day = "2026-08-31";

    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: day,
      periodEnd: day,
      summaryJson: {},
    });

    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });
    mockListExecutionReviewItems.mockResolvedValueOnce({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    // The readback's own read throws — a network error, not a "mock"
    // provider or an empty result.
    mockListExecutionReviewItems.mockRejectedValue(
      new Error("network unavailable"),
    );
    mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    await waitFor(async () => {
      const pending = await listPendingWrites("review");
      expect(pending).toHaveLength(0);
    });
    // No positive completion signal is possible here (the read never
    // succeeds), so wait for the account-sync posture itself to settle —
    // `markAccountSynced` is the last thing `runAccountSync` does, strictly
    // after the readback attempt has already rejected and been caught.
    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
    });

    expect(screen.getByTestId("account-closed-days")).not.toHaveTextContent(
      day,
    );
    expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(day);
  });

  // #967 review, negative case 3/3, widened by the #967 follow-up review's
  // finding 1: a session that changes ANYWHERE between the pre-replay
  // identity capture and the readback's own post-read check — not merely
  // during the readback's own account read — must never let another
  // identity's account state land on this tab. The mock sequencing below
  // spans that full replay-to-read gap (see the inline comment at the
  // `mockGetUser` call), which is exactly the window the follow-up review
  // found the original before/after-inside-the-helper shape could not see:
  // a "before" fetched only at the helper's own start would already observe
  // a session that changed during replay, comparing a changed identity
  // against itself and finding no change at all.
  it("a session change mid-readback is not applied and does not clear device-tier evidence (#967 review)", async () => {
    const day = "2026-09-01";
    const userA = PERSISTED_AREA.user_id;
    const userB = "99999999-9999-4999-8999-999999999999";

    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: day,
      periodEnd: day,
      summaryJson: {},
    });

    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });
    mockListExecutionReviewItems.mockResolvedValueOnce({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    // The readback's own read DOES confirm `day` — if the identity check
    // were skipped, this alone would (wrongly) authorize the clear.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          user_id: userA,
          area_id: null,
          review_type: "daily",
          period_start: day,
          period_end: day,
          summary_json: {},
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

    // The provider now calls `getUser()` exactly twice per pass: once in
    // `runAccountSync`, BEFORE the pending-period snapshot and replay even
    // start (captured as `expectedUserId`), and once inside
    // `readbackAccountReviewClosedDays`, immediately after its own account
    // read. Answering A the first time and B every time after means the
    // switch spans the ENTIRE gap between those two calls — snapshot,
    // replay, and the readback's own read all happen while this mock is
    // already answering B, matching the follow-up review's "replay-to-read
    // gap" scenario rather than a change during the read alone.
    mockGetUser
      .mockReset()
      .mockResolvedValueOnce({ data: { user: { id: userA } }, error: null })
      .mockResolvedValue({ data: { user: { id: userB } }, error: null });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    await waitFor(async () => {
      const pending = await listPendingWrites("review");
      expect(pending).toHaveLength(0);
    });
    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
    });

    // B's response — even though it genuinely names `day` — must not be
    // applied to this tab.
    expect(screen.getByTestId("account-closed-days")).not.toHaveTextContent(
      day,
    );
    expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(day);
  });

  // #967 follow-up review, finding 2: a failed pre-replay snapshot must not
  // be treated as "nothing was pending" — that would make the readback's own
  // `every(...)` vacuously true and authorize clearing device-tier evidence
  // for a day this pass never actually confirmed. Replay and the readback
  // itself still run and still succeed here (mirroring the review's own
  // "lets replay/readback continue" framing) — only the pre-replay
  // `listPendingWrites("review")` snapshot fails.
  it("a failed pre-replay snapshot does not authorize clearing device-tier evidence, even though replay and readback continue (#967 follow-up review)", async () => {
    const day = "2026-09-02";

    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: day,
      periodEnd: day,
      summaryJson: {},
    });

    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });
    mockListExecutionReviewItems.mockResolvedValueOnce({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    // The readback's own read succeeds AND genuinely names `day` — if the
    // snapshot-failure guard were missing, this alone would (wrongly)
    // authorize the clear, since `expectedDailyPeriods` would be an empty
    // array and `[].every(...)` is vacuously `true` regardless of what this
    // response contains.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          user_id: PERSISTED_AREA.user_id,
          area_id: null,
          review_type: "daily",
          period_start: day,
          period_end: day,
          summary_json: {},
          created_at: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

    // Only the pre-replay snapshot call (`listPendingWrites("review")`)
    // fails. `replayPendingWritesUnlocked`'s own no-arg call, and every other
    // test's use of the real journal, are untouched.
    mockListPendingWrites.mockImplementation((entity) => {
      if (entity === "review") {
        return Promise.reject(new Error("indexeddb read failed"));
      }
      return listPendingWritesActual(entity);
    });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    // Replay still drains the journal — the snapshot failure is upstream of
    // replay and does not block it.
    await waitFor(async () => {
      const pending = await listPendingWritesActual("review");
      expect(pending).toHaveLength(0);
    });
    // The readback itself still runs and still confirms `day` on the account
    // tier — this proves the guard is specifically about the CLEARANCE
    // decision, not about suppressing the readback or its own truthful
    // account-tier update.
    await waitFor(() => {
      expect(screen.getByTestId("account-closed-days")).toHaveTextContent(day);
    });

    // Despite the account tier confirming `day`, the failed snapshot must
    // still refuse the journal-derived clearance: the device tier's evidence
    // survives.
    expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(day);
  });

  // #967 final-candidate review: a wrong-user row must refuse the WHOLE
  // readback before `setAccountClosedDays` runs, not just get filtered out
  // of the array passed to it. An A-to-B-to-A read (identity checks both see
  // A; a B row rides along in the response body anyway) previously still
  // called `setAccountClosedDays` with the filtered (A-only, now missing the
  // stray B row) array — which, for a response containing ONLY a B row,
  // means an EMPTY array, silently erasing A's real, previously-confirmed
  // account evidence for no reason visible to the caller.
  it("a wrong-user row in an otherwise same-identity response does not erase the account's existing closed-day evidence (#967 final-candidate review)", async () => {
    const markerDay = "1800-01-01";
    const day = "2026-09-03";
    const userA = PERSISTED_AREA.user_id;
    const userB = "99999999-9999-4999-8999-999999999999";

    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: day,
      periodEnd: day,
      summaryJson: {},
    });

    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [PERSISTED_AREA],
    });
    // The FIRST account read (`syncPersistedWorkflowRows`, before replay)
    // seeds A's real, already-confirmed account evidence for `markerDay` —
    // the thing this test proves must survive.
    mockListExecutionReviewItems.mockResolvedValueOnce({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          user_id: userA,
          area_id: null,
          review_type: "daily",
          period_start: markerDay,
          period_end: markerDay,
          summary_json: {},
          created_at: "1800-01-01T00:00:00.000Z",
        },
      ],
    });
    // The readback's own (second) read: `getUser()` will answer A both
    // before and after (the `beforeEach` default, left untouched by this
    // test), but the response body itself carries a B row — the "mixed/
    // wrong-user fixture" the review named as unproven by the existing
    // A-to-B account-switch test, which only changes the mocked identity,
    // never the row content.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [
        {
          id: "99999999-8888-4888-8888-888888888888",
          user_id: userB,
          area_id: null,
          review_type: "daily",
          period_start: day,
          period_end: day,
          summary_json: {},
          created_at: "2026-09-03T00:00:00.000Z",
        },
      ],
    });
    mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );

    await waitFor(async () => {
      const pending = await listPendingWrites("review");
      expect(pending).toHaveLength(0);
    });
    // No positive completion signal names this pass (the readback is
    // refused, so nothing it does is observable) — wait for the account-sync
    // posture itself to settle, the last thing `runAccountSync` does.
    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
    });

    // A's real, previously-confirmed marker survives — the wrong-user row
    // must not have authorized overwriting it, empty or otherwise.
    expect(screen.getByTestId("account-closed-days")).toHaveTextContent(
      markerDay,
    );
    // B's row must never land on this tab.
    expect(screen.getByTestId("account-closed-days")).not.toHaveTextContent(
      day,
    );
    // The refused readback must not authorize journal-derived clearance
    // either — the device tier's evidence for `day` survives.
    expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(day);
  });

  // #967 visibility: a queued write whose last account-save attempt is
  // known to have failed (`durability/pendingWriteJournal.ts`'s own
  // `last_attempt_failed`, set by `markPendingWriteAttemptFailed` when a
  // replay attempt throws) must become visible through
  // `syncStatus.pendingSaveFailed`, derived on `refreshJournalledDurableState`'s
  // existing `listPendingWrites()` read — no new watcher or read loop.
  describe("pendingSaveFailed (#967 visibility)", () => {
    it("becomes visible after a failed replay attempt, is STILL visible (actual notice, not just the flag) after a provider remount whose own recovery attempt has not resolved yet, then clears once that attempt actually succeeds", async () => {
      const day = "2026-09-10";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // The FIRST replay attempt for this entry rejects — the real shape
      // `markPendingWriteAttemptFailed` reacts to (a per-handler throw
      // inside `replayPendingWritesUnlocked`), not a mock-provider response.
      mockSyncJournaledReviewEntry.mockRejectedValueOnce(
        new Error("server rejected the review"),
      );

      const first = render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // The failed attempt leaves the write JOURNALLED (not drained) —
      // replay's fault isolation retries it later rather than discarding it.
      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });
      // The ACTUAL composed notice, not just the raw flag — its own
      // `waitFor`, since `pendingLocalChanges` and `pendingSaveFailed` are
      // set by separate calls and can land on different renders.
      await waitFor(() => {
        expect(screen.getByTestId("notice-tone")).toHaveTextContent("alarm");
      });
      // Visible through the NEW field, not by way of the account posture —
      // one rejected write must not be reported as the whole account
      // erroring, which would be a false, broader claim.
      expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");

      first.unmount();

      // #967 root/independent review: hold the SECOND mount's own recovery
      // attempt open (a real pending promise, never resolved until this
      // test says so) so the assertion below cannot pass merely because the
      // mock happened to resolve before any check ran.
      let resolveSecondAttempt!: (value: { provider: "supabase" }) => void;
      mockSyncJournaledReviewEntry.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondAttempt = resolve;
        }),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // The durable evidence SURVIVED the remount (fake-indexeddb persists
      // across the unmount, exactly like a real reload would) — the fresh
      // provider's own mount-time journal read (independent of, and faster
      // than, its OWN still-in-flight replay attempt above) confirms this
      // BEFORE recovery has had any chance to complete.
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId("notice-tone")).toHaveTextContent("alarm");
      });
      expect(screen.getByTestId("notice-message")).toHaveTextContent(
        ACCOUNT_SAVE_FAILED,
      );
      // The write is STILL held open above — not yet actually resent.
      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(1);
      });

      // NOW release recovery.
      resolveSecondAttempt({ provider: "supabase" });

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(0);
      });
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "false",
        );
      });
      expect(screen.getByTestId("notice-tone")).not.toHaveTextContent("alarm");
    });

    it("stays calm for an ordinary queued write whose first attempt simply hasn't landed yet", async () => {
      const day = "2026-09-11";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // No rejection anywhere — an ordinary successful drain.
      mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(0);
      });
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "false",
      );
    });

    it("a journal read failure never fabricates failed-save visibility", async () => {
      // No journalled write at all this time — the point is that a broken
      // READ must not invent a failure that was never confirmed, not that a
      // real failure gets hidden.
      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // Every `listPendingWrites()` call this pass rejects — the read
      // `refreshJournalledDurableState` (and replay's own internal read)
      // depend on is entirely unavailable, not merely slow.
      mockListPendingWrites.mockRejectedValue(
        new Error("indexeddb unavailable"),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // No positive signal names a broken journal read, so wait for the
      // account-sync posture itself to settle — best-effort read failures
      // never block `markAccountSynced`.
      await waitFor(() => {
        expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
      });

      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "false",
      );
    });

    // #967 root/independent review, finding 1 (identity half): the
    // post-replay call to `refreshPendingSaveFailed` rechecks the identity
    // `runAccountSync` captured before replay against a fresh `getUser()`
    // after its own journal read resolves — a session change spanning
    // exactly that window must not let the result apply.
    it("a session change mid-read for the failure-flag pass does not apply its result, even though the write genuinely failed", async () => {
      const day = "2026-09-12";
      const userA = PERSISTED_AREA.user_id;
      const userB = "99999999-9999-4999-8999-999999999999";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // The write genuinely, durably fails this pass — ground truth for
      // the journal itself, independent of what the identity check does.
      mockSyncJournaledReviewEntry.mockRejectedValue(
        new Error("server rejected the review"),
      );

      // getUser sequence: call 1 = `expectedUserId` capture (A, before
      // replay); call 2 = `refreshPendingSaveFailed`'s own post-read
      // recheck (B — the narrowest possible window, a session change
      // spanning exactly this one read); call 3+ = the later review
      // readback's own recheck (A again — out of scope for this test).
      mockGetUser
        .mockReset()
        .mockResolvedValueOnce({ data: { user: { id: userA } }, error: null })
        .mockResolvedValueOnce({ data: { user: { id: userB } }, error: null })
        .mockResolvedValue({ data: { user: { id: userA } }, error: null });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending[0]?.last_attempt_failed).toBe(true);
      });
      await waitFor(() => {
        expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
      });

      // The mismatched pass's own result must never have applied.
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "false",
      );
    });

    // #967 root/independent review, finding 1 (generation half): a newer
    // read starting anywhere invalidates an older one's eventual
    // completion, even when the older one started FIRST but resolves LAST.
    it("a newer failed-write read wins over an older, slower pre-failure read that resolves after it", async () => {
      const day = "2026-09-13";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // This pass's own replay attempt genuinely fails the write.
      mockSyncJournaledReviewEntry.mockRejectedValue(
        new Error("server rejected the review"),
      );

      // Intercept ONLY the very first no-arg `listPendingWrites()` call —
      // structurally, that is the unconditional "sync on mount" effect's
      // own `refreshJournalledDurableState()` call, which starts almost
      // immediately and does not depend on replay; `refreshPendingSaveFailed`
      // (the NEWER read, by construction — it only starts once replay has
      // resolved) reaches its own `listPendingWrites()` call several awaits
      // later. Held open here, so it is the one that resolves LAST.
      let releaseOlderRead!: (
        value: Awaited<ReturnType<typeof listPendingWrites>>,
      ) => void;
      let olderReadIntercepted = false;
      mockListPendingWrites.mockImplementation((entity) => {
        if (entity === undefined && !olderReadIntercepted) {
          olderReadIntercepted = true;
          return new Promise((resolve) => {
            releaseOlderRead = resolve;
          });
        }
        return listPendingWritesActual(entity);
      });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // The newer read (`refreshPendingSaveFailed`, gated behind replay)
      // completes normally and applies `true`.
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });

      // NOW resolve the older, slower read — with the STALE snapshot it
      // actually captured: the write BEFORE this pass's replay failed it.
      releaseOlderRead([
        {
          entity: "review",
          client_write_id: "stale-pre-failure-snapshot",
          payload: {
            review_type: "daily",
            period_start: day,
            period_end: day,
          },
          created_at: new Date().toISOString(),
          // deliberately no `last_attempt_failed` — the state as it was
          // before this pass's replay ran.
        },
      ] as unknown as Awaited<ReturnType<typeof listPendingWrites>>);

      // Give the now-resolved older read a tick to (wrongly, if the
      // generation guard were missing) apply.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "true",
      );
      // #967 typed failure category: the same generation guard covers this
      // field too — the stale, pre-failure snapshot (with no
      // `last_attempt_failure_kind` at all) must not overwrite the newer
      // read's own result.
      expect(screen.getByTestId("pending-save-failure-kind")).toHaveTextContent(
        "unknown",
      );
    });

    // #967 root/independent review, finding 1 (generation half, mirrored
    // for recovery): the same guard must not let a stale "still failed"
    // read resurrect the flag after a newer, confirmed successful drain.
    it("an older, slower failed-write read does not resurrect a stale failure after a newer successful drain resolves first", async () => {
      const day = "2026-09-14";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });

      // FIRST mount: the write genuinely fails once — establishes real,
      // durable `last_attempt_failed: true` ground truth in the journal.
      mockSyncJournaledReviewEntry.mockRejectedValueOnce(
        new Error("server rejected the review"),
      );
      const first = render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });
      first.unmount();

      // SECOND mount: this pass's OWN replay attempt succeeds, draining the
      // write for real. The OLDER read (the unconditional mount effect,
      // structurally the first no-arg call — see the test above) is held
      // open so it captures the STILL-true pre-drain snapshot, while the
      // NEWER read (`refreshPendingSaveFailed`, gated behind replay)
      // resolves normally, ahead of it, with the correct `false`.
      mockSyncJournaledReviewEntry.mockResolvedValue({
        provider: "supabase",
      });

      let releaseOlderRead!: (
        value: Awaited<ReturnType<typeof listPendingWrites>>,
      ) => void;
      let olderReadIntercepted = false;
      mockListPendingWrites.mockImplementation((entity) => {
        if (entity === undefined && !olderReadIntercepted) {
          olderReadIntercepted = true;
          return new Promise((resolve) => {
            releaseOlderRead = resolve;
          });
        }
        return listPendingWritesActual(entity);
      });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // The newer read applies the correct `false` — the successful drain.
      await waitFor(async () => {
        const pending = await listPendingWritesActual("review");
        expect(pending).toHaveLength(0);
      });
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "false",
        );
      });

      // NOW resolve the older, slower read with the STALE still-failed
      // snapshot it actually captured on this mount — it started FIRST but
      // is completing LAST.
      releaseOlderRead([
        {
          entity: "review",
          client_write_id: "stale-still-failed-snapshot",
          payload: {
            review_type: "daily",
            period_start: day,
            period_end: day,
          },
          created_at: new Date().toISOString(),
          last_attempt_failed: true,
          last_attempt_failed_at: new Date().toISOString(),
        },
      ] as unknown as Awaited<ReturnType<typeof listPendingWrites>>);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "false",
      );
      // #967 provider/journal review, omission 1: the same generation guard
      // must reject the stale category too — recovery already cleared it to
      // absent, and the stale (legacy-shaped, no kind field) snapshot must
      // not resurrect one.
      expect(screen.getByTestId("pending-save-failure-kind")).toHaveTextContent(
        "",
      );
    });

    // #967 root/independent review, finding 4 (the "insufficient" half): a
    // failed refresh must preserve a previously ESTABLISHED true value, not
    // just leave an initially-false one alone (already covered above).
    //
    // #967 provider/journal review, omission 2: also preserve a previously
    // CONFIRMED VISIBLE typed category — the first mount fails with a
    // genuine known `PersistenceWriteError` (not a plain `Error`) so both
    // `pendingSaveFailed` and `pendingSaveFailureKind` have real, non-default
    // values before the read failure hits.
    it("a failed refresh preserves a previously established TRUE failure state and its known category, not just an initially false/absent one", async () => {
      const day = "2026-09-15";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });

      // FIRST mount: establishes real, durable `true` AND a real, durable
      // known category.
      mockSyncJournaledReviewEntry.mockRejectedValueOnce(
        new PersistenceWriteError(
          "Google calendar RPC is not supported.",
          "server-capability-missing",
        ),
      );
      const first = render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("server-capability-missing");
      });
      first.unmount();

      // SECOND mount: hold ITS OWN recovery attempt open so
      // `refreshPendingSaveFailed` (the later read) has not run yet when
      // every SUBSEQUENT journal read is switched to fail.
      let resolveSecondAttempt!: (value: { provider: "supabase" }) => void;
      mockSyncJournaledReviewEntry.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondAttempt = resolve;
        }),
      );

      let rejectSubsequentReads = false;
      mockListPendingWrites.mockImplementation((entity) => {
        if (rejectSubsequentReads) {
          return Promise.reject(new Error("indexeddb read failed"));
        }
        return listPendingWritesActual(entity);
      });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // The mount's own unconditional (identity-free) read confirms the
      // still-genuinely-failed journal BEFORE this pass's own recovery
      // attempt has resolved — the same checkpoint the remount test above
      // uses.
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("server-capability-missing");
      });

      // From THIS point on, every further journal read fails —
      // specifically, `refreshPendingSaveFailed`'s own read, which has not
      // run yet: it is still gated behind the held-open replay attempt.
      rejectSubsequentReads = true;

      // Release recovery — replay succeeds and removes the entry for real,
      // but `refreshPendingSaveFailed`'s own re-read of the (now genuinely
      // empty) journal fails, so it cannot apply the new, correct `false`.
      resolveSecondAttempt({ provider: "supabase" });

      await waitFor(async () => {
        const pending = await listPendingWritesActual("review");
        expect(pending).toHaveLength(0);
      });
      // The failed refresh must not have cleared the previously TRUE state
      // or the previously visible known category.
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "true",
      );
      expect(screen.getByTestId("pending-save-failure-kind")).toHaveTextContent(
        "server-capability-missing",
      );
    });

    // #967 root/independent review, finding 2's own required test: the
    // failure-only refresh must not touch any of the four legacy journal
    // arrays, even as some of their own entries actually drain this pass.
    it("the failure-only post-replay refresh preserves all four legacy journal arrays, even as some of their own entries actually drain", async () => {
      const closedDay = "2026-09-16";
      const failedDay = "2026-09-17";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: closedDay,
        periodEnd: closedDay,
        summaryJson: {},
      });
      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: failedDay,
        periodEnd: failedDay,
        summaryJson: {},
      });
      await journalWinWrite({
        workflowTaskId: PRESYNCED_TASK_ID,
        persistedTaskId: PRESYNCED_TASK_ID,
        persistedAreaId: PERSISTED_AREA.id,
        title: "Shipped the onboarding flow",
        detail: null,
        occurredAt: "2026-09-16T00:00:00.000Z",
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // closedDay's review, and the win, both succeed and drain this pass;
      // failedDay's review rejects, marking IT (and only it) failed.
      mockSyncJournaledReviewEntry.mockImplementation(
        (_client: unknown, payload: { period_start?: string }) =>
          payload.period_start === failedDay
            ? Promise.reject(new Error("server rejected the review"))
            : Promise.resolve({ provider: "supabase" }),
      );
      mockSyncJournaledWin.mockResolvedValue({ provider: "supabase" });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // Wait for the whole pass to settle: closedDay's review and the win
      // both actually drained; failedDay's review is the only one left.
      await waitFor(async () => {
        const reviews = await listPendingWrites("review");
        expect(reviews).toHaveLength(1);
        expect(reviews[0]?.payload).toMatchObject({
          period_start: failedDay,
        });
      });
      await waitFor(async () => {
        const wins = await listPendingWrites("win");
        expect(wins).toHaveLength(0);
      });
      await waitFor(() => {
        expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
      });
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "true",
      );

      // The failure-only refresh must not have touched any of the four
      // legacy arrays — closedDay's drain (a real, successful send) stays
      // invisible to them until a confirmed account readback authorizes
      // the full refresh, exactly as before this slice. `journalled-
      // completed-session-days` and `journalled-rollup-keys` were never
      // seeded in this test (no execution-session or rollup write), so
      // their "unchanged" proof here is necessarily the weaker "still
      // empty" — the closed-days and wins assertions are the load-bearing
      // proof that a real drain does not leak into these arrays early.
      expect(screen.getByTestId("journalled-closed-days")).toHaveTextContent(
        closedDay,
      );
      expect(screen.getByTestId("journalled-logged-wins")).toHaveTextContent(
        PRESYNCED_TASK_ID,
      );
      expect(
        screen.getByTestId("journalled-completed-session-days"),
      ).toHaveTextContent("");
      expect(screen.getByTestId("journalled-rollup-keys")).toHaveTextContent(
        "",
      );
    });
  });

  // #967 typed failure category: `syncStatus.pendingSaveFailureKind` is a
  // SAFE AGGREGATE across only the CURRENTLY FAILED journal rows (see its
  // doc in `workflowContext/types.ts` and `WorkflowContext.tsx`'s
  // `derivePendingSaveFailureAggregate`) — computed by the SAME
  // `refreshJournalledDurableState`/`refreshPendingSaveFailed` reads proven
  // above for `pendingSaveFailed`, under the exact same generation/identity
  // guards, not a new read or watcher.
  describe("pendingSaveFailureKind (#967 typed failure category)", () => {
    it("is server-capability-missing, and the shared notice goes calm with the app-update message, when the one failed row is a genuine known PersistenceWriteError", async () => {
      const day = "2026-09-17";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      mockSyncJournaledReviewEntry.mockRejectedValue(
        new PersistenceWriteError(
          "Google calendar RPC is not supported.",
          "server-capability-missing",
        ),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("server-capability-missing");
      });
      await waitFor(() => {
        expect(screen.getByTestId("notice-tone")).toHaveTextContent("calm");
      });
      expect(screen.getByTestId("notice-message")).toHaveTextContent(
        ACCOUNT_NEEDS_APP_UPDATE,
      );
    });

    it("is unknown, and the shared notice keeps the generic alarm, when the failed rows are mixed (one known, one not)", async () => {
      const day = "2026-09-18";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });
      await journalWinWrite({
        workflowTaskId: PRESYNCED_TASK_ID,
        persistedTaskId: PRESYNCED_TASK_ID,
        persistedAreaId: PERSISTED_AREA.id,
        title: "Shipped the onboarding flow",
        detail: null,
        occurredAt: "2026-09-18T00:00:00.000Z",
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      mockSyncJournaledReviewEntry.mockRejectedValue(
        new PersistenceWriteError(
          "Google calendar RPC is not supported.",
          "server-capability-missing",
        ),
      );
      mockSyncJournaledWin.mockRejectedValue(new Error("network unavailable"));

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(async () => {
        const pending = await listPendingWrites();
        expect(
          pending.filter((write) => write.last_attempt_failed),
        ).toHaveLength(2);
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("unknown");
      });
      await waitFor(() => {
        expect(screen.getByTestId("notice-tone")).toHaveTextContent("alarm");
      });
      expect(screen.getByTestId("notice-message")).toHaveTextContent(
        ACCOUNT_SAVE_FAILED,
      );
    });

    // Nonfailed rows must never participate in the aggregate. The replay
    // loop (`replayPendingWritesUnlocked`) is sequential and the provider's
    // own `refreshPendingSaveFailed`/`refreshJournalledDurableState` only
    // read the journal again once that whole pass has settled — so a
    // SUCCESSFUL sibling write (removed from the journal entirely once
    // synced) is the realistic, non-flaky way to prove a nonfailed row
    // cannot drag a genuinely known-only aggregate down to "unknown": by
    // the time the aggregate is read, only the failed row remains at all.
    it("a successful sibling write does not affect the aggregate from a genuinely known failure", async () => {
      const failedDay = "2026-09-22";
      const succeededDay = "2026-09-23";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: failedDay,
        periodEnd: failedDay,
        summaryJson: {},
      });
      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: succeededDay,
        periodEnd: succeededDay,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // `failedDay`'s attempt genuinely rejects with a known kind;
      // `succeededDay`'s attempt is an ordinary success — removed from the
      // journal once synced, never itself failed evidence of any kind.
      mockSyncJournaledReviewEntry.mockImplementation(
        (_client: unknown, payload: { period_start?: string }) =>
          payload.period_start === failedDay
            ? Promise.reject(
                new PersistenceWriteError(
                  "Google calendar RPC is not supported.",
                  "server-capability-missing",
                ),
              )
            : Promise.resolve({ provider: "supabase" }),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(1);
        expect(pending[0]?.payload.period_start).toBe(failedDay);
        expect(pending[0]?.last_attempt_failed).toBe(true);
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("server-capability-missing");
      });
    });

    it("clears back to absent once a known failure is successfully retried", async () => {
      const day = "2026-09-19";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      mockSyncJournaledReviewEntry.mockRejectedValueOnce(
        new PersistenceWriteError(
          "Google calendar RPC is not supported.",
          "server-capability-missing",
        ),
      );

      const { unmount } = render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("server-capability-missing");
      });

      unmount();
      mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(0);
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("");
      });
    });

    // #967 root/independent review, finding 1 (identity half), applied to
    // the new field: the same mismatched-identity window that discards a
    // stale `pendingSaveFailed` result must discard its category too — a
    // wrong-identity read must never stamp a category derived from someone
    // else's journal onto this session's status.
    it("a session change mid-read never applies a stale category, even though the write genuinely failed with a known kind", async () => {
      const day = "2026-09-21";
      const userA = PERSISTED_AREA.user_id;
      const userB = "88888888-8888-4888-8888-888888888888";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      mockSyncJournaledReviewEntry.mockRejectedValue(
        new PersistenceWriteError(
          "Google calendar RPC is not supported.",
          "server-capability-missing",
        ),
      );

      mockGetUser
        .mockReset()
        .mockResolvedValueOnce({ data: { user: { id: userA } }, error: null })
        .mockResolvedValueOnce({ data: { user: { id: userB } }, error: null })
        .mockResolvedValue({ data: { user: { id: userA } }, error: null });

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending[0]?.last_attempt_failure_kind).toBe(
          "server-capability-missing",
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
      });

      expect(screen.getByTestId("pending-save-failure-kind")).toHaveTextContent(
        "",
      );
    });

    // #967 provider/journal review, omission 3: a raw, already-failed
    // journal row with no `last_attempt_failure_kind` at all (a legacy row,
    // predating this field) or an invalid stored value (never something
    // `markPendingWriteAttemptFailed` itself would write, but the aggregate
    // must not trust the stored value blindly) must both normalize to
    // `"unknown"` at the provider aggregate — not merely at the downstream
    // notice, which is proven separately in `deviceSaveNotice.test.ts`.
    it.each([
      ["a legacy row with the field entirely absent", undefined],
      ["a row with an invalid stored value", "PGRST202"],
    ])(
      "normalizes %s to unknown at the aggregate",
      async (_label, storedKind) => {
        mockListAreas.mockResolvedValue({
          provider: "supabase",
          areas: [PERSISTED_AREA],
        });
        mockListExecutionReviewItems.mockResolvedValue({
          provider: "supabase",
          tasks: [],
          blocks: [],
          sessions: [],
          reviewEntries: [],
        });

        // Bypass the real journal-write path entirely — this is a row shape
        // the current code never itself produces, so it is injected directly
        // at the read seam, the same technique the generation-race tests
        // above use for their own synthetic stale snapshots. Scoped to
        // "review" and the unconditional no-arg call only — every other
        // entity keeps reading the real (empty) journal, so this synthetic
        // row never leaks into an unrelated array's own filtering.
        const legacyOrInvalidRow = {
          entity: "review",
          client_write_id: "legacy-or-invalid-kind-row",
          payload: {
            review_type: "daily",
            period_start: "2026-09-24",
            period_end: "2026-09-24",
          },
          created_at: new Date().toISOString(),
          last_attempt_failed: true,
          last_attempt_failed_at: new Date().toISOString(),
          ...(storedKind === undefined
            ? {}
            : { last_attempt_failure_kind: storedKind }),
        } as unknown as Awaited<ReturnType<typeof listPendingWrites>>[number];
        mockListPendingWrites.mockImplementation((entity) =>
          entity === undefined || entity === "review"
            ? Promise.resolve([legacyOrInvalidRow])
            : listPendingWritesActual(entity),
        );

        render(
          <WorkflowProvider>
            <Harness />
          </WorkflowProvider>,
        );

        await waitFor(() => {
          expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
            "true",
          );
        });
        expect(
          screen.getByTestId("pending-save-failure-kind"),
        ).toHaveTextContent("unknown");
      },
    );
  });

  // #967 manual retry: `retryPendingAccountWrites` is a thin wrapper around
  // `runAccountSync({ replayAfter: true })` — the SAME ordered area/account
  // hydration, serialized drain, identity recheck, and closed-day handoff
  // the mount effect and the sign-in listener already run through (NOT
  // reconnect, which calls `replayJournaledWrites` directly). These tests
  // are about the WRAPPER reaching that pass correctly and respecting its
  // in-flight guard; the ordering/identity/failure-retention guarantees
  // themselves are already proven above (and are not re-proven here, per
  // scope).
  describe("retryPendingAccountWrites (#967 manual retry)", () => {
    it("drains a real failed pending write and clears its evidence, through the exact same pass a mount uses", async () => {
      const day = "2026-09-20";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // The mount's own first attempt fails — real, durable evidence.
      mockSyncJournaledReviewEntry.mockRejectedValueOnce(
        new Error("server rejected the review"),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });
      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(1);
      });

      // A later attempt succeeds — clicking the retry action, not a remount.
      mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });
      fireEvent.click(screen.getByText("Retry pending writes"));

      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(0);
      });
      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "false",
        );
      });
    });

    it("retains the entry and the visible failure when the retried attempt rejects again, proving a genuine second handler attempt", async () => {
      const day = "2026-09-21";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // Every attempt this test makes rejects — the mount's, and the retry's.
      mockSyncJournaledReviewEntry.mockRejectedValue(
        new Error("server rejected the review"),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // The initial pass sets this flag in its finally block. A handler
      // call or an already-synced posture alone can precede completion.
      await waitFor(() => {
        expect(screen.getByTestId("areas-readback-settled")).toHaveTextContent(
          "true",
        );
      });
      expect(mockSyncJournaledReviewEntry).toHaveBeenCalledTimes(1);
      const pendingAfterMount = await listPendingWrites("review");
      expect(pendingAfterMount).toHaveLength(1);
      expect(pendingAfterMount[0]?.last_attempt_failed).toBe(true);

      fireEvent.click(screen.getByText("Retry pending writes"));

      // The actual proof this test exists for: a SECOND, genuine handler
      // attempt — not a no-op that would leave the call count at 1.
      await waitFor(() => {
        expect(mockSyncJournaledReviewEntry).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.getByTestId("retry-settled-count")).toHaveTextContent(
          "1",
        );
      });

      // The retried attempt failed again — the entry and its failure
      // evidence are retained, not invented from an early return.
      const pendingAfterRetry = await listPendingWrites("review");
      expect(pendingAfterRetry).toHaveLength(1);
      expect(pendingAfterRetry[0]?.last_attempt_failed).toBe(true);
      expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
        "true",
      );
    });

    it("is a no-op while an account sync is already in flight — no duplicate account hydration and no duplicate handler run", async () => {
      const day = "2026-09-22";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // Hold the mount pass's OWN handler call open — the pass is
      // genuinely in flight, blocked on this exact promise.
      let releaseMountAttempt!: (value: { provider: "supabase" }) => void;
      mockSyncJournaledReviewEntry.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseMountAttempt = resolve;
        }),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      // Confirm the mount pass has actually started the handler call before
      // clicking retry — the in-flight guard is what this test is about,
      // not a race against the mount effect itself starting.
      await waitFor(() => {
        expect(mockSyncJournaledReviewEntry).toHaveBeenCalledTimes(1);
      });
      const listAreasCallsBeforeRetry = mockListAreas.mock.calls.length;
      const listExecutionReviewItemsCallsBeforeRetry =
        mockListExecutionReviewItems.mock.calls.length;

      fireEvent.click(screen.getByText("Retry pending writes"));

      // #967 root review: an explicit boundary for the MANUAL WRAPPER's own
      // settlement, not a fixed sleep — `runAccountSync`'s in-flight guard
      // makes the retry's own call resolve near-instantly (an early
      // return), so waiting for THAT specific call to settle is
      // deterministic where a timer is not.
      await waitFor(() => {
        expect(screen.getByTestId("retry-settled-count")).toHaveTextContent(
          "1",
        );
      });

      // While the ORIGINAL pass is still held open: no duplicate account
      // hydration (a second `runAccountSync` pass getting past its own
      // guard would call `listAreas`/`listExecutionReviewItems` again,
      // regardless of whether the journal's own serialization also happens
      // to keep a second HANDLER call from running) and no duplicate
      // handler call either.
      expect(mockListAreas.mock.calls.length).toBe(listAreasCallsBeforeRetry);
      expect(mockListExecutionReviewItems.mock.calls.length).toBe(
        listExecutionReviewItemsCallsBeforeRetry,
      );
      expect(mockSyncJournaledReviewEntry).toHaveBeenCalledTimes(1);

      // The mount pass's own attempt still completes normally afterward.
      releaseMountAttempt({ provider: "supabase" });
      await waitFor(async () => {
        const pending = await listPendingWrites("review");
        expect(pending).toHaveLength(0);
      });
    });

    it("a successful retry preserves the closed-day handoff — the account tier confirms before the device tier is allowed to clear", async () => {
      const day = "2026-09-23";

      await journalReviewWrite({
        workflowAreaId: null,
        persistedAreaId: null,
        reviewType: "daily",
        periodStart: day,
        periodEnd: day,
        summaryJson: {},
      });

      seedSessionStorageWithPresyncedTask();

      mockListAreas.mockResolvedValue({
        provider: "supabase",
        areas: [PERSISTED_AREA],
      });
      mockListExecutionReviewItems.mockResolvedValueOnce({
        provider: "supabase",
        tasks: [
          {
            id: PRESYNCED_TASK_ID,
            user_id: PERSISTED_AREA.user_id,
            area_id: PERSISTED_AREA.id,
            project_id: null,
            source_capture_item_id: null,
            title: "Shipped the onboarding flow",
            description: null,
            status: "active",
            priority_score: null,
            priority_confidence: null,
            task_type: null,
            is_reversible: null,
            energy_type: null,
            estimated_minutes_low: null,
            estimated_minutes_high: null,
            due_at: null,
            definition_of_done: null,
            first_tiny_step: null,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      // The mount's own first attempt fails — real, durable evidence.
      mockSyncJournaledReviewEntry.mockRejectedValueOnce(
        new Error("server rejected the review"),
      );

      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("pending-save-failed")).toHaveTextContent(
          "true",
        );
      });

      // The retry starts a SECOND full pass — its own `syncPersistedWorkflowRows`
      // read needs the presynced task again (its own `mockResolvedValueOnce`,
      // exactly like the mount's first pass above), or the account's own
      // (unrelated, always-dispatched) whole-workflow merge would retire it
      // before the readback ever runs. The readback's own read (the default,
      // consumed after that) confirms the day by name.
      mockSyncJournaledReviewEntry.mockResolvedValue({ provider: "supabase" });
      mockListExecutionReviewItems.mockResolvedValueOnce({
        provider: "supabase",
        tasks: [
          {
            id: PRESYNCED_TASK_ID,
            user_id: PERSISTED_AREA.user_id,
            area_id: PERSISTED_AREA.id,
            project_id: null,
            source_capture_item_id: null,
            title: "Shipped the onboarding flow",
            description: null,
            status: "active",
            priority_score: null,
            priority_confidence: null,
            task_type: null,
            is_reversible: null,
            energy_type: null,
            estimated_minutes_low: null,
            estimated_minutes_high: null,
            due_at: null,
            definition_of_done: null,
            first_tiny_step: null,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        blocks: [],
        sessions: [],
        reviewEntries: [],
      });
      mockListExecutionReviewItems.mockResolvedValue({
        provider: "supabase",
        tasks: [],
        blocks: [],
        sessions: [],
        reviewEntries: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            user_id: PERSISTED_AREA.user_id,
            area_id: null,
            review_type: "daily",
            period_start: day,
            period_end: day,
            summary_json: {},
            created_at: "2026-09-23T00:00:00.000Z",
          },
        ],
      });
      fireEvent.click(screen.getByText("Retry pending writes"));

      await waitFor(() => {
        expect(screen.getByTestId("account-closed-days")).toHaveTextContent(
          day,
        );
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("journalled-closed-days"),
        ).not.toHaveTextContent(day);
      });
      // Unrelated task state, confirmed by the FIRST account read, survives
      // the whole retry pass.
      expect(screen.getByTestId("task-count")).toHaveTextContent("1");
    });
  });
});
