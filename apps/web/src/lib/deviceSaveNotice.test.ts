import { describe, expect, it } from "vitest";
import { resolveDeviceSaveNotice } from "./deviceSaveNotice";
import {
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_UNREACHABLE_NOW,
  DEVICE_STORAGE_BLOCKED,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  SOME_WORK_ON_THIS_DEVICE,
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
});
