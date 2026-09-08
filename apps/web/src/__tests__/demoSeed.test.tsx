import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { AppShell } from "../app/components/AppShell";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import {
  createEmptyWorkflowState,
  createInitialWorkflowState,
  createSeededDemoWorkflowState,
  markDemoSeedCleared,
  workflowStateHasDemoSeed,
} from "@/lib/workflow";
import {
  STORAGE_KEY,
  workflowReducer,
} from "@/lib/workflowContext/reducerCore";
import { buildCloseVM } from "@/app/components/moments/momentsViewModel/close";
import { ReviewSheet } from "@/app/components/moments/ReviewSheet";
import { shouldShowOnboarding } from "@/lib/onboarding/onboarding";

const navigationMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: navigationMock.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

/**
 * #687 demo-seed (owner 2026-08-30, judge environment) — a fresh-eyes judge
 * reaches only the unconfigured (no Supabase) demo fallback, so it must show
 * a realistic sample instead of an empty shell. `src/setupTests.ts` turns
 * the seed OFF for the whole suite (measured: leaving it on by default broke
 * 23 test files that assert on the pre-existing empty initial state) — this
 * file is where it opts back in for its own tests only.
 */

const ORIGINAL_DEMO_SEED = process.env.NEXT_PUBLIC_DEMO_SEED;
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe("demo seed data (#687)", () => {
  describe("createInitialWorkflowState gating", () => {
    beforeEach(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });

    afterEach(() => {
      restoreEnv("NEXT_PUBLIC_DEMO_SEED", ORIGINAL_DEMO_SEED);
      vi.resetModules();
      vi.doUnmock("@/lib/supabase/config");
      window.sessionStorage.clear();
      window.localStorage.clear();
    });

    it("stays empty when the seed flag is off (the whole suite's default)", () => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "false";
      const state = createInitialWorkflowState();
      expect(state.captureItems).toHaveLength(0);
      expect(state.tasks).toHaveLength(0);
      expect(workflowStateHasDemoSeed(state)).toBe(false);
    });

    it("seeds when unconfigured and the flag is on, for a genuinely fresh tab", () => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "true";
      const state = createInitialWorkflowState();
      expect(state.captureItems.length).toBeGreaterThan(0);
      expect(state.tasks.length).toBeGreaterThan(0);
      expect(workflowStateHasDemoSeed(state)).toBe(true);
    });

    // Independent verifier round 1 finding 2: "Reset this browser" writes a
    // `localStorage` marker (`resetWorkflow`, WorkflowContext.tsx), which
    // must survive into a brand-new tab — simulated here as a fresh
    // `createInitialWorkflowState()` call with clean `sessionStorage` (a new
    // tab has none) but the SAME `localStorage` (shared by the browser).
    it("stays empty in a simulated new tab after 'Reset this browser' (localStorage marker survives, per finding 2)", () => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "true";

      // Before any reset, a fresh tab seeds normally.
      expect(workflowStateHasDemoSeed(createInitialWorkflowState())).toBe(true);

      markDemoSeedCleared();
      window.sessionStorage.clear(); // "new tab": no per-tab snapshot

      const newTabState = createInitialWorkflowState();
      expect(workflowStateHasDemoSeed(newTabState)).toBe(false);
      expect(newTabState).toEqual(createEmptyWorkflowState());
    });

    // Independent verifier round 1 finding 4 (hydration race): the
    // seed-or-not decision must be made SYNCHRONOUSLY inside the same call
    // that produces the first render, not left for a later effect to
    // correct — otherwise a fast reader (or a measurement tool) can observe
    // the wrong answer between the two. Simulates the e2e no-sample seam
    // (`tests/e2e/helpers/pinnedSurfaces.ts`'s `seedNoSampleWorkflowState`):
    // a `sessionStorage` snapshot already exists for this tab BEFORE
    // `createInitialWorkflowState` is ever called — same as
    // `page.addInitScript` writing it before any page script runs. Repeated
    // (not just called once) because a race is exactly the kind of bug a
    // single passing call cannot rule out.
    it("never seeds when a sessionStorage snapshot already exists for this tab (no hydration-race window), repeated", () => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "true";
      const STORAGE_KEY = "lifeos.phase2.workflow";

      for (let i = 0; i < 5; i += 1) {
        window.sessionStorage.clear();
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(createEmptyWorkflowState()),
        );

        const state = createInitialWorkflowState();
        expect(workflowStateHasDemoSeed(state)).toBe(false);
      }
    });
  });

  describe("reducer 'reset' always lands on the genuinely-empty shape", () => {
    it("clears every seeded row even though the seed itself is non-empty", () => {
      const seeded = createSeededDemoWorkflowState();
      expect(workflowStateHasDemoSeed(seeded)).toBe(true);

      const afterReset = workflowReducer(seeded, { type: "reset" });

      expect(workflowStateHasDemoSeed(afterReset)).toBe(false);
      expect(afterReset.captureItems).toHaveLength(0);
      expect(afterReset.taskDrafts).toHaveLength(0);
      expect(afterReset.tasks).toHaveLength(0);
      expect(afterReset.calendarBlocks).toHaveLength(0);
      expect(afterReset.timeBlockProposals).toHaveLength(0);
      expect(afterReset.reviewLog).toHaveLength(0);
      // Areas and health checks are structural, not sample content — reset
      // must not remove the areas a person may have been using.
      expect(afterReset.areas.length).toBeGreaterThan(0);
      expect(afterReset).toEqual(createEmptyWorkflowState());
    });
  });

  describe("first visit in demo mode (RTL, red on main before #687 — the app was an empty shell)", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "true";
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
      window.sessionStorage.clear();
      window.localStorage.clear();
    });

    afterEach(() => {
      restoreEnv("NEXT_PUBLIC_DEMO_SEED", ORIGINAL_DEMO_SEED);
      restoreEnv("NEXT_PUBLIC_MOMENTS_HOME", ORIGINAL_MOMENTS_HOME);
      window.sessionStorage.clear();
      window.localStorage.clear();
    });

    it("renders the seeded captures and tasks on the moments home instead of an empty pipeline", async () => {
      render(
        <AppShell>
          {await HomePage({ searchParams: Promise.resolve({}) })}
        </AppShell>,
      );

      await screen.findByTestId("today-moments");

      // The default moment depends on time of day (Close in the evening) —
      // the Pipeline rail lives on Start, so switch there explicitly.
      fireEvent.click(await screen.findByTestId("moment-switcher-start"));

      // The default view scopes to the first area (area-main-job). Its one
      // unsorted ("new") capture keeps the Capture pipeline stage non-zero;
      // its one pending draft keeps Triage non-zero too. Both testids only
      // render at all once at least one stage is non-zero
      // (PipelineOverview.tsx) — their mere presence already proves the app
      // is not an empty shell.
      expect(
        await screen.findByTestId("pipeline-overview-count-capture"),
      ).toHaveTextContent("1");
      expect(
        screen.getByTestId("pipeline-overview-count-triage"),
      ).toHaveTextContent("1");
    });

    // #974 (merged underneath this branch) rebuilt DemoModeBanner around a
    // hard, measured constraint: ANY added height to this globally-rendered
    // banner drops hit-target-overlap-pin's settings-areas count from 23/10
    // to 11/7 (settings/areas sits at ~0px headroom against the fold at both
    // pinned viewports — see that component's own doc comment). Round 1
    // responded by dropping the sample-data label entirely, which the
    // independent verifier correctly refuted as a truth regression: a judge
    // seeing unlabeled fake data is worse than a shorter banner. Round 2
    // instead SWAPS the one sentence for an equal-or-shorter variant
    // (DemoModeBanner.tsx's own header comment has the byte-count proof) —
    // real DOM-height parity across 320/390/1366 is verified in a real
    // browser by `tests/e2e/demo-mode-banner-signin-link.spec.ts` (jsdom has
    // no real layout engine to measure wrapping with), not here.
    it("labels the seeded sample as sample data, in plain language, without dropping the durable-truth clauses", async () => {
      render(
        <AppShell>
          {await HomePage({ searchParams: Promise.resolve({}) })}
        </AppShell>,
      );

      await screen.findByTestId("today-moments");

      const banner = screen.getByTestId("demo-mode-banner");
      expect(banner).toHaveTextContent(
        "Demo mode — this is sample data. Nothing you do leaves this browser, and clearing its data ends it.",
      );
      // The three claims #737-A falsified must stay absent from BOTH
      // variants — same guard `demoModeBanner.test.tsx` runs on the default.
      const text = banner.textContent ?? "";
      expect(text).not.toMatch(/nothing here is saved/i);
      expect(text).not.toMatch(/only in this tab/i);
      expect(text).not.toMatch(/vanish on reload/i);
    });
  });

  /**
   * Independent verifier round 1 finding 5: the original seed's "win" was a
   * task marked done YESTERDAY, so Close's own "completed today" count
   * (which reads `calendar_blocks` with a completed block on TODAY's local
   * day — `momentsViewModel/close.ts`) stayed at 0, and Review's session
   * list stayed empty because no `executionSessions` were ever seeded at
   * all. Both now have real content: a completed block + session earlier
   * TODAY, tied to the same "done" task.
   */
  describe("Close and Review actually reflect the seeded win (finding 5)", () => {
    it("counts the seeded win in Close's completedToday", () => {
      const state = createSeededDemoWorkflowState();
      const vm = buildCloseVM(state, { now: new Date() });
      expect(vm.completedToday).toBeGreaterThanOrEqual(1);
    });

    it("seeds at least one execution session for Review's session list", () => {
      const state = createSeededDemoWorkflowState();
      expect(state.executionSessions.length).toBeGreaterThan(0);
      expect(
        state.executionSessions.every(
          (session) => session.outcome === "completed",
        ),
      ).toBe(true);
    });
  });

  /**
   * #975 (merged underneath this branch, C3 card 10) moved the setup ritual
   * to its own `/welcome` route, hand-off decided by the same deterministic
   * predicate as before (`shouldShowOnboarding`, lib/onboarding/onboarding.ts):
   * `areaCount === 0 && captureCount === 0`. A seeded first visit must NOT
   * be treated as a brand-new account needing the ritual — decided here as
   * "never": `createSeededDemoWorkflowState`'s `areas` is always the same 4
   * real areas `createEmptyWorkflowState` uses (mockData.ts's `areas`,
   * structural, never emptied by the seed), so `areaCount` is never 0 for
   * EITHER shape, seeded or not. The predicate was never touched by this
   * PR — this pins that the seed's own content (captures, tasks, drafts)
   * cannot accidentally satisfy it either, now or if `shouldShowOnboarding`
   * is later widened to look at more than just areas.
   */
  describe("the seeded state never satisfies the onboarding zero-state predicate (#975 /welcome interaction)", () => {
    it("a seeded first visit is never eligible for the onboarding ritual", () => {
      const seeded = createSeededDemoWorkflowState();
      const eligible = shouldShowOnboarding({
        areaCount: seeded.areas.length,
        captureCount: seeded.captureItems.length,
        completed: false,
        rerunRequested: false,
      });
      expect(eligible).toBe(false);
    });

    it("a genuinely empty (post-reset) state is STILL not eligible, because areas are structural, not sample content", () => {
      const empty = createEmptyWorkflowState();
      const eligible = shouldShowOnboarding({
        areaCount: empty.areas.length,
        captureCount: empty.captureItems.length,
        completed: false,
        rerunRequested: false,
      });
      // Documents the existing (pre-#687) behavior this PR does not change:
      // the demo fallback always carries 4 real areas, so the zero-state
      // ritual has never fired in demo mode, seeded or not — a real account
      // is what starts with genuinely zero areas.
      expect(eligible).toBe(false);
    });
  });

  /**
   * Independent verifier round 2 finding 5: `buildDemoSeedExecutionSessions`
   * returning a row proves nothing about what a judge actually sees —
   * `buildCockpitViewModel` (lib/cockpit/viewModel.ts) scopes Review's
   * session list to the CURRENTLY SELECTED area, which defaults to
   * `areas[0].id`. The seeded session was in `area-volunteer`; moved to
   * `area-main-job` (mockData.ts) to match. This test renders the real
   * Review sheet and reads the DOM, not the state shape.
   */
  describe("Review actually renders the seeded session in the DOM (round 2 finding 5)", () => {
    beforeEach(() => {
      window.sessionStorage.clear();
    });

    afterEach(() => {
      window.sessionStorage.clear();
    });

    // Mirrors ReviewSheet.test.tsx's own `renderSheet` idiom: pre-populate
    // the reducer's sessionStorage snapshot (STORAGE_KEY), render
    // WorkflowProvider + ReviewSheet directly — not through
    // AppShell/HomePage's `?sheet=review` deep link, which this file's own
    // `useSearchParams` mock (a fixed `next/navigation` stub, needed by the
    // OTHER tests in this file) always returns empty for.
    it("shows the seeded session instead of the empty fallback", async () => {
      const seeded = createSeededDemoWorkflowState();
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

      render(
        <WorkflowProvider>
          <ReviewSheet
            open
            onClose={vi.fn()}
            selectedAreaId="area-main-job"
            now={new Date()}
            dayClose={null}
            onCloseDay={vi.fn()}
          />
        </WorkflowProvider>,
      );

      await screen.findByTestId("review-sheet");
      expect(screen.queryByTestId("review-sheet-sessions-empty")).toBeNull();
      const sessionsList = await screen.findByTestId("review-sheet-sessions");
      expect(sessionsList).toHaveTextContent(
        "Redline signed off by the client.",
      );
    });
  });
});
