import { describe, expect, it } from "vitest";
import {
  acceptLatestDraft,
  captureWorkflow,
  planLatestActiveTask,
  rawCaptureWorkflow,
  reloadWorkflowState,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { startExecutionSession, swapWipSlot } from "../workflow";
import { workflowReducer, type PersistedWorkflowPayload } from "./reducerCore";
import {
  acknowledgeSnapshot,
  hasSnapshotWork,
  reconcileSnapshotRead,
  snapshotCursor,
  snapshotReceipt,
  trackSnapshotChanges,
  restoreSnapshotChanges,
} from "./snapshotOwnership";
import { revertTaskReviewTransition } from "./taskReviewRefusal";

// Device-only work (drafts, the first move) is still owned and protected, but
// since review finding 2 it no longer counts as account work, so these checks
// read the ownership itself instead of `hasSnapshotWork`.
function hasPendingOwner(
  state: ReturnType<typeof workflowSeed>,
  collection: "tasks" | "taskDrafts",
) {
  return Object.values(state.snapshotOwnership?.rows[collection] ?? {}).some(
    (owner) =>
      owner.creation?.pending ||
      Object.values(owner.fields).some((field) => field.pending),
  );
}

const TASK_ID = "22222222-2222-4222-8222-222222222222";
const CAPTURE_ID = "33333333-3333-4333-8333-333333333333";
const AREA_ID = "44444444-4444-4444-8444-444444444444";
const aliases = () => ({
  captures: new Map<string, string>(),
  tasks: new Map<string, string>(),
  proposals: new Map<string, string>(),
  blocks: new Map<string, string>(),
  sessions: new Map<string, string>(),
});
function accountTask() {
  const local = acceptLatestDraft(
    captureWorkflow(workflowSeed(), "Prepare the synthetic report."),
  );
  const task = local.tasks[0];
  const recorded = workflowReducer(local, {
    type: "recordAccountId",
    family: "tasks",
    localId: task.id,
    accountId: TASK_ID,
  });
  return workflowReducer(recorded, {
    type: "syncPersistedWorkflow",
    payload: {
      captures: [],
      tasks: [{ ...task, id: TASK_ID }],
      proposals: [],
      blocks: [],
      sessions: [],
      reviewLog: [],
      idAliases: aliases(),
    },
  });
}
function readTasks(
  state: ReturnType<typeof workflowSeed>,
  tasks: PersistedWorkflowPayload["tasks"],
  cursor = snapshotCursor(state),
) {
  return workflowReducer(state, {
    type: "syncPersistedWorkflow",
    cursor,
    payload: {
      captures: [],
      tasks,
      proposals: [],
      blocks: [],
      sessions: [],
      reviewLog: [],
      idAliases: aliases(),
    },
  });
}

describe("snapshot state ownership (#967)", () => {
  it("keeps the newest account version through an old read, reload and unchanged read", () => {
    const initial = accountTask();
    const v1 = { ...initial.tasks[0], updated_at: "2026-10-01T00:00:00.000Z" };
    const seenV1 = readTasks(initial, [v1]);
    const oldRead = snapshotCursor(seenV1);
    const v2 = { ...v1, updated_at: "2026-10-02T00:00:00.000Z" };
    const seenV2 = readTasks(seenV1, [v2]);
    const edited = trackSnapshotChanges(seenV2, {
      ...seenV2,
      tasks: [{ ...v2, title: "Unsent edit based on v2" }],
    });
    const late = readTasks(edited, [v1], oldRead);
    expect(late.tasks[0].title).toBe("Unsent edit based on v2");
    const restored = reloadWorkflowState(late);
    const unchanged = readTasks(restored, [v2]);
    expect(unchanged.tasks[0].title).toBe("Unsent edit based on v2");
    expect(
      Object.values(late.snapshotOwnership!.rows.tasks!).every(
        (owner) => owner.base === v2.updated_at,
      ),
    ).toBe(true);
  });

  it("binds an empty account independently of rows and fences the prior account read", () => {
    const initial = accountTask();
    const edited = trackSnapshotChanges(initial, {
      ...initial,
      tasks: [{ ...initial.tasks[0], title: "Account A unsent edit" }],
    });
    const oldCursor = snapshotCursor(edited);
    const switched = workflowReducer(edited, {
      type: "bindSnapshotAccount",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    expect(switched.tasks).toEqual([]);
    expect(switched.snapshotOwnership?.rows.tasks).toBeUndefined();
    expect(readTasks(switched, initial.tasks, oldCursor)).toBe(switched);
  });

  it("drops delivered local aliases at account switch but retains an undelivered creation", () => {
    const local = trackSnapshotChanges(
      workflowSeed(),
      acceptLatestDraft(
        captureWorkflow(workflowSeed(), "Synthetic local task"),
      ),
    );
    const taskId = local.tasks[0].id;
    const delivered = workflowReducer(local, {
      type: "recordAccountId",
      family: "tasks",
      localId: taskId,
      accountId: TASK_ID,
    });
    const switched = workflowReducer(delivered, {
      type: "bindSnapshotAccount",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    expect(switched.tasks).toEqual([]);
    expect(switched.accountIdByLocalId.tasks).toEqual({});
    const unbound = workflowReducer(local, {
      type: "bindSnapshotAccount",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    expect(unbound.tasks).toEqual(local.tasks);
    expect(hasSnapshotWork(unbound)).toBe(true);
  });

  it("retains an unsaved area through account refresh and adopts its exact creation identity", () => {
    const initial = workflowSeed();
    const local = workflowReducer(initial, {
      type: "addArea",
      name: "Local project",
      color: "#abcdef",
    });
    const area = local.areas.find((item) => item.name === "Local project")!;
    const receipt = snapshotReceipt(local, "areas", area.id);
    const missing = workflowReducer(local, {
      type: "syncAreas",
      areas: initial.areas,
    });
    expect(missing.areas).toContainEqual(area);
    expect(hasSnapshotWork(missing)).toBe(true);
    const recolored = workflowReducer(missing, {
      type: "updateAreaColor",
      areaId: area.id,
      color: "#123456",
    });
    const acknowledged = acknowledgeSnapshot(recolored, receipt, AREA_ID);
    const read = workflowReducer(acknowledged, {
      type: "syncAreas",
      cursor: receipt,
      areas: [...initial.areas, { ...area, id: AREA_ID }],
    });
    expect(read.areas.filter((item) => item.name === area.name)).toEqual([
      { ...area, id: AREA_ID, color: "#123456" },
    ]);
    expect(hasSnapshotWork(read)).toBe(true);
  });

  it("keeps an undelivered operation's receipt valid through first sign-in", () => {
    const local = workflowReducer(workflowSeed(), {
      type: "addArea",
      name: "Early local area",
      color: "#112233",
    });
    const area = local.areas.find((row) => row.name === "Early local area")!;
    const receipt = snapshotReceipt(local, "areas", area.id);
    const bound = workflowReducer(local, {
      type: "bindSnapshotAccount",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    expect(snapshotCursor(bound).epoch).toBe(receipt.epoch);
    const saved = acknowledgeSnapshot(bound, receipt, AREA_ID);
    expect(
      saved.snapshotOwnership!.rows.areas![area.id].creation?.pending,
    ).toBe(false);
  });

  it("preserves same-user legacy ownership on first binding and drops a different user's rows", () => {
    const initial = accountTask();
    const edited = trackSnapshotChanges(initial, {
      ...initial,
      tasks: [{ ...initial.tasks[0], title: "Same-account pending title" }],
    });
    delete edited.snapshotOwnership!.userId;
    const same = workflowReducer(edited, {
      type: "bindSnapshotAccount",
      userId: initial.tasks[0].user_id,
    });
    expect(same.tasks[0].title).toBe("Same-account pending title");
    expect(hasPendingOwner(same, "tasks")).toBe(true);
    expect(
      workflowReducer(same, {
        type: "bindSnapshotAccount",
        userId: initial.tasks[0].user_id,
      }),
    ).toBe(same);
    const different = workflowReducer(edited, {
      type: "bindSnapshotAccount",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    expect(different.tasks).toEqual([]);
  });

  it("retains draft transfers across binding and reload without acknowledging a later edit", () => {
    const drafted = captureWorkflow(workflowSeed(), "Synthetic transfer");
    const draftId = drafted.taskDrafts[0].id;
    const accepted = workflowReducer(drafted, {
      type: "backlogDraft",
      draftId,
    });
    const taskId = accepted.tasks[0].id;
    const transferred = workflowReducer(accepted, {
      type: "registerDraftTransfer",
      draftId,
      taskId,
      proposalId: null,
    });
    const receipt =
      transferred.snapshotOwnership!.rows.tasks![taskId].transfers![0];
    const later = workflowReducer(transferred, {
      type: "editDraft",
      draftId,
      changes: { title: "Later draft edit" },
    });
    const bound = workflowReducer(later, {
      type: "bindSnapshotAccount",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    const restored = reloadWorkflowState(bound);
    expect(
      restored.snapshotOwnership!.rows.tasks![taskId].transfers![0],
    ).toEqual({ ...receipt, epoch: snapshotCursor(bound).epoch });
    const delivered = workflowReducer(restored, {
      type: "recordAccountId",
      family: "tasks",
      localId: taskId,
      accountId: TASK_ID,
    });
    expect(
      delivered.taskDrafts.find((draft) => draft.id === draftId)?.title,
    ).toBe("Later draft edit");
    expect(
      delivered.snapshotOwnership!.rows.taskDrafts![draftId].fields.title
        .pending,
    ).toBe(true);
  });

  it("a successful capture retires only its creation, independently of snapshot storage", () => {
    const initial = workflowSeed();
    const failed = trackSnapshotChanges(
      initial,
      rawCaptureWorkflow(initial, "Earlier failed thought"),
    );
    const both = trackSnapshotChanges(
      failed,
      rawCaptureWorkflow(failed, "Later delivered thought"),
    );
    const delivered = both.captureItems.find(
      (item) => item.raw_text === "Later delivered thought",
    )!;
    const result = workflowReducer(both, {
      type: "recordAccountId",
      family: "captures",
      localId: delivered.id,
      accountId: CAPTURE_ID,
    });
    expect(result.captureItems).toHaveLength(2);
    expect(hasSnapshotWork(result)).toBe(true);
    const all = workflowReducer(result, {
      type: "recordAccountId",
      family: "captures",
      localId: failed.captureItems[0].id,
      accountId: "55555555-5555-4555-8555-555555555555",
    });
    expect(hasSnapshotWork(all)).toBe(false);
    expect(hasSnapshotWork(reloadWorkflowState(all))).toBe(false);
  });

  it("keeps an existing account task's first move through unrelated and stale reads", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const oldRead = snapshotCursor(initial);
    const edited = workflowReducer(initial, {
      type: "updateTaskFirstTinyStep",
      taskId: TASK_ID,
      firstTinyStep: "Open the new brief",
    });
    const receipt = snapshotReceipt(edited, "tasks", TASK_ID, [
      "first_tiny_step",
    ]);
    expect(readTasks(edited, [original]).tasks[0].first_tiny_step).toBe(
      "Open the new brief",
    );
    const saved = acknowledgeSnapshot(edited, receipt);
    expect(hasSnapshotWork(saved)).toBe(false);
    const stale = readTasks(saved, [original], oldRead);
    expect(stale.tasks[0].first_tiny_step).toBe("Open the new brief");
    expect(hasSnapshotWork(stale)).toBe(false);
    const newer = workflowReducer(saved, {
      type: "updateTaskFirstTinyStep",
      taskId: TASK_ID,
      firstTinyStep: "Call the reviewer",
    });
    expect(hasPendingOwner(acknowledgeSnapshot(newer, receipt), "tasks")).toBe(
      true,
    );
    expect(
      readTasks(newer, [{ ...original, first_tiny_step: "Call the reviewer" }])
        .tasks[0].first_tiny_step,
    ).toBe("Call the reviewer");
    expect(
      hasSnapshotWork(
        readTasks(newer, [
          { ...original, first_tiny_step: "Call the reviewer" },
        ]),
      ),
    ).toBe(false);
  });

  it("acceptance retires exact draft history, adopts server defaults, and preserves newer edits", () => {
    let state = captureWorkflow(workflowSeed(), "Write the synthetic report.");
    const draft = state.taskDrafts[0];
    state = workflowReducer(state, {
      type: "editDraft",
      draftId: draft.id,
      changes: { title: "Edited report" },
    });
    state = workflowReducer(state, { type: "backlogDraft", draftId: draft.id });
    const localTask = state.tasks[0];
    state = workflowReducer(state, {
      type: "registerDraftTransfer",
      draftId: draft.id,
      taskId: localTask.id,
      proposalId: null,
    });
    state = workflowReducer(state, {
      type: "updateTaskFirstTinyStep",
      taskId: localTask.id,
      firstTinyStep: "Newer personal step",
    });
    state = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: localTask.id,
      accountId: TASK_ID,
    });
    const canonical = {
      ...localTask,
      id: TASK_ID,
      priority_confidence: 0.91,
      definition_of_done: null,
    };
    state = readTasks(state, [canonical]);
    expect(state.tasks[0].priority_confidence).toBe(0.91);
    expect(state.tasks[0].definition_of_done).toBeNull();
    expect(state.tasks[0].first_tiny_step).toBe("Newer personal step");
    expect(state.taskDrafts.find((row) => row.id === draft.id)?.status).toBe(
      "accepted",
    );
    expect(hasPendingOwner(state, "tasks")).toBe(true);
    state = readTasks(state, [
      { ...canonical, first_tiny_step: "Newer personal step" },
    ]);
    expect(hasSnapshotWork(state)).toBe(false);
  });

  it("fences reads started after an edit but before its receipt or matching readback", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const edited = workflowReducer(initial, {
      type: "updateTaskFirstTinyStep",
      taskId: TASK_ID,
      firstTinyStep: "Delivered later",
    });
    const inFlight = snapshotCursor(edited);
    const saved = acknowledgeSnapshot(
      edited,
      snapshotReceipt(edited, "tasks", TASK_ID),
    );
    expect(
      readTasks(saved, [original], inFlight).tasks[0].first_tiny_step,
    ).toBe("Delivered later");
    const readback = readTasks(
      edited,
      [{ ...original, first_tiny_step: "Delivered later" }],
      inFlight,
    );
    expect(hasSnapshotWork(readback)).toBe(false);
    expect(
      readTasks(readback, [original], inFlight).tasks[0].first_tiny_step,
    ).toBe("Delivered later");
    expect(
      acknowledgeSnapshot(saved, snapshotReceipt(edited, "tasks", TASK_ID)),
    ).toBe(saved);
  });

  it("keeps established echo deduplication when another tab delivered the local block", () => {
    const initial = accountTask();
    const planned = trackSnapshotChanges(
      initial,
      planLatestActiveTask(initial),
    );
    const block = planned.calendarBlocks[0];
    const proposal = planned.timeBlockProposals.find(
      (item) => item.task_id === TASK_ID,
    )!;
    const result = workflowReducer(planned, {
      type: "syncPersistedWorkflow",
      payload: {
        captures: [],
        tasks: planned.tasks,
        proposals: [
          { ...proposal, id: "66666666-6666-4666-8666-666666666666" },
        ],
        blocks: [{ ...block, id: "77777777-7777-4777-8777-777777777777" }],
        sessions: [],
        reviewLog: [],
        idAliases: aliases(),
      },
    });
    expect(result.calendarBlocks).toHaveLength(1);
    expect(result.calendarBlocks[0].id).toBe(
      "77777777-7777-4777-8777-777777777777",
    );
    expect(
      result.timeBlockProposals.filter((row) => row.task_id === TASK_ID),
    ).toHaveLength(1);
    expect(hasSnapshotWork(result)).toBe(false);
  });

  it.each([
    undefined,
    {},
    { version: 1, epoch: 0, revision: 1, rows: null },
    { version: 1, epoch: 0, revision: 1, rows: { tasks: null } },
  ])("restores user payload after rejecting bookkeeping %j", (metadata) => {
    const legacy = rawCaptureWorkflow(
      workflowSeed(),
      "Legacy retained thought",
    );
    const malformed = JSON.parse(JSON.stringify(legacy));
    malformed.snapshotOwnership = metadata;
    const repaired = reloadWorkflowState(malformed);
    expect(repaired.captureItems).toEqual(legacy.captureItems);
    expect(hasSnapshotWork(repaired)).toBe(true);
  });

  // Review rework (#1106): an older saved copy must never overwrite newer
  // account data. A legacy snapshot carries no delivery evidence, so the
  // account read wins for rows the account already holds (the pre-#967 merge).
  it("never lets a legacy saved copy overwrite a newer account value", () => {
    const legacy = accountTask();
    delete legacy.snapshotOwnership;
    const original = legacy.tasks[0];
    const restored = reloadWorkflowState(legacy);
    // The account-held task carries no delivery debt from the legacy copy.
    // (Its never-delivered local capture still does, correctly.)
    expect(restored.snapshotOwnership?.rows.tasks).toBeUndefined();
    const newer = readTasks(restored, [
      {
        ...original,
        title: "Edited on another device",
        updated_at: "2099-01-01T00:00:00.000Z",
      },
    ]);
    expect(newer.tasks[0].title).toBe("Edited on another device");
    expect(newer.snapshotOwnership?.rows.tasks).toBeUndefined();
  });

  it("does not resurrect an account row deleted elsewhere from a legacy saved copy", () => {
    const legacy = accountTask();
    delete legacy.snapshotOwnership;
    const restored = reloadWorkflowState(legacy);
    expect(readTasks(restored, []).tasks).toEqual([]);
  });

  it("a restored unsent edit yields to a newer account version of the row", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const seen = readTasks(initial, [
      { ...original, updated_at: "2026-10-01T00:00:00.000Z" },
    ]);
    const edited = workflowReducer(seen, {
      type: "updateTaskFirstTinyStep",
      taskId: TASK_ID,
      firstTinyStep: "Unsent device edit",
    });
    const restored = reloadWorkflowState(edited);
    expect(hasPendingOwner(restored, "tasks")).toBe(true);
    const newer = readTasks(restored, [
      {
        ...original,
        first_tiny_step: "Newer account edit",
        updated_at: "2026-10-02T00:00:00.000Z",
      },
    ]);
    expect(newer.tasks[0].first_tiny_step).toBe("Newer account edit");
    expect(hasPendingOwner(newer, "tasks")).toBe(false);
  });

  it("a restored unsent edit survives while the account row is unchanged since it was seen", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const accountRow = { ...original, updated_at: "2026-10-01T00:00:00.000Z" };
    const seen = readTasks(initial, [accountRow]);
    const edited = workflowReducer(seen, {
      type: "updateTaskFirstTinyStep",
      taskId: TASK_ID,
      firstTinyStep: "Unsent device edit",
    });
    const restored = reloadWorkflowState(edited);
    const same = readTasks(restored, [accountRow]);
    expect(same.tasks[0].first_tiny_step).toBe("Unsent device edit");
    expect(hasPendingOwner(same, "tasks")).toBe(true);
  });

  it("an echo with different block intent stays pending without reintroducing a duplicate", () => {
    const initial = accountTask();
    const planned = trackSnapshotChanges(
      initial,
      planLatestActiveTask(initial),
    );
    const block = planned.calendarBlocks[0];
    const proposal = planned.timeBlockProposals.find(
      (item) => item.task_id === TASK_ID,
    )!;
    const payload = {
      captures: [],
      tasks: planned.tasks,
      proposals: [{ ...proposal, id: "66666666-6666-4666-8666-666666666666" }],
      blocks: [
        {
          ...block,
          id: "77777777-7777-4777-8777-777777777777",
          end_at: new Date(
            new Date(block.end_at).getTime() + 60_000,
          ).toISOString(),
        },
      ],
      sessions: [],
      reviewLog: [],
      idAliases: aliases(),
    };
    const read = workflowReducer(planned, {
      type: "syncPersistedWorkflow",
      payload,
    });
    expect(read.calendarBlocks).toHaveLength(1);
    expect(read.calendarBlocks[0].end_at).toBe(block.end_at);
    expect(hasSnapshotWork(read)).toBe(true);
    const again = workflowReducer(read, {
      type: "syncPersistedWorkflow",
      payload,
    });
    expect(again.calendarBlocks[0].end_at).toBe(block.end_at);
    expect(hasSnapshotWork(again)).toBe(true);
  });

  it("rollback restores prior delivery ownership while keeping unrelated work", () => {
    const previous = accountTask();
    const optimistic = workflowReducer(previous, {
      type: "deferTask",
      taskId: TASK_ID,
    });
    const reverted = revertTaskReviewTransition(
      optimistic,
      previous,
      optimistic,
      TASK_ID,
    )!;
    const restored = restoreSnapshotChanges(optimistic, reverted, previous);
    expect(restored.tasks[0].status).toBe(previous.tasks[0].status);
    expect(hasSnapshotWork(restored)).toBe(false);
    const unrelated = workflowReducer(optimistic, {
      type: "addArea",
      name: "Keep this",
      color: "#111111",
    });
    const partial = revertTaskReviewTransition(
      unrelated,
      previous,
      optimistic,
      TASK_ID,
    )!;
    const result = restoreSnapshotChanges(unrelated, partial, previous);
    expect(result.areas.some((row) => row.name === "Keep this")).toBe(true);
    expect(result.tasks[0].status).toBe(previous.tasks[0].status);
    expect(hasSnapshotWork(result)).toBe(true);
  });

  it("does not retire a sibling draft or a newer draft edit with another draft's receipt", () => {
    let state = captureWorkflow(
      workflowSeed(),
      "Write the report and call the supplier.",
    );
    const draft = state.taskDrafts[0];
    state = workflowReducer(state, {
      type: "splitDraft",
      draftId: draft.id,
      titles: ["Write report", "Call supplier"],
    });
    const pending = state.taskDrafts.filter(
      (item) => item.status === "pending",
    );
    expect(pending.length).toBeGreaterThanOrEqual(2);
    const accepted = pending[0];
    state = workflowReducer(state, {
      type: "backlogDraft",
      draftId: accepted.id,
    });
    state = workflowReducer(state, {
      type: "registerDraftTransfer",
      draftId: accepted.id,
      taskId: state.tasks[0].id,
      proposalId: null,
    });
    state = workflowReducer(state, {
      type: "recordAccountId",
      family: "tasks",
      localId: state.tasks[0].id,
      accountId: TASK_ID,
    });
    expect(
      state.taskDrafts.find((item) => item.id === pending[1].id)?.status,
    ).toBe("pending");
    expect(hasPendingOwner(state, "taskDrafts")).toBe(true);
  });

  it("keeps map approval and completion through an unrelated refresh", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const approved = workflowReducer(initial, {
      type: "approveTaskMapLocal",
      taskId: TASK_ID,
      graph: {
        schema_version: "1.0",
        nodes: [{ id: "first", title: "Open document", role: "required" }],
        edges: [],
      },
    });
    expect(hasSnapshotWork(approved)).toBe(true);
    const completed = workflowReducer(approved, {
      type: "toggleTaskMapNodeCompletionLocal",
      taskId: TASK_ID,
      nodeId: "first",
      nowIso: "2026-10-23T12:00:00.000Z",
    });
    const refreshed = readTasks(completed, [original]);
    expect(refreshed.tasks[0].progression_map).toEqual(
      completed.tasks[0].progression_map,
    );
    expect(refreshed.tasks[0].map_status).toBe("approved");
    expect(hasSnapshotWork(refreshed)).toBe(true);
    expect(hasSnapshotWork(readTasks(refreshed, refreshed.tasks))).toBe(false);
  });

  it("keeps every WIP swap change, including the stopped session and cancelled block", () => {
    let state = workflowSeed();
    for (let index = 0; index < 3; index++)
      state = acceptLatestDraft(
        captureWorkflow(state, `Synthetic task ${index}`),
      );
    state = planLatestActiveTask(state);
    const released = state.tasks.find((task) =>
      state.calendarBlocks.some((block) => block.task_id === task.id),
    )!;
    state = startExecutionSession(state, released.id);
    state = acceptLatestDraft(captureWorkflow(state, "Fourth synthetic task"));
    expect(state.wipRefusal).not.toBeNull();
    const swapped = trackSnapshotChanges(
      state,
      swapWipSlot(state, released.id),
    );
    const refreshed = reconcileSnapshotRead(
      swapped,
      state,
      ["tasks", "calendarBlocks", "executionSessions"],
      snapshotCursor(swapped),
      state,
    );
    expect(
      refreshed.tasks.find((task) => task.id === released.id)?.status,
    ).toBe("backlog");
    expect(
      refreshed.calendarBlocks.find((block) => block.task_id === released.id)
        ?.status,
    ).toBe("cancelled");
    expect(
      refreshed.executionSessions.find(
        (session) => session.task_id === released.id,
      )?.status,
    ).toBe("stopped");
    expect(hasSnapshotWork(refreshed)).toBe(true);
  });

  it("does not mint ownership for review text or refused/no-op transitions", () => {
    const initial = workflowSeed();
    const textOnly = trackSnapshotChanges(initial, {
      ...initial,
      reviewLog: ["Derived explanation"],
    });
    expect(hasSnapshotWork(textOnly)).toBe(false);
    expect(
      hasSnapshotWork(
        workflowReducer(textOnly, {
          type: "updateTaskFirstTinyStep",
          taskId: "missing",
          firstTinyStep: "No task",
        }),
      ),
    ).toBe(false);
  });

  it("reset fences old receipts and reads even if local revisions are reused", () => {
    const initial = workflowReducer(workflowSeed(), {
      type: "addArea",
      name: "Old",
      color: "#111111",
    });
    const receipt = snapshotReceipt(
      initial,
      "areas",
      initial.areas.find((row) => row.name === "Old")!.id,
    );
    const reset = workflowReducer(initial, { type: "reset" });
    const newer = workflowReducer(reset, {
      type: "addArea",
      name: "New",
      color: "#222222",
    });
    expect(acknowledgeSnapshot(newer, receipt)).toBe(newer);
    expect(
      workflowReducer(newer, {
        type: "syncAreas",
        areas: initial.areas,
        cursor: receipt,
      }),
    ).toBe(newer);
    expect(readTasks(newer, accountTask().tasks, receipt)).toBe(newer);
    expect(hasSnapshotWork(newer)).toBe(true);
  });

  // Review findings 2-6 (#1106).
  it("keeps a device-only first move through reads without holding the account notice", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const edited = workflowReducer(initial, {
      type: "updateTaskFirstTinyStep",
      taskId: TASK_ID,
      firstTinyStep: "Device-only move",
    });
    expect(hasSnapshotWork(edited)).toBe(false);
    expect(readTasks(edited, [original]).tasks[0].first_tiny_step).toBe(
      "Device-only move",
    );
  });

  it("does not hold the account notice for proposal rationale or device-only projects", () => {
    const base = accountTask();
    const proposal = {
      id: "55555555-5555-4555-8555-555555555555",
      user_id: base.tasks[0].user_id,
      area_id: base.tasks[0].area_id,
      task_id: TASK_ID,
      proposed_start: "2026-10-24T16:00:00.000Z",
      proposed_end: "2026-10-24T16:30:00.000Z",
      rationale: "Account rationale",
      conflict_flag: false,
      status: "proposed",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    } as unknown as (typeof base.timeBlockProposals)[number];
    const before = { ...base, timeBlockProposals: [proposal] };
    const rationale = trackSnapshotChanges(before, {
      ...before,
      timeBlockProposals: [{ ...proposal, rationale: "Sized to actuals" }],
    });
    expect(hasSnapshotWork(rationale)).toBe(false);
    const project = {
      id: "project-901",
      area_id: base.tasks[0].area_id,
      name: "Device project",
    } as unknown as (typeof base.projects)[number];
    const withProject = trackSnapshotChanges(before, {
      ...before,
      projects: [...before.projects, project],
    });
    expect(hasSnapshotWork(withProject)).toBe(false);
  });

  it("does not mint delivery work when drafts are read back from the device", () => {
    const drafted = captureWorkflow(workflowSeed(), "Synthetic stored draft");
    const restored = workflowReducer(
      { ...drafted, taskDrafts: [], snapshotOwnership: undefined },
      { type: "restoreDeviceDrafts", drafts: drafted.taskDrafts },
    );
    expect(restored.taskDrafts).toHaveLength(drafted.taskDrafts.length);
    expect(restored.snapshotOwnership?.rows.taskDrafts).toBeUndefined();
  });

  it("prunes delivered bookkeeping after a later read and fences older reads", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const oldRead = snapshotCursor(initial);
    const moved = trackSnapshotChanges(initial, {
      ...initial,
      tasks: [{ ...original, title: "Delivered title" }],
    });
    const receipt = snapshotReceipt(moved, "tasks", TASK_ID, ["title"]);
    const saved = acknowledgeSnapshot(moved, receipt);
    const delivered = { ...original, title: "Delivered title" };
    const later = readTasks(saved, [delivered]);
    const owners = Object.values(later.snapshotOwnership?.rows.tasks ?? {});
    expect(owners.every((owner) => !("title" in owner.fields))).toBe(true);
    // A read that started before the edit returns late with the old title.
    const stale = readTasks(later, [original], oldRead);
    expect(stale.tasks[0].title).toBe("Delivered title");
  });

  it("drops another account's row ownership when a different user's rows are read", () => {
    const initial = accountTask();
    const original = initial.tasks[0];
    const edited = trackSnapshotChanges(initial, {
      ...initial,
      tasks: [{ ...original, title: "User A unsent title" }],
    });
    expect(hasSnapshotWork(edited)).toBe(true);
    const switched = readTasks(edited, [
      {
        ...original,
        id: "88888888-8888-4888-8888-888888888888",
        user_id: "99999999-9999-4999-8999-999999999999",
        title: "User B task",
      },
    ]);
    expect(switched.tasks.map((task) => task.title)).toEqual(["User B task"]);
    expect(switched.snapshotOwnership?.rows.tasks).toBeUndefined();
  });
});
