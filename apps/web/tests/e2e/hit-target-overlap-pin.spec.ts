import { expect, test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import {
  PINNED_SURFACES,
  preparePinnedSurfaces,
  VIEWPORTS,
  type ViewportId,
} from "./helpers/pinnedSurfaces";
import { scanInteractiveGeometry } from "./helpers/interactiveGeometry";

/**
 * Final UX Loop C5 (Target Cards 8+9) — HIT-TARGET + OVERLAP PIN
 * ================================================================
 * docs/design/ux-audit-2026-07-26-fable.md measured "zero interactive
 * targets under 44x44 and zero overlapping controls" across every mobile
 * surface it drove, and named exactly two sub-44px desktop exceptions on the
 * moments surfaces (`Skip to stage content` at 32x16, and the Start moment's
 * pending-triage line at 24px tall — both since fixed or unreachable through
 * this pin's surface list; neither reproduces here). This file is the
 * automated, permanent proof that stays true: it re-measures every reachable
 * signed-out/local-mode surface (see helpers/pinnedSurfaces.ts) at both of
 * the audit's own viewports (1440x1000, 390x844) using the audit's own
 * method (helpers/interactiveGeometry.ts — getBoundingClientRect filtered by
 * elementFromPoint hit-testing) and pins what it finds.
 *
 * THE RATCHET RULE (mirrors apps/web/src/__tests__/plainLanguageGuard.test.ts)
 * -----------------------------------------------------------------------
 * Most surfaces in BASELINE below read 0 violations for both hit-target and
 * overlap — that is the real, reproducible floor this pin defends: any PR
 * that pushes one of those surfaces off zero fails immediately, on this
 * file, in CI.
 *
 * A few surfaces are NOT yet at zero, and are pinned at their honest
 * measured count instead of a wishful 0:
 *   - `login` (both viewports): the shadcn Input/Button default height is
 *     40px, not 44 — three controls (email, password, Sign in) on the
 *     pre-account sign-in door. Pre-existing, not introduced by this lane.
 *   - `settings-areas` (both viewports): the legacy AdminShell surface has
 *     accumulated 40px controls (tab links, color swatches, area actions) —
 *     23 on desktop, 10 on mobile (fewer because mobile collapses some rows
 *     out of the layout, not because they're bigger).
 *   - `onboarding-day` (both viewports): the inline "connect Google Calendar
 *     in Settings" prose link (OnboardingRitual.tsx) is a real 15px-tall
 *     hyperlink inside a sentence. THIS IS A FINDING BY THIS PIN'S OWN SCAN,
 *     not in the audit's text — the audit's manual pass named only the two
 *     moments-surface exceptions above and did not flag this link, the same
 *     way plainLanguageGuard's "Slice F" found strings a manual inventory
 *     missed. Recorded here rather than silently widening the selector to
 *     avoid it.
 *
 * Every one of those is PRE-EXISTING debt, not something this lane
 * introduced, and none is in this lane's two named residuals (capture
 * overlay button chrome, mobile hero copy — both fixed elsewhere in this
 * PR). Fixing them is legitimate follow-up work, tracked as an
 * AGENT-TODO in the PR body, not silently absorbed into this pin.
 *
 * C2-S6 (#687): `calendar` / `health` / `areas` (the legacy routes,
 * including the 20px-wide `areas` mobile chip debt named above in an earlier
 * revision of this comment) retired as pinned surfaces, replaced 1:1 by
 * `review-sheet` / `health-sheet` / `areas-sheet` — measured 0 sub-44px
 * targets and 0 overlaps on both viewports before the swap landed, so the
 * old `areas` mobile debt did not carry forward (the moments-native
 * AreasSheet's chips are not the legacy 20px-wide ones). Total drops
 * 45 -> 41 (the 4 that leave are exactly the old `areas` mobile row).
 *
 * Two assertions make it a ratchet, same mechanism as plainLanguageGuard:
 *   1. Per-surface, per-viewport counts are asserted with STRICT EQUALITY,
 *      not `<=`. A regression (count goes up) fails immediately. A genuine
 *      fix (count goes down) also fails immediately — forcing whoever fixed
 *      it to lower the constant here in the same diff, which is what makes
 *      the improvement visible and permanent instead of quietly reopening
 *      headroom for a future regression.
 *   2. The grand totals (`TOTAL_SUB_MIN_PINNED`, `TOTAL_OVERLAPS_PINNED`) are
 *      asserted against the sum of the per-surface table, so the table and
 *      the ceiling can never drift apart silently.
 */

interface SurfaceBaseline {
  subMin: number;
  overlaps: number;
}

const ZERO: SurfaceBaseline = { subMin: 0, overlaps: 0 };

// Every surface not listed per-viewport below is pinned at ZERO for both
// hit-target and overlap counts — see BASELINE_OVERRIDES.
const BASELINE_OVERRIDES: Record<
  string,
  Partial<Record<ViewportId, SurfaceBaseline>>
> = {
  login: {
    desktop: { subMin: 3, overlaps: 0 },
    mobile: { subMin: 3, overlaps: 0 },
  },
  "settings-areas": {
    desktop: { subMin: 23, overlaps: 0 },
    mobile: { subMin: 10, overlaps: 0 },
  },
  // C2-S11 (#687 accessible-name dispute follow-on): added to
  // pinnedSurfaces.ts to settle whether the per-area "Plan area"/"Review
  // area" links are icon-only (they are not — see that file's own comment).
  // Sharing the surface list with THIS pin means it gets measured here too;
  // the color-swatch buttons and nav links it surfaces are the SAME 40px
  // controls already named for `settings-areas` above, just newly visible
  // because the disclosure that was collapsed there is forced open here —
  // not a new defect, and out of scope for the accessible-name work that
  // added this surface. Recorded honestly rather than silently widened past.
  "settings-areas-disclosures-expanded": {
    desktop: { subMin: 11, overlaps: 0 },
    mobile: { subMin: 10, overlaps: 0 },
  },
  "onboarding-day": {
    desktop: { subMin: 1, overlaps: 0 },
    mobile: { subMin: 1, overlaps: 0 },
  },
};

function baselineFor(
  surfaceId: string,
  viewportId: ViewportId,
): SurfaceBaseline {
  return BASELINE_OVERRIDES[surfaceId]?.[viewportId] ?? ZERO;
}

let totalSubMin = 0;
let totalOverlaps = 0;
for (const surface of PINNED_SURFACES) {
  for (const viewport of VIEWPORTS) {
    const baseline = baselineFor(surface.id, viewport.id);
    totalSubMin += baseline.subMin;
    totalOverlaps += baseline.overlaps;
  }
}

// MAY ONLY EVER SHRINK. Raising either constant is only correct alongside a
// deliberate per-surface entry above explaining the new count, and moving
// either DOWN without deleting/shrinking the matching entry above is a bug
// (assertion 3 below catches that drift).
const TOTAL_SUB_MIN_PINNED = 62;
const TOTAL_OVERLAPS_PINNED = 0;

test.describe("hit-target + overlap pin (Final UX Loop C5)", () => {
  test.beforeEach(async ({ page }) => {
    // HIGH-1 (#670): the E2E dev server has no Supabase env, so any capture
    // flow a surface's goto() touches must run against the deterministic
    // mock-parser stub.
    await stubParseCaptureRoute(page);
    // Same clock pin as the axe pin: the four moment-less surfaces must not
    // measure a different moment depending on when CI runs — see
    // helpers/pinnedSurfaces.ts.
    await preparePinnedSurfaces(page);
  });

  test("the pinned totals match the sum of the per-surface table", () => {
    expect(totalSubMin).toBe(TOTAL_SUB_MIN_PINNED);
    expect(totalOverlaps).toBe(TOTAL_OVERLAPS_PINNED);
  });

  for (const viewport of VIEWPORTS) {
    for (const surface of PINNED_SURFACES) {
      const baseline = baselineFor(surface.id, viewport.id);

      test(`${surface.id} @ ${viewport.id} (${viewport.width}x${viewport.height}): ${baseline.subMin} sub-44px target(s), ${baseline.overlaps} overlap(s)`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await surface.goto(page);

        const result = await scanInteractiveGeometry(page);

        expect(
          result.subMinTargets,
          `sub-44px targets on ${surface.id}@${viewport.id}`,
        ).toHaveLength(baseline.subMin);
        expect(
          result.overlappingPairs,
          `overlapping pairs on ${surface.id}@${viewport.id}`,
        ).toHaveLength(baseline.overlaps);
      });
    }
  }
});
