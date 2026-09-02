import { expect, test } from "@playwright/test";
import { PINNED_SURFACES, VIEWPORTS } from "./helpers/pinnedSurfaces";
import { pinMomentPreference } from "./helpers/momentPreference";
import { scanInteractiveGeometry } from "./helpers/interactiveGeometry";
import { scanAxeViolationNodes } from "./helpers/axeScan";

/**
 * #687 demo-seed round 2 (independent verifier finding 4) — THIS file runs
 * against a server started with `NEXT_PUBLIC_DEMO_SEED=true`
 * (`playwright.config.ts`'s "msedge-seeded" project + second `webServer`
 * entry; `scripts/run-playwright-e2e.mjs` spawns the same second server for
 * CI, since that script — not this config's own `webServer` block — is what
 * actually runs the suite there). No `sessionStorage` snapshot is ever
 * injected: every surface below reaches `createSeededDemoWorkflowState`'s
 * REAL output through the REAL app boot path, the same one a judge's
 * browser takes. `demo-seed-pin.spec.ts` (round 1, hand-rolled snapshot,
 * `seed-pin-*` ids, missing families — captureItems/tasks only) is deleted,
 * not kept alongside this one; a second, thinner truth would only invite
 * drift between what it asserts and what a judge actually sees.
 *
 * TIMING: SSR always renders the empty shape (no `window` on the server —
 * `createInitialWorkflowState`, lib/workflow/shared.ts); only the CLIENT's
 * hydration render can know whether to seed, and that happens some
 * measurable time after the server's HTML paints. Scanning before hydration
 * settles would silently examine the pre-seed empty DOM — a check that
 * examines nothing, exactly the round-1 finding. Every surface below waits
 * for `[data-testid="today-moments"][data-demo-seeded="true"]`
 * (TodayMoments.tsx) before either scan runs; that attribute is written by
 * the SAME render that decides seeded-vs-empty, so waiting for it means
 * waiting for exactly the moment that matters, not an arbitrary sleep.
 *
 * SCOPE: the moment-native surfaces the seed can actually reach content on
 * — not `login`/`not-found`/`settings-areas`/`onboarding-*`, which render a
 * different page entirely (no `today-moments` node to seed) and are already
 * covered, unaffected by the seed, by the non-seeded pins.
 */
const SEEDED_MOMENT_SURFACE_IDS = [
  "start-moment",
  "flow-moment",
  "close-moment",
  "capture-overlay",
  "triage-sheet",
  "plan-sheet",
  "command-palette",
  "review-sheet",
  "health-sheet",
  "areas-sheet",
] as const;

const SEEDED_MOMENT_SURFACES = PINNED_SURFACES.filter((surface) =>
  (SEEDED_MOMENT_SURFACE_IDS as readonly string[]).includes(surface.id),
);

test.describe("demo seed additive pin — hit-target + axe over the REAL seeded state (#687 round 2, finding 4)", () => {
  for (const viewport of VIEWPORTS) {
    for (const surface of SEEDED_MOMENT_SURFACES) {
      test(`${surface.id} @ ${viewport.id} (${viewport.width}x${viewport.height}): 0 sub-44px target(s), 0 overlap(s), 0 AA violation node(s), seeded`, async ({
        page,
      }) => {
        await pinMomentPreference(page, "start");
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await surface.goto(page);

        // The settled-seed marker — see the file header for why this is the
        // wait that actually matters.
        await expect(
          page.locator(
            '[data-testid="today-moments"][data-demo-seeded="true"]',
          ),
        ).toBeAttached({ timeout: 15_000 });

        const geometry = await scanInteractiveGeometry(page);
        expect(
          geometry.subMinTargets,
          `sub-44px targets on seeded ${surface.id}@${viewport.id}: ${JSON.stringify(geometry.subMinTargets)}`,
        ).toHaveLength(0);
        expect(
          geometry.overlappingPairs,
          `overlapping pairs on seeded ${surface.id}@${viewport.id}: ${JSON.stringify(geometry.overlappingPairs)}`,
        ).toHaveLength(0);

        const violations = await scanAxeViolationNodes(page);
        expect(
          violations.map((v) => `${v.rule} :: ${v.target} :: ${v.summary}`),
          `AA violations on seeded ${surface.id}@${viewport.id}`,
        ).toHaveLength(0);
      });
    }
  }
});
