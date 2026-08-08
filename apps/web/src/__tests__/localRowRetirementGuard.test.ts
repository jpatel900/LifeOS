import { describe, expect, it } from "vitest";
import {
  STORAGE_KEY,
  loadStoredStateFromSession,
  mergePersistedRows,
  workflowReducer,
  type PersistedWorkflowPayload,
} from "@/lib/workflowContext/reducerCore";
import type { WorkflowState } from "@/lib/workflow";
import {
  acceptLatestDraft,
  captureWorkflow,
  proposeLatestActiveTask,
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
 */

const ACCOUNT_TASK_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_SESSION_ID = "33333333-3333-4333-8333-333333333333";

function emptyAliases(): PersistedWorkflowPayload["dropLocalIds"] {
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
    dropLocalIds: emptyAliases(),
    ...overrides,
  };
}

/** A device state holding exactly one local task, made by real transitions. */
function stateWithLocalTask(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "Retirement guard fixture task.");
  state = acceptLatestDraft(state);
  return state;
}

function stateWithLocalProposal(): WorkflowState {
  return proposeLatestActiveTask(stateWithLocalTask());
}

/**
 * The whole point of the suite: put the state through the SAME round trip a
 * browser reload does — serialize to `sessionStorage`, drop every per-mount
 * ref, read it back — and then sync. Anything the alias needs to survive has
 * to survive this.
 */
function reload(state: WorkflowState): WorkflowState {
  const store = new Map<string, string>();
  const original = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    },
  });
  try {
    globalThis.window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state),
    );
    const restored = loadStoredStateFromSession();
    expect(restored.storageBlocked).toBe(false);
    expect(restored.state).not.toBeNull();
    return restored.state as WorkflowState;
  } finally {
    if (original === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  }
}

function accountTwinOfTask(state: WorkflowState) {
  const local = state.tasks.at(-1);
  expect(local).toBeDefined();
  return { local: local!, account: { ...local!, id: ACCOUNT_TASK_ID } };
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
    expect(reload(recorded).accountIdByLocalId.tasks[local.id]).toBe(
      ACCOUNT_TASK_ID,
    );
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

    // The reload is what empties the refs. `dropLocalIds` below is empty for
    // exactly that reason — it is what a fresh mount actually sends.
    const next = workflowReducer(reload(recorded), {
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
    const local = state.timeBlockProposals.at(-1);
    expect(local).toBeDefined();

    const next = workflowReducer(state, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        proposals: [{ ...local!, id: ACCOUNT_PROPOSAL_ID }],
      }),
    });

    expect(next.timeBlockProposals.map((row) => row.id)).toEqual([
      ACCOUNT_PROPOSAL_ID,
    ]);
  });

  it("retires a device session on (task_id, calendar_block_id) — the measured two-row probe", () => {
    const state = stateWithLocalTask();
    const task = state.tasks.at(-1);
    expect(task).toBeDefined();

    const localSession = {
      id: "session-1",
      task_id: task!.id,
      calendar_block_id: "block-1",
      area_id: task!.area_id,
      status: "completed" as const,
      started_at: "2026-08-08T09:00:00.000Z",
      ended_at: "2026-08-08T09:45:00.000Z",
      actual_minutes: 45,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: 4,
      notes: null,
    };
    const seeded: WorkflowState = {
      ...state,
      executionSessions: [localSession],
    };

    const next = workflowReducer(seeded, {
      type: "syncPersistedWorkflow",
      payload: syncPayload({
        sessions: [{ ...localSession, id: ACCOUNT_SESSION_ID }],
      }),
    });

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
});
