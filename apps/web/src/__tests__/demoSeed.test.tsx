import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { AppShell } from "../app/components/AppShell";
import {
  createEmptyWorkflowState,
  createInitialWorkflowState,
  createSeededDemoWorkflowState,
  workflowStateHasDemoSeed,
} from "@/lib/workflow";
import { workflowReducer } from "@/lib/workflowContext/reducerCore";

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
    afterEach(() => {
      restoreEnv("NEXT_PUBLIC_DEMO_SEED", ORIGINAL_DEMO_SEED);
      vi.resetModules();
      vi.doUnmock("@/lib/supabase/config");
    });

    it("stays empty when the seed flag is off (the whole suite's default)", () => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "false";
      const state = createInitialWorkflowState();
      expect(state.captureItems).toHaveLength(0);
      expect(state.tasks).toHaveLength(0);
      expect(workflowStateHasDemoSeed(state)).toBe(false);
    });

    it("seeds when unconfigured and the flag is on", () => {
      process.env.NEXT_PUBLIC_DEMO_SEED = "true";
      const state = createInitialWorkflowState();
      expect(state.captureItems.length).toBeGreaterThan(0);
      expect(state.tasks.length).toBeGreaterThan(0);
      expect(workflowStateHasDemoSeed(state)).toBe(true);
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
    });

    afterEach(() => {
      restoreEnv("NEXT_PUBLIC_DEMO_SEED", ORIGINAL_DEMO_SEED);
      restoreEnv("NEXT_PUBLIC_MOMENTS_HOME", ORIGINAL_MOMENTS_HOME);
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

    it("marks the sample data as sample data in the demo banner, in plain language", async () => {
      render(
        <AppShell>
          {await HomePage({ searchParams: Promise.resolve({}) })}
        </AppShell>,
      );

      await screen.findByTestId("today-moments");

      const banner = screen.getByTestId("demo-mode-banner");
      expect(banner).toHaveTextContent(/sample data, not yours/i);
      expect(banner).toHaveTextContent(/Reset this browser/i);
    });
  });
});
