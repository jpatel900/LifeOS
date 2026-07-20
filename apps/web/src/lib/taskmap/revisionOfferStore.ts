import type { RevisionOfferRecord } from "./revision";

/**
 * FR-031 slice F5 (#679) — per-task revision-offer bookkeeping behind the
 * pure `shouldOfferRevision` decision: when an offer was last SHOWN (the
 * one-offer-per-task-per-day cap) and which evidence fingerprint the owner
 * last DISMISSED (suppressed until new evidence).
 *
 * localStorage-backed (same device-local idiom as the capture draft):
 * offer caps are a calm-UX budget, not product data — they never sync, and
 * losing them merely allows one extra offer. Every function takes the
 * storage explicitly (injectable for tests) and fails safe: a missing or
 * broken storage/JSON reads as "no record" and writes are best-effort.
 */

export const REVISION_OFFER_STORE_KEY = "lifeos.taskMapRevisionOffers.v1";

/** Oldest entries are dropped past this bound so the record can never grow
 * unboundedly on a long-lived device. */
const MAX_TRACKED_TASKS = 50;

type StoreShape = Record<string, RevisionOfferRecord>;

export interface MinimalStringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultRevisionOfferStorage(): MinimalStringStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function readAll(storage: MinimalStringStorage | null): StoreShape {
  if (!storage) return {};
  try {
    const raw = storage.getItem(REVISION_OFFER_STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: StoreShape = {};
    for (const [taskId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      result[taskId] = {
        lastOfferedDate:
          typeof record.lastOfferedDate === "string"
            ? record.lastOfferedDate
            : null,
        dismissedFingerprint:
          typeof record.dismissedFingerprint === "string"
            ? record.dismissedFingerprint
            : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function writeAll(storage: MinimalStringStorage | null, store: StoreShape) {
  if (!storage) return;
  try {
    const entries = Object.entries(store);
    const bounded =
      entries.length > MAX_TRACKED_TASKS
        ? Object.fromEntries(entries.slice(entries.length - MAX_TRACKED_TASKS))
        : store;
    storage.setItem(REVISION_OFFER_STORE_KEY, JSON.stringify(bounded));
  } catch {
    // Best-effort: a failed write only risks one extra offer later.
  }
}

export function readRevisionOfferRecord(
  storage: MinimalStringStorage | null,
  taskId: string,
): RevisionOfferRecord | null {
  return readAll(storage)[taskId] ?? null;
}

export function recordRevisionOfferShown(
  storage: MinimalStringStorage | null,
  taskId: string,
  todayIsoDate: string,
): void {
  const store = readAll(storage);
  store[taskId] = {
    ...(store[taskId] ?? {}),
    lastOfferedDate: todayIsoDate,
  };
  writeAll(storage, store);
}

export function recordRevisionOfferDismissed(
  storage: MinimalStringStorage | null,
  taskId: string,
  fingerprint: string,
): void {
  const store = readAll(storage);
  store[taskId] = {
    ...(store[taskId] ?? {}),
    dismissedFingerprint: fingerprint,
  };
  writeAll(storage, store);
}
