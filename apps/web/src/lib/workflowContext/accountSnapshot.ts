import { STORAGE_KEY, type WorkflowState } from "../workflow/shared";
import { isUnownedWorkflowScope } from "../durability/deviceAccount";
import { reserveCaptureWriteOwners } from "../durability/pendingWriteJournal";
import {
  decodeStoredWorkflowState,
  loadStoredStateFromSession,
} from "./reducerCore";
import {
  listSnapshotRecoveries,
  reserveSnapshotRecovery,
  snapshotRecoveryId,
} from "./snapshotRecovery";

export function accountSnapshotKey(scope: string): string {
  return scope === "demo" ? STORAGE_KEY : `${STORAGE_KEY}:scoped-v1:${scope}`;
}

export function anonymousWorkflowScope(previousScope: string): string {
  return unownedScope(previousScope, "anonymous");
}

export function unverifiedWorkflowScope(previousScope = "pending"): string {
  return unownedScope(previousScope, "unverified");
}

function unownedScope(
  previousScope: string,
  kind: "anonymous" | "unverified",
): string {
  const matches = (scope: string) =>
    scope === kind || scope.startsWith(`${kind}:`);
  if (matches(previousScope)) return previousScope;
  const pointer = `${STORAGE_KEY}:${kind}-scope`;
  let scope =
    previousScope === "pending" ? kind : `${kind}:${crypto.randomUUID()}`;
  try {
    const storedScope = window.sessionStorage.getItem(pointer);
    if (previousScope === "pending") {
      const candidate =
        storedScope && matches(storedScope) ? storedScope : kind;
      const stored = window.sessionStorage.getItem(
        accountSnapshotKey(candidate),
      );
      scope =
        stored && JSON.parse(stored)?.heldFor
          ? `${kind}:${crypto.randomUUID()}`
          : candidate;
    }
    window.sessionStorage.setItem(pointer, scope);
  } catch {
    // The provider still keeps this generation in memory and reports failed
    // snapshot writes through its existing device-storage warning.
  }
  return scope;
}

function anonymousScopes(liveScope?: string): string[] {
  const scopes = new Set(["anonymous", "unverified"]);
  const prefix = `${STORAGE_KEY}:scoped-v1:`;
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    const scope = key?.startsWith(prefix)
      ? key.slice(prefix.length)
      : undefined;
    if (scope && isUnownedWorkflowScope(scope)) scopes.add(scope);
  }
  if (liveScope && isUnownedWorkflowScope(liveScope)) scopes.add(liveScope);
  return [...scopes];
}

export function anonymousSnapshotOwners(): Record<string, string> {
  const owners: Record<string, string> = {};
  for (const scope of anonymousScopes()) {
    const stored = window.sessionStorage.getItem(accountSnapshotKey(scope));
    const owner = stored ? JSON.parse(stored)?.heldFor : null;
    if (typeof owner === "string" && owner.startsWith("account:"))
      owners[scope] = owner;
  }
  return owners;
}

export function storeAccountSnapshot(
  scope: string,
  state: WorkflowState,
): void {
  const key = accountSnapshotKey(scope);
  const existing = window.sessionStorage.getItem(key);
  const recoveredSnapshotIds = existing
    ? JSON.parse(existing)?.recoveredSnapshotIds
    : undefined;
  let snapshotClaimId: string | undefined;
  if (isUnownedWorkflowScope(scope)) {
    const stored = window.sessionStorage.getItem(key);
    if (stored && JSON.parse(stored)?.heldFor) {
      throw new Error("A previous account's snapshot is awaiting recovery.");
    }
    snapshotClaimId =
      (stored && JSON.parse(stored)?.snapshotClaimId) || crypto.randomUUID();
  }
  window.sessionStorage.setItem(
    key,
    JSON.stringify({
      ...state,
      ...(snapshotClaimId ? { snapshotClaimId } : {}),
      ...(Array.isArray(recoveredSnapshotIds) ? { recoveredSnapshotIds } : {}),
    }),
  );
}

/** Check before anonymous hydration, so a reserved source cannot be edited. */
export async function safeUnownedWorkflowScope(scope: string): Promise<string> {
  const stored = window.sessionStorage.getItem(accountSnapshotKey(scope));
  if (!stored) return scope;
  const value = JSON.parse(stored);
  const source = decodeStoredWorkflowState(value);
  const kind = scope.startsWith("unverified") ? "unverified" : "anonymous";
  if (value?.heldFor) return unownedScope("reserved", kind);
  if (!source) return scope;
  const id = await snapshotRecoveryId(scope, stored, source);
  const claims = await listSnapshotRecoveries();
  return claims.some((record) => record.id === id)
    ? unownedScope("reserved", kind)
    : scope;
}

/** Scoped providers mint globally unique local IDs. Account IDs already are
 * globally unique. This preserves references and journal idempotency keys.
 */
export function mergeAnonymousSnapshot(
  target: WorkflowState,
  source: WorkflowState,
): WorkflowState {
  const merged = { ...target };
  for (const key of Object.keys(source) as (keyof WorkflowState)[]) {
    const incoming = source[key];
    const existing = target[key];
    if (Array.isArray(incoming) && Array.isArray(existing)) {
      const seen = new Set(
        existing.map((row: unknown) =>
          typeof row === "object" && row !== null && "id" in row ? row.id : row,
        ),
      );
      Object.assign(merged, {
        [key]: [
          ...existing,
          ...incoming.filter(
            (row: unknown) =>
              !seen.has(
                typeof row === "object" && row !== null && "id" in row
                  ? row.id
                  : row,
              ),
          ),
        ],
      });
    }
  }
  return merged;
}

/** Reserve the source, then commit the destination before consuming it.
 * Old unscoped snapshots are never guessed to belong to the next sign-in.
 * If storage refuses the write, the source stays available for recovery.
 */
export async function claimAnonymousSnapshots(
  accountScope: string,
  live?: { scope: string; state: WorkflowState },
  heldTarget?: WorkflowState,
  memoryOwners: Record<string, string> = {},
  sourceScopes?: readonly string[],
): Promise<{ state: WorkflowState; storageBlocked: boolean }> {
  let destination =
    heldTarget ??
    loadStoredStateFromSession(accountSnapshotKey(accountScope)).state;
  if (!destination) throw new Error("The account snapshot needs recovery.");
  const recoveries = await listSnapshotRecoveries();
  for (const record of recoveries) {
    if (record.state)
      await reserveCaptureWriteOwners(
        record.owner.slice("account:".length),
        record.state.captureItems.map((capture) => capture.id),
      );
  }
  const storedAccount = window.sessionStorage.getItem(
    accountSnapshotKey(accountScope),
  );
  const receipts = new Set<string>(
    storedAccount
      ? (JSON.parse(storedAccount)?.recoveredSnapshotIds ?? [])
      : [],
  );
  const appliedAtStart = new Set(receipts);
  // A fallback without any session-storage anchor must remain device-durable.
  // Each tab records its receipt alongside the state, never consumes the only
  // global copy, and never re-applies it over that tab's later edits.
  for (const record of recoveries) {
    if (
      record.owner === accountScope &&
      record.unanchored &&
      record.state &&
      !receipts.has(record.id)
    ) {
      destination = mergeAnonymousSnapshot(destination, record.state);
      receipts.add(record.id);
    }
  }
  const consumed: string[] = [];
  let storageBlocked = false;
  for (const scope of sourceScopes ?? anonymousScopes(live?.scope)) {
    if (memoryOwners[scope] && memoryOwners[scope] !== accountScope) continue;
    const key = accountSnapshotKey(scope);
    const stored = window.sessionStorage.getItem(key);
    const value = stored ? JSON.parse(stored) : null;
    const heldFor = value?.heldFor;
    if (heldFor && heldFor !== accountScope) {
      const held = decodeStoredWorkflowState(value.state);
      if (held)
        await reserveCaptureWriteOwners(
          heldFor.slice("account:".length),
          held.captureItems.map((capture) => capture.id),
        );
      continue;
    }
    let source = heldFor
      ? decodeStoredWorkflowState(value.state)
      : live?.scope === scope
        ? live.state
        : decodeStoredWorkflowState(value);
    if (!source) continue;
    const id = await snapshotRecoveryId(scope, stored, source);
    const recovery = recoveries.find((record) => record.id === id);
    if (recovery && recovery.owner === accountScope && appliedAtStart.has(id)) {
      memoryOwners[scope] = recovery.owner;
      continue;
    }
    if (recovery && !recovery.state) {
      memoryOwners[scope] = recovery.owner;
      continue;
    }
    if (recovery && recovery.owner !== accountScope) {
      memoryOwners[scope] = recovery.owner;
      continue;
    }
    if (recovery?.state) {
      source =
        live?.scope === scope
          ? mergeAnonymousSnapshot(source, recovery.state)
          : recovery.state;
      receipts.add(recovery.id);
    }
    try {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          heldFor: accountScope,
          state: source,
          snapshotClaimId: id,
        }),
      );
    } catch {
      const reserved = await reserveSnapshotRecovery(
        {
          id,
          scope,
          owner: accountScope,
          state: source,
          unanchored: stored === null,
        },
        mergeAnonymousSnapshot,
      );
      if (reserved.owner !== accountScope) {
        memoryOwners[scope] = reserved.owner;
        continue;
      }
      source = reserved.state ?? source;
      receipts.add(reserved.id);
      storageBlocked = true;
      // Keep the source as this tab's recovery anchor until its destination
      // commits. Another tab must not consume this tab's only durable copy.
    }
    await reserveCaptureWriteOwners(
      accountScope.slice("account:".length),
      source.captureItems.map((capture) => capture.id),
    );
    memoryOwners[scope] = accountScope;
    destination = mergeAnonymousSnapshot(destination, source);
    consumed.push(key);
  }
  try {
    window.sessionStorage.setItem(
      accountSnapshotKey(accountScope),
      JSON.stringify({ ...destination, recoveredSnapshotIds: [...receipts] }),
    );
  } catch {
    return { state: destination, storageBlocked: true };
  }
  for (const key of consumed) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      storageBlocked = true;
    }
  }
  // A duplicated tab can share the same source token. Its session-local
  // receipt cannot consume the device's only fallback payload. Retain the
  // owner-qualified recovery and use receipts to prevent reapplication.
  return { state: destination, storageBlocked };
}
