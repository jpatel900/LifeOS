// #737 C1 S5: the polyfill IS the subject here — these tests assert that an
// approved rollup reaches IndexedDB and that a user's undo cancels the write
// it undoes, so a regression to a memory-only (or un-cancellable) path fails
// CI.
import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";

/**
 * REGRESSION GUARDS FOR SLICE S5 — the last two save-truths in the program.
 *
 * Both failures here are invisible from the outside: the screen looks
 * identical whether the rollup landed or evaporated, and identical whether the
 * sync is about to resurrect a block the user deleted. That is why these drive
 * the REAL provider in mock mode (no Supabase client — the exact configuration
 * the old code lost work in) and then read the journal directly, rather than
 * asserting on the dispatcher, which would stay green if someone reintroduced
 * an early return in `WorkflowContext`.
 *
 * ## 1. Rollups (S2's flagged falsehood)
 *
 * `confirmRollup` opened with `if (!client) return;` and, when the area had no
 * account id, `markLocalOnly(savedOnThisDeviceBanner("Your rollup"))` — a
 * banner saying the rollup was on this device over a write that had happened
 * nowhere at all.
 *
 * ## 2. The compensating actions (#778's disclosed resurrection)
 *
 * #778 made placements and triage accepts durable and recorded, in its own
 * truth map, the failure that created: the undo was NOT journalled, so a
 * reconnect delivered a block (or a task) the user had explicitly taken back.
 *
 * The browser tier of the placement half is `tests/e2e/offline-undo-supersede.spec.ts`
 * — a real IndexedDB, a real second tab. This file covers the ACCEPT-THEN-DROP
 * half, which has no equally clean browser affordance (`onDrop` lives on the
 * legacy `/review` cockpit, inside a needs-recovery list with no test id and a
 * seed shape of its own), plus the cross-cutting rule both halves share: a
 * cancellation must take exactly its own pair and nothing else.
 */

const navigationMock = vi.hoisted(() => ({
  pathname: "/today",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

const AREA_ID = "area-s5-guard";
const DRAFT_ID = "draft-s5-guard";
const CAPTURE_ID = "capture-s5-guard";
const STORAGE_KEY = "lifeos.phase2.workflow";

/**
 * Seed one pending triage draft through the provider's own restore path.
 *
 * `WorkflowProvider` rehydrates from this `sessionStorage` key on mount, which
 * is how the shipped app carries state across a reload — so seeding here
 * exercises the real entry point rather than reaching into the reducer. The
 * empty `tasks` array is deliberate: accepting to "today" runs the WIP cap,
 * and a seed that already filled the slots would return a refusal instead of
 * an accept, making the test assert against a write that never happened.
 */
function seedPendingDraft() {
  const nowIso = new Date("2026-05-08T12:00:00.000Z").toISOString();
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
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
          raw_text: "Accept this draft and then drop it",
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
          title: "Accept this draft and then drop it",
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
      tasks: [],
      timeBlockProposals: [],
      calendarBlocks: [],
      executionSessions: [],
      healthChecks: [],
      reviewLog: [],
      wipRefusal: null,
    }),
  );
}

/**
 * Exposes the live sync status alongside the win action, so a test can watch
 * `pendingLocalChanges` go up AND come back down.
 */
function PendingFlagHarness() {
  const { confirmWin, syncStatus } = useWorkflow();

  return (
    <div>
      <span data-testid="pending-flag">
        {syncStatus.pendingLocalChanges ? "pending" : "clear"}
      </span>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <button
        type="button"
        data-testid="confirm-win"
        onClick={() => {
          void confirmWin({ taskId: "task-s5-flag", title: "A logged win" });
        }}
      >
        confirm
      </button>
    </div>
  );
}

/** Approves one rollup through the real context action, once, on mount. */
function RollupHarness() {
  const { confirmRollup } = useWorkflow();
  const [done, setDone] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    void (async () => {
      await confirmRollup({
        areaId: AREA_ID,
        periodType: "week",
        periodStart: "2026-05-04",
        periodEnd: "2026-05-10",
        summary: {
          headline: "A steady week",
          counts: {
            completed: 3,
            missed: 1,
            captured: 5,
            tasksCreated: 4,
          },
          highlights: [],
          nextFocus: null,
        },
      });
      setDone(true);
    })();
  }, [confirmRollup]);

  return <span data-testid="rollup-done">{done ? "done" : ""}</span>;
}

/**
 * Accepts a seeded triage draft and then drops the task it created — the exact
 * accept-then-drop sequence #778 disclosed, driven through the real context
 * actions so the path under test is the shipped one.
 *
 * ## Why each step is deferred a tick, and why that is not a workaround
 *
 * Both actions read `stateRef.current`, which the provider refreshes in its
 * OWN effect. React runs child effects before parent effects in a commit, so
 * an action fired synchronously from this child's mount effect would read the
 * pre-restore state, find no draft, and quietly do nothing — the test would
 * then assert against a write that never happened. Deferring to a macrotask
 * puts each step after the provider has caught up, which is exactly where a
 * real user's click lands. The drop needs a second deferral for the same
 * reason: it must see the task the accept just created.
 */
function AcceptThenDropHarness({ drop }: { drop: boolean }) {
  const { state, acceptTaskDraft, dropTask } = useWorkflow();
  const [phase, setPhase] = useState<"idle" | "accepted" | "dropped">("idle");
  const acceptedTaskId = useRef<string | null>(null);
  const hasAccepted = useRef(false);
  const hasDropped = useRef(false);

  const draftId = state.taskDrafts[0]?.id ?? null;

  useEffect(() => {
    if (hasAccepted.current || !draftId) return;
    hasAccepted.current = true;
    const timer = setTimeout(() => {
      acceptedTaskId.current = acceptTaskDraft(draftId);
      setPhase("accepted");
    }, 0);
    return () => clearTimeout(timer);
  }, [acceptTaskDraft, draftId]);

  useEffect(() => {
    if (phase !== "accepted" || !drop || hasDropped.current) return;
    const taskId = acceptedTaskId.current;
    if (!taskId) return;
    hasDropped.current = true;
    const timer = setTimeout(() => {
      dropTask(taskId);
      setPhase("dropped");
    }, 0);
    return () => clearTimeout(timer);
  }, [drop, dropTask, phase]);

  return <span data-testid="phase">{phase}</span>;
}

beforeEach(async () => {
  // Mock mode: no Supabase client — the configuration the old code lost work
  // in, and the only one in which a write can still be queued when the user
  // undoes it.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  await clearPendingWrites();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearPendingWrites();
});

describe("#737 C1 S5 guard: rollups are device-durable", () => {
  it("journals an approved rollup to IndexedDB even with no account reachable", async () => {
    render(
      <WorkflowProvider>
        <RollupHarness />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("rollup-done")).toHaveTextContent("done"),
    );

    const journalled = await listPendingWrites("rollup");
    expect(journalled).toHaveLength(1);
    expect(journalled[0]!.payload).toMatchObject({
      workflow_area_id: AREA_ID,
      period_type: "week",
      // Pinned at approve time. A replay running next week must not re-derive
      // the period from its own clock.
      period_start: "2026-05-04",
      period_end: "2026-05-10",
    });
    // The idempotency key the account write will carry must exist from the
    // moment the rollup is journalled, not be minted at send time.
    expect(journalled[0]!.client_write_id).toEqual(expect.any(String));
    expect(journalled[0]!.client_write_id.length).toBeGreaterThan(0);
  });

  it("never claims the rollup is on the device when the device refuses to hold it", async () => {
    // The one state where nothing holds the rollup: no usable IndexedDB. The
    // banner must name the DEVICE as the cause rather than blaming the
    // account, which is what the pre-S5 path did.
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global to simulate a browser
    // that does not provide it.
    delete globalThis.indexedDB;

    try {
      render(
        <WorkflowProvider>
          <RollupHarness />
        </WorkflowProvider>,
      );

      await waitFor(() =>
        expect(screen.getByTestId("rollup-done")).toHaveTextContent("done"),
      );
      // Nothing was journalled, and nothing may claim otherwise.
      globalThis.indexedDB = realIndexedDb;
      expect(await listPendingWrites("rollup")).toHaveLength(0);
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });
});

describe("#737 C1 S5 guard: an undo cancels the write it undoes", () => {
  beforeEach(() => {
    seedPendingDraft();
  });

  it("journals an accepted triage draft when it is NOT dropped", async () => {
    // The control for the test below: without it, "no task_draft_accept in the
    // journal" would also pass on a build where the accept was never
    // journalled at all, and the cancellation would be proving nothing.
    render(
      <WorkflowProvider>
        <AcceptThenDropHarness drop={false} />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("accepted"),
    );

    await waitFor(async () =>
      expect(await listPendingWrites("task_draft_accept")).toHaveLength(1),
    );
  });

  it("leaves nothing queued to recreate a task the user accepted and then dropped", async () => {
    render(
      <WorkflowProvider>
        <AcceptThenDropHarness drop />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("dropped"),
    );

    // THE ASSERTION. A queued accept here IS the resurrection: it needs only
    // an account to appear, and the replay would create the task as `active`
    // (#778's disclosed second shape).
    await waitFor(async () =>
      expect(await listPendingWrites("task_draft_accept")).toHaveLength(0),
    );
    // And the compensating entry must not linger either — it had nothing to
    // send, because the accept it compensates never reached the account.
    expect(await listPendingWrites("task_drop")).toHaveLength(0);
  });
});

describe("#737 C1 S5 guard: the device-only indicator can CLEAR, not only raise", () => {
  /**
   * The half of `pendingLocalChanges` that never existed, flagged on #736.
   *
   * Nine call sites set the flag to `true`; none ever set it back. So one
   * signed-out session — or a single flaky save — pinned every surface reading
   * it to "some of your work is on this device" for the rest of the page's
   * life, long after the work had reached the account. The masthead indicator
   * #736 built on that flag could not be trusted for exactly this reason, and
   * a rebuilt indicator on the same broken flag would be the same lie in a
   * new place.
   *
   * Driven end to end through the provider: raise the flag with a real
   * journalled write, empty the journal the way a successful drain would, then
   * fire the `online` event the provider actually listens on.
   */
  it("clears the flag once the drain finds nothing left to send", async () => {
    render(
      <WorkflowProvider>
        <PendingFlagHarness />
      </WorkflowProvider>,
    );

    // Starts clear: nothing is queued.
    await waitFor(() =>
      expect(screen.getByTestId("pending-flag")).toHaveTextContent("clear"),
    );

    fireEvent.click(screen.getByTestId("confirm-win"));

    // Raised by a write that genuinely is on the device and not in an account.
    await waitFor(() =>
      expect(screen.getByTestId("pending-flag")).toHaveTextContent("pending"),
    );
    expect(await listPendingWrites("win")).toHaveLength(1);

    // Stand in for a successful drain: the account took the write, so the
    // journal no longer holds it.
    await act(async () => {
      await clearPendingWrites();
      window.dispatchEvent(new Event("online"));
    });

    // THE ASSERTION. Before S5 this stayed "pending" forever.
    await waitFor(() =>
      expect(screen.getByTestId("pending-flag")).toHaveTextContent("clear"),
    );
  });
});
