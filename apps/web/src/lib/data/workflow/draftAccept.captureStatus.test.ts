import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncJournaledTaskDraftAccept } from "./draftAccept";
import type { MinimalSupabaseClient } from "./shared";

/**
 * Final UX Loop C1, Target Card 1 (audit P0#3) — "sorted/accepted work never
 * resurrects as unsorted (capture status transitions pinned)".
 *
 * RE-ANCHORED, NOT REWRITTEN, BY SLICE S3
 * ---------------------------------------
 * These assertions arrived with #771 against
 * `persistenceSync.persistAcceptedTaskDraft`, which then ran the whole account
 * sequence inline. S3 makes a triage accept device-durable, so that sequence
 * moved: `persistAcceptedTaskDraft` now only journals, and the account writes
 * happen when the journal entry is REPLAYED, through
 * `syncJournaledTaskDraftAccept`. The guarantee did not change and neither did
 * any assertion below — only the module that owns it, which is why this file
 * moved with `git mv` rather than being deleted and re-authored.
 *
 * This is still the WIRING tier: does accepting a draft issue the capture
 * status write at all? On `origin/main` @ 6cc76ade it did not, and
 * `capture_items.status` stayed `"new"` forever.
 *
 * The other tiers live elsewhere and prove different things:
 *  - ACCOUNT (`src/__tests__/phase4aRls.local.test.ts`, real Postgres): the
 *    update lands, is ownership-bounded, and never drags a decided row back.
 *  - SURFACE (`src/lib/workflow/captureStatus.test.ts`): no screen presents an
 *    item as both unsorted and an accepted task.
 *  - DEVICE (`src/__tests__/durablePlansDraftsGuard.test.tsx`): the accept
 *    reaches IndexedDB before any of this is attempted.
 */

const createTaskMock = vi.hoisted(() => vi.fn());
const resolveCaptureItemsMock = vi.hoisted(() => vi.fn());
const recordPersonLinkAcceptanceMock = vi.hoisted(() => vi.fn());
const findOrCreatePersonMock = vi.hoisted(() => vi.fn());

vi.mock("./planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./planning")>()),
  createTask: createTaskMock,
}));

vi.mock("./capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture")>()),
  resolveCaptureItems: resolveCaptureItemsMock,
}));

vi.mock("./people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./people")>()),
  recordPersonLinkAcceptance: recordPersonLinkAcceptanceMock,
  findOrCreatePerson: findOrCreatePersonMock,
}));

const AREA_ID = "44444444-4444-4444-8444-444444444444";
const CAPTURE_ID = "55555555-5555-4555-8555-555555555555";
const PERSISTED_TASK_ID = "66666666-6666-4666-8666-666666666666";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_WRITE_ID = "journal-accept-1";

/**
 * A client whose `tasks` lookup finds nothing — the ordinary first attempt.
 * The replay short-circuit has its own coverage in the RLS suite, where a real
 * index rather than a stub decides it.
 */
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
    title: "Call the accountant about the quarterly filing",
    description: null,
    confidence: 0.8,
    task_type: null,
    is_reversible: null,
    due_at: null,
    estimated_minutes_low: 25,
    estimated_minutes_high: 40,
    first_tiny_step: "Find the filing reference",
    is_commitment: false,
    person_mentions: [],
    task_status: "active",
    accepted_at: "2026-07-04T09:00:00.000Z",
    proposal: null,
    ...overrides,
  };
}

describe("journalled triage accept — capture status truth (C1 card 1)", () => {
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
    recordPersonLinkAcceptanceMock.mockReset();
    findOrCreatePersonMock.mockReset();
  });

  it("advances the source capture to resolved when a draft is accepted", async () => {
    await syncJournaledTaskDraftAccept(client(), input());

    expect(resolveCaptureItemsMock).toHaveBeenCalledOnce();
    expect(resolveCaptureItemsMock.mock.calls[0][1]).toEqual([CAPTURE_ID]);
  });

  it("does the same for a backlogged accept — the thought is decided either way", async () => {
    await syncJournaledTaskDraftAccept(
      client(),
      input({ task_status: "backlog" }),
    );

    expect(resolveCaptureItemsMock.mock.calls[0][1]).toEqual([CAPTURE_ID]);
  });

  it("writes the status only after the task it came from actually landed", async () => {
    // Ordering matters: the task is what MAKES the capture resolved. A failed
    // insert must leave the thought waiting rather than resolve a capture that
    // produced nothing.
    createTaskMock.mockResolvedValue({ provider: "mock", task: { id: "x" } });

    await syncJournaledTaskDraftAccept(client(), input());

    expect(resolveCaptureItemsMock).not.toHaveBeenCalled();
  });

  it("fails loudly when the status write fails — never silently", async () => {
    // Unlike the person-link writes in the same path (best-effort by design,
    // NS-INV-4), a dropped status write IS the bug. It must propagate — which
    // under S3 means the journal entry stays queued and the next replay
    // retries it, rather than the accept being reported as delivered.
    resolveCaptureItemsMock.mockRejectedValue(new Error("update denied"));

    await expect(
      syncJournaledTaskDraftAccept(client(), input()),
    ).rejects.toThrow("update denied");
  });

  it("is a no-op, not a crash, when the capture never reached the account", async () => {
    await syncJournaledTaskDraftAccept(
      client(),
      input({ source_capture_item_id: null }),
    );

    expect(resolveCaptureItemsMock).toHaveBeenCalledOnce();
    expect(resolveCaptureItemsMock.mock.calls[0][1]).toEqual([null]);
  });

  it("never writes anything when there is no account to write to", async () => {
    // Mock mode must not report success: the journal entry has to stay queued
    // until an account is genuinely reachable. This is what stops a signed-out
    // replay from silently deleting the user's decision.
    const result = await syncJournaledTaskDraftAccept(null, input());

    expect(result.provider).toBe("mock");
    expect(createTaskMock).not.toHaveBeenCalled();
    expect(resolveCaptureItemsMock).not.toHaveBeenCalled();
  });
});
