import { fireEvent, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { latestActivityTimestamp } from "@/lib/reEntry/detect";
import { TodayMoments } from "@/app/components/moments/TodayMoments";
import type { TodayMomentsProps } from "@/app/components/moments/TodayMoments";
import { resetTodayMomentsMountTrackingForTests } from "@/app/components/moments/deepLink";

/**
 * Shared fixtures for TodayMoments.*.test.tsx — split from the single
 * 2,600+-line TodayMoments.test.tsx (see that file and its siblings in
 * apps/web/src/app/components/moments/). `vi.mock`/`vi.hoisted` calls are
 * hoisted per test file by Vitest and cannot live in a shared module, so
 * every split file still declares its own `fake-indexeddb/auto` import,
 * `next/navigation` mock, and `@/lib/reEntry/briefView` mock — this module
 * only carries what genuinely can be shared: the fixed clock, the render
 * helper, and the WorkflowContext seed bridges reused by more than one split
 * file. Bridges used by exactly one split file (DriftSeedBridge,
 * BacklogRecoverySeedBridge) stay local to that file instead of living here.
 */

export const FIXED_NOW = new Date("2026-07-05T15:00:00.000Z");

/**
 * C2-S13 (#687 round-7): `deepLink.ts` tracks "has TodayMoments mounted
 * before in this tab" with a MODULE-scope flag, not React state, because it
 * must survive a client-side route change and back (see deepLink.ts's own
 * doc comment on `consumeIsRemount` for the full mechanism). Vitest keeps
 * ONE module instance loaded for every `it()` in a file, so without a reset
 * the flag reads `true` (a "remount", cross-checking the live URL instead of
 * trusting a fresh `deepLink` prop) for every test after the first real
 * TodayMoments mount in that file — and `window.history` is the same class
 * of file-lifetime leak. Every split file that calls `renderToday` (or
 * mounts `<TodayMoments>` directly) more than once needs this in its OWN
 * file-level `afterEach` — Vitest hooks cannot be shared across files, only
 * the reset logic itself can, which is why it lives here once instead of
 * being hand-copied into each split file.
 */
export function resetTodayMomentsMountTracking(): void {
  window.history.replaceState(null, "", "/");
  resetTodayMomentsMountTrackingForTests();
}

/**
 * Test-only bridge that drives a real capture -> mock parse -> accept
 * journey through WorkflowContext, so the Start moment has a first move to
 * show. The default demo WorkflowProvider state seeds areas but no tasks,
 * so journeys that need a first move must create one through real context
 * actions rather than mocking WorkflowContext internals.
 */
/**
 * #703: capture no longer parses — a seeded capture only becomes a pending
 * draft once something taps Sort. This stands in for that tap, driving the
 * same `sortCaptureIntoDrafts` the Sort button calls, so these journeys still
 * exercise the real capture -> sort -> draft path. One sort runs at a time
 * (FR-026: no parse queue), so it re-checks whenever `captureParse` settles.
 */
export function useAutoSortSeededCaptures() {
  const { state, captureParse, sortCaptureIntoDrafts } = useWorkflow();
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (captureParse.phase === "parsing") return;
    const next = state.captureItems.find(
      (item) => !attempted.current.has(item.id),
    );
    if (!next) return;
    attempted.current.add(next.id);
    sortCaptureIntoDrafts(next.id);
  }, [state.captureItems, captureParse, sortCaptureIntoDrafts]);
}

export function TaskSeedBridge() {
  const { state, submitCaptureText, acceptTaskDraft } = useWorkflow();
  useAutoSortSeededCaptures();
  const draft = state.taskDrafts[0];

  return (
    <div>
      <span data-testid="seed-draft-count">{state.taskDrafts.length}</span>
      <button
        type="button"
        data-testid="seed-submit"
        onClick={() =>
          submitCaptureText("Draft the proposal for the client", null)
        }
      >
        Seed capture
      </button>
      <button
        type="button"
        data-testid="seed-accept"
        disabled={!draft}
        onClick={() => draft && acceptTaskDraft(draft.id)}
      >
        Seed accept
      </button>
    </div>
  );
}

/**
 * Presses the `c` capture shortcut exactly once. The mount contract is that
 * the page must be ready to receive a user keypress once it is interactive;
 * retrying here would hide a dropped shortcut during cold mount.
 */
export function pressCaptureShortcut(): void {
  fireEvent.keyDown(window, { key: "c" });
}

export function renderToday(props: Partial<TodayMomentsProps> = {}) {
  return render(
    <WorkflowProvider>
      <TaskSeedBridge />
      <TodayMoments now={FIXED_NOW} {...props} />
    </WorkflowProvider>,
  );
}

/**
 * FR-028 packet F-G2c integration coverage: the return ritual as a real
 * moment state, driven through WorkflowContext (not a hand-built state) so
 * it proves the ritual actually wires into the live provider. A single
 * seeded active task gives both an absence signal (its created_at becomes
 * `latestActivityTimestamp`) and a recovery candidate (the stalest open
 * task) in one journey — `now` is derived from the rendered state's
 * timestamp, never hardcoded, per the packet's floor-plan rule.
 */
export const RE_ENTRY_ABSENCE_DAYS = 4;

export function ReEntrySeedBridge({
  onState,
}: {
  onState: (lastActivityAt: string | null) => void;
}) {
  const { state, submitCaptureText, acceptTaskDraft } = useWorkflow();
  useAutoSortSeededCaptures();
  const draft = state.taskDrafts[0];

  onState(latestActivityTimestamp(state));

  return (
    <div>
      <span data-testid="re-entry-seed-draft-count">
        {state.taskDrafts.length}
      </span>
      <button
        type="button"
        data-testid="re-entry-seed-submit"
        onClick={() => submitCaptureText("Draft the client proposal", null)}
      >
        Seed capture
      </button>
      <button
        type="button"
        data-testid="re-entry-seed-accept"
        disabled={!draft}
        onClick={() => draft && acceptTaskDraft(draft.id)}
      >
        Seed accept
      </button>
    </div>
  );
}
