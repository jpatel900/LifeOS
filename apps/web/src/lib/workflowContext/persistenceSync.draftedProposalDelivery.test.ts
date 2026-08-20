import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPersistenceSync } from "./persistenceSync";
import type { Phase2TimeBlockProposal } from "@lifeos/schemas";
import { savedOnThisDeviceBanner } from "../statusVocabulary";

/**
 * #840 follow-up — THE DRAFTED BLOCK THAT NEVER REACHED THE ACCOUNT.
 *
 * `plan-port-truth.spec.ts`'s "draft a block" test failed nondeterministically.
 * One of its shapes, reproduced locally, was this seam: the drafted proposal's
 * create was NEVER SENT. The trace held exactly one `POST /time_block_proposals`
 * and it was triage's, not the draft's. The probe that caught it read
 * `persistedTaskId: null` with an EMPTY id map while workflow state still held
 * the device-local task id `task-1`.
 *
 * Why the map can be empty and the task still real: a task's account id is
 * recorded only when its journalled accept is REPLAYED
 * (`recordTaskDraftAcceptIds`). Draft a block before that replay lands and the
 * lookup answers null.
 *
 * Why that was worse here than anywhere else in `persistenceSync`: unlike every
 * placement path, this write is not journalled. `markLocalOnly` was the END of
 * it — the draft stayed on the device, the account never heard about it, and
 * nothing ever retried. Silent loss, not a deferred send.
 *
 * These specs pin the fix and the honest fallback it must NOT swallow.
 */

const createTimeBlockProposalMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../data/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/workflow")>();
  return {
    ...actual,
    createTimeBlockProposal: createTimeBlockProposalMock,
  };
});

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const LOCAL_TASK_ID = "task-1";
const ACCOUNT_TASK_ID = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_PROPOSAL_ID = "55555555-5555-4555-8555-555555555555";

function localDraftedProposal(): Phase2TimeBlockProposal {
  return {
    id: "proposal-3",
    task_id: LOCAL_TASK_ID,
    proposed_start: "2026-08-05T19:00:00.000Z",
    proposed_end: "2026-08-05T19:45:00.000Z",
    rationale: "Drafted a block for 7 p.m.",
  } as unknown as Phase2TimeBlockProposal;
}

function makeSync(options: {
  /** What `replayJournaledWrites` does to the task id map when it drains. */
  onReplay?: (taskIdMap: Map<string, string>) => void;
}) {
  const persistedCaptureIdByLocalIdRef = { current: new Map<string, string>() };
  const persistedTaskIdByLocalIdRef = { current: new Map<string, string>() };
  const persistedProposalIdByLocalIdRef = {
    current: new Map<string, string>(),
  };
  const persistedBlockIdByLocalIdRef = { current: new Map<string, string>() };
  const persistedSessionIdByLocalIdRef = { current: new Map<string, string>() };
  const refByFamily = {
    captures: persistedCaptureIdByLocalIdRef,
    tasks: persistedTaskIdByLocalIdRef,
    proposals: persistedProposalIdByLocalIdRef,
    blocks: persistedBlockIdByLocalIdRef,
    sessions: persistedSessionIdByLocalIdRef,
  } as const;
  // Mirrors the real recorder's ref half (#844): the durable dispatch half is
  // the reducer's job and is pinned by `localRowRetirementGuard.test.ts`.
  const recordAccountAlias = vi.fn(
    (family: keyof typeof refByFamily, localId: string, accountId: string) => {
      refByFamily[family].current.set(localId, accountId);
    },
  );
  const markLocalOnly = vi.fn();
  const markDeviceStorageBlocked = vi.fn();
  const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
  const replayJournaledWrites = vi.fn().mockImplementation(async () => {
    options.onReplay?.(persistedTaskIdByLocalIdRef.current);
  });

  createSupabaseBrowserClientMock.mockReturnValue({ rpc: vi.fn() });

  const ops = createPersistenceSync({
    persistedAreasRef: { current: [] },
    persistedCaptureIdByLocalIdRef,
    persistedTaskIdByLocalIdRef,
    persistedProposalIdByLocalIdRef,
    persistedBlockIdByLocalIdRef,
    persistedSessionIdByLocalIdRef,
    selectedAreaId: null,
    recordAccountAlias,
    markLocalOnly,
    markDeviceStorageBlocked,
    replayJournaledWrites,
    syncPersistedWorkflowRows,
  });

  return {
    ops,
    markLocalOnly,
    replayJournaledWrites,
    persistedProposalIdByLocalIdRef,
    recordAccountAlias,
  };
}

describe("persistCreatedLocalProposal — the drafted block reaches the account", () => {
  beforeEach(() => {
    createTimeBlockProposalMock.mockReset();
    createTimeBlockProposalMock.mockResolvedValue({
      provider: "supabase",
      proposal: { id: ACCOUNT_PROPOSAL_ID },
    });
    createSupabaseBrowserClientMock.mockReset();
  });

  it("delivers the draft once the task's own write drains, instead of abandoning it", async () => {
    // THE REGRESSION. Before the fix this returned at the null lookup and the
    // draft never left the device.
    const { ops, markLocalOnly, replayJournaledWrites } = makeSync({
      onReplay: (taskIdMap) => taskIdMap.set(LOCAL_TASK_ID, ACCOUNT_TASK_ID),
    });

    await ops.persistCreatedLocalProposal(localDraftedProposal());

    expect(replayJournaledWrites).toHaveBeenCalledOnce();
    expect(createTimeBlockProposalMock).toHaveBeenCalledOnce();
    // Sent against the ACCOUNT's task id — the whole point of waiting.
    expect(createTimeBlockProposalMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        task_id: ACCOUNT_TASK_ID,
        rationale_note: "Drafted a block for 7 p.m.",
      }),
    );
    expect(markLocalOnly).not.toHaveBeenCalled();
  });

  it("records the account's proposal id, so the accept names the DRAFTED row", async () => {
    // Without this mapping the later accept sends a null proposal id and
    // `place_time_block` mints a SECOND proposal rather than accepting this
    // one — the defect #840's own AGENT-TODO describes.
    const { ops, persistedProposalIdByLocalIdRef, recordAccountAlias } =
      makeSync({
        onReplay: (taskIdMap) => taskIdMap.set(LOCAL_TASK_ID, ACCOUNT_TASK_ID),
      });

    await ops.persistCreatedLocalProposal(localDraftedProposal());

    expect(persistedProposalIdByLocalIdRef.current.get("proposal-3")).toBe(
      ACCOUNT_PROPOSAL_ID,
    );
    // #844: the id is learned through the ONE record point, so the twinship
    // also reaches the reducer's durable alias map — not just this ref.
    expect(recordAccountAlias).toHaveBeenCalledWith(
      "proposals",
      "proposal-3",
      ACCOUNT_PROPOSAL_ID,
    );
  });

  it("does not drain the journal when the task id is already known", async () => {
    // The wait is for the RACE, not a tax on the normal path.
    const { ops, replayJournaledWrites } = makeSync({});
    const proposal = {
      ...localDraftedProposal(),
      task_id: ACCOUNT_TASK_ID,
    } as Phase2TimeBlockProposal;

    await ops.persistCreatedLocalProposal(proposal);

    expect(replayJournaledWrites).not.toHaveBeenCalled();
    expect(createTimeBlockProposalMock).toHaveBeenCalledOnce();
  });

  it("still tells the truth when the task id never arrives", async () => {
    // The honest fallback is NOT swallowed by the retry: a draft that genuinely
    // cannot be sent must still say it is only on this device.
    const { ops, markLocalOnly } = makeSync({});

    await ops.persistCreatedLocalProposal(localDraftedProposal());

    expect(createTimeBlockProposalMock).not.toHaveBeenCalled();
    expect(markLocalOnly).toHaveBeenCalledWith(
      savedOnThisDeviceBanner("Your new proposal"),
    );
  });
});
