// Leaf types for snapshot ownership (#967). Kept free of imports so the
// workflow state type can reference them without an import cycle.

export type SnapshotCollection =
  | "areas"
  | "captureItems"
  | "tasks"
  | "timeBlockProposals"
  | "calendarBlocks"
  | "executionSessions"
  | "taskDrafts"
  | "projectDrafts"
  | "timeBlockProposalDrafts"
  | "projects";

export type SnapshotStamp = {
  revision: number;
  pending: boolean;
  acknowledgedAt?: number;
  /** Came from a saved copy (page reload), not from an edit in this page. */
  restored?: boolean;
  /** Kept on this device by design; protected, but not owed to the account. */
  deviceOnly?: boolean;
};

export interface SnapshotCursor {
  epoch: number;
  revision: number;
}

export interface SnapshotReceipt extends SnapshotCursor {
  collection: SnapshotCollection;
  id: string;
  creation?: number;
  fields: Record<string, { revision: number; value: unknown }>;
}

export type SnapshotOwner = {
  creation?: SnapshotStamp;
  fields: Record<string, SnapshotStamp>;
  /** The newest valid account row version (`updated_at`) this device read. */
  base?: string;
  accountId?: string;
  inferredIdentity?: boolean;
  transfers?: SnapshotReceipt[];
};

export interface SnapshotOwnership extends SnapshotCursor {
  version: 1;
  rows: Partial<Record<SnapshotCollection, Record<string, SnapshotOwner>>>;
  /** Authenticated account identity; also present for successful empty reads. */
  userId?: string;
  /** Per collection: a read at this revision pruned delivered bookkeeping, so
   * an older read can no longer be reconciled safely and is ignored. */
  prunedThrough?: Partial<Record<SnapshotCollection, number>>;
}
