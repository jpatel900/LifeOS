// #737 C1 S3: a triage accept is journalled to IndexedDB BEFORE any account
// write, so a run with no IndexedDB exercises the device-blocked branch and
// never reaches `createTask` at all.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import CapturePage from "../app/capture/page";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import {
  ACCOUNT_NEEDS_APP_UPDATE,
  ACCOUNT_SAVE_FAILED,
} from "@/lib/statusVocabulary";
import { stubParseCaptureFetch } from "./helpers/parseCaptureFetch";

// #687: the demoted stage pages (/capture, /triage, /execute, ...) are
// redirect shims into the moments home under the shipping config. This suite
// exercises the cockpit surfaces themselves, which render only under the
// #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false) — pin that config here.
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;
beforeEach(() => {
  // beforeEach, not beforeAll: process.env is process-global and shared by
  // every test file in a vitest worker, so re-pin before each test rather
  // than once per file.
  process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
});
afterAll(() => {
  if (ORIGINAL_MOMENTS_HOME === undefined) {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  } else {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
  }
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/capture",
  useRouter: () => ({ push: vi.fn() }),
}));

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockCreateCaptureItem,
  mockCreateTask,
  mockCreateTimeBlockProposal,
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockCreateCaptureItem: vi.fn(),
  mockCreateTask: vi.fn(),
  mockCreateTimeBlockProposal: vi.fn(),
  // #737 C1 S3: the replay path calls `requireSupabaseUser` and looks the task
  // up by `client_write_id` before deciding to insert, so the stand-in client
  // needs those two surfaces. The lookup finds nothing, which is the ordinary
  // first attempt.
  mockCreateSupabaseBrowserClient: vi.fn(() => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const eqInner = vi.fn(() => ({ maybeSingle }));
    const eqOuter = vi.fn(() => ({ eq: eqInner }));
    return {
      mocked: true,
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: eqOuter })),
        upsert: vi.fn(async () => ({ error: null })),
      })),
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
          error: null,
        })),
      },
    };
  }),
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
    createCaptureItem: mockCreateCaptureItem,
    createTask: mockCreateTask,
    createTimeBlockProposal: mockCreateTimeBlockProposal,
  };
});

// #737 C1 S3: `syncJournaledTaskDraftAccept` imports its writes from the LEAF
// modules rather than the barrel, so the barrel mock above no longer
// intercepts them. The barrel mock stays for the `list*` reads, which
// WorkflowContext still imports from it.
vi.mock("@/lib/data/workflow/planning", async () => ({
  ...(await vi.importActual<typeof import("@/lib/data/workflow/planning")>(
    "@/lib/data/workflow/planning",
  )),
  createTask: mockCreateTask,
}));

vi.mock("@/lib/data/workflow/calendar", async () => ({
  ...(await vi.importActual<typeof import("@/lib/data/workflow/calendar")>(
    "@/lib/data/workflow/calendar",
  )),
  createTimeBlockProposal: mockCreateTimeBlockProposal,
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

function AreaProbe() {
  const { state, selectedAreaId } = useWorkflow();

  return (
    <div>
      <span data-testid="area-count">{state.areas.length}</span>
      <span data-testid="first-area-id">{state.areas[0]?.id ?? ""}</span>
      <span data-testid="selected-area-id">{selectedAreaId ?? ""}</span>
    </div>
  );
}

function WorkflowRowsProbe() {
  const { state, selectedAreaId } = useWorkflow();
  const firstTask = state.tasks[0];

  return (
    <div>
      <span data-testid="selected-area-id">{selectedAreaId ?? ""}</span>
      <span data-testid="task-count">{state.tasks.length}</span>
      <span data-testid="first-task-area">{firstTask?.area_id ?? ""}</span>
      <span data-testid="first-task-title">{firstTask?.title ?? ""}</span>
    </div>
  );
}

function SyncStatusProbe() {
  const { syncStatus } = useWorkflow();

  return (
    <div>
      <span data-testid="sync-account">{syncStatus.account}</span>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
    </div>
  );
}

function TriageActionProbe() {
  const {
    state,
    selectedAreaId,
    submitCaptureText,
    sortCaptureIntoDrafts,
    backlogTaskDraft,
  } = useWorkflow();
  const draft = state.taskDrafts[0];
  // #703: capture saves raw; sorting it into a draft is a separate triage
  // action. This probe drives both steps, same as the real journey.
  const unsortedCapture = state.captureItems[0];

  return (
    <div>
      <span data-testid="selected-area-id">{selectedAreaId ?? ""}</span>
      <span data-testid="draft-count">{state.taskDrafts.length}</span>
      <button
        type="button"
        onClick={() =>
          submitCaptureText("Review the future idea", selectedAreaId)
        }
      >
        Capture
      </button>
      <button
        type="button"
        disabled={!unsortedCapture}
        onClick={() =>
          unsortedCapture && sortCaptureIntoDrafts(unsortedCapture.id)
        }
      >
        Sort
      </button>
      <button
        type="button"
        disabled={!draft}
        onClick={() => draft && backlogTaskDraft(draft.id)}
      >
        Someday
      </button>
    </div>
  );
}

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

const persistedTask = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: persistedArea.user_id,
  area_id: persistedArea.id,
  project_id: null,
  source_capture_item_id: null,
  title: "Persisted task",
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: 0.7,
  task_type: null,
  energy_type: null,
  estimated_minutes_low: 15,
  estimated_minutes_high: 30,
  due_at: null,
  definition_of_done: "Complete the first useful move and note the outcome.",
  first_tiny_step: "Open the task",
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

let restoreParseCaptureFetch: () => void;

beforeEach(async () => {
  // #691: the provider has always persisted the workflow STATE to
  // sessionStorage (unchanged). The area SELECTION moved to the
  // `lifeos_moments_prefs` cookie in C2-S14 (#687 round-8, defect 3) — see
  // `lib/momentsPreferencesCookie.ts`. Each test must start from clean
  // storage or one test's stored selection hydrates into the next (same
  // pattern as cockpitPlanFlow.test.tsx).
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.cookie = "lifeos_moments_prefs=; Max-Age=0; Path=/";
  // C2-S8 (#687 finding 1): `?area=` now also drives mount resolution — a
  // stray param a previous test left in `window.location` would otherwise
  // hydrate into this one.
  window.history.replaceState(null, "", "/");
  restoreParseCaptureFetch = stubParseCaptureFetch();
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
  mockCreateCaptureItem.mockResolvedValue({
    provider: "supabase",
    capture: {
      id: "44444444-4444-4444-8444-444444444444",
      user_id: persistedArea.user_id,
      area_id: persistedArea.id,
      raw_text: "Review the future idea",
      raw_audio_ref: null,
      capture_mode: "text",
      inferred_area_confidence: null,
      status: "new",
      created_at: "2026-05-27T00:00:00.000Z",
    },
  });
  mockCreateTask.mockResolvedValue({
    provider: "supabase",
    task: { ...persistedTask, status: "backlog" },
  });
  mockCreateTimeBlockProposal.mockResolvedValue({
    provider: "supabase",
    proposal: null,
  });
  // #861: `fake-indexeddb/auto` backs ONE module-global store shared by every
  // `it` in this file. The accept path below runs the REAL persistence sync,
  // which journals a device-durable write before the (mocked) account layer
  // is reached — so the journal fills up even with `@/lib/data/workflow`
  // mocked. Left uncleared, an earlier test's write is read back by the next
  // test's `WorkflowProvider` mount effect. Same clear
  // `durableWinsReviewsGuard.test.tsx` has always done.
  await clearPendingWrites();
});

afterEach(async () => {
  restoreParseCaptureFetch();
  vi.clearAllMocks();
  await clearPendingWrites();
});

describe("WorkflowProvider persisted area sync", () => {
  it("replaces the mock area list when persisted areas are available", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [persistedArea],
    });

    render(
      <WorkflowProvider>
        <AreaProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-count")).toHaveTextContent("1");
      expect(screen.getByTestId("first-area-id")).toHaveTextContent(
        "area-main-job",
      );
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    expect(mockCreateSupabaseBrowserClient).toHaveBeenCalled();
  });

  it("clears the selected area when persisted storage has no active areas", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [],
    });

    render(
      <WorkflowProvider>
        <AreaProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-count")).toHaveTextContent("0");
      expect(screen.getByTestId("first-area-id")).toHaveTextContent("");
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent("");
    });
  });

  it("does not save capture text against the display fallback when no areas exist", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [],
    });

    // CapturePage is an async Server Component (Next 15 `searchParams` is a
    // Promise) — resolve it before handing the element to `render`.
    const capturePageElement = await CapturePage({
      searchParams: Promise.resolve({}),
    });
    render(<WorkflowProvider>{capturePageElement}</WorkflowProvider>);

    await waitFor(() => {
      expect(screen.getByText("Create an area before capture")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText("Drop the thought here."), {
      target: { value: "Capture should wait for a real area" },
    });

    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
    expect(mockCreateCaptureItem).not.toHaveBeenCalled();
  });

  it("keeps direct persisted ids for custom areas without canonical slug mappings", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          user_id: "user-a",
          name: "Deep Work",
          slug: "deep-work",
          description: "Custom area",
          color: null,
          icon: null,
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-28T00:00:00.000Z",
          updated_at: "2026-05-28T00:00:00.000Z",
        },
      ],
    });

    render(
      <WorkflowProvider>
        <AreaProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-count")).toHaveTextContent("1");
      expect(screen.getByTestId("first-area-id")).toHaveTextContent(
        "33333333-3333-4333-8333-333333333333",
      );
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "33333333-3333-4333-8333-333333333333",
      );
    });
  });

  it("hydrates persisted workflow rows with cockpit area ids", async () => {
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [persistedTask],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    render(
      <WorkflowProvider>
        <WorkflowRowsProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
      expect(screen.getByTestId("task-count")).toHaveTextContent("1");
      expect(screen.getByTestId("first-task-area")).toHaveTextContent(
        "area-main-job",
      );
      expect(screen.getByTestId("first-task-title")).toHaveTextContent(
        "Persisted task",
      );
    });
  });

  it("persists Someday triage decisions as backlog tasks when signed in", async () => {
    // The capture already exists on the account — this test is about what
    // triage does with it, not about capturing it.
    mockListCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          user_id: persistedArea.user_id,
          area_id: persistedArea.id,
          raw_text: "Review the future idea",
          raw_audio_ref: null,
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "new",
          created_at: "2026-05-27T00:00:00.000Z",
        },
      ],
    });

    render(
      <WorkflowProvider>
        <TriageActionProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    // #703: capture saves raw and sorting is a separate triage action, so
    // this journey starts from an already-saved (server-side) capture and
    // exercises the Sort step that turns it into a draft.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sort" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));

    await waitFor(() => {
      expect(screen.getByTestId("draft-count")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Someday" }));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          area_id: persistedArea.id,
          status: "backlog",
          title: "Review the future idea",
        }),
      );
    });
    expect(mockCreateTimeBlockProposal).not.toHaveBeenCalled();
  });

  it("surfaces persisted load failures as saved data missing from view", async () => {
    mockListAreas.mockRejectedValue(new Error("network unavailable"));

    render(
      <WorkflowProvider>
        <SyncStatusProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "Saved workspace data could not load",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "saved account data may be missing from view",
      );
    });
  });

  it("surfaces save failures as local-only pending retry", async () => {
    mockCreateCaptureItem.mockRejectedValue(new Error("insert timeout"));

    render(
      <WorkflowProvider>
        <TriageActionProbe />
        <SyncStatusProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        ACCOUNT_SAVE_FAILED,
      );
    });
  });

  // C2-S8 (#687 finding 1): `?area=` outranks the stored device preference.
  // C2-S14 (#687 round-8, defect 3): the stored device preference now lives
  // in the `lifeos_moments_prefs` cookie, not `sessionStorage` — these tests
  // prime the cookie (the current, primary path), not the legacy bridge.
  describe("?area= URL precedence", () => {
    it("a valid ?area= wins over a stored device preference on mount", async () => {
      // The cookie already remembers "area-personal" from an earlier visit;
      // the URL now names a different area — the URL must win.
      document.cookie = `lifeos_moments_prefs=${encodeURIComponent(
        JSON.stringify({ area: "area-personal" }),
      )}; Path=/`;
      window.history.replaceState(null, "", "/?area=area-volunteer");

      render(
        <WorkflowProvider>
          <AreaProbe />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
          "area-volunteer",
        );
      });
    });

    it("?area=all resolves to the explicit All-areas selection, winning over a stored area preference", async () => {
      document.cookie = `lifeos_moments_prefs=${encodeURIComponent(
        JSON.stringify({ area: "area-personal" }),
      )}; Path=/`;
      window.history.replaceState(null, "", "/?area=all");

      render(
        <WorkflowProvider>
          <AreaProbe />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("selected-area-id")).toHaveTextContent("");
      });
    });

    it("an ?area= naming an id absent from every known area is not applied — the default/stored value stands", async () => {
      window.history.replaceState(null, "", "/?area=not-a-real-area");

      render(
        <WorkflowProvider>
          <AreaProbe />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
          "area-main-job",
        );
      });
    });

    // The advisor-flagged risk this session: `applyPersistedAreas`'s async
    // reconcile can move the selection away from what `?area=` named (the
    // account's real areas do not include it) long after the mount-time URL
    // priority applied it — demo/mock-mode tests never reach this path
    // (`createSupabaseBrowserClient()` returns null there), so this is the
    // only tier that can prove the address bar gets corrected rather than
    // left claiming a selection the screen no longer shows.
    it("corrects a stale ?area= param once the account's real areas no longer include it", async () => {
      window.history.replaceState(null, "", "/?area=area-personal");
      mockListAreas.mockResolvedValue({
        provider: "supabase",
        // Only maps to "area-main-job" — "area-personal" is absent.
        areas: [persistedArea],
      });

      render(
        <WorkflowProvider>
          <AreaProbe />
        </WorkflowProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
          "area-main-job",
        );
      });
      await waitFor(() => {
        expect(new URL(window.location.href).searchParams.get("area")).toBe(
          "area-main-job",
        );
      });
    });
  });

  it("surfaces missing server capabilities with Health guidance", async () => {
    mockCreateCaptureItem.mockRejectedValue({
      code: "PGRST202",
      message: "Could not find the public.create_capture_item function",
    });

    render(
      <WorkflowProvider>
        <TriageActionProbe />
        <SyncStatusProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        ACCOUNT_NEEDS_APP_UPDATE,
      );
    });
  });
});
