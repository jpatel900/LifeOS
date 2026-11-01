// #737 C1 S3: a triage accept is journalled to IndexedDB BEFORE any account
// write, so a run with no IndexedDB exercises the device-blocked branch and
// never reaches the person-link writes these tests are about.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import type { ParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";

// Drive real journal replay to a mocked atomic RPC. This proves submitted
// approvals and post-commit learning, not PostgreSQL link creation or isolation.

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockAcceptRpc,
  mockCreateTask,
  mockCreateTimeBlockProposal,
  mockFindOrCreatePerson,
  mockRecordPersonLinkAcceptance,
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockAcceptRpc: vi.fn(),
  mockCreateTask: vi.fn(),
  mockCreateTimeBlockProposal: vi.fn(),
  mockFindOrCreatePerson: vi.fn(),
  mockRecordPersonLinkAcceptance: vi.fn(),
  // Real journal replay authenticates, then calls the atomic RPC. The remaining
  // query stubs serve snapshot loading and compensation lookup only.
  mockCreateSupabaseBrowserClient: vi.fn(() => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const eqInner = vi.fn(() => ({ maybeSingle }));
    const eqOuter = vi.fn(() => ({ eq: eqInner }));
    return {
      mocked: true,
      rpc: (...args: unknown[]) => mockAcceptRpc(...args),
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
    createTask: mockCreateTask,
    createTimeBlockProposal: mockCreateTimeBlockProposal,
    findOrCreatePerson: mockFindOrCreatePerson,
    recordPersonLinkAcceptance: mockRecordPersonLinkAcceptance,
  };
});

// Keep post-commit learning observable and forbid legacy dependent writes.
vi.mock("@/lib/data/workflow/planning", async () => ({
  ...(await vi.importActual<typeof import("@/lib/data/workflow/planning")>(
    "@/lib/data/workflow/planning",
  )),
  createTask: mockCreateTask,
  recordTaskAcceptance: vi.fn(),
}));

vi.mock("@/lib/data/workflow/people", async () => ({
  ...(await vi.importActual<typeof import("@/lib/data/workflow/people")>(
    "@/lib/data/workflow/people",
  )),
  findOrCreatePerson: mockFindOrCreatePerson,
  recordPersonLinkAcceptance: mockRecordPersonLinkAcceptance,
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
  title: "Send Sarah the deck",
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
  first_tiny_step: "Open the deck",
  waiting_on_person_id: null,
  waiting_on_since: null,
  is_commitment: false,
  committed_to_person_id: null,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

const SARAH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeParsedResult(
  personMentions: Array<{
    name: string;
    role: "waiting_on" | "committed_to" | "mention";
    confidence: number;
  }>,
  isCommitment: boolean,
): ParsedWorkflowResult {
  const createdAt = "2026-05-27T00:00:00.000Z";
  return {
    captureItem: {
      id: "capture-local-1",
      user_id: "mock-user",
      area_id: "area-main-job",
      raw_text: "Send Sarah the deck like I promised.",
      capture_mode: "text",
      inferred_area_confidence: 0.8,
      status: "triage_required",
      created_at: createdAt,
    },
    taskDrafts: [
      {
        id: "task-draft-local-1",
        user_id: "mock-user",
        capture_item_id: "capture-local-1",
        area_id: "area-main-job",
        title: "Send Sarah the deck",
        description: null,
        confidence: 0.7,
        estimated_minutes_low: 15,
        estimated_minutes_high: 30,
        first_tiny_step: "Open the deck",
        breakdown: null,
        person_mentions: personMentions,
        is_commitment: isCommitment,
        status: "pending",
        created_at: createdAt,
      },
    ],
    projectDrafts: [],
    ambiguityAssessment: null,
    timeBlockProposalDrafts: [],
    triageReasons: [],
    clarificationQuestions: [],
  };
}

function PersonLinkProbe() {
  const { state, addParsedWorkflowResult, acceptTaskDraft, rejectPersonLink } =
    useWorkflow();
  const draft = state.taskDrafts[0];

  return (
    <div>
      <span data-testid="draft-count">{state.taskDrafts.length}</span>
      <span data-testid="task-count">{state.tasks.length}</span>
      <button
        type="button"
        onClick={() =>
          addParsedWorkflowResult(
            makeParsedResult(
              [{ name: "Sarah", role: "waiting_on", confidence: 0.9 }],
              false,
            ),
          )
        }
      >
        Inject waiting-on draft
      </button>
      <button
        type="button"
        onClick={() =>
          addParsedWorkflowResult(
            makeParsedResult(
              [{ name: "Sarah", role: "committed_to", confidence: 0.9 }],
              true,
            ),
          )
        }
      >
        Inject committed-to draft
      </button>
      <button
        type="button"
        onClick={() => addParsedWorkflowResult(makeParsedResult([], false))}
      >
        Inject plain draft
      </button>
      <button
        type="button"
        onClick={() =>
          addParsedWorkflowResult(
            makeParsedResult(
              [{ name: "Sarah", role: "mention", confidence: 0.9 }],
              false,
            ),
          )
        }
      >
        Inject mention-only draft
      </button>
      <button
        type="button"
        disabled={!draft}
        onClick={() => draft && rejectPersonLink(draft.id, 0)}
      >
        Reject link
      </button>
      <button
        type="button"
        disabled={!draft}
        onClick={() => draft && acceptTaskDraft(draft.id)}
      >
        Accept
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <WorkflowProvider>
      <PersonLinkProbe />
    </WorkflowProvider>,
  );
}

beforeEach(async () => {
  // A response fixture, not a simulation of PostgreSQL transactions or RLS.
  mockAcceptRpc.mockImplementation(
    async (
      _fn: string,
      args: {
        p_task: Record<string, unknown>;
        p_person_mentions: Array<{
          name: string;
          role: string;
          normalized_name: string;
        }>;
      },
    ) => ({
      data: {
        task: { ...persistedTask, ...args.p_task },
        proposal: null,
        deduplicated: false,
        accepted_links: args.p_person_mentions.map((mention) => ({
          name: mention.name,
          role: mention.role,
          person_id: mention.role === "mention" ? null : SARAH_ID,
        })),
      },
      error: null,
    }),
  );

  // The provider persists workflow state to sessionStorage; clear it so drafts
  // from a prior test do not leak into the next render.
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
  mockCreateTimeBlockProposal.mockResolvedValue({
    provider: "supabase",
    proposal: null,
  });
  mockCreateTask.mockResolvedValue({
    provider: "supabase",
    task: persistedTask,
  });
  mockFindOrCreatePerson.mockResolvedValue({
    provider: "supabase",
    person: {
      id: SARAH_ID,
      user_id: persistedArea.user_id,
      display_name: "Sarah",
      normalized_name: "sarah",
      notes: null,
      created_at: "2026-05-27T00:00:00.000Z",
      updated_at: "2026-05-27T00:00:00.000Z",
      archived_at: null,
    },
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
  vi.clearAllMocks();
  await clearPendingWrites();
});

describe("WorkflowProvider accept-path person/commitment persistence", () => {
  async function waitForPersistedAreas() {
    await waitFor(() => expect(mockListAreas).toHaveBeenCalled());
  }

  it("submits the approved waiting-on link and acceptance time atomically", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject waiting-on draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );

    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => expect(mockAcceptRpc).toHaveBeenCalled());
    const acceptInput = mockAcceptRpc.mock.calls[0][1];
    const taskInput = acceptInput.p_task;
    expect(acceptInput.p_person_mentions).toEqual([
      { name: "Sarah", role: "waiting_on", normalized_name: "sarah" },
    ]);
    expect(typeof acceptInput.p_accepted_at).toBe("string");
    expect(taskInput.is_commitment).toBe(false);

    // The pending person-link proposal is resolved to accepted.
    await waitFor(() =>
      expect(mockRecordPersonLinkAcceptance).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: "waiting_on", name: "Sarah" }),
      ),
    );
  });

  it("submits the normalized committed-to link and commitment atomically", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject committed-to draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );

    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => expect(mockAcceptRpc).toHaveBeenCalled());
    const acceptInput = mockAcceptRpc.mock.calls[0][1];
    const taskInput = acceptInput.p_task;
    expect(acceptInput.p_person_mentions).toEqual([
      { name: "Sarah", role: "committed_to", normalized_name: "sarah" },
    ]);
    expect(taskInput.is_commitment).toBe(true);
    expect(mockFindOrCreatePerson).not.toHaveBeenCalled();
  });

  it("links nothing when the person link was rejected before accept", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject committed-to draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );

    // Reject the proposed link first — it degrades to a plain task.
    fireEvent.click(screen.getByText("Reject link"));
    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => expect(mockAcceptRpc).toHaveBeenCalled());
    const acceptInput = mockAcceptRpc.mock.calls[0][1];
    const taskInput = acceptInput.p_task;
    // No surviving mention -> no person link; rejecting a committed_to mention
    // also cleared is_commitment (rejectPersonMention degrades it).
    expect(acceptInput.p_person_mentions).toEqual([]);
    expect(taskInput.is_commitment).toBe(false);
    // No person is created and no acceptance suggestion fires for a rejected link.
    expect(mockFindOrCreatePerson).not.toHaveBeenCalled();
    expect(mockRecordPersonLinkAcceptance).not.toHaveBeenCalled();
  });

  it("leaves a plain draft (no mentions, not a commitment) unaffected on accept", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject plain draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );
    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => expect(mockAcceptRpc).toHaveBeenCalled());
    const acceptInput = mockAcceptRpc.mock.calls[0][1];
    const taskInput = acceptInput.p_task;
    expect(acceptInput.p_person_mentions).toEqual([]);
    expect(taskInput.is_commitment).toBe(false);
    // A plain task creates no person and fires no acceptance suggestion.
    expect(mockFindOrCreatePerson).not.toHaveBeenCalled();
    expect(mockRecordPersonLinkAcceptance).not.toHaveBeenCalled();
  });

  it("creates no person and links no column for an informational mention, but resolves its suggestion", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject mention-only draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );
    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => expect(mockAcceptRpc).toHaveBeenCalled());
    const acceptInput = mockAcceptRpc.mock.calls[0][1];
    const taskInput = acceptInput.p_task;
    // role "mention" is informational: no person row (FR-017 approval is only
    // granted by a waiting_on/committed_to link) and no column linked.
    expect(mockFindOrCreatePerson).not.toHaveBeenCalled();
    expect(acceptInput.p_person_mentions).toEqual([
      { name: "Sarah", role: "mention", normalized_name: "sarah" },
    ]);
    expect(taskInput.is_commitment).toBe(false);
    // The dangling pending proposal for the mention is still resolved.
    await waitFor(() =>
      expect(mockRecordPersonLinkAcceptance).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: "mention", name: "Sarah" }),
      ),
    );
  });
});
