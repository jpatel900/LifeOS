import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import { seedNoSampleWorkflowState } from "./helpers/pinnedSurfaces";
import { scanInteractiveGeometry } from "./helpers/interactiveGeometry";
import { scanAxeViolationNodes } from "./helpers/axeScan";

/**
 * #1011 — mobile control label containment (Final UX Loop C5)
 * =============================================================
 * The existing pins (`hit-target-overlap-pin.spec.ts`, `hit-targets-390.spec.ts`)
 * measure a control's own box against the 44px floor and against its
 * neighbors — never the rendered TEXT inside the control against that same
 * box, so a label can paint past its own edges while both pins stay green.
 * This file adds that missing assertion (rendered text range vs. control
 * box), plus the full geometry/a11y/keyboard proof for the surface the fix
 * touches: below 384px, BottomNavigator stacks into two rows (MomentSwitcher's
 * row, then Capture/More/Settings) rather than shrink any label past
 * legibility; 384px+ keeps the original single row.
 *
 * THE CLOCK IS PINNED (same mechanism as close-day-verdict.spec.ts): a spec
 * that reads the wall clock renders differently on a UTC CI runner than on a
 * developer's machine. `setFixedTime` pins the instant; `timezoneId` pins the
 * zone. Fixture timestamps below are derived from that SAME pinned instant,
 * never `Date.now()`, so nothing here depends on the real calendar.
 */

test.use({ timezoneId: "UTC" });

/** Pinned instant: 2026-09-30, a Wednesday, 10:00 UTC. */
const PINNED_NOW = "2026-09-30T10:00:00.000Z";

/**
 * Observed error category, reproduced consistently in this session:
 * `page.clock.setFixedTime` fixes only the browser's JS clock, not the dev
 * server's SSR render, which still uses the real system clock. The console
 * (`page.on("pageerror")`) reports exactly one category from this: "Hydration
 * failed because the server rendered text didn't match the client... Variable
 * input such as `Date.now()`". Next.js dev mode surfaces that as a
 * `<nextjs-portal>` overlay, which sits over this band and blocks
 * `.click()`'s pointer-interception check. Confirmed this does NOT reproduce
 * without the clock pin (prior commits' click-based tests, same surface, ran
 * clean with no clock pin and no overlay). Removing the portal element is
 * test-side DOM cleanup scoped to this one observed category — it is not a
 * runtime/app patch, and it is not a claim that no other error exists; it
 * only removes the specific dev-tooling node this session's own diagnostics
 * identified as the cause of the click-interception failures.
 */
async function dismissDevOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
}

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
    return { contained, box: box.toJSON(), text: text.toJSON() };
  }, testId) as unknown as Promise<{
    contained: boolean;
    box: DOMRect;
    text: DOMRect;
  }>;
}

const MOBILE_WIDTHS = [320, 384, 390] as const;

test.describe("bottom navigator: label containment and geometry (#1011)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(PINNED_NOW));
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

  test("Capture control is not rendered at desktop (band is sm:hidden; the header's separate CaptureAffordance owns desktop)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByTestId("bottom-navigator-capture"),
    ).not.toBeVisible();
  });

  for (const width of MOBILE_WIDTHS) {
    test(`every reachable interactive control meets the 44px floor with no overlaps at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("bottom-navigator")).toBeVisible();

      const result = await scanInteractiveGeometry(page);
      expect(
        result.subMinTargets,
        `sub-44px targets at ${width}px`,
      ).toHaveLength(0);
      expect(
        result.overlappingPairs,
        `overlapping pairs at ${width}px`,
      ).toHaveLength(0);
    });
  }

  const BOTTOM_NAV_CONTROLS = [
    "moment-switcher-bottom-nav-start",
    "moment-switcher-bottom-nav-flow",
    "moment-switcher-bottom-nav-close",
    "bottom-navigator-capture",
    "bottom-navigator-more",
    "bottom-navigator-settings-link",
  ];

  for (const width of MOBILE_WIDTHS) {
    test(`every bottom-navigator control stays fully within the viewport at ${width}px`, async ({
      page,
    }) => {
      // `scanInteractiveGeometry`'s hit-testability filter clamps its probe
      // point to the viewport before calling `elementFromPoint`, so a
      // control that pokes only slightly past the edge can still register
      // as "reachable" there — it is a >=44px-floor/overlap check, not a
      // stays-inside-the-viewport check. This is that check, explicitly.
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("bottom-navigator")).toBeVisible();

      for (const testId of BOTTOM_NAV_CONTROLS) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box, `${testId} at ${width}px`).not.toBeNull();
        expect(
          box!.x,
          `${testId} left edge at ${width}px`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          box!.x + box!.width,
          `${testId} right edge at ${width}px (viewport ${width}px)`,
        ).toBeLessThanOrEqual(width + 0.5);
      }
    });
  }

  test("the 383/384px hinge: stacked below, single row at and above, all controls in-viewport and >=44px", async ({
    page,
  }) => {
    // Pins the exact breakpoint BottomNavigator.tsx's `min-[384px]:` switches
    // on, which MOBILE_WIDTHS (320/384/390) never directly exercises: 320 and
    // 390 are comfortably on either side, so a hinge planted at the wrong
    // pixel would not fail any existing test in this file.
    for (const { width, stacked } of [
      { width: 383, stacked: true },
      { width: 384, stacked: false },
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("bottom-navigator")).toBeVisible();

      const switcherBox = await page
        .getByTestId("moment-switcher-bottom-nav")
        .boundingBox();
      const captureBox = await page
        .getByTestId("bottom-navigator-capture")
        .boundingBox();
      expect(switcherBox, `switcher row at ${width}px`).not.toBeNull();
      expect(captureBox, `capture row at ${width}px`).not.toBeNull();

      if (stacked) {
        expect(
          captureBox!.y,
          `capture must sit on a row below the switcher at ${width}px`,
        ).toBeGreaterThanOrEqual(switcherBox!.y + switcherBox!.height - 0.5);
      } else {
        expect(
          Math.abs(captureBox!.y - switcherBox!.y),
          `capture must share the switcher's row (near-equal top) at ${width}px`,
        ).toBeLessThanOrEqual(2);
      }

      for (const testId of BOTTOM_NAV_CONTROLS) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box, `${testId} at ${width}px`).not.toBeNull();
        expect(
          box!.width,
          `${testId} width floor at ${width}px`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box!.height,
          `${testId} height floor at ${width}px`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box!.x,
          `${testId} left edge at ${width}px`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          box!.x + box!.width,
          `${testId} right edge at ${width}px (viewport ${width}px)`,
        ).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });

  for (const width of MOBILE_WIDTHS) {
    test(`no WCAG 2.1 AA violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByTestId("bottom-navigator")).toBeVisible();

      const violations = await scanAxeViolationNodes(page);
      expect(violations, `axe violations at ${width}px`).toHaveLength(0);
    });
  }

  for (const width of [384, 390] as const) {
    test(`Capture's disabled label ("Resolving…") does not push Settings past the row at ${width}px`, async ({
      page,
    }) => {
      // SYNTHETIC geometry probe only — not real production disabled
      // behavior. `captureDisabled` is modeled on BottomNavigatorProps and
      // fully styled/aria-wired, but TodayMoments.tsx's only call site never
      // passes it, so this state is unreachable through any current UI flow.
      // Worth proving anyway: it is part of the component's shipped
      // contract, and its label is ~43px wider than "Capture" against a
      // single-row margin as thin as 2.9px at 384px. The DOM mutation below
      // swaps only the label text node, leaving every class/attribute from
      // the real `disabled:` variant untouched, then reverts it — no state
      // wiring added.
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

  test("the unsynced-capture badge does not overlap MomentSwitcher's row in the stacked layout (320px)", async ({
    page,
  }) => {
    // Unlike `captureDisabled`, `unsyncedCount` IS wired in production
    // (TodayMoments.tsx passes `unsyncedCaptureCount`), and the two-row
    // layout put MomentSwitcher's row directly above Capture's badge
    // (`absolute -right-1 -top-1` on the button). `unsyncedCaptureCount` is
    // internal WorkflowContext state with no session-storage seed, so this
    // renders the same badge markup the app renders (not a fabricated
    // shape) next to the real button, measures it, and removes it — no
    // state wiring added, same synthetic-probe discipline as above.
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/");
    await expect(page.getByTestId("bottom-navigator-capture")).toBeVisible();

    const gap = await page.evaluate(() => {
      const btn = document.querySelector(
        '[data-testid="bottom-navigator-capture"]',
      );
      const switcher = document.querySelector(
        '[data-testid="moment-switcher-bottom-nav"]',
      );
      if (!btn || !switcher)
        throw new Error("missing bottom-navigator elements");
      const badge = document.createElement("span");
      badge.className =
        "absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[0.7rem] font-semibold leading-none tabular-nums shadow-sm";
      badge.textContent = "3";
      btn.appendChild(badge);
      const badgeRect = badge.getBoundingClientRect();
      const switcherRect = switcher.getBoundingClientRect();
      badge.remove();
      return badgeRect.top - switcherRect.bottom;
    });

    // Known cosmetic tightness, not fixed here: the badge's top edge
    // touches the switcher row's bottom edge at a 0px gap — adjacent, not
    // overlapping. This assertion guards only the hard requirement (no
    // actual overlap); it is not a claim of comfortable spacing.
    expect(
      gap,
      "unsynced-capture badge must not overlap MomentSwitcher's row at 320px",
    ).toBeGreaterThanOrEqual(0);
  });

  test("Capture and More each activate in one interaction, via mouse and via keyboard, at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 824 });
    await page.goto("/");
    await dismissDevOverlay(page);

    const captureDialog = page.getByRole("dialog", {
      name: "Capture a thought",
    });

    await page.getByTestId("bottom-navigator-capture").click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.press("Escape");
    // Closing is an async state update, not instant on the keypress — wait
    // for it to actually complete before the next action, the same
    // async-aware observation used for Settings' Enter navigation above.
    await expect(captureDialog).not.toBeVisible();

    await page.getByTestId("bottom-navigator-capture").focus();
    await page.keyboard.press("Enter");
    await expect(captureDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(captureDialog).not.toBeVisible();

    const palette = page.getByTestId("command-palette");
    await page.getByTestId("bottom-navigator-more").click();
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();

    await page.getByTestId("bottom-navigator-more").focus();
    await page.keyboard.press("Enter");
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();
  });

  test("Settings is Tab-reachable and Enter activates it at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 824 });
    await page.goto("/");
    await dismissDevOverlay(page);

    const settings = page.getByTestId("bottom-navigator-settings-link");

    // Real Tab movement (not `.focus()`) from a known nearby control proves
    // actual tab-order reachability, not just programmatic focusability.
    await page.getByTestId("bottom-navigator-more").focus();
    await page.keyboard.press("Tab");
    await expect(settings).toBeFocused();

    // Router navigation is asynchronous — `toHaveURL` polls under its own
    // bounded timeout, which is the correct way to observe it (an immediate
    // `page.url()` read right after the keypress would race the navigation).
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/areas/);
  });

  test("Settings activates via click at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 824 });
    await page.goto("/");
    await dismissDevOverlay(page);

    await page.getByTestId("bottom-navigator-settings-link").click();
    await expect(page).toHaveURL(/\/settings\/areas/);
  });

  test("MomentSwitcher (bottom-nav) switches moments via click and ArrowRight at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 824 });
    await page.goto("/?moment=start");
    await dismissDevOverlay(page);
    await expect(page.getByTestId("start-moment")).toBeVisible();

    await page.getByTestId("moment-switcher-bottom-nav-flow").click();
    await expect(page.getByTestId("flow-moment")).toBeVisible();

    await page.getByTestId("moment-switcher-bottom-nav-flow").focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByTestId("moment-switcher-bottom-nav-close"),
    ).toBeFocused();
    await expect(page.getByTestId("close-moment")).toBeVisible();
  });

  test("the two-row band (320px) keeps a real clearance margin from content at scroll-end", async ({
    page,
  }) => {
    // Zero-intersection alone can't discriminate the fix (152px padding
    // over the 111px two-row band, ~41px margin) from the bug it exists to
    // catch (112px padding over that SAME 111px band, ~1px margin) — both
    // report zero intersection. A real margin threshold, same shape as
    // moments-home-parity.spec.ts:911's own "keeps a real clearance margin".
    const MIN_CLEARANCE_PX = 20;

    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/?moment=start");
    await expect(page.getByTestId("start-moment-pipeline-rail")).toBeVisible();
    await expect(page.getByTestId("side-rail-areas-card")).toBeVisible();

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );

    const navBox = await page.getByTestId("bottom-navigator").boundingBox();
    const pipelineBox = await page
      .getByTestId("start-moment-pipeline-rail")
      .boundingBox();
    const areasBox = await page
      .getByTestId("side-rail-areas-card")
      .boundingBox();
    expect(navBox).not.toBeNull();
    expect(pipelineBox).not.toBeNull();
    expect(areasBox).not.toBeNull();

    const pipelineClearance =
      navBox!.y - (pipelineBox!.y + pipelineBox!.height);
    const areasClearance = navBox!.y - (areasBox!.y + areasBox!.height);
    expect(
      pipelineClearance,
      `bottom band clearance from the pipeline rail at scroll-end (320px)`,
    ).toBeGreaterThanOrEqual(MIN_CLEARANCE_PX);
    expect(
      areasClearance,
      `bottom band clearance from the areas card at scroll-end (320px)`,
    ).toBeGreaterThanOrEqual(MIN_CLEARANCE_PX);
  });
});

/**
 * Plan deferred button: PlanSheet.tsx's "Move to today" `Button` —
 * `size="sm"` carries a fixed `h-10`, which `min-h-[44px]` (HIT_TARGET_MIN)
 * clamps UP but does not let grow past for a wrapped long title (pre-fix:
 * 44px box, 57px content, label painting past the button). Fixed by adding
 * `h-auto` (tailwind-merge displaces `h-10` in the same utility group), so
 * the box grows with the wrapped label instead.
 */
const PLAN_TASK_ID = "probe-1011-backlog-task";
const PLAN_WORKFLOW_STORAGE_KEY = "lifeos.phase2.workflow";

function planSeedState(nowIso: string) {
  return {
    areas: [
      {
        id: "area-main-job",
        user_id: "00000000-0000-0000-0000-000000000001",
        name: "Main Job",
        color: "#4c80cd",
        created_at: "2026-05-07T00:00:00.000Z",
      },
    ],
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      {
        id: PLAN_TASK_ID,
        user_id: "00000000-0000-0000-0000-000000000001",
        area_id: "area-main-job",
        // Synthetic generic title, long enough to force a 3-line wrap —
        // no private task text or identifiers, per the issue's fixture rule.
        title:
          "Draft the quarterly synthetic planning summary document for review",
        description: null,
        status: "backlog",
        priority_score: 1,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 30,
        estimated_minutes_high: 45,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: "Open the outline doc",
        created_at: nowIso,
        updated_at: nowIso,
        project_id: null,
        source_capture_item_id: null,
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

const PLAN_WIDTHS = [320, 384, 390, 1440] as const; // PlanSheet is not sm-gated; desktop is in scope

test.describe("Plan deferred button: label containment (#1011)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(PINNED_NOW));
    await stubParseCaptureRoute(page);
    // The fixture's created_at/updated_at equal the SAME pinned instant the
    // browser clock is fixed to (zero elapsed time), not `new Date()`:
    // useReEntryRitual.ts triggers a "Welcome back — N days away" screen
    // when a task's timestamp is stale relative to the clock the app reads,
    // and with the clock now pinned, any timestamp other than PINNED_NOW
    // would be a fixed, growing staleness rather than a moving one.
    const state = planSeedState(PINNED_NOW);
    await page.addInitScript(
      ([key, value]) => {
        window.sessionStorage.setItem(key, value);
      },
      [PLAN_WORKFLOW_STORAGE_KEY, JSON.stringify(state)] as const,
    );
    await pinMomentPreference(page, "start");
  });

  for (const width of PLAN_WIDTHS) {
    test(`"Move to today" label stays inside its own control when wrapped, at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/?sheet=plan");
      const testId = `plan-sheet-promote-${PLAN_TASK_ID}`;
      await expect(page.getByTestId(testId)).toBeVisible();

      const result = await textContainedInBox(page, testId);
      expect(
        result.contained,
        `"Move to today" label ${JSON.stringify(result.text)} must fit inside its button ${JSON.stringify(result.box)} at ${width}px`,
      ).toBe(true);

      const box = await page.getByTestId(testId).boundingBox();
      expect(
        box!.height,
        `"Move to today" button height (44px floor) at ${width}px`,
      ).toBeGreaterThanOrEqual(44);

      const violations = await scanAxeViolationNodes(page);
      expect(
        violations,
        `axe violations on plan-sheet at ${width}px`,
      ).toHaveLength(0);
    });
  }
});
