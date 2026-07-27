// #737 C1 S3: a triage accept is journalled to IndexedDB BEFORE any account
// write, so a run with no IndexedDB exercises the device-blocked branch and
// never reaches the person-link writes these tests are about.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import type { ParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";

// S3 (#255): accept-path person/commitment persistence. These tests drive the
// real accept orchestration from WorkflowContext, mocking only the data-layer
// writes so we can assert what gets sent to `createTask`,
// `findOrCreatePerson`, and `recordPersonLinkAcceptance`.
//
// RE-ANCHORED BY #737 C1 S3. Two things moved under these tests, and neither
// changed what they assert:
//
//  1. The orchestration moved out of `persistAcceptedTaskDraft` (which now only
//     journals) into `syncJournaledTaskDraftAccept`, which runs on REPLAY.
//  2. That module imports its writes from the LEAF modules
//     (`data/workflow/planning`, `/people`, `/calendar`) rather than the
//     barrel, so the barrel mock below no longer intercepts them. The write
//     mocks are therefore installed on the leaves; the barrel mock stays for
//     the `list*` reads, which WorkflowContext still imports from it.

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
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
  mockCreateTask: vi.fn(),
  mockCreateTimeBlockProposal: vi.fn(),
  mockFindOrCreatePerson: vi.fn(),
  mockRecordPersonLinkAcceptance: vi.fn(),
  // #737 C1 S3: the replay path calls `requireSupabaseUser` and looks the task
  // up by `client_write_id` before deciding to insert, so the stand-in client
  // needs those two surfaces. Everything it would WRITE is still mocked at the
  // leaf modules below -- this only lets the real orchestration get that far.
  // The lookup deliberately finds nothing: these tests are about the FIRST
  // attempt, which is the one that resolves person links.
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
    createTask: mockCreateTask,
    createTimeBlockProposal: mockCreateTimeBlockProposal,
    findOrCreatePerson: mockFindOrCreatePerson,
    recordPersonLinkAcceptance: mockRecordPersonLinkAcceptance,
  };
});

// The leaf modules `syncJournaledTaskDraftAccept` actually calls.
vi.mock("@/lib/data/workflow/planning", async () => ({
  ...(await vi.importActual<typeof import("@/lib/data/workflow/planning")>(
    "@/lib/data/workflow/planning",
  )),
  createTask: mockCreateTask,
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

beforeEach(() => {
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("WorkflowProvider accept-path person/commitment persistence", () => {
  async function waitForPersistedAreas() {
    await waitFor(() => expect(mockListAreas).toHaveBeenCalled());
  }

  it("writes waiting_on_person_id + waiting_on_since when a waiting-on link is accepted", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject waiting-on draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );

    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const taskInput = mockCreateTask.mock.calls[0][1];
    expect(taskInput.waiting_on_person_id).toBe(SARAH_ID);
    expect(typeof taskInput.waiting_on_since).toBe("string");
    expect(taskInput.committed_to_person_id).toBeNull();
    expect(taskInput.is_commitment).toBe(false);

    // The pending person-link proposal is resolved to accepted.
    await waitFor(() =>
      expect(mockRecordPersonLinkAcceptance).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: "waiting_on", name: "Sarah" }),
      ),
    );
  });

  it("creates the person then links committed_to + is_commitment on accept (and is idempotent via findOrCreatePerson)", async () => {
    renderProbe();
    await waitForPersistedAreas();

    fireEvent.click(screen.getByText("Inject committed-to draft"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-count").textContent).toBe("1"),
    );

    fireEvent.click(screen.getByText("Accept"));

    // Person is found-or-created (idempotent primitive) before the task insert.
    await waitFor(() =>
      expect(mockFindOrCreatePerson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          display_name: "Sarah",
          normalized_name: "sarah",
        }),
      ),
    );

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const taskInput = mockCreateTask.mock.calls[0][1];
    expect(taskInput.committed_to_person_id).toBe(SARAH_ID);
    expect(taskInput.is_commitment).toBe(true);
    expect(taskInput.waiting_on_person_id).toBeNull();
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

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const taskInput = mockCreateTask.mock.calls[0][1];
    // No surviving mention -> no person link; rejecting a committed_to mention
    // also cleared is_commitment (rejectPersonMention degrades it).
    expect(taskInput.waiting_on_person_id).toBeNull();
    expect(taskInput.committed_to_person_id).toBeNull();
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

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const taskInput = mockCreateTask.mock.calls[0][1];
    expect(taskInput.waiting_on_person_id).toBeNull();
    expect(taskInput.committed_to_person_id).toBeNull();
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

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const taskInput = mockCreateTask.mock.calls[0][1];
    // role "mention" is informational: no person row (FR-017 approval is only
    // granted by a waiting_on/committed_to link) and no column linked.
    expect(mockFindOrCreatePerson).not.toHaveBeenCalled();
    expect(taskInput.waiting_on_person_id).toBeNull();
    expect(taskInput.committed_to_person_id).toBeNull();
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
