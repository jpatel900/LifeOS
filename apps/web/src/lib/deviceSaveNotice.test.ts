import { describe, expect, it } from "vitest";
import { resolveDeviceSaveNotice } from "./deviceSaveNotice";
import {
  ACCOUNT_NEEDS_APP_UPDATE,
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_UNREACHABLE_NOW,
  DEVICE_STORAGE_BLOCKED,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  SOME_WORK_ON_THIS_DEVICE,
  savedOnThisDeviceAndSendingBanner,
} from "./statusVocabulary";
import type { WorkflowSyncStatus } from "./workflowContext/types";

function status(
  overrides: Partial<WorkflowSyncStatus> = {},
): WorkflowSyncStatus {
  return {
    storage: "available",
    account: "synced",
    message: null,
    pendingLocalChanges: false,
    ...overrides,
  };
}

describe("resolveDeviceSaveNotice (#734)", () => {
  it("says nothing once everything has reached the account", () => {
    expect(resolveDeviceSaveNotice(status())).toBeNull();
  });

  it("says nothing while LifeOS is still looking", () => {
    expect(resolveDeviceSaveNotice(status({ account: "checking" }))).toBeNull();
  });

  it("stays calm when nobody is signed in, and offers the door", () => {
    const notice = resolveDeviceSaveNotice(
      status({
        account: "local-only",
        message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
        pendingLocalChanges: true,
        signedOut: true,
      }),
    );

    expect(notice).toEqual({
      tone: "calm",
      message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
      signedOut: true,
    });
  });

  it("falls back to the signed-out sentence when no message is set", () => {
    const notice = resolveDeviceSaveNotice(
      status({ account: "local-only", signedOut: true }),
    );

    expect(notice?.message).toBe(SIGNED_OUT_SAVING_ON_THIS_DEVICE);
  });

  it("stays calm when the account simply can't be reached", () => {
    const notice = resolveDeviceSaveNotice(
      status({
        account: "local-only",
        message: ACCOUNT_UNREACHABLE_NOW,
        pendingLocalChanges: true,
      }),
    );

    expect(notice).toEqual({
      tone: "calm",
      message: ACCOUNT_UNREACHABLE_NOW,
      signedOut: false,
    });
  });

  it("stays calm when the account is reached but some work stayed here", () => {
    const notice = resolveDeviceSaveNotice(
      status({
        account: "synced",
        message: SOME_WORK_ON_THIS_DEVICE,
        pendingLocalChanges: true,
      }),
    );

    expect(notice).toEqual({
      tone: "calm",
      message: SOME_WORK_ON_THIS_DEVICE,
      signedOut: false,
    });
  });

  it("raises alarm only when a save actually failed", () => {
    const notice = resolveDeviceSaveNotice(
      status({
        account: "sync-error",
        message: ACCOUNT_SAVE_FAILED,
        pendingLocalChanges: true,
      }),
    );

    expect(notice).toEqual({
      tone: "alarm",
      message: ACCOUNT_SAVE_FAILED,
      signedOut: false,
    });
  });

  it("raises alarm when the browser refuses to hold work on this device", () => {
    const notice = resolveDeviceSaveNotice(
      status({ storage: "blocked", account: "local-only", signedOut: true }),
    );

    expect(notice).toEqual({
      tone: "alarm",
      message: DEVICE_STORAGE_BLOCKED,
      signedOut: false,
    });
  });

  it("never dresses an ordinary state as a failure", () => {
    const ordinary: WorkflowSyncStatus[] = [
      status({ account: "local-only", signedOut: true }),
      status({ account: "local-only", message: ACCOUNT_UNREACHABLE_NOW }),
      status({ account: "synced", pendingLocalChanges: true }),
    ];

    for (const state of ordinary) {
      expect(resolveDeviceSaveNotice(state)?.tone).toBe("calm");
    }
  });

  // #967 visibility: a persisted, durable "this write's last attempt failed"
  // signal must reach the same shared notice both consumers read.
  describe("pendingSaveFailed (#967)", () => {
    it("raises alarm when a queued write's last save attempt is known to have failed, even though the account is otherwise reached", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "synced",
          pendingLocalChanges: true,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      });
    });

    it("stays calm for an ordinary queued write with no failed attempt", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "synced",
          pendingLocalChanges: true,
          pendingSaveFailed: false,
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: SOME_WORK_ON_THIS_DEVICE,
        signedOut: false,
      });
    });

    it("says nothing once the failed write is no longer pending (successful drain clears it)", () => {
      // A cleared journal entry means BOTH flags flip together in the real
      // provider (`refreshPendingLocalChanges`, `refreshJournalledDurableState`)
      // — this proves the pure function's own silence-on-resolution half of
      // that: with nothing queued, a stale `pendingSaveFailed: true` alone
      // cannot manufacture a notice.
      const notice = resolveDeviceSaveNotice(
        status({
          account: "synced",
          pendingLocalChanges: false,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toBeNull();
    });

    // #967 root/independent review: `verify967-notice-state.mjs` reproduced
    // the actual resolver staying calm for these two exact local-only
    // shapes, both with a real failed attempt on record. A non-null message
    // is not automatically a specific, actionable one — most of
    // `markLocalOnly`'s callers pass exactly this generic, "will add it as
    // soon as it can" language, and one of them (`savedOnThisDeviceAndSendingBanner`)
    // is the precise misleading promise #967 exists to end.
    it("raises alarm for local-only with the generic ACCOUNT_UNREACHABLE_NOW default, when a save actually failed", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          message: ACCOUNT_UNREACHABLE_NOW,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      });
    });

    it("raises alarm for local-only with a generic per-write 'saved here and sending' banner, when a save actually failed", () => {
      const genericBanner = savedOnThisDeviceAndSendingBanner("Your win");
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          message: genericBanner,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      });
    });

    it("does not override the one genuinely specific actionable message (ACCOUNT_NEEDS_APP_UPDATE) with the generic failed-save sentence", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          message: ACCOUNT_NEEDS_APP_UPDATE,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: ACCOUNT_NEEDS_APP_UPDATE,
        signedOut: false,
      });
    });

    it("stays calm for local-only with no failed attempt, regardless of message", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          message: ACCOUNT_UNREACHABLE_NOW,
          pendingLocalChanges: true,
          pendingSaveFailed: false,
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: ACCOUNT_UNREACHABLE_NOW,
        signedOut: false,
      });
    });

    it("preserves signed-out priority even when a failed attempt is also known", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          signedOut: true,
          message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
        signedOut: true,
      });
    });

    it("preserves device-storage-blocked priority even when a failed attempt is also known", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          storage: "blocked",
          account: "local-only",
          pendingLocalChanges: true,
          pendingSaveFailed: true,
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: DEVICE_STORAGE_BLOCKED,
        signedOut: false,
      });
    });
  });

  // #967 typed failure category: `pendingSaveFailureKind` is a SAFE AGGREGATE
  // across only the currently-failed journal rows (see its doc in
  // `workflowContext/types.ts`). A known-only aggregate gets the same calm,
  // specific `ACCOUNT_NEEDS_APP_UPDATE` treatment as an already-specific
  // message; any mix, any unknown row, or a legacy/absent aggregate must
  // never be blanket-hidden and keeps the generic alarm.
  describe("pendingSaveFailureKind (#967 typed failure category)", () => {
    it("shows the specific app-update message, calm, when every failed row is known server-capability-missing (local-only)", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          message: ACCOUNT_UNREACHABLE_NOW,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "server-capability-missing",
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: ACCOUNT_NEEDS_APP_UPDATE,
        signedOut: false,
      });
    });

    it("shows the specific app-update message, calm, when every failed row is known server-capability-missing (synced, pending local changes)", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "synced",
          message: SOME_WORK_ON_THIS_DEVICE,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "server-capability-missing",
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: ACCOUNT_NEEDS_APP_UPDATE,
        signedOut: false,
      });
    });

    it("keeps the generic alarm for a mixed aggregate (some rows known, at least one not)", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "synced",
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "unknown",
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      });
    });

    it("keeps the generic alarm for an unknown-only aggregate, unchanged from before this field existed", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "unknown",
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      });
    });

    it("treats a legacy or absent aggregate as unknown, not as known-only", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: undefined,
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: ACCOUNT_SAVE_FAILED,
        signedOut: false,
      });
    });

    it("still lets the one genuinely specific actionable message win over the known-only branch", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          message: ACCOUNT_NEEDS_APP_UPDATE,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "server-capability-missing",
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: ACCOUNT_NEEDS_APP_UPDATE,
        signedOut: false,
      });
    });

    it("preserves signed-out priority over a known-only aggregate", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          account: "local-only",
          signedOut: true,
          message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "server-capability-missing",
        }),
      );

      expect(notice).toEqual({
        tone: "calm",
        message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
        signedOut: true,
      });
    });

    it("preserves device-storage-blocked priority over a known-only aggregate", () => {
      const notice = resolveDeviceSaveNotice(
        status({
          storage: "blocked",
          account: "local-only",
          pendingLocalChanges: true,
          pendingSaveFailed: true,
          pendingSaveFailureKind: "server-capability-missing",
        }),
      );

      expect(notice).toEqual({
        tone: "alarm",
        message: DEVICE_STORAGE_BLOCKED,
        signedOut: false,
      });
    });
  });
});
