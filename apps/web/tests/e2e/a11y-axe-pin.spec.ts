import { expect, test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import {
  PINNED_SURFACES,
  VIEWPORTS,
  type ViewportId,
} from "./helpers/pinnedSurfaces";
import { scanAxeViolationNodes } from "./helpers/axeScan";

/**
 * Final UX Loop C5 (Target Cards 8+9) — AXE (WCAG AA) PIN
 * ========================================================
 * docs/design/ux-audit-2026-07-26-fable.md's accessibility pass was a manual
 * spot-check ("h1s, skip-nav, labels, a proper combobox palette, contrast at
 * AA... the only failing text node found on any route was the `◆` logo glyph
 * at 3.98:1") — real, but not exhaustive: a human sampling representative
 * elements, not an automated sweep of every rendered node. This pin is the
 * automated sweep, driving `@axe-core/playwright` (WCAG 2.0/2.1 A+AA rule
 * set only — see helpers/axeScan.ts for why) across every reachable
 * signed-out/local-mode surface (helpers/pinnedSurfaces.ts), at both of the
 * audit's own viewports.
 *
 * THE RATCHET RULE (mirrors apps/web/src/__tests__/plainLanguageGuard.test.ts
 * and hit-target-overlap-pin.spec.ts — same mechanism, third application)
 * -----------------------------------------------------------------------
 * The legacy cockpit surfaces (`calendar`, `health`, `areas`,
 * `settings-areas`) are genuinely at ZERO AA violations on both viewports —
 * that floor is defended here by strict equality, so any regression on those
 * four surfaces fails immediately.
 *
 * Every moments-native surface and every onboarding step is NOT yet at zero.
 * THIS IS A FINDING OF THIS PIN'S OWN SWEEP, not something the audit's text
 * names — the audit found one bad text node (the logo glyph, which this
 * pin's surface list never reaches — it's cockpit-only chrome). What this
 * sweep found instead, on every affected surface, is the exact same single
 * root cause: `#ffffff` text on a `#6d8bff` primary-accent background
 * measures 3.09:1 against the 4.5:1 AA floor for normal-weight body text
 * (the active moment-switcher tab, the capture-affordance pill's "Capture
 * it" label, and the command palette's matching option row all paint with
 * that pairing). One design-token fix (raising `--primary`'s contrast
 * against white, or switching that text to a darker foreground token) would
 * very likely collapse every non-zero row below to 0 or near it — that is
 * real, valuable, *design* work, and it is out of scope for a pin lane (see
 * the lane contract: this PR's only in-scope fixes are the two named
 * residuals — capture overlay button chrome and the mobile hero copy, both
 * elsewhere in this diff). Recording the honest count now, with the shared
 * root cause named once here instead of un-explained in fifteen rows, is
 * what turns it into a tracked, fixable, un-hideable number instead of an
 * undiscovered one — the AGENT-TODO in the PR body points back to this
 * comment.
 *
 * Two assertions make it a ratchet, identical in shape to
 * hit-target-overlap-pin.spec.ts:
 *   1. Per-surface, per-viewport violation-NODE counts (not rule counts —
 *      see axeScan.ts) are asserted with STRICT EQUALITY. A regression
 *      (count goes up, whether from the known root cause worsening or an
 *      unrelated new rule firing) fails immediately. A fix also fails
 *      immediately, forcing the constant down in the same diff.
 *   2. The grand total (`TOTAL_VIOLATION_NODES_PINNED`) is asserted against
 *      the sum of the per-surface table, so table and ceiling can't drift
 *      apart silently.
 */

const ZERO = 0;

// Every surface not listed per-viewport below is pinned at ZERO violation
// nodes for both viewports — see BASELINE_OVERRIDES.
const BASELINE_OVERRIDES: Record<
  string,
  Partial<Record<ViewportId, number>>
> = {
  // `#ffffff` on `#6d8bff` (3.09:1 measured, 4.5:1 required) — the
  // shared root cause named in the file header above. Node counts differ
  // per surface because which of {moment-switcher tab, capture pill/button,
  // palette option row} the surface actually renders differs, and mobile
  // renders the bottom-navigator instead of the desktop pill (2 nodes
  // there: the active tab + the Capture button, vs. desktop's tab + pill
  // label + bold span = 3).
  login: { desktop: 1, mobile: 1 },
  "start-moment": { desktop: 3, mobile: 2 },
  "flow-moment": { desktop: 3, mobile: 2 },
  "close-moment": { desktop: 3, mobile: 3 },
  "capture-overlay": { desktop: 3, mobile: 2 },
  "triage-sheet": { desktop: 3, mobile: 2 },
  "plan-sheet": { desktop: 3, mobile: 2 },
  "command-palette": { desktop: 4, mobile: 3 },
  "onboarding-areas": { desktop: 3, mobile: 3 },
  "onboarding-day": { desktop: 4, mobile: 4 },
  "onboarding-capture": { desktop: 2, mobile: 2 },
  // `login`'s single node is its own instance of the same #ffffff/#6d8bff
  // pairing on the "Sign in" button — a shadcn Button default-variant
  // control, not the moments primitives above, but the same underlying
  // `--primary` token.
};

function baselineFor(surfaceId: string, viewportId: ViewportId): number {
  return BASELINE_OVERRIDES[surfaceId]?.[viewportId] ?? ZERO;
}

let totalViolationNodes = 0;
for (const surface of PINNED_SURFACES) {
  for (const viewport of VIEWPORTS) {
    totalViolationNodes += baselineFor(surface.id, viewport.id);
  }
}

// MAY ONLY EVER SHRINK. Raising this is only correct alongside a deliberate
// per-surface entry above explaining the new count (assertion 1 below
// catches the table and this constant drifting apart).
const TOTAL_VIOLATION_NODES_PINNED = 58;

test.describe("axe WCAG AA pin (Final UX Loop C5)", () => {
  test.beforeEach(async ({ page }) => {
    // HIGH-1 (#670): the E2E dev server has no Supabase env, so any capture
    // flow a surface's goto() touches must run against the deterministic
    // mock-parser stub.
    await stubParseCaptureRoute(page);
  });

  test("the pinned total matches the sum of the per-surface table", () => {
    expect(totalViolationNodes).toBe(TOTAL_VIOLATION_NODES_PINNED);
  });

  for (const viewport of VIEWPORTS) {
    for (const surface of PINNED_SURFACES) {
      const baseline = baselineFor(surface.id, viewport.id);

      test(`${surface.id} @ ${viewport.id} (${viewport.width}x${viewport.height}): ${baseline} AA violation node(s)`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await surface.goto(page);

        const violations = await scanAxeViolationNodes(page);

        expect(
          violations.map((v) => `${v.rule} :: ${v.target} :: ${v.summary}`),
          `AA violations on ${surface.id}@${viewport.id}`,
        ).toHaveLength(baseline);
      });
    }
  }
});
