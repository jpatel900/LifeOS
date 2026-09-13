import {
  ACCOUNT_NEEDS_APP_UPDATE,
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
 *
 * #967 VISIBILITY: A FAILED ATTEMPT IS NOT THE SAME AS AN ORDINARY QUEUE
 * ------------------------------------------------------------------
 * `status.pendingSaveFailed` (see its own doc in `workflowContext/types.ts`)
 * is factual, durable evidence — at least one currently-queued write's LAST
 * account-save attempt is known to have failed, not merely that it hasn't
 * been sent yet. That is a stronger claim than "some work stayed here" and
 * gets the SAME alarm treatment already used for `sync-error`, reusing the
 * same `ACCOUNT_SAVE_FAILED` sentence — no new vocabulary.
 *
 * #967 root/independent review of the first pass here: checking this ONLY
 * inside the "synced, some work stayed here" case was too narrow, and the
 * guard that kept it out of `local-only` was wrong. A committed candidate
 * checked `!status.message` to decide whether a branch already had
 * something "more specific" to say — but `markLocalOnly`'s callers never
 * leave `message` null; they always pass a real sentence, and MOST of those
 * sentences (`ACCOUNT_UNREACHABLE_NOW`, `SOME_WORK_ON_THIS_DEVICE`, every
 * `savedOnThisDeviceBanner`/`savedOnThisDeviceAndSendingBanner(subject)`
 * output) are exactly as generic as the default they replace — some of them
 * even carry the "LifeOS will add it to your account as soon as it can"
 * promise, which is the precise lie this whole feature exists to end once a
 * real attempt has actually failed. A non-null message is not the same
 * claim as a SPECIFIC, actionable one, and treating it that way silently
 * re-hid the failure `verify967-notice-state.mjs` reproduced for both
 * `local-only` shapes.
 *
 * The fix: `hasSpecificActionableMessage` below allowlists the ONE message
 * in this codebase that actually names a distinct, non-retriable cause a
 * person can act on — `ACCOUNT_NEEDS_APP_UPDATE` (the same string
 * `workflowContext/reducerCore.ts`'s `serverCapabilityMissingMessage`
 * aliases). Everything else — the generic defaults, every
 * `savedOnThisDeviceBanner`/`savedOnThisDeviceAndSendingBanner` output, and
 * any other caller-supplied sentence — yields to the failed-save alarm when
 * `pendingSaveFailed` is true. Signed-out and storage-blocked still come
 * first, unconditionally (checked before this is ever consulted): those are
 * about WHERE the work physically is, not whether a send was attempted and
 * rejected, and the CLAIM is explicit that their priority must not move.
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
 * Priority, unchanged from the pre-#734 `SyncNotice`, with the #967
 * refinement described in the module comment above applied to BOTH cases 3
 * and 5:
 *   1. signed out (and storage is fine) — calm, with the door
 *   2. device storage blocked — alarm
 *   3. account unreachable — calm, UNLESS a queued write's last save attempt
 *      is known to have failed and the current message is not a genuinely
 *      specific actionable one, in which case alarm
 *   4. saving to the account failed — alarm (already)
 *   5. account reached, but some work stayed here — calm, with the same
 *      #967 exception as case 3
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

  // #967 root/independent review: the ONE message in this codebase that
  // names a distinct, non-retriable, actionable cause — every other caller
  // of `markLocalOnly` (and the synced+pending case's own default) is
  // exactly as generic as "we don't know why yet", even when non-null.
  const hasSpecificActionableMessage =
    status.message === ACCOUNT_NEEDS_APP_UPDATE;

  if (status.account === "local-only") {
    if (status.pendingSaveFailed && !hasSpecificActionableMessage) {
      // #967 typed failure category: a KNOWN-ONLY aggregate (every currently
      // failed journal row is `"server-capability-missing"`) is the same
      // actionable, non-retriable cause as `hasSpecificActionableMessage`
      // above, so it gets the same calm, specific message. Any mix, any
      // unknown row, or a legacy/absent aggregate must NOT be blanket-hidden
      // by this — it keeps the generic alarm, unchanged from before.
      if (status.pendingSaveFailureKind === "server-capability-missing") {
        return {
          tone: "calm",
          message: ACCOUNT_NEEDS_APP_UPDATE,
          signedOut: false,
        };
      }
      return { tone: "alarm", message: ACCOUNT_SAVE_FAILED, signedOut: false };
    }
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
    if (status.pendingSaveFailed && !hasSpecificActionableMessage) {
      // #967 typed failure category: same known-only exception as the
      // local-only case above — see its comment.
      if (status.pendingSaveFailureKind === "server-capability-missing") {
        return {
          tone: "calm",
          message: ACCOUNT_NEEDS_APP_UPDATE,
          signedOut: false,
        };
      }
      return {
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      };
    }
    return {
      tone: "calm",
      message: status.message ?? SOME_WORK_ON_THIS_DEVICE,
      signedOut: false,
    };
  }

  return null;
}
