// Regression guard for the jsdom-teardown race: `WorkflowProvider`'s mount
// effect fires several un-awaited refreshes (`refreshUnsyncedCount`,
// `refreshJournalledDurableState`, `refreshPendingLocalChanges`, and
// `syncPersistedWorkflowRows`'s own drains) that read IndexedDB / the mocked
// account layer. None of them were cancelled on unmount, so a provider torn
// down before those reads settle left their continuations to call a state
// setter later — and `setSyncStatus` (etc.) reaching into React's scheduler
// touches `window`.
//
// In a real browser `window` never disappears, so this never crashed a user.
// It reproduced in CI specifically because vitest tears down the WHOLE jsdom
// environment (deletes the `window` global) between test files while a
// slower drain from a PREVIOUS test's mount was still in flight — see
// PR #894's CI run and the main-red-guard revert at 79996dba, both citing
// `ReferenceError: window is not defined` at this file's
// `refreshPendingLocalChanges`. This test reproduces that exact mechanism
// deterministically (no timing luck required): mount, unmount immediately
// (real IndexedDB reads cannot have settled synchronously, so their
// continuations are guaranteed still pending), then simulate the
// environment teardown by deleting `window` before flushing the pending
// work.
import "fake-indexeddb/auto";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";

describe("WorkflowContext mount-time refreshes survive an unmount that races environment teardown", () => {
  it("raises no unhandled rejection when window disappears while a post-unmount refresh is still pending", async () => {
    const { unmount } = render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    // Unmount synchronously, before any of the mount effect's IndexedDB
    // reads (`refreshUnsyncedCount`, `refreshJournalledDurableState`,
    // `refreshPendingLocalChanges`, `syncPersistedWorkflowRows`) can have
    // resolved — even fake IndexedDB never settles in the same tick it was
    // asked to open.
    unmount();

    const rejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    const realWindow = globalThis.window;
    try {
      // This is exactly what vitest's jsdom environment teardown does
      // between test files — the bare `window` identifier stops resolving,
      // which is what turns a dropped state update into a thrown
      // ReferenceError inside React's scheduler.
      // @ts-expect-error -- deliberately simulating environment teardown
      delete globalThis.window;

      // Flush macrotasks/microtasks so every dangling mount-time promise
      // gets a chance to settle and its continuation (if unguarded) to run.
      for (let tick = 0; tick < 25; tick += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      globalThis.window = realWindow;
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(rejections).toEqual([]);
  });
});
