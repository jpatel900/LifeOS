import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import { seedNoSampleWorkflowState } from "./helpers/pinnedSurfaces";

/**
 * #1011 — TEXT CONTAINMENT PIN (Final UX Loop C5)
 * ================================================
 * `hit-target-overlap-pin.spec.ts` and `hit-targets-390.spec.ts` already
 * prove every reachable control is >=44x44 CSS px and none overlap. Neither
 * one caught this bug, because both measure the CONTROL's own box against
 * the 44px floor and against its neighbors — never the rendered TEXT inside
 * the control against that same box. A control can pass both existing pins
 * (>=44px box, zero overlap with siblings) while its own label paints past
 * its own edges. That gap is what shipped: the mobile Capture button's box
 * shrank to 48.27px while its "Capture" label rendered at 60.25px, and
 * neither existing pin has an assertion shaped to notice.
 *
 * `hit-targets-390.spec.ts`'s own `assertNoHorizontalOverflow` helper is
 * insufficient for the same reason the issue names explicitly: the document
 * never scrolls (`scrollWidth` stays at `clientWidth`) because the escaping
 * text sits inside a `position: fixed` bar, whose overflow does not extend
 * page-level scrollable overflow. Page-fit alone is not proof of
 * control-fit.
 *
 * This file adds the missing assertion: the rendered text range's bounding
 * box must sit inside its control's bounding box (small tolerance for
 * sub-pixel antialiasing), at every width the issue names (320/384/390) plus
 * desktop.
 */

async function textContainedInBox(
  page: Page,
  testId: string,
): Promise<{ contained: boolean; box: DOMRect; text: DOMRect }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing element: ${id}`);
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const EPS = 0.5; // sub-pixel antialiasing tolerance
    const contained =
      text.left >= box.left - EPS &&
      text.right <= box.right + EPS &&
      text.top >= box.top - EPS &&
      text.bottom <= box.bottom + EPS;
    return {
      contained,
      box: box.toJSON(),
      text: text.toJSON(),
    };
  }, testId) as unknown as Promise<{
    contained: boolean;
    box: DOMRect;
    text: DOMRect;
  }>;
}

const MOBILE_WIDTHS = [320, 384, 390] as const;

test.describe("mobile control label containment (#1011)", () => {
  test.beforeEach(async ({ page }) => {
    await stubParseCaptureRoute(page);
    await seedNoSampleWorkflowState(page);
    await pinMomentPreference(page, "start");
  });

  for (const width of MOBILE_WIDTHS) {
    test(`Capture button label stays inside its own control at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 824 });
      await page.goto("/");
      await expect(page.getByTestId("bottom-navigator-capture")).toBeVisible();

      const result = await textContainedInBox(page, "bottom-navigator-capture");
      expect(
        result.contained,
        `Capture label ${JSON.stringify(result.text)} must fit inside button ${JSON.stringify(result.box)} at ${width}px`,
      ).toBe(true);
    });
  }

  test("Capture control is not rendered at desktop (band is sm:hidden, no containment claim applies)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    // N/A by design: BottomNavigator is `sm:hidden` — desktop uses the
    // header's own CaptureAffordance, unaffected by this fix (different
    // component, not in this issue's manifest).
    await expect(
      page.getByTestId("bottom-navigator-capture"),
    ).not.toBeVisible();
  });

  test("no interactive-control overlap is introduced among Capture/More/Settings at 390px", async ({
    page,
  }) => {
    // Regression guard for the `shrink-0` fix itself: widening Capture must
    // not push it into More, even though it now claims its full label width
    // instead of the old (broken) 44px floor.
    await page.setViewportSize({ width: 390, height: 824 });
    await page.goto("/");
    const [captureBox, moreBox] = await Promise.all([
      page.getByTestId("bottom-navigator-capture").boundingBox(),
      page.getByTestId("bottom-navigator-more").boundingBox(),
    ]);
    expect(captureBox).not.toBeNull();
    expect(moreBox).not.toBeNull();
    expect(captureBox!.x + captureBox!.width).toBeLessThanOrEqual(
      moreBox!.x + 0.5,
    );
  });

  for (const width of [384, 390] as const) {
    test(`Capture's disabled label ("Resolving…") does not push Settings past the row at ${width}px`, async ({
      page,
    }) => {
      // `captureDisabled` is modeled on BottomNavigatorProps and fully
      // styled/aria-wired, but TodayMoments.tsx's only call site never
      // passes it (always `false` today) — so this state cannot be reached
      // through any current user flow. That does not make its geometry
      // safe to skip: the prop and its longer "Resolving…" label are part
      // of this component's shipped contract, the first thing a future
      // wiring change would exercise, and the label is 43px wider than
      // "Capture" while the idle row had only ~9px of spare width at 390px
      // post-fix (2.9px at 384px) — enough to have silently re-broken
      // Settings' reachability had this gone unchecked. Synthetic DOM
      // mutation (not a real interaction) is used because no reachable UI
      // path can trigger this state without editing TodayMoments.tsx,
      // which is outside this lane's manifest.
      await page.setViewportSize({ width, height: 824 });
      await page.goto("/");
      await expect(page.getByTestId("bottom-navigator-capture")).toBeVisible();

      const result = await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-testid="bottom-navigator-capture"]',
        );
        const nav = document.querySelector('[data-testid="bottom-navigator"]');
        const settings = document.querySelector(
          '[data-testid="bottom-navigator-settings-link"]',
        );
        if (!btn || !nav || !settings) {
          throw new Error("missing bottom-navigator elements");
        }
        const originalHTML = btn.innerHTML;
        // The label is the button's first text node ("Capture"); swap only
        // that node's text, leaving every class/attribute untouched, so the
        // measured box reflects the real `disabled:` variant's own styling.
        (btn.childNodes[0] as Text).textContent = "Resolving…";
        const navRight = nav.getBoundingClientRect().right;
        const settingsRight = settings.getBoundingClientRect().right;
        btn.innerHTML = originalHTML;
        return { navRight, settingsRight };
      });

      expect(
        result.settingsRight,
        `Settings (right edge ${result.settingsRight}) must stay within the row (right edge ${result.navRight}) even with the longer disabled label at ${width}px`,
      ).toBeLessThanOrEqual(result.navRight + 0.5);
    });
  }
});

/**
 * PLAN DEFERRED-BUTTON CONTAINMENT — BLOCKED, not silently dropped.
 * ==================================================================
 * The issue's manifest names `apps/web/src/app/components/cockpit/PlanView.tsx`
 * for the second symptom ("Move to today" labels extending past their
 * buttons). That component does NOT reproduce it: its button is a raw
 * `<button>` styled only with `HIT_TARGET_MIN` (`min-h-[44px]`, no fixed
 * height) — height is `auto` and grows to fit wrapped text with no overflow.
 * It is also unreachable in the shipping config: `cockpit/PlanView.tsx` only
 * renders under the `NEXT_PUBLIC_MOMENTS_HOME=false` rollback flag (see
 * `hit-targets-390.spec.ts`'s own `test.skip` on every describe that touches
 * it, and `legacyRouteRedirects.test.tsx`), which is off by default.
 *
 * The actual reproducing control is
 * `apps/web/src/app/components/moments/PlanSheet.tsx:1032` — the "Put off
 * for later" list's own "Move to today" `Button` (shared
 * `components/ui/button.tsx`, `size="sm"` -> `h-10` = a FIXED 40px height,
 * `cn`-merged with `HIT_TARGET_MIN`'s `min-h-[44px]` and a local
 * `whitespace-normal` override that lets a long title wrap). Measured live
 * at 384px with a synthetic long title: button box height 44px (`h-10`
 * clamped up by `min-height`, itself a FIXED used value — not `auto` —
 * confirmed via `getComputedStyle`), `scrollHeight` 57px: the wrapped label
 * overflows the box by 13px, the same mechanism the issue describes (12px
 * over a 44px box).
 *
 * `PlanSheet.tsx` is NOT in this lane's allowed edit manifest
 * (`apps/web/src/app/components/moments/BottomNavigator.tsx`,
 * `MomentSwitcher.tsx`, `apps/web/src/app/components/cockpit/PlanView.tsx`,
 * this spec file). Per the lane contract's authority-check clause, a
 * contract premise that conflicts with repo state gets surfaced, not
 * silently reinterpreted or silently built anyway. This test stays
 * `fixme` — ready to arm the moment the manifest is amended to include
 * `PlanSheet.tsx` — rather than either asserting the broken geometry as
 * "passing" or quietly disappearing the finding.
 */
test.fixme("Move to today label stays inside its own control when wrapped (PlanSheet.tsx:1032 — outside this lane's manifest, see comment above)", async () => {});
