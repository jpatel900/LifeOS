// #737 C1 re-score GAP 3: the polyfill IS the subject here — these tests
// assert that an UNACCEPTED triage draft reaches IndexedDB and comes back in a
// tab that never saw it, so a regression to a sessionStorage-only path fails
// CI.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearStoredTaskDrafts,
  listStoredTaskDrafts,
} from "@/lib/durability/draftStore";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import { DEVICE_STORAGE_BLOCKED } from "@/lib/statusVocabulary";

/**
 * REGRESSION GUARD — an unaccepted triage draft must stay device-durable.
 *
 * ## What the C1 re-score found
 *
 * Sort a capture, edit the draft, close the tab, open a new one: the draft was
 * gone and the capture read "Captured, not sorted yet" again. It survived a
 * RELOAD, which is what made the gap easy to miss — `WorkflowContext` mirrors
 * the reducer to `sessionStorage`, and `sessionStorage` survives a reload and
 * dies with the tab. #778 made the ACCEPTED draft durable; the undecided one,
 * with every edit made to it, did not follow.
 *
 * ## Why these tests, at this tier
 *
 * The failure is invisible from inside one tab: the triage sheet looks
 * identical whether the draft is held anywhere but this tab or not. So each
 * test drives the REAL provider in mock mode (no Supabase client), then either
 * reads IndexedDB directly or REMOUNTS with an empty `sessionStorage` — which
 * is what a new tab is. A draft that survives that remount is a draft a new
 * tab can find.
 *
 * Deliberately NOT asserted here: anything about the account. A pending draft
 * has no account destination at all — that is the whole reason it lives in
 * `durability/draftStore.ts` and not in the pending-writes journal.
 */

const navigationMock = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

const STORAGE_KEY = "lifeos.phase2.workflow";
const AREA_ID = "guard-area-draft";
const CAPTURE_ID = "guard-capture-draft";
const DRAFT_ID = "guard-draft-pending";
const EDITED_TITLE = "Renew the volunteer insurance certificate — this year";

const SEED_NOW = new Date("2026-05-08T12:00:00.000Z").toISOString();

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
 * `withDraft: false` is the NEW TAB: the account still holds the area and the
 * capture (the capture is persisted at capture time and its status is
 * legitimately still `new`), and the pending draft is the one thing only the
 * device ever had.
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

function DraftHarness() {
  const { state, editTaskDraft, acceptTaskDraft, rejectTaskDraft, syncStatus } =
    useWorkflow();
  const draft = state.taskDrafts.find((item) => item.id === DRAFT_ID) ?? null;

  return (
    <div>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <span data-testid="draft-title">{draft?.title ?? ""}</span>
      <span data-testid="draft-status">{draft?.status ?? "absent"}</span>
      <button
        type="button"
        onClick={() => editTaskDraft(DRAFT_ID, { title: EDITED_TITLE })}
      >
        edit
      </button>
      <button type="button" onClick={() => acceptTaskDraft(DRAFT_ID)}>
        accept
      </button>
      <button type="button" onClick={() => rejectTaskDraft(DRAFT_ID)}>
        reject
      </button>
    </div>
  );
}

async function renderWithDraftLoaded() {
  const view = render(
    <WorkflowProvider>
      <DraftHarness />
    </WorkflowProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("draft-status")).toHaveTextContent("pending"),
  );
  return view;
}

beforeEach(async () => {
  // Mock mode: no Supabase client — the configuration a signed-out or offline
  // user is in, and the one this gap lost work in.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  putSeed({ withDraft: true });
  await clearStoredTaskDrafts();
  await clearPendingWrites();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearStoredTaskDrafts();
  await clearPendingWrites();
});

describe("#737 C1 GAP 3 guard: an unaccepted triage draft is device-durable", () => {
  it("stores the pending draft on the device, with the user's edit in it", async () => {
    await renderWithDraftLoaded();

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    await waitFor(() =>
      expect(screen.getByTestId("draft-title")).toHaveTextContent(EDITED_TITLE),
    );

    await waitFor(async () => {
      const stored = await listStoredTaskDrafts();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: DRAFT_ID,
        title: EDITED_TITLE,
        capture_item_id: CAPTURE_ID,
        status: "pending",
      });
    });
  });

  it("restores the edited draft in a tab that never saw it", async () => {
    const first = await renderWithDraftLoaded();
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    await waitFor(async () =>
      expect(await listStoredTaskDrafts()).toHaveLength(1),
    );
    first.unmount();

    // THE DISCRIMINATOR. A fresh `sessionStorage` with no draft in it is what
    // a new tab has; IndexedDB is shared. Before this guard's fix the draft
    // existed nowhere but the tab that made it.
    putSeed({ withDraft: false });

    render(
      <WorkflowProvider>
        <DraftHarness />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("draft-title")).toHaveTextContent(EDITED_TITLE),
    );
    expect(screen.getByTestId("draft-status")).toHaveTextContent("pending");
  });

  it("drops the draft from the device once the user accepts it", async () => {
    await renderWithDraftLoaded();
    await waitFor(async () =>
      expect(await listStoredTaskDrafts()).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "accept" }));

    // The decision is what ends this tier's job: the accept becomes a real
    // `task_draft_accept` journal entry (#778), and nothing lives in both.
    await waitFor(async () =>
      expect(await listStoredTaskDrafts()).toHaveLength(0),
    );
  });

  it("drops the draft from the device once the user rejects it", async () => {
    await renderWithDraftLoaded();
    await waitFor(async () =>
      expect(await listStoredTaskDrafts()).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "reject" }));

    await waitFor(async () =>
      expect(await listStoredTaskDrafts()).toHaveLength(0),
    );
  });

  it("says the DEVICE refused it when IndexedDB is missing", async () => {
    // A browser with no usable IndexedDB (private mode, a blocking extension,
    // a storage quota). The banner must name the real cause — this is the one
    // state where the draft genuinely is per-tab, and the user is entitled to
    // know it rather than be told it is safe.
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global to simulate a browser
    // that does not provide it.
    delete globalThis.indexedDB;

    try {
      await renderWithDraftLoaded();
      fireEvent.click(screen.getByRole("button", { name: "edit" }));

      await waitFor(() =>
        expect(screen.getByTestId("sync-message")).toHaveTextContent(
          DEVICE_STORAGE_BLOCKED,
        ),
      );
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });
});
