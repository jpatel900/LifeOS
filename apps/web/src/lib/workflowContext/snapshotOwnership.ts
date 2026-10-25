import type { AccountIdAliasFamily, WorkflowState } from "../workflow/shared";
import { hasDemoSeedId } from "../mockData";
import type {
  SnapshotCollection,
  SnapshotCursor,
  SnapshotOwner,
  SnapshotOwnership,
  SnapshotReceipt,
  SnapshotStamp,
} from "./snapshotOwnershipTypes";

export type {
  SnapshotCollection,
  SnapshotCursor,
  SnapshotOwnership,
  SnapshotReceipt,
} from "./snapshotOwnershipTypes";

// Delivery obligations belong to actual state transitions, never to a toast or
// a failed snapshot write. New rows have one creation obligation. Only later
// edits own fields, so account-created defaults can replace optimistic defaults.
const accountFields = {
  areas: ["name", "color"],
  captureItems: ["raw_text", "area_id", "return_hook"],
  tasks: [
    "title",
    "description",
    "area_id",
    "project_id",
    "source_capture_item_id",
    "status",
    "priority_score",
    "priority_confidence",
    "task_type",
    "is_reversible",
    "energy_type",
    "estimated_minutes_low",
    "estimated_minutes_high",
    "due_at",
    "first_tiny_step",
    "definition_of_done",
    "waiting_on_person_id",
    "committed_to_person_id",
    "is_commitment",
    "progression_map",
    "map_status",
    "map_schema_version",
    "waiting_on_since",
  ],
  timeBlockProposals: [
    "area_id",
    "task_id",
    "proposed_start",
    "proposed_end",
    "rationale",
    "conflict_flag",
    "status",
  ],
  calendarBlocks: [
    "area_id",
    "task_id",
    "proposal_id",
    "start_at",
    "end_at",
    "status",
    "google_event_id",
  ],
  executionSessions: [
    "area_id",
    "task_id",
    "calendar_block_id",
    "planned_minutes",
    "actual_minutes",
    "paused_minutes",
    "distraction_minutes",
    "productivity_rating",
    "status",
    "outcome",
    "cap_outcome",
    "notes",
  ],
} as const;
const deviceCollections = [
  "taskDrafts",
  "projectDrafts",
  "timeBlockProposalDrafts",
  "projects",
] as const;
// The literal union lives in the leaf types module; this keeps it exact.
type DerivedCollection =
  | keyof typeof accountFields
  | (typeof deviceCollections)[number];
const collectionsMatch: [SnapshotCollection, DerivedCollection] extends [
  DerivedCollection,
  SnapshotCollection,
]
  ? true
  : never = true;
void collectionsMatch;
const collections: SnapshotCollection[] = [
  ...(Object.keys(accountFields) as (keyof typeof accountFields)[]),
  ...deviceCollections,
];
type Row = { id: string; [key: string]: unknown };
type Stamp = SnapshotStamp;
type Owner = SnapshotOwner;
const families: Partial<Record<SnapshotCollection, AccountIdAliasFamily>> = {
  captureItems: "captures",
  tasks: "tasks",
  timeBlockProposals: "proposals",
  calendarBlocks: "blocks",
  executionSessions: "sessions",
};
const ignored = new Set(["id", "user_id", "created_at", "updated_at"]);
const rows = (state: WorkflowState, collection: SnapshotCollection) =>
  state[collection] as unknown as Row[];
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const fresh = (): SnapshotOwnership => ({
  version: 1,
  epoch: 0,
  revision: 0,
  rows: {},
});
export const snapshotCursor = (state: WorkflowState): SnapshotCursor => ({
  epoch: state.snapshotOwnership?.epoch ?? 0,
  revision: state.snapshotOwnership?.revision ?? 0,
});
function fieldsFor(
  collection: SnapshotCollection,
  row: Row,
): readonly string[] {
  return collection in accountFields
    ? accountFields[collection as keyof typeof accountFields]
    : Object.keys(row).filter((field) => !ignored.has(field));
}
function copy(state: WorkflowState): SnapshotOwnership {
  return structuredClone(state.snapshotOwnership ?? fresh());
}
function ownerId(
  state: WorkflowState,
  collection: SnapshotCollection,
  id: string,
): string {
  const owners = state.snapshotOwnership?.rows[collection] ?? {};
  return (
    Object.keys(owners).find(
      (key) => accountId(state, collection, key) === id,
    ) ?? id
  );
}
function accountId(
  state: WorkflowState,
  collection: SnapshotCollection,
  id: string,
): string {
  const family = families[collection];
  return (
    (family && state.accountIdByLocalId[family][id]) ||
    state.snapshotOwnership?.rows[collection]?.[id]?.accountId ||
    id
  );
}
export function snapshotAreaId(state: WorkflowState, id: string): string;
export function snapshotAreaId(
  state: WorkflowState,
  id: string | null,
): string | null;
export function snapshotAreaId(
  state: WorkflowState,
  id: string | null,
): string | null {
  return id === null ? null : accountId(state, "areas", id);
}
function canonical(
  state: WorkflowState,
  field: string,
  value: unknown,
): unknown {
  if (typeof value !== "string") return value;
  const relations: Record<string, SnapshotCollection> = {
    area_id: "areas",
    source_capture_item_id: "captureItems",
    capture_item_id: "captureItems",
    task_id: "tasks",
    proposal_id: "timeBlockProposals",
    calendar_block_id: "calendarBlocks",
  };
  const collection = relations[field];
  return collection ? accountId(state, collection, value) : value;
}
export function hasSnapshotWork(state: WorkflowState): boolean {
  return Object.values(state.snapshotOwnership?.rows ?? {}).some((group) =>
    Object.values(group).some(
      (owner) =>
        owner.creation?.pending ||
        Object.values(owner.fields).some((field) => field.pending),
    ),
  );
}

/** Call only after an actual local transition. Account hydration is separate. */
export function trackSnapshotChanges(
  before: WorkflowState,
  after: WorkflowState,
): WorkflowState {
  if (before === after) return after;
  const metadata = copy(before);
  const revision = metadata.revision + 1;
  let changed = false;
  for (const collection of collections) {
    const oldRows = new Map(
      rows(before, collection).map((row) => [row.id, row]),
    );
    const newIds = new Set(rows(after, collection).map((row) => row.id));
    const group = metadata.rows[collection] ?? {};
    // Domain transitions replace/remove device drafts. Deleted drafts cannot
    // leave invisible debt behind. Account rows are changed by status, not deleted.
    for (const id of Object.keys(group)) {
      if (!newIds.has(id) && !newIds.has(accountId(before, collection, id))) {
        delete group[id];
        changed = true;
      }
    }
    for (const row of rows(after, collection)) {
      const old = oldRows.get(row.id);
      const key = ownerId(before, collection, row.id);
      if (!old) {
        group[key] = { creation: { revision, pending: true }, fields: {} };
        changed = true;
        continue;
      }
      for (const field of fieldsFor(collection, row)) {
        if (equal(old[field], row[field])) continue;
        const owner = (group[key] ??= { fields: {} });
        // The edit was made against the row version the device held. Later
        // reads keep this current; it decides whether a saved copy is older.
        if (owner.base === undefined && typeof old.updated_at === "string")
          owner.base = old.updated_at;
        owner.fields[field] = { revision, pending: true };
        changed = true;
      }
    }
    if (Object.keys(group).length) metadata.rows[collection] = group;
    else delete metadata.rows[collection];
  }
  return {
    ...after,
    snapshotOwnership: changed ? { ...metadata, revision } : metadata,
  };
}

export function snapshotReceipt(
  state: WorkflowState,
  collection: SnapshotCollection,
  id: string,
  fields?: readonly string[],
): SnapshotReceipt {
  const key = ownerId(state, collection, id);
  const owner = state.snapshotOwnership?.rows[collection]?.[key];
  const row = rows(state, collection).find(
    (item) => item.id === id || item.id === accountId(state, collection, key),
  );
  return {
    ...snapshotCursor(state),
    collection,
    id: key,
    creation: fields ? undefined : owner?.creation?.revision,
    fields: Object.fromEntries(
      Object.entries(owner?.fields ?? {})
        .filter(([field]) => !fields || fields.includes(field))
        .map(([field, stamp]) => [
          field,
          { revision: stamp.revision, value: row?.[field] },
        ]),
    ),
  };
}

export function acknowledgeSnapshot(
  state: WorkflowState,
  receipt: SnapshotReceipt,
  persistedId?: string,
): WorkflowState {
  if (snapshotCursor(state).epoch !== receipt.epoch) return state;
  const metadata = copy(state);
  const owner = metadata.rows[receipt.collection]?.[receipt.id];
  if (!owner) return state;
  const acknowledge = (stamp: Stamp) => {
    if (!stamp.pending) return;
    stamp.pending = false;
    stamp.acknowledgedAt = metadata.revision + 1;
  };
  const row = rows(state, receipt.collection).find(
    (item) =>
      item.id === receipt.id ||
      item.id === accountId(state, receipt.collection, receipt.id),
  );
  if (persistedId) owner.accountId = persistedId;
  if (owner.creation && owner.creation.revision === receipt.creation) {
    acknowledge(owner.creation);
    delete owner.inferredIdentity;
  }
  for (const [field, submitted] of Object.entries(receipt.fields)) {
    const stamp = owner.fields[field];
    if (
      stamp?.revision === submitted.revision &&
      equal(
        canonical(state, field, row?.[field]),
        canonical(state, field, submitted.value),
      )
    )
      acknowledge(stamp);
  }
  if (equal(metadata, state.snapshotOwnership)) return state;
  metadata.revision++;
  return { ...state, snapshotOwnership: metadata };
}

/** Creation acknowledgement deliberately does not acknowledge subsequent edits. */
export function acknowledgeSnapshotCreation(
  state: WorkflowState,
  family: AccountIdAliasFamily,
  localId: string,
): WorkflowState {
  const collection = collections.find((key) => families[key] === family)!;
  const owner = state.snapshotOwnership?.rows[collection]?.[localId];
  let next = acknowledgeSnapshot(state, {
    ...snapshotReceipt(state, collection, localId),
    fields: {},
  });
  for (const transfer of owner?.transfers ?? [])
    next = acknowledgeSnapshot(next, transfer);
  return next;
}

export function registerDraftTransfer(
  state: WorkflowState,
  draftId: string,
  taskId: string,
  proposalId: string | null,
): WorkflowState {
  const metadata = copy(state);
  const task = metadata.rows.tasks?.[taskId];
  if (!task) return state;
  task.transfers = [snapshotReceipt(state, "taskDrafts", draftId)];
  // Proposal draft history is delivered by its proposal's receipt, or by the
  // backlog acceptance that intentionally creates no proposal.
  const destination =
    (proposalId && metadata.rows.timeBlockProposals?.[proposalId]) || task;
  destination.transfers = [
    ...(destination.transfers ?? []),
    ...state.timeBlockProposalDrafts
      .filter((draft) => draft.task_draft_id === draftId)
      .map((draft) =>
        snapshotReceipt(state, "timeBlockProposalDrafts", draft.id),
      ),
  ];
  return { ...state, snapshotOwnership: metadata };
}

/** Protect pending fields and already-acknowledged edits newer than this read. */
export function reconcileSnapshotRead(
  before: WorkflowState,
  merged: WorkflowState,
  collectionsRead: SnapshotCollection[],
  cursor = snapshotCursor(before),
  readRows: Partial<Pick<WorkflowState, SnapshotCollection>> = merged,
  inferredIds: Partial<Record<SnapshotCollection, Set<string>>> = {},
): WorkflowState {
  if (cursor.epoch !== snapshotCursor(before).epoch) return before;
  const metadata = copy(before);
  const result = { ...merged, snapshotOwnership: metadata };
  const watermark = (stamp: Stamp) =>
    Math.max(stamp.revision, stamp.acknowledgedAt ?? 0);
  let acknowledged = false;
  const acknowledge = (stamp: Stamp) => {
    if (!stamp.pending) return;
    stamp.pending = false;
    stamp.acknowledgedAt = metadata.revision + 1;
    acknowledged = true;
  };
  for (const collection of collectionsRead) {
    const output = [...rows(merged, collection)];
    for (const [id, owner] of Object.entries(metadata.rows[collection] ?? {})) {
      if (inferredIds[collection]?.has(id) && owner.creation?.pending)
        owner.inferredIdentity = true;
      const persistedId = accountId(before, collection, id);
      const local = rows(before, collection).find(
        (row) => row.id === id || row.id === persistedId,
      );
      if (!local) continue;
      const index = output.findIndex((row) => row.id === persistedId);
      const remote = (
        readRows[collection] as unknown as Row[] | undefined
      )?.find((row) => row.id === persistedId);
      // A retained local row from the old merge is not account evidence.
      if (!remote) {
        // A saved copy cannot resurrect a row the account no longer returns.
        for (const stamp of Object.values(owner.fields))
          if (stamp.restored && stamp.pending) acknowledge(stamp);
        const mustKeep =
          owner.creation?.pending ||
          (owner.creation && watermark(owner.creation) > cursor.revision) ||
          Object.values(owner.fields).some(
            (stamp) =>
              !stamp.restored &&
              (stamp.pending || watermark(stamp) > cursor.revision),
          );
        if (mustKeep) {
          const at = output.findIndex((row) => row.id === local.id);
          if (at < 0) output.push(local);
          else output[at] = local;
        }
        continue;
      }
      let resolved = { ...remote };
      // Display echo matching is weaker than a write receipt. A guessed twin
      // may replace the duplicate card, but all its intent fields must agree
      // before it can discharge creation debt.
      const unconfirmedCreation =
        owner.creation?.pending &&
        owner.inferredIdentity &&
        !fieldsFor(collection, local).every((field) =>
          equal(
            canonical(before, field, local[field]),
            canonical(before, field, remote[field]),
          ),
        );
      const protectCreation =
        owner.creation && watermark(owner.creation) > cursor.revision;
      if (owner.creation && !protectCreation && !unconfirmedCreation)
        acknowledge(owner.creation);
      if (protectCreation) resolved = { ...local, id: remote.id };
      if (unconfirmedCreation)
        for (const field of fieldsFor(collection, local))
          resolved[field] = canonical(before, field, local[field]);
      // An older saved copy never overwrites newer account data: a restored,
      // unsent edit keeps its value only while the account row is provably
      // the version this device last read. No recorded version means no proof.
      const remoteVersion =
        typeof remote.updated_at === "string" ? remote.updated_at : undefined;
      const accountNewer =
        !owner.base ||
        !remoteVersion ||
        !(Date.parse(remoteVersion) <= Date.parse(owner.base));
      for (const [field, stamp] of Object.entries(owner.fields)) {
        const localValue = canonical(before, field, local[field]);
        const remoteValue = canonical(before, field, remote[field]);
        const protect = watermark(stamp) > cursor.revision;
        if (stamp.restored && stamp.pending && accountNewer && !protect) {
          acknowledge(stamp);
          continue;
        }
        if (!protect && equal(localValue, remoteValue)) acknowledge(stamp);
        if (stamp.pending || protect) resolved[field] = localValue;
      }
      if (remoteVersion) owner.base = remoteVersion;
      if (index < 0) output.push(resolved);
      else output[index] = resolved;
      if (id !== persistedId) {
        const duplicate = output.findIndex((row) => row.id === id);
        if (duplicate >= 0) output.splice(duplicate, 1);
      }
    }
    // This assignment stays inside the closed, typed collection list above.
    (result as unknown as Record<SnapshotCollection, Row[]>)[collection] =
      output;
  }
  if (acknowledged) metadata.revision++;
  if (collectionsRead.includes("areas")) {
    for (const collection of collections.filter((name) => name !== "areas")) {
      const retargeted = rows(result, collection).map((row) =>
        typeof row.area_id === "string" &&
        accountId(result, "areas", row.area_id) !== row.area_id
          ? { ...row, area_id: accountId(result, "areas", row.area_id) }
          : row,
      );
      (result as unknown as Record<SnapshotCollection, Row[]>)[collection] =
        retargeted;
    }
  }
  return result;
}

export function resetSnapshotOwnership(
  state: WorkflowState,
  empty: WorkflowState,
): WorkflowState {
  return {
    ...empty,
    snapshotOwnership: { ...fresh(), epoch: snapshotCursor(state).epoch + 1 },
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const counter = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const safeKey = (key: string) =>
  !["__proto__", "constructor", "prototype"].includes(key);

/** Reject bookkeeping alone, never the user's otherwise valid workflow rows. */
export function normalizeSnapshotOwnership(
  value: unknown,
): SnapshotOwnership | undefined {
  if (
    !record(value) ||
    value.version !== 1 ||
    !counter(value.epoch) ||
    !counter(value.revision) ||
    !record(value.rows)
  )
    return undefined;
  const validStamp = (stamp: unknown) =>
    record(stamp) &&
    counter(stamp.revision) &&
    stamp.revision <= (value.revision as number) &&
    typeof stamp.pending === "boolean" &&
    (stamp.restored === undefined || typeof stamp.restored === "boolean") &&
    (stamp.acknowledgedAt === undefined ||
      (counter(stamp.acknowledgedAt) &&
        stamp.acknowledgedAt <= (value.revision as number)));
  const validReceipt = (receipt: unknown) => {
    if (
      !record(receipt) ||
      receipt.epoch !== value.epoch ||
      !counter(receipt.revision) ||
      receipt.revision > (value.revision as number) ||
      !collections.includes(receipt.collection as SnapshotCollection) ||
      typeof receipt.id !== "string" ||
      !safeKey(receipt.id) ||
      !record(receipt.fields)
    )
      return false;
    if (
      receipt.creation !== undefined &&
      (!counter(receipt.creation) || receipt.creation > receipt.revision)
    )
      return false;
    return Object.entries(receipt.fields).every(
      ([field, submitted]) =>
        safeKey(field) &&
        record(submitted) &&
        counter(submitted.revision) &&
        submitted.revision <= (receipt.revision as number),
    );
  };
  for (const [collection, group] of Object.entries(value.rows)) {
    if (
      !collections.includes(collection as SnapshotCollection) ||
      !record(group)
    )
      return undefined;
    for (const [id, owner] of Object.entries(group)) {
      if (!safeKey(id) || !record(owner) || !record(owner.fields))
        return undefined;
      if (owner.creation !== undefined && !validStamp(owner.creation))
        return undefined;
      if (owner.accountId !== undefined && typeof owner.accountId !== "string")
        return undefined;
      if (
        owner.base !== undefined &&
        (typeof owner.base !== "string" || Number.isNaN(Date.parse(owner.base)))
      )
        return undefined;
      if (
        owner.inferredIdentity !== undefined &&
        typeof owner.inferredIdentity !== "boolean"
      )
        return undefined;
      if (
        !Object.entries(owner.fields).every(
          ([field, stamp]) => safeKey(field) && validStamp(stamp),
        )
      )
        return undefined;
      if (
        owner.transfers !== undefined &&
        (!Array.isArray(owner.transfers) ||
          !owner.transfers.every(validReceipt))
      )
        return undefined;
    }
  }
  return value as unknown as SnapshotOwnership;
}

/** A saved copy is older evidence than the account. Its unsent edits are
 * marked restored, so a newer account row wins on the next read. Snapshots
 * without valid bookkeeping keep only never-delivered local rows pending; rows
 * the account already holds take the account's values (the pre-#967 merge). */
export function restoreSnapshotOwnership(state: WorkflowState): WorkflowState {
  const valid = normalizeSnapshotOwnership(state.snapshotOwnership);
  if (valid) {
    const marked = structuredClone(valid);
    for (const group of Object.values(marked.rows))
      for (const owner of Object.values(group ?? {}))
        for (const stamp of Object.values(owner.fields))
          if (stamp.pending) stamp.restored = true;
    return { ...state, snapshotOwnership: marked };
  }
  // Rejected bookkeeping must not influence either access or inferred identity.
  // The user rows and independently validated account aliases remain intact.
  const recovered = { ...state, snapshotOwnership: undefined };
  const metadata = fresh();
  metadata.revision = 1;
  for (const collection of collections) {
    for (const row of rows(recovered, collection)) {
      if (hasDemoSeedId(row.id)) continue;
      if (
        collection === "areas" &&
        !/^area-\d+$/.test(row.id) &&
        !/^[0-9a-f]{8}-/i.test(row.id)
      )
        continue;
      // Only a row that never reached the account carries delivery debt.
      // Account-held rows get no stamps, so the next read is authoritative.
      if (
        /^(area|capture|task-draft|project-draft|proposal-draft|project|task|proposal|block|session)-\d+$/.test(
          row.id,
        ) &&
        accountId(recovered, collection, row.id) === row.id
      ) {
        (metadata.rows[collection] ??= {})[row.id] = {
          creation: { revision: 1, pending: true },
          fields: {},
        };
      }
    }
  }
  return { ...recovered, snapshotOwnership: metadata };
}

/** A refused optimistic transition restores its previous ownership too. Keep
 * a new watermark so an older account read cannot resurrect the refused value. */
export function restoreSnapshotChanges(
  current: WorkflowState,
  restored: WorkflowState,
  previous: WorkflowState,
): WorkflowState {
  const tracked = trackSnapshotChanges(current, restored);
  const metadata = copy(tracked);
  for (const collection of collections) {
    for (const row of rows(restored, collection)) {
      const old = rows(current, collection).find((item) => item.id === row.id);
      const prior = rows(previous, collection).find(
        (item) => item.id === row.id,
      );
      if (!old || !prior) continue;
      const key = ownerId(tracked, collection, row.id);
      const owner = metadata.rows[collection]?.[key];
      if (!owner) continue;
      for (const field of fieldsFor(collection, row)) {
        if (equal(old[field], row[field]) || !equal(prior[field], row[field]))
          continue;
        const priorStamp =
          previous.snapshotOwnership?.rows[collection]?.[
            ownerId(previous, collection, row.id)
          ]?.fields[field];
        owner.fields[field] = {
          revision: metadata.revision,
          pending: priorStamp?.pending ?? false,
        };
      }
    }
  }
  return { ...tracked, snapshotOwnership: metadata };
}
