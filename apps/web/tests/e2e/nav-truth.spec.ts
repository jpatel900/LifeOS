import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { SHEET_VALUES } from "../../src/app/components/moments/sheetValues";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

/**
 * One shell, one renderer per URL — the acceptance-bar oracle for epic #555
 * item 1 (docs/implementation-planning/plan-one-shell-routing.md). The URL
 * is the only source of navigation truth: Back/Forward, refresh, and direct
 * URL entry must always render the same screen, and Health + Settings must
 * be reachable in at most two interactions from `/`.
 *
 * C2-S6 RE-ANCHOR (#687), not a deletion: `/calendar`, `/review`, `/health`
 * and `/areas` used to render the legacy cockpit directly — that branch of
 * this file (a `STAGES` array + two per-stage loops + three cockpit
 * round-trip tests) asserted exactly that. All four are flag-gated redirect
 * shims now (same pattern as `/today`/`/capture`/`/triage`/`/execute`
 * before them), so their entries move into `REDIRECTED` below — the
 * criterion the old tests pinned ("the URL is the only source of navigation
 * truth") is unchanged, only the destination is. The three cockpit
 * round-trip tests are re-anchored as moments-shell walks (see the block
 * below `REDIRECTED`), plus a new HISTORY-WALK PIN that the S6 lane contract
 * calls for explicitly.
 */

// Read as a PARAM, not a URL suffix: `useMomentUrlState`'s mount-time
// reconciliation (C2-S6) writes `?moment=<value>` onto EVERY moments-home
// URL now, so a redirect that only sets `?sheet=` or `?capture=` lands on
// `?sheet=plan&moment=start` (param order is a URLSearchParams
// implementation detail, not a contract) — a `/\?sheet=plan$/` suffix regex
// fails on real output the moment a second param exists, which is exactly
// what happened red-first while authoring this file. `expectParam` below
// checks the one param each target actually promises, nothing about the
// others.
async function expectParam(page: Page, key: string, value: string) {
  await expect(async () => {
    expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  }).toPass({ timeout: 30_000 });
}

const REDIRECTED: Array<{
  path: string;
  param: { key: string; value: string };
  assertSurface(page: Page): Promise<void>;
}> = [
  {
    path: "/today",
    param: { key: "moment", value: "" }, // checked specially below
    assertSurface: async (page) => {
      await expect(page.getByTestId("today-moments")).toBeVisible();
    },
  },
  {
    path: "/capture",
    param: { key: "capture", value: "1" },
    assertSurface: async (page) => {
      await expect(
        page.getByRole("dialog", { name: "Capture a thought" }),
      ).toBeVisible();
    },
  },
  {
    path: "/triage",
    param: { key: "sheet", value: "triage" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("triage-sheet-empty")).toBeVisible();
    },
  },
  {
    path: "/execute",
    param: { key: "moment", value: "flow" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("flow-moment")).toBeVisible();
    },
  },
  {
    // C2-S6: NOT `?moment=close` — Close is deliberately day-scoped and
    // lacks planned-vs-actual/needs-a-decision/aging/open-commitments/policy
    // proposals on purpose (ReviewSheet.tsx's own header comment). This is
    // risk #1 from the lane contract: prove the redirect target directly.
    path: "/calendar",
    param: { key: "sheet", value: "plan" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("plan-sheet")).toBeVisible();
    },
  },
  {
    path: "/review",
    param: { key: "sheet", value: "review" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("review-sheet")).toBeVisible();
      // Risk #1 (lane contract): a Review-ONLY section, so an old `/review`
      // bookmark provably lands on the real Review surface, not Close.
      await expect(
        page.getByText("Planned vs actual", { exact: true }),
      ).toBeVisible();
    },
  },
  {
    path: "/health",
    param: { key: "sheet", value: "health" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("health-sheet")).toBeVisible();
    },
  },
  {
    path: "/areas",
    param: { key: "sheet", value: "areas" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("areas-sheet")).toBeVisible();
    },
  },
];

for (const target of REDIRECTED) {
  test(`direct entry to ${target.path} redirects to the moments home surface`, async ({
    page,
  }) => {
    await page.goto(target.path);
    await target.assertSurface(page);
    if (target.path !== "/today") {
      await expectParam(page, target.param.key, target.param.value);
    }
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
  });

  test(`refresh on the ${target.path} redirect lands on the same surface`, async ({
    page,
  }) => {
    await page.goto(target.path);
    await target.assertSurface(page);
    const beforeUrl = page.url();

    await page.reload();

    await target.assertSurface(page);
    if (target.path !== "/today") {
      await expectParam(page, target.param.key, target.param.value);
    }
    expect(page.url()).toBe(beforeUrl);
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
  });
}

// C2-S6 RE-ANCHOR of "in-app navigate then Back renders the previous
// screen's URL and landmark": the old version drilled the cockpit's OWN
// stage rail between two rendered cockpit screens. There is no cockpit to
// drill between anymore (flag on) — the equivalent property, "opening then
// closing a sheet is a clean round trip Back can undo," is proven directly
// against the moments shell's own sheets instead.
test("opening then Back-closing a sheet is a clean round trip, for two different sheets in sequence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  await page.getByTestId("pipeline-overview-stage-triage").click();
  await expect(page.getByTestId("moment-sheet-dialog")).toHaveAttribute(
    "aria-label",
    "Triage",
  );
  expect(new URL(page.url()).searchParams.get("sheet")).toBe("triage");

  await page.goBack();
  await expect(page.getByTestId("moment-sheet-dialog")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("sheet")).toBe("plan");

  await page.goBack();
  await expect(page.getByTestId("plan-sheet")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
});

// C2-S6 RE-ANCHOR of "/ renders the moments home, including after a cockpit
// round-trip": the old version proved the cockpit's brand link returns to
// `/` rather than `/today`. With the cockpit retired from the live path,
// the equivalent property is that ARRIVING via an old bookmark (a redirect
// shim) and then closing what it opened returns cleanly to the bare home —
// there is no shell to "return to", because the redirect never left one.
test("arriving via a legacy bookmark and closing its sheet returns to the bare moments home", async ({
  page,
}) => {
  await page.goto("/calendar");
  await expect(page.getByTestId("plan-sheet")).toBeVisible();
  await expectParam(page, "sheet", "plan");
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  await page.getByTestId("moment-sheet-close").click();

  await expect(page.getByTestId("plan-sheet")).toHaveCount(0);
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
});

// C2-S6 RE-ANCHOR of "cockpit stage rail's Capture node lands on the moments
// home, not a legacy shell": the old version proved a REDIRECT never landed
// on the legacy shell. Now there is no redirect to prove — the pipeline
// rail's OWN Capture node opens the overlay directly (Criterion 1, item 9:
// no control may promise a shell that no longer exists). This proves the
// direct path instead of the now-impossible indirect one.
test("moments home pipeline rail: Capture node opens the capture overlay directly, in one interaction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  await page.getByTestId("pipeline-overview-stage-capture").click();

  await expect(
    page.getByRole("dialog", { name: "Capture a thought" }),
  ).toBeVisible();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
});

// C2-S6 HISTORY-WALK PIN (lane contract, Criterion 2): every step of a
// realistic session — moment switch, sheet open, sheet close, Back, Back,
// Forward — must leave the URL and the screen in agreement, and the cockpit
// must never resurrect.
//
// `window.history.length` is a real signal here but a one-directional one:
// it counts every entry ever created in the tab's session and only ever
// GROWS on a genuine `pushState` — `history.back()` moves the current
// position without shrinking it (the entries stay navigable via Forward).
// So `length` growing by exactly 1 per intentional switch/open IS the right
// proof that each step pushed once, not twice, not zero times; but "close"
// (which steps back rather than pushing) is proven by `length` staying
// UNCHANGED from its post-open value, not by it shrinking — asserting a
// shrink here was this test's own red-first bug the first time it ran
// against real Chromium (jsdom, in `useMomentUrlState.test.ts`, does not
// expose this distinction, so that suite's push-count spies did not catch
// it). Risk #6 (no leaked entries, no stolen Backs) is proven by the
// SEQUENCE of screens the following Back/Back/Forward calls land on, not by
// asserting `length` at each of those steps.
// Time-robustness fix (found on an unrelated PR's CI, folded in here):
// this pin used to `goto("/")` and read back whatever moment the WALL-CLOCK
// heuristic (`heuristicMoment`, TodayMoments.tsx) resolved at mount, storing
// that as `initialMoment` for the later Back-lands-here assertion at the
// bottom. `heuristicMoment` is re-evaluated fresh on every navigation — it
// takes no seed and reads real time — so a run that starts just before an
// hour boundary (11:00 or 17:00, the heuristic's own thresholds) could
// observe a DIFFERENT moment than a re-render moments later would compute,
// or simply differ from what a rerun of the SAME test produces a minute on.
// The captured `initialMoment` was never wrong for the run that captured
// it, but the pin's OWN premise — "the same moment mount resolved to is the
// moment Back lands back on" — doesn't need the heuristic in the loop at
// all: tier 2 of TodayMoments.tsx's own resolution order (`initialMoment`
// prop -> URL's own `?moment=` -> stored preference -> clock heuristic)
// is the URL itself, so a direct `?moment=start` entry — the same explicit-
// URL pattern every other target in this file already uses (`directUrl`
// above) — pins the moment without depending on wall-clock timing at all.
test("history-walk pin: moment switch -> sheet open -> sheet close -> Back -> Back -> Forward all agree with the URL, cockpit never resurrects", async ({
  page,
}) => {
  await page.goto("/?moment=start");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(page.getByTestId("start-moment")).toBeVisible();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  // Mount reconciliation (useMomentUrlState): the resolved initial moment
  // lands in the URL via `replaceState`, never `pushState` — the stack must
  // not grow from this alone. Deterministic now (not heuristic-derived):
  // the URL already named "start", so this is exactly what tier 2 of
  // TodayMoments.tsx's resolution order returns.
  const initialMoment = new URL(page.url()).searchParams.get("moment");
  expect(initialMoment).toBe("start");
  const depthAtStart = await page.evaluate(() => window.history.length);

  // Moment switch: Start -> Flow. Exactly one push.
  await page.keyboard.press("2");
  await expect(page.getByTestId("flow-moment")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("moment")).toBe("flow");
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
  expect(await page.evaluate(() => window.history.length)).toBe(
    depthAtStart + 1,
  );

  // Switch back to Start so the pipeline rail (Start-moment only) is on
  // screen to open a sheet from — a second real push.
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();
  const depthBeforeSheet = await page.evaluate(() => window.history.length);
  expect(depthBeforeSheet).toBe(depthAtStart + 2);

  // Sheet open: Plan. Exactly one push, preserving `moment=start`.
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("sheet")).toBe("plan");
  expect(new URL(page.url()).searchParams.get("moment")).toBe("start");
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
  const depthAfterOpen = await page.evaluate(() => window.history.length);
  expect(depthAfterOpen).toBe(depthBeforeSheet + 1);

  // Sheet close: WE pushed it opening, so `useSheetUrlState.closeSheet`
  // steps back rather than pushing a new entry — `length` does NOT grow
  // again (it would, to `depthAfterOpen + 1`, if close had incorrectly
  // pushed a "closed" state instead of reusing the entry that existed
  // before open).
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("plan-sheet")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();
  expect(new URL(page.url()).searchParams.get("moment")).toBe("start");
  expect(await page.evaluate(() => window.history.length)).toBe(depthAfterOpen);

  // Back: undoes the second switch (back to Flow). URL and screen agree —
  // this is the real proof that close() moved the CURRENT position back to
  // the pre-open entry rather than merely not pushing: if it had left the
  // position sitting on the sheet-open entry, this Back would land back on
  // Start (undoing open, not the second switch), not Flow.
  await page.goBack();
  await expect(page.getByTestId("flow-moment")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("moment")).toBe("flow");
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  // Back again: undoes the first switch, landing on the mount-reconciled
  // entry — our handlers do not intercept it or grow the stack; screen and
  // URL agree on the originally-resolved moment.
  await page.goBack();
  await expect(page.getByTestId("today-moments")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("moment")).toBe(initialMoment);
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  // Forward: re-applies the first switch via popstate — the URL is the
  // authority, not a guess.
  await page.goForward();
  await expect(page.getByTestId("flow-moment")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("moment")).toBe("flow");
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
});

test("/settings/areas content is centered, not stretched edge-to-edge (#687)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings/areas");

  const heading = page.getByRole("heading", { level: 1, name: "Areas" });
  await expect(heading).toBeVisible();

  // AdminShell now wraps content in the same centered max-w-6xl container as
  // its header; at 1280px the content column must start well inside the
  // viewport instead of flush against its left edge.
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThan(40);
});

// Final UX Loop C2-S0 (#742): signed-out visits to /settings/areas now
// redirect to the sign-in door (`useAreasLoadState.ts`'s status:"signed-out"
// drives a `router.replace("/login?next=…")` in page.tsx). This spec's dev
// server runs with NO Supabase env (see the file-level comment at the top of
// this suite), the same "demo mode" every other test here already relies on
// -- `createSupabaseBrowserClient()` returns null, `listAreas(null)` resolves
// with `provider: "mock"` and never rejects, so `status` goes straight to
// "ready" and the "signed-out" branch this redirect lives in is never
// reached. That is true of every ordinary (non-`@signed-in`) e2e spec in this
// repo, and was equally true of the in-place calm state #753 shipped before
// this change -- neither ever had device-tier coverage, only vitest coverage
// (`src/__tests__/areasSignedOutBoundary.test.tsx`, which drives the real
// client-side code path against a mocked Supabase client that actually
// rejects `getUser()`). Reaching the redirect in a real browser needs a
// Supabase-configured dev server, which only the `e2e-signed-in` CI job
// boots -- and that job signs a seeded user IN, so it cannot exercise a
// signed-OUT visit either without a second, differently-configured server
// this lane does not own (workflows are out of scope here). So: what THIS
// tier can honestly prove is the regression guard -- demo-mode visits keep
// loading normally and do not accidentally redirect -- at both viewports.
test.describe("/settings/areas demo-mode load is unaffected by the C2-S0 redirect (#742)", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    test(`${viewport.name}: stays on /settings/areas, no accidental redirect to /login`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/settings/areas");

      await expect(
        page.getByRole("heading", { level: 1, name: "Areas" }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/settings\/areas$/);
      await expect(page.getByTestId("areas-create-card")).toBeVisible();
    });
  }
});

/**
 * C2-S4 RE-ANCHOR (#687), not a deletion.
 *
 * This test used to assert that "View area health" LEFT the moments home for
 * the legacy `/health` route, and that the cockpit shell rendered there. Both
 * halves were true, and both were the Target Card 2 violation the Health port
 * exists to remove. The criterion the test is really pinning — "Health is
 * reachable from the home in one interaction" — is unchanged and still
 * asserted; what changed is where one interaction now lands.
 */
test("moments home: View area health opens Health in one interaction, without leaving the home", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  // The home's default moment is time-of-day derived; pin it to Start for a
  // deterministic run regardless of the wall clock.
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  await page.getByRole("button", { name: /View area health/ }).click();

  // One interaction, and the moments home is still the shell.
  await expect(page.getByTestId("health-sheet")).toBeVisible();
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  // The state change is in the URL, which is the half the old jump got right
  // for the wrong reason.
  //
  // Read as a PARAM, not as a URL suffix: `urlWithSheet` preserves whatever
  // query the home already carried, so `/?moment=start&sheet=health` is an
  // equally correct result and a `/\?sheet=health$/` regex would fail on it.
  // Pinning the suffix would pass today only because nothing else writes the
  // home's query yet, and break silently the day something does.
  expect(new URL(page.url()).searchParams.get("sheet")).toBe("health");
  await expect(
    page.getByRole("heading", {
      name: /Everything is working|\d+ things? needs? a look/,
    }),
  ).toBeVisible();

  // Back steps the moment, it does not leave the shell.
  await page.goBack();
  await expect(page.getByTestId("health-sheet")).toHaveCount(0);
  await expect(page.getByTestId("today-moments")).toBeVisible();
});

test("moments home: Settings link reaches /settings/areas in one interaction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  await page.getByTestId("moments-settings-link").click();

  // First client-side visit to /settings/areas in a dev run can spend several
  // seconds compiling; allow more than the default 5s expect window.
  await expect(page).toHaveURL(/\/settings\/areas$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
});

/**
 * C2-S6 MATRIX PIN (lane contract, Criterion 3): every sheet — looped from
 * `SHEET_VALUES` itself, so a future sheet is auto-covered rather than
 * silently unpinned — plus the capture overlay and Settings, is reachable
 * from `/` in AT MOST TWO TAPS on a real mobile viewport with NO keyboard
 * input anywhere in this block (this is the property `useMomentKeyboard`
 * cannot satisfy — it is keydown-only), AND agrees with refresh + direct-URL
 * entry. `login` is checked for the refresh/URL half only: no in-app tap
 * path reaches it from the demo-mode home (there is no sign-out affordance
 * to tap back into a sign-in screen from — see this file's own
 * `/settings/areas demo-mode` comment block above for why signed-out states
 * are outside this tier's reach).
 *
 * Reachability and refresh/direct-URL agreement are proven as TWO SEPARATE
 * tests per target rather than one chained test, deliberately: chaining
 * reach -> refresh -> a SECOND `goto` to the same URL -> Back compounds
 * history entries (a `goto` to an already-current URL is itself a new
 * entry), so a single Back no longer proves what it looks like it proves —
 * this file's own first red-first run hit exactly that. Back-agreement
 * itself is already proven generically for every sheet by the HISTORY-WALK
 * PIN above and the REDIRECTED-loop tests, both riding the one shared
 * `useSheetUrlState` mechanism every sheet uses — re-asserting it per sheet
 * here would be the same proof repeated, not a stronger one.
 *
 * `reach` performs the WORST-CASE two-tap path deterministically (tap the
 * Start moment tab, THEN the target control) rather than relying on
 * whichever moment the clock heuristic happens to land on — a fresh visit
 * that already lands on Start would reach the same target in one tap, which
 * is inside the ≤2 budget, not outside it.
 *
 * `next.config.ts` disables `next dev`'s floating dev-tools indicator
 * (`devIndicators: false`) — at 390px it sat over BottomNavigator's
 * bottom-docked controls and silently swallowed real clicks aimed at them
 * (a dev-server-only artifact, absent from every production build). This
 * pin caught it: `{ force: true }` alone was tried and rejected first —
 * force skips Playwright's OWN actionability wait, not the browser's real
 * hit-testing, so the click still physically landed on the intercepting
 * portal instead of the intended control, turning a loud failure into a
 * silent no-op one. Removing the indicator was the real fix.
 */
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

interface MatrixTarget {
  name: string;
  /** Taps only, starting from a fresh `/` visit. At most 2 calls. */
  reach(page: Page): Promise<void>;
  /**
   * The URL param this target lands on once reached BY TAP. C2-S7 (#687
   * finding 2) closed the one real gap this used to document (capture had
   * no outbound tap-to-URL write) via `useOverlayUrlState.ts`, so every
   * target in this matrix now writes one — `null` is kept in the type only
   * as a documented escape hatch, not because anything currently uses it.
   */
  urlParam: { key: "sheet" | "capture" | "palette"; value: string } | null;
  assertSurface(page: Page): Promise<void>;
  directUrl: string;
}

const SHEET_REACH_TESTID: Record<(typeof SHEET_VALUES)[number], string> = {
  triage: "pipeline-overview-stage-triage",
  plan: "pipeline-overview-stage-plan",
  review: "pipeline-overview-stage-review",
  // health/areas no longer reach via this map — see PALETTE_REACH_SHEETS
  // below for why, and the custom `reach` branch in matrixTargets.
  health: "side-rail-open-health",
  areas: "side-rail-open-areas",
};

const SHEET_TESTID: Record<(typeof SHEET_VALUES)[number], string> = {
  triage: "triage-sheet-empty",
  plan: "plan-sheet",
  review: "review-sheet",
  health: "health-sheet",
  areas: "areas-sheet",
};

// C2-S6 mutation-proven gap (adversarial verifier, 2026-08-20): this matrix
// pin used to reach health/areas via SideRail's own
// side-rail-open-health/-areas testids. `.click()` auto-scrolls its target
// into view, even one that sits below the fold on a real 390px phone —
// SideRail lives inside the Start moment and stacks to the BOTTOM of the
// page below 1024px (StartMoment's own layout, see TodayMoments.tsx's
// comments on the palette's "Open health"/"Open all areas" actions) — so
// that reach path passed here while masking whether the actual shipped
// ≤2-tap mobile path (BottomNavigator's "More" trigger -> command palette)
// was reachable at all. Proof of the gap: disconnecting TodayMoments.tsx's
// `onOpenPalette={() => setPaletteOpen(true)}` prop wiring left every test
// in this file (and all 69 TodayMoments/BottomNavigator vitest tests)
// green — nothing here exercised that chain. Health and areas now reach
// through the real trigger; the other three sheets are unaffected (their
// PipelineOverview stage buttons are the real, documented reach for them and
// were never in question).
const PALETTE_REACH_SHEETS = new Set<(typeof SHEET_VALUES)[number]>([
  "health",
  "areas",
]);

const matrixTargets: MatrixTarget[] = [
  ...SHEET_VALUES.map(
    (sheet): MatrixTarget => ({
      name: `sheet:${sheet}`,
      reach: async (page) => {
        if (PALETTE_REACH_SHEETS.has(sheet)) {
          // Tap 1: BottomNavigator's "More" trigger — reachable from any
          // moment, no Start-switch needed first.
          await page.getByTestId("bottom-navigator-more").click();
          await expect(page.getByTestId("command-palette")).toBeVisible();
          // Tap 2: the palette's matching "Open health"/"Open all areas"
          // action.
          await page
            .getByTestId(`command-palette-option-open-${sheet}`)
            .click();
          return;
        }
        // Tap 1 (worst case — a no-op if already there): switch to Start,
        // the only moment the reach controls below render on.
        await page.getByTestId("moment-switcher-bottom-nav-start").click();
        await expect(page.getByTestId("start-moment")).toBeVisible();
        // Tap 2: the sheet's own reach control.
        await page.getByTestId(SHEET_REACH_TESTID[sheet]).click();
      },
      urlParam: { key: "sheet", value: sheet },
      assertSurface: async (page) => {
        await expect(page.getByTestId(SHEET_TESTID[sheet])).toBeVisible();
      },
      directUrl: `/?sheet=${sheet}`,
    }),
  ),
  {
    name: "capture overlay",
    reach: async (page) => {
      // One tap, from any moment — BottomNavigator's Capture button.
      await page.getByTestId("bottom-navigator-capture").click();
    },
    // C2-S7 (#687 finding 2): FIXED, not just re-anchored. Unlike every
    // sheet (`openSheet` always pushes `?sheet=`), `captureOpen` used to be
    // a plain `useState` with no URL-writing call site anywhere in
    // TodayMoments.tsx — tapping Capture opened the overlay but wrote
    // nothing to the address bar. `useOverlayUrlState.ts` (the
    // `useSheetUrlState`-shaped hook for a boolean overlay) now backs it,
    // so the tap-to-URL half this pin used to document as missing is
    // proven below like every other target.
    urlParam: { key: "capture", value: "1" },
    assertSurface: async (page) => {
      await expect(
        page.getByRole("dialog", { name: "Capture a thought" }),
      ).toBeVisible();
    },
    directUrl: "/?capture=1",
  },
  {
    name: "command palette",
    reach: async (page) => {
      // One tap, from any moment — BottomNavigator's "More" trigger (the
      // same mobile-only path the health/areas sheets above reach through).
      await page.getByTestId("bottom-navigator-more").click();
    },
    // Same C2-S7 fix as the capture overlay — `useOverlayUrlState.ts`
    // backs `paletteOpen` too.
    urlParam: { key: "palette", value: "1" },
    assertSurface: async (page) => {
      await expect(page.getByTestId("command-palette")).toBeVisible();
    },
    directUrl: "/?palette=1",
  },
];

for (const target of matrixTargets) {
  test(`matrix pin: ${target.name} reachable in <=2 taps on mobile`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();

    await target.reach(page);

    await target.assertSurface(page);
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
    if (target.urlParam) {
      // Read as a PARAM, not a URL suffix — see the Health test above for
      // why a suffix regex would be the wrong assertion once more than one
      // param can be on the home's URL at once.
      expect(new URL(page.url()).searchParams.get(target.urlParam.key)).toBe(
        target.urlParam.value,
      );
    }
  });

  test(`matrix pin: ${target.name} — refresh and direct-URL entry agree with the screen`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);

    // Direct URL entry (a fresh visit, no reach taps at all).
    await page.goto(target.directUrl);
    await target.assertSurface(page);
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

    // Refresh agrees with what direct entry just proved.
    await page.reload();
    await target.assertSurface(page);
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
  });
}

// C2-S7 (#687 finding 2), the third leg PR #880's AGENT-TODO named
// explicitly ("Open writes the param via pushState, close pops it, Back
// closes the overlay") — the matrix loop above proves open+refresh/direct-URL
// for every target including the two new overlay entries; this proves Back,
// the one half neither the matrix nor the sheet-focused HISTORY-WALK PIN
// covers for a boolean overlay. Desktop viewport: BottomNavigator's mobile
// triggers are `sm:hidden`, so this uses each overlay's desktop affordance
// instead (the pill / the Cmd+K shortcut) — the URL/history contract itself
// is viewport-independent, already proven mobile-reachable by the matrix
// above.
test("Back closes the capture overlay (opened via the desktop pill) and restores the prior screen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  const beforeUrl = page.url();

  await page.getByTestId("capture-affordance").click();
  await expect(
    page.getByRole("dialog", { name: "Capture a thought" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("capture")).toBe("1");

  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Capture a thought" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("today-moments")).toBeVisible();
  expect(page.url()).toBe(beforeUrl);
});

test("Back closes the command palette (opened via Cmd+K) and restores the prior screen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  const beforeUrl = page.url();

  await page.keyboard.press("Meta+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("palette")).toBe("1");

  await page.goBack();
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
  await expect(page.getByTestId("today-moments")).toBeVisible();
  expect(page.url()).toBe(beforeUrl);
});

test("matrix pin: Settings reachable in 1 tap on mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  await page.getByTestId("bottom-navigator-settings-link").click();

  await expect(page).toHaveURL(/\/settings\/areas$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
});

test("matrix pin: /settings/areas — refresh agrees with the screen", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/settings/areas");
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
});

// login: no in-app tap path exists from the demo-mode home (see the block
// comment above the matrix pin) — only the refresh/direct-URL half of the
// criterion applies.
test("matrix pin: /login is stable under refresh and direct-URL entry", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
