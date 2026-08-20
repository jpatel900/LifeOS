// #885 regression guard — "Reset this browser" promises the browser now
// starts from empty local state, but it only ever rebuilt the in-memory
// reducer. Three device-local IndexedDB stores were never cleared — the
// offline capture queue, the undecided-draft store, and the pending-writes
// journal — each read back on the next mount by the restore effects in
// WorkflowContext.tsx, so the "wiped" data visibly reappeared after a
// reload. Mirrors durableTriageDraftGuard.test.tsx's shape: drive the REAL
// provider over fake-indexeddb, then remount with fresh `sessionStorage`
// (what a reload after the reset actually is) to prove nothing comes back.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  enqueueCapture,
  listPendingCaptures,
} from "@/lib/capture/offlineQueue";
import {
  clearStoredTaskDrafts,
  listStoredTaskDrafts,
} from "@/lib/durability/draftStore";
import {
  clearPendingWrites,
  enqueuePendingWrite,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";

const STORAGE_KEY = "lifeos.phase2.workflow";
const AREA_ID = "reset-guard-area";
const CAPTURE_ID = "reset-guard-capture";
const DRAFT_ID = "reset-guard-draft";

const SEED_NOW = new Date("2026-08-20T12:00:00.000Z").toISOString();

function seedArea() {
  return {
    id: AREA_ID,
    user_id: "guard-user",
    name: "Work",
    color: "#2563eb",
    created_at: SEED_NOW,
  };
}

function seedCapture() {
  return {
    id: CAPTURE_ID,
    user_id: "guard-user",
    area_id: AREA_ID,
    raw_text: "Renew the volunteer insurance certificate",
    return_hook: null,
    client_capture_id: null,
    capture_mode: "text",
    inferred_area_confidence: 0.9,
    status: "triage_required",
    created_at: SEED_NOW,
  };
}

function seedDraft() {
  return {
    id: DRAFT_ID,
    user_id: "guard-user",
    capture_item_id: CAPTURE_ID,
    area_id: AREA_ID,
    title: "Renew the volunteer insurance certificate",
    description: null,
    confidence: 0.8,
    estimated_minutes_low: 30,
    estimated_minutes_high: 60,
    first_tiny_step: "Find last year's certificate",
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: SEED_NOW,
  };
}

/**
 * `withDraft: false` is the reload-simulate mount: the reducer's own
 * sessionStorage mirror is empty (a fresh page load never carries an
 * in-memory draft), so the only way the draft could come back is if it is
 * still sitting in the durable `draftStore` IndexedDB.
 */
function seedState(options: { withDraft: boolean }) {
  return {
    areas: [seedArea()],
    captureItems: [seedCapture()],
    taskDrafts: options.withDraft ? [seedDraft()] : [],
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
  };
}

function putSeed(options: { withDraft: boolean }) {
  window.sessionStorage.clear();
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(seedState(options)),
  );
}

function ResetHarness() {
  const { state, resetWorkflow, unsyncedCaptureCount } = useWorkflow();
  const draft = state.taskDrafts.find((item) => item.id === DRAFT_ID) ?? null;

  return (
    <div>
      <span data-testid="draft-status">{draft?.status ?? "absent"}</span>
      <span data-testid="unsynced-count">{unsyncedCaptureCount}</span>
      <button type="button" onClick={() => void resetWorkflow()}>
        reset
      </button>
    </div>
  );
}

beforeEach(async () => {
  // Mock mode: no Supabase client — reset is a device-only operation and
  // must work identically signed out or offline.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  await clearStoredTaskDrafts();
  await clearPendingWrites();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearStoredTaskDrafts();
  await clearPendingWrites();
});

describe("#885 guard: local reset wipes the three device-local durable stores", () => {
  it("clears the offline queue, the draft store, and the pending-writes journal so a reload can't restore them", async () => {
    putSeed({ withDraft: true });
    await enqueueCapture({
      rawText: "Renew the volunteer insurance certificate",
      areaId: AREA_ID,
    });
    await enqueuePendingWrite({
      entity: "win",
      payload: { title: "shipped the reset guard", source_task_id: "task-1" },
    });

    const first = render(
      <WorkflowProvider>
        <ResetHarness />
      </WorkflowProvider>,
    );

    // Baseline: the draft is live in the reducer, the capture badge counts
    // it, and — because of the write-half mirror effect — the draft has also
    // landed in the real draftStore, not just sessionStorage.
    await waitFor(() =>
      expect(screen.getByTestId("draft-status")).toHaveTextContent("pending"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("unsynced-count")).toHaveTextContent("1"),
    );
    await waitFor(async () =>
      expect(await listStoredTaskDrafts()).toHaveLength(1),
    );
    expect(await listPendingCaptures()).toHaveLength(1);
    expect(await listPendingWrites()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "reset" }));

    await waitFor(() =>
      expect(screen.getByTestId("draft-status")).toHaveTextContent("absent"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("unsynced-count")).toHaveTextContent("0"),
    );

    // The three device-local stores themselves, not just the reducer's copy
    // of them — this is the exact gap #885 reported: a reset that rebuilds
    // only the in-memory state while IndexedDB keeps the "wiped" data.
    expect(await listPendingCaptures()).toHaveLength(0);
    expect(await listStoredTaskDrafts()).toHaveLength(0);
    expect(await listPendingWrites()).toHaveLength(0);

    first.unmount();

    // Reload-simulate: a fresh mount with an empty sessionStorage mirror
    // (what a real page reload is) reruns WorkflowContext's restore path —
    // the draft-restore effect reads `draftStore`, and the mount effect
    // reads the offline queue and pending-writes journal. Before the fix,
    // this second mount pulled the seeded data right back in.
    putSeed({ withDraft: false });

    render(
      <WorkflowProvider>
        <ResetHarness />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("unsynced-count")).toHaveTextContent("0"),
    );
    expect(screen.getByTestId("draft-status")).toHaveTextContent("absent");
    expect(await listPendingCaptures()).toHaveLength(0);
    expect(await listStoredTaskDrafts()).toHaveLength(0);
    expect(await listPendingWrites()).toHaveLength(0);
  });
});
