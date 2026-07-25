import {
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_UNREACHABLE_NOW,
  DEVICE_STORAGE_BLOCKED,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  SOME_WORK_ON_THIS_DEVICE,
} from "./statusVocabulary";
import type { WorkflowSyncStatus } from "./workflowContext/types";

/**
 * ONE READING OF "WHERE IS MY WORK RIGHT NOW" FOR EVERY SURFACE (#734)
 * ===================================================================
 *
 * `statusVocabulary.ts` settled what the words are. This settles the two
 * questions every surface reporting them has to answer first:
 *
 *   1. Is there anything to say at all?
 *   2. Is this an ordinary state, or a real failure?
 *
 * Both answers lived inside `cockpit/StatusBanners.tsx`, tangled into the
 * JSX that rendered them, so neither could be tested or reused on its own —
 * which is why the tone bug in that component (an ordinary offline save
 * dressed as a failure) had no test that could have caught it. As a pure
 * function the calm/alarm split is assertable directly, and any other surface
 * that ever needs the same reading has one place to get it rather than a
 * second hand-typed copy of the conditions.
 *
 * This module is pure: it maps a `WorkflowSyncStatus` to what to show. It
 * makes no decision about WHEN a status is reached, never retries, and never
 * reclassifies — the conditions and their priority are exactly the ones
 * `SyncNotice` already applied.
 *
 * SILENCE IS A RESULT, NOT A GAP
 * ------------------------------
 * `null` means everything has reached the account (or LifeOS is still
 * looking) and there is nothing a person needs to know. Nothing renders.
 * That is deliberate: a permanent "all synced" marker would be furniture the
 * eye learns to skip, and it would make the one state that matters harder to
 * notice, not easier. If a persistent marker is ever wanted instead, this
 * function is the seam — a caller that wants one renders its own resting
 * state when this returns `null`, and no other file changes.
 *
 * TONE IS NOT DECORATION
 * ----------------------
 * `calm` states fire during ordinary use: signed out, offline, an account
 * that can't be reached for a few minutes. They are the high-frequency case
 * and must never wear failure styling — the work is safe, it is simply here
 * rather than there.
 *
 * `alarm` is reserved for the two states where something is actually wrong:
 * a save that was attempted and failed, and a browser refusing to hold
 * anything on this device at all (where a reload really does lose work).
 */
export type DeviceSaveTone = "calm" | "alarm";

export interface DeviceSaveNotice {
  tone: DeviceSaveTone;
  /** The sentence to show. Always a `statusVocabulary` phrase. */
  message: string;
  /**
   * True when the only reason the work is here is that nobody is signed in,
   * so a surface can offer the sign-in door alongside the sentence (#688).
   */
  signedOut: boolean;
}

/**
 * What to tell the person about where their work is, or `null` for nothing.
 *
 * Priority, unchanged from the pre-#734 `SyncNotice`:
 *   1. signed out (and storage is fine) — calm, with the door
 *   2. device storage blocked — alarm
 *   3. account unreachable — calm
 *   4. saving to the account failed — alarm
 *   5. account reached, but some work stayed here — calm
 */
export function resolveDeviceSaveNotice(
  status: WorkflowSyncStatus,
): DeviceSaveNotice | null {
  if (status.signedOut && status.storage !== "blocked") {
    return {
      tone: "calm",
      message: status.message ?? SIGNED_OUT_SAVING_ON_THIS_DEVICE,
      signedOut: true,
    };
  }

  if (status.storage === "blocked") {
    return { tone: "alarm", message: DEVICE_STORAGE_BLOCKED, signedOut: false };
  }

  if (status.account === "local-only") {
    return {
      tone: "calm",
      message: status.message ?? ACCOUNT_UNREACHABLE_NOW,
      signedOut: false,
    };
  }

  if (status.account === "sync-error") {
    return {
      tone: "alarm",
      message: status.message ?? ACCOUNT_SAVE_FAILED,
      signedOut: false,
    };
  }

  if (status.account === "synced" && status.pendingLocalChanges) {
    return {
      tone: "calm",
      message: status.message ?? SOME_WORK_ON_THIS_DEVICE,
      signedOut: false,
    };
  }

  return null;
}
