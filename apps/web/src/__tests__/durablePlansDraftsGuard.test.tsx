// #737 C1 S3: the polyfill IS the subject here — these tests assert that a
// placed block and an accepted triage draft reach IndexedDB, so a regression
// to a memory-only path fails CI.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import { DEVICE_STORAGE_BLOCKED } from "@/lib/statusVocabulary";

/**
 * REGRESSION GUARD — plans and triage accepts must stay device-durable.
 *
 * ## What broke, and why a guard is the right shape of fix
 *
 * `persistPlannedTask` and `persistAcceptedTaskDraft` both opened with an
 * early return: no Supabase client (or an area/task whose account id had not
 * synced) meant `markLocalOnly("Your plan" / "Your triage decision")` and no
 * write anywhere but the reducer. The reducer's `sessionStorage` mirror is
 * scoped to ONE TAB, so the banner's "saved on this device" was true only
 * until the tab closed — the #750 inventory's loss trigger T for rows 6, 7,
 * 9 and 10.
 *
 * That failure is invisible from the outside: the hour rail and the triage
 * sheet look identical whether the write landed or evaporated. A dispatcher
 * unit test cannot catch a regression either — someone could reintroduce the
 * early return in `persistenceSync.ts` and every `durableWrites.test.ts` case
 * would stay green, because the dispatcher would simply never be reached.
 *
 * ## What these tests pin
 *
 * They drive the REAL provider in mock mode (no Supabase client — precisely
 * the configuration the old code lost work in) through `useWorkflow`, then
 * read the pending-writes journal directly. IndexedDB survives tab close, so
 * a write present here is a write a new tab can find.
 *
 * Deliberately NOT asserted here: that the write reaches the account. That is
 * the dispatcher's and the data layer's job
 * (`lib/durability/durableWrites.test.ts`, `src/__tests__/phase4aRls.local.test.ts`).
 */

const navigationMock = vi.hoisted(() => ({
  pathname: "/calendar",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

const STORAGE_KEY = "lifeos.phase2.workflow";
const AREA_ID = "guard-area-s3";
const TASK_ID = "guard-task-s3";
const DRAFT_ID = "guard-draft-s3";
const CAPTURE_ID = "guard-capture-s3";

function seedState() {
  const nowIso = new Date("2026-05-08T12:00:00.000Z").toISOString();
  return {
    areas: [
      {
        id: AREA_ID,
        user_id: "guard-user",
        name: "Work",
        color: "#2563eb",
        created_at: nowIso,
      },
    ],
    captureItems: [
      {
        id: CAPTURE_ID,
        user_id: "guard-user",
        area_id: AREA_ID,
        raw_text: "Guard draft thought",
        return_hook: null,
        client_capture_id: null,
        capture_mode: "text",
        inferred_area_confidence: 0.9,
        status: "triage_required",
        created_at: nowIso,
      },
    ],
    taskDrafts: [
      {
        id: DRAFT_ID,
        user_id: "guard-user",
        capture_item_id: CAPTURE_ID,
        area_id: AREA_ID,
        title: "Guard draft title",
        description: null,
        confidence: 0.8,
        estimated_minutes_low: 20,
        estimated_minutes_high: 40,
        first_tiny_step: "Write the first line",
        breakdown: null,
        person_mentions: [],
        is_commitment: false,
        status: "pending",
        created_at: nowIso,
      },
    ],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      {
        id: TASK_ID,
        user_id: "guard-user",
        area_id: AREA_ID,
        project_id: null,
        source_capture_item_id: null,
        title: "Guard task to place",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 30,
        estimated_minutes_high: 60,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: "Open the file",
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

/**
 * Both harnesses expose a BUTTON rather than firing on mount.
 *
 * Not cosmetic. Child effects run BEFORE the provider's own effects in React,
 * so an action dispatched from a mount effect here reads a `stateRef` that the
 * provider has not yet pointed at the restored state. `planTaskAtHour` would
 * then look up an unknown id, no-op, and — because `applyWorkflowState` writes
 * whatever it computed back — actually overwrite the restored state with the
 * initial mock one. The test would fail for a reason with nothing to do with
 * durability. A click happens after every effect has flushed, which is also
 * exactly how a user reaches these actions.
 */
function PlacementHarness() {
  const { state, planTaskAtHour, syncStatus } = useWorkflow();
  const taskIsLoaded = state.tasks.some((task) => task.id === TASK_ID);

  return (
    <div>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <span data-testid="task-loaded">{taskIsLoaded ? "yes" : "no"}</span>
      <button type="button" onClick={() => planTaskAtHour(TASK_ID, 10)}>
        place
      </button>
    </div>
  );
}

function DraftAcceptHarness() {
  const { state, acceptTaskDraft, syncStatus } = useWorkflow();
  const [acceptedTaskId, setAcceptedTaskId] = useState<string | null>(null);
  const draftIsLoaded = state.taskDrafts.some((draft) => draft.id === DRAFT_ID);

  return (
    <div>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <span data-testid="draft-loaded">{draftIsLoaded ? "yes" : "no"}</span>
      {/* FR-031 F3 (#664) depends on this id coming back SYNCHRONOUSLY. If the
          journal ever made `acceptTaskDraft` async, this would stay empty and
          the map-it offer would silently stop appearing. */}
      <span data-testid="accepted-task-id">{acceptedTaskId ?? ""}</span>
      <button
        type="button"
        onClick={() => setAcceptedTaskId(acceptTaskDraft(DRAFT_ID))}
      >
        accept
      </button>
    </div>
  );
}

/** Render, wait for the seeded row to be visible, then act — like a user. */
async function renderAndAct(
  harness: React.ReactElement,
  loadedTestId: string,
  buttonName: string,
) {
  const view = render(<WorkflowProvider>{harness}</WorkflowProvider>);
  await waitFor(() =>
    expect(screen.getByTestId(loadedTestId)).toHaveTextContent("yes"),
  );
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  return view;
}

beforeEach(async () => {
  // Mock mode: no Supabase client. This is precisely the configuration the old
  // code lost placements and triage decisions in.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seedState()));
  await clearPendingWrites();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearPendingWrites();
});

describe("#737 C1 S3 guard: plans and triage accepts are device-durable", () => {
  it("journals a placed block to IndexedDB even with no account reachable", async () => {
    await renderAndAct(<PlacementHarness />, "task-loaded", "place");

    await waitFor(async () =>
      expect(await listPendingWrites("plan_placement")).toHaveLength(1),
    );

    const [journalled] = await listPendingWrites("plan_placement");
    expect(journalled!.payload).toMatchObject({
      workflow_task_id: TASK_ID,
      // Freshly minted locally, so the account holds no proposal for it yet.
      persisted_proposal_id: null,
    });
    // Absolute instants, pinned when the user acted. An hour re-derived at
    // replay time would land on the wrong day.
    expect(String(journalled!.payload.proposed_start)).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(String(journalled!.payload.proposed_end)).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    // The idempotency key the account write will carry must exist from the
    // moment the block is journalled, not be minted at send time.
    expect(journalled!.client_write_id).toEqual(expect.any(String));
    expect(journalled!.client_write_id.length).toBeGreaterThan(0);
  });

  it("journals an accepted triage draft, carrying the draft as the user left it", async () => {
    await renderAndAct(<DraftAcceptHarness />, "draft-loaded", "accept");

    await waitFor(async () =>
      expect(await listPendingWrites("task_draft_accept")).toHaveLength(1),
    );

    const [journalled] = await listPendingWrites("task_draft_accept");
    expect(journalled!.payload).toMatchObject({
      workflow_draft_id: DRAFT_ID,
      workflow_area_id: AREA_ID,
      title: "Guard draft title",
      first_tiny_step: "Write the first line",
      task_status: "active",
    });
    // Pinned at accept time: it feeds `waiting_on_since`, which must mean
    // since the accept, not since whenever the replay happens to run.
    expect(String(journalled!.payload.accepted_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(journalled!.client_write_id.length).toBeGreaterThan(0);
  });

  it("still returns the new task id synchronously, for the map-it offer", async () => {
    await renderAndAct(<DraftAcceptHarness />, "draft-loaded", "accept");

    expect(screen.getByTestId("accepted-task-id").textContent).not.toBe("");
  });

  it("says the DEVICE refused it, not the account, when IndexedDB is missing", async () => {
    // The one state where nothing holds the placement: a browser with no
    // usable IndexedDB (private mode, a blocking extension, a storage quota).
    // The banner must name the real cause -- blaming the account here would
    // send the user to check their connection over a device problem.
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global to simulate a browser
    // that does not provide it.
    delete globalThis.indexedDB;

    try {
      await renderAndAct(<PlacementHarness />, "task-loaded", "place");

      await waitFor(() =>
        expect(screen.getByTestId("sync-message")).toHaveTextContent(
          DEVICE_STORAGE_BLOCKED,
        ),
      );
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });

  it("keeps the journalled placement readable after the provider unmounts", async () => {
    // Standing in for a tab close: React state and the sessionStorage mirror
    // both die with the tree, IndexedDB does not. This is the whole claim.
    const view = await renderAndAct(
      <PlacementHarness />,
      "task-loaded",
      "place",
    );

    await waitFor(async () =>
      expect(await listPendingWrites("plan_placement")).toHaveLength(1),
    );

    view.unmount();
    window.sessionStorage.clear();

    const survivors = await listPendingWrites("plan_placement");
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.payload).toMatchObject({ workflow_task_id: TASK_ID });
  });
});
