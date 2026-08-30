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
import { journalWinWrite } from "@/lib/durability/durableWrites";
import { SIGNED_OUT_SAVING_ON_THIS_DEVICE } from "@/lib/statusVocabulary";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";

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
  mockCreateSupabaseBrowserClient,
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
  mockCreateSupabaseBrowserClient: vi.fn(),
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
  };
});

function SIGNED_OUT_ERROR() {
  // Recognized by `isSignedOutError` (reducerCore.ts) — the real shape
  // `requireSupabaseUser` throws when a client exists but no session does.
  return new Error("Sign in before loading areas from Supabase.");
}

function Harness() {
  const { state, selectedAreaId, submitCaptureText, confirmWin, syncStatus } =
    useWorkflow();
  const unsortedCapture = state.captureItems[0];

  return (
    <div>
      <span data-testid="sync-account">{syncStatus.account}</span>
      <span data-testid="sync-signed-out">
        {String(syncStatus.signedOut ?? false)}
      </span>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <span data-testid="capture-area">{unsortedCapture?.area_id ?? ""}</span>
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
    </div>
  );
}

beforeEach(async () => {
  authListener.callback = null;

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

  window.sessionStorage.clear();
  await clearPendingWrites();
});

afterEach(async () => {
  window.sessionStorage.clear();
  await clearPendingWrites();
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
});
