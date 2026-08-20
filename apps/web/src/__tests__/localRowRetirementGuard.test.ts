import { describe, expect, it } from "vitest";
import {
  mergePersistedRows,
  stableWorkflowKey,
  workflowReducer,
  type PersistedWorkflowPayload,
} from "@/lib/workflowContext/reducerCore";
import {
  acceptLatestDraft,
  captureWorkflow,
  proposeLatestActiveTask,
  reloadWorkflowState,
  workflowSeed,
} from "./helpers/workflowReachability";

/**
 * The device -> account identity seam, pinned at the reducer.
 *
 * Every row this app creates is first minted with a DEVICE-LOCAL id
 * (`task-3`, `proposal-7`) and later replaced by the account's uuid. The only
 * thing that ever retires the device copy is the local -> account alias, and
 * before this suite that alias lived exclusively in per-mount `useRef` maps
 * while the state itself was mirrored to `sessionStorage`. After any reload
 * the state still held `task-3` and the alias map was empty, so the account
 * row and its device twin coexisted for the life of the tab — the duplicate
 * card reported against "Needs a decision" (3 cards, 2 account rows) and the
 * measured "one finished session, two rows" session probe.
 *
 * These tests deliberately drive the reducer, not a component: the merge is
 * the single place every reading surface inherits its row set from.
 *
 * A fixture note the assertions depend on: accepting a draft folds in a
 * parse-created proposal AND drafting adds a second one, so the proposal
 * state legitimately holds TWO pending local proposals for one task. Only the
 * one whose twin is in the payload may be retired — the other surviving is
 * the #840 rule, not a leak — so every proposal assertion names both rows.
 */

const ACCOUNT_TASK_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_BLOCK_ID = "55555555-5555-4555-8555-555555555555";

function emptyAliases(): PersistedWorkflowPayload["idAliases"] {
  return {
    captures: new Map<string, string>(),
    tasks: new Map<string, string>(),
    proposals: new Map<string, string>(),
    blocks: new Map<string, string>(),
    sessions: new Map<string, string>(),
  };
}

function syncPayload(
  overrides: Partial<PersistedWorkflowPayload> = {},
): PersistedWorkflowPayload {
  return {
    captures: [],
    tasks: [],
    proposals: [],
    blocks: [],
    sessions: [],
    reviewLog: [],
    idAliases: emptyAliases(),
    ...overrides,
  };
}

/** A device state holding exactly one local task, made by real transitions. */
function stateWithLocalTask() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Retirement guard fixture task.");
  state = acceptLatestDraft(state);
  return state;
}

function stateWithLocalProposal() {
  return proposeLatestActiveTask(stateWithLocalTask());
}

function accountTwinOfTask(state: ReturnType<typeof stateWithLocalTask>) {
  const local = state.tasks.at(-1);
  expect(local).toBeDefined();
  return { local: local!, account: { ...local!, id: ACCOUNT_TASK_ID } };
}

/** The two pending local proposals the fixture holds — see the module note. */
function proposalPairOf(state: ReturnType<typeof stateWithLocalProposal>) {
  const [drafted, folded] = state.timeBlockProposals;
  expect(drafted).toBeDefined();
  expect(folded).toBeDefined();
  return { drafted, folded };
}

function localSessionFor(state: ReturnType<typeof stateWithLocalTask>) {
  const task = state.tasks.at(-1);
  expect(task).toBeDefined();
  return {
    id: "session-1",
    user_id: task!.user_id,
    task_id: task!.id,
    calendar_block_id: "block-1",
    area_id: task!.area_id,
    status: "completed" as const,
    outcome: "completed" as const,
    planned_minutes: 45,
    actual_minutes: 45,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: 4,
    notes: null,
    created_at: "2026-08-08T09:45:00.000Z",
  };
}

describe("local row retirement survives the mount (device -> account identity)", () => {
  it("records the account id into state, so a reload can still name the device twin", () => {
    const state = stateWithLocalTask();
    const { local } = accountTwinOfTask(state);

    const recorded = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: local.id,
      accountId: ACCOUNT_TASK_ID,
    });

    expect(recorded.accountIdByLocalId.tasks[local.id]).toBe(ACCOUNT_TASK_ID);
    expect(
      reloadWorkflowState(recorded).accountIdByLocalId.tasks[local.id],
    ).toBe(ACCOUNT_TASK_ID);
  });

  it("retires the device twin after a reload, with no per-mount alias map left", () => {
    const state = stateWithLocalTask();
    const { local, account } = accountTwinOfTask(state);

    const recorded = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: local.id,
      accountId: ACCOUNT_TASK_ID,
    });

    // The reload is what empties the refs. `idAliases` below is empty for
    // exactly that reason — it is what a fresh mount actually sends.
    const next = workflowReducer(reloadWorkflowState(recorded), {
      type: "syncPersistedWorkflow",
      payload: syncPayload({ tasks: [account] }),
    });

    expect(next.tasks.map((task) => task.id)).toEqual([ACCOUNT_TASK_ID]);
  });

  it("keeps the device row when the payload does NOT carry its account twin (#840 pin)", () => {
    const state = stateWithLocalTask();
    const { local } = accountTwinOfTask(state);

    const recorded = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: local.id,
      accountId: ACCOUNT_TASK_ID,
    });

    // The alias is known, but this payload's read predates the account row.
    // Retiring here is what put a row on the account and on no screen.
    const next = workflowReducer(recorded, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({ tasks: [] }),
    });

    expect(next.tasks.map((task) => task.id)).toEqual([local.id]);
  });

  it("retires a device proposal on (task_id, proposed_start) when no alias was ever recorded", () => {
    const state = stateWithLocalProposal();
    const { drafted, folded } = proposalPairOf(state);

    const next = workflowReducer(state, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        proposals: [{ ...drafted, id: ACCOUNT_PROPOSAL_ID }],
      }),
    });

    // The drafted proposal's twin arrived, so it is retired on content
    // identity alone. The folded proposal's twin did not — it must survive.
    expect(next.timeBlockProposals.map((row) => row.id)).toEqual([
      ACCOUNT_PROPOSAL_ID,
      folded.id,
    ]);
  });

  it("retires a device session on (task_id, calendar_block_id) — the measured two-row probe", () => {
    const state = stateWithLocalTask();
    const localSession = localSessionFor(state);

    const next = workflowReducer(
      { ...state, executionSessions: [localSession] },
      {
        type: "syncPersistedWorkflow",
        payload: syncPayload({
          sessions: [{ ...localSession, id: ACCOUNT_SESSION_ID }],
        }),
      },
    );

    expect(next.executionSessions.map((row) => row.id)).toEqual([
      ACCOUNT_SESSION_ID,
    ]);
  });

  it("mergePersistedRows never retires a row whose twin is absent from the payload", () => {
    const rows = mergePersistedRows(
      [{ id: ACCOUNT_TASK_ID }],
      [{ id: "task-9" }],
      new Map([["task-9", "44444444-4444-4444-8444-444444444444"]]),
    );

    expect(rows.map((row) => row.id)).toEqual([ACCOUNT_TASK_ID, "task-9"]);
  });

  it("retires the device proposal after a reload, under the account's own task id", () => {
    // The real post-accept shape: the account's proposal row references the
    // task's uuid while the device's twin still hangs off `task-N`. Both
    // aliases were recorded before the reload; the refs died with the mount.
    const state = stateWithLocalProposal();
    const { local: localTask } = accountTwinOfTask(state);
    const { drafted, folded } = proposalPairOf(state);

    let recorded = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: localTask.id,
      accountId: ACCOUNT_TASK_ID,
    });
    recorded = workflowReducer(recorded, {
      type: "recordAccountId",
      family: "proposals",
      localId: drafted.id,
      accountId: ACCOUNT_PROPOSAL_ID,
    });

    const next = workflowReducer(reloadWorkflowState(recorded), {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        tasks: [{ ...localTask, id: ACCOUNT_TASK_ID }],
        proposals: [
          { ...drafted, id: ACCOUNT_PROPOSAL_ID, task_id: ACCOUNT_TASK_ID },
        ],
      }),
    });

    expect(next.tasks.map((task) => task.id)).toEqual([ACCOUNT_TASK_ID]);
    expect(next.timeBlockProposals.map((row) => row.id)).toEqual([
      ACCOUNT_PROPOSAL_ID,
      folded.id,
    ]);
  });

  it("retires a device proposal after a reload on content alone, resolved through the TASK alias", () => {
    // The un-journalled create path: the proposal itself never got an alias
    // (the write may have been delivered by another tab's drain), but the task
    // alias survived the reload and (task, proposed_start) names the twin.
    const state = stateWithLocalProposal();
    const { local: localTask } = accountTwinOfTask(state);
    const { drafted, folded } = proposalPairOf(state);

    const recorded = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: localTask.id,
      accountId: ACCOUNT_TASK_ID,
    });

    const next = workflowReducer(reloadWorkflowState(recorded), {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        proposals: [
          { ...drafted, id: ACCOUNT_PROPOSAL_ID, task_id: ACCOUNT_TASK_ID },
        ],
      }),
    });

    expect(next.timeBlockProposals.map((row) => row.id)).toEqual([
      ACCOUNT_PROPOSAL_ID,
      folded.id,
    ]);
  });

  it("retires the device session after a reload, under the account's task and block ids", () => {
    // Sessions NEVER get their own alias — `record_execution_session` returns
    // no row id — so the merge must name the twin by (task, block), resolved
    // through the surviving task and block aliases. This is the measured
    // two-row probe, now driven through a real reload.
    const state = stateWithLocalTask();
    const { local: localTask } = accountTwinOfTask(state);
    const localSession = localSessionFor(state);

    let recorded = workflowReducer(
      { ...state, executionSessions: [localSession] },
      {
        type: "recordAccountId",
        family: "tasks",
        localId: localTask.id,
        accountId: ACCOUNT_TASK_ID,
      },
    );
    recorded = workflowReducer(recorded, {
      type: "recordAccountId",
      family: "blocks",
      localId: "block-1",
      accountId: ACCOUNT_BLOCK_ID,
    });

    const next = workflowReducer(reloadWorkflowState(recorded), {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        sessions: [
          {
            ...localSession,
            id: ACCOUNT_SESSION_ID,
            task_id: ACCOUNT_TASK_ID,
            calendar_block_id: ACCOUNT_BLOCK_ID,
          },
        ],
      }),
    });

    expect(next.executionSessions.map((row) => row.id)).toEqual([
      ACCOUNT_SESSION_ID,
    ]);
  });

  it("stableWorkflowKey keeps a row's rendered identity across the id swap", () => {
    // #844 shape B: the tap that never lands. A React key derived from this
    // value is the same string before the swap (the row IS `proposal-3`) and
    // after it (the alias points the account id back to `proposal-3`), so the
    // element under the finger is reconciled in place, not destroyed.
    const aliases = { "proposal-3": ACCOUNT_PROPOSAL_ID };

    expect(stableWorkflowKey(aliases, "proposal-3")).toBe("proposal-3");
    expect(stableWorkflowKey(aliases, ACCOUNT_PROPOSAL_ID)).toBe("proposal-3");
    // A row born on the account keeps its own id — no alias, no rewrite.
    expect(stableWorkflowKey(aliases, ACCOUNT_SESSION_ID)).toBe(
      ACCOUNT_SESSION_ID,
    );
  });
});
