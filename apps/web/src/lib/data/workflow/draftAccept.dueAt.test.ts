import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncJournaledTaskDraftAccept } from "./draftAccept";
import type { MinimalSupabaseClient } from "./shared";

/**
 * FR-049 (#1025) acceptance criterion: "Accepting an AI draft no longer
 * copies the draft's due_at into a new ORDINARY task ... Decision tasks
 * are the one exception ... Accept keeps copying a decision draft's
 * deadline."
 *
 * This is the persisted half of the accept-mapping gate — the demo/local
 * half (`lib/workflow/triage.ts`) is covered by
 * `lib/workflow/triage.dueAt.test.ts`. Same WIRING tier as
 * `draftAccept.captureStatus.test.ts`: does `createTask` actually get
 * called with the right `due_at`, not a real Postgres round trip.
 */

const createTaskMock = vi.hoisted(() => vi.fn());
const resolveCaptureItemsMock = vi.hoisted(() => vi.fn());

vi.mock("./planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./planning")>()),
  createTask: createTaskMock,
}));

vi.mock("./capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture")>()),
  resolveCaptureItems: resolveCaptureItemsMock,
}));

const AREA_ID = "44444444-4444-4444-8444-444444444444";
const CAPTURE_ID = "55555555-5555-4555-8555-555555555555";
const PERSISTED_TASK_ID = "66666666-6666-4666-8666-666666666666";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_WRITE_ID = "journal-accept-due-at-1";
const DUE_AT = "2026-09-30T16:00:00.000Z";

function client(): MinimalSupabaseClient {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqInner = vi.fn().mockReturnValue({ maybeSingle });
  const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
  const select = vi.fn().mockReturnValue({ eq: eqOuter });
  const upsert = vi.fn().mockResolvedValue({ error: null });

  return {
    from: vi.fn().mockReturnValue({ select, upsert }),
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
    },
  } as unknown as MinimalSupabaseClient;
}

type AcceptInput = Parameters<typeof syncJournaledTaskDraftAccept>[1];

function input(overrides: Partial<AcceptInput> = {}): AcceptInput {
  return {
    client_write_id: CLIENT_WRITE_ID,
    area_id: AREA_ID,
    source_capture_item_id: CAPTURE_ID,
    draft_id: "draft-1",
    title: "Someday review old notes",
    description: null,
    confidence: 0.8,
    task_type: null,
    is_reversible: null,
    due_at: DUE_AT,
    estimated_minutes_low: 25,
    estimated_minutes_high: 40,
    first_tiny_step: "Open the notes",
    is_commitment: false,
    person_mentions: [],
    task_status: "active",
    accepted_at: "2026-07-04T09:00:00.000Z",
    proposal: null,
    ...overrides,
  };
}

describe("journalled triage accept — due_at mapping (#1025)", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    createTaskMock.mockResolvedValue({
      provider: "supabase",
      task: { id: PERSISTED_TASK_ID },
    });
    resolveCaptureItemsMock.mockReset();
    resolveCaptureItemsMock.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
  });

  it("drops due_at when creating an ordinary (task_type: null) task", async () => {
    await syncJournaledTaskDraftAccept(client(), input({ task_type: null }));

    expect(createTaskMock).toHaveBeenCalledOnce();
    expect(createTaskMock.mock.calls[0][1]).toMatchObject({ due_at: null });
  });

  it("drops due_at when creating an explicit task_type: 'task' task", async () => {
    await syncJournaledTaskDraftAccept(client(), input({ task_type: "task" }));

    expect(createTaskMock.mock.calls[0][1]).toMatchObject({ due_at: null });
  });

  it("drops due_at for a backlogged (put-off) ordinary accept too", async () => {
    await syncJournaledTaskDraftAccept(
      client(),
      input({ task_type: "task", task_status: "backlog" }),
    );

    expect(createTaskMock.mock.calls[0][1]).toMatchObject({ due_at: null });
  });

  it("keeps due_at when creating a decision task", async () => {
    await syncJournaledTaskDraftAccept(
      client(),
      input({ task_type: "decision" }),
    );

    expect(createTaskMock.mock.calls[0][1]).toMatchObject({ due_at: DUE_AT });
  });
});
