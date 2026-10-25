import { STORAGE_KEY, type WorkflowState } from "../workflow/shared";
import { isUnownedWorkflowScope } from "../durability/deviceAccount";
import {
  decodeStoredWorkflowState,
  loadStoredStateFromSession,
} from "./reducerCore";

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
  if (isUnownedWorkflowScope(scope)) {
    const stored = window.sessionStorage.getItem(key);
    if (stored && JSON.parse(stored)?.heldFor) {
      throw new Error("A previous account's snapshot is awaiting recovery.");
    }
  }
  window.sessionStorage.setItem(key, JSON.stringify(state));
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
export function claimAnonymousSnapshots(
  accountScope: string,
  live?: { scope: string; state: WorkflowState },
  heldTarget?: WorkflowState,
  memoryOwners: Record<string, string> = {},
): WorkflowState {
  let destination =
    heldTarget ??
    loadStoredStateFromSession(accountSnapshotKey(accountScope)).state;
  if (!destination) throw new Error("The account snapshot needs recovery.");
  for (const scope of anonymousScopes(live?.scope)) {
    if (memoryOwners[scope] && memoryOwners[scope] !== accountScope) continue;
    const key = accountSnapshotKey(scope);
    const stored = window.sessionStorage.getItem(key);
    const value = stored ? JSON.parse(stored) : null;
    const heldFor = value?.heldFor;
    if (heldFor && heldFor !== accountScope) continue;
    const source = heldFor
      ? decodeStoredWorkflowState(value.state)
      : live?.scope === scope
        ? live.state
        : decodeStoredWorkflowState(value);
    if (!source) continue;
    memoryOwners[scope] = accountScope;
    // If either subsequent operation fails, the complete source remains
    // recoverable only by this account, never importable by the next one.
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ heldFor: accountScope, state: source }),
    );
    destination = mergeAnonymousSnapshot(destination, source);
    window.sessionStorage.setItem(
      accountSnapshotKey(accountScope),
      JSON.stringify(destination),
    );
    window.sessionStorage.removeItem(key);
  }
  return destination;
}
