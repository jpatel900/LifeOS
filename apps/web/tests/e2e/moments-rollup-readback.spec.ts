import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { SIGNED_IN_TAG, requireSupabaseEnv } from "./helpers/signedInAccount";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

/**
 * S8 (#260) — rollup readback UI, Playwright golden journey.
 *
 * Against `/` (this suite's webServer sets NEXT_PUBLIC_MOMENTS_HOME=true,
 * see playwright.config.ts; live WorkflowContext, mock mode — approve
 * persists nothing over the network and the UI is deterministic). Seeds a
 * WorkflowState with this-week completed + missed blocks for one area, then
 * drives the Close moment's weekly-rollup step:
 *
 *  1. the area's weekly rollup draft (highlights + misses) surfaces,
 *  2. approving moves it into the week-over-week readback and off the pending
 *     list,
 *  3. dismissing removes the draft and approves nothing.
 *
 * Same sessionStorage seeding seam as moments-wins-harvest.spec.ts.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-rollup";
const DONE_TASK_ID = "e2e-task-rollup-done";
const MISS_TASK_ID = "e2e-task-rollup-miss";
const BLOCK_DONE = "e2e-block-rollup-done";
const BLOCK_MISS = "e2e-block-rollup-miss";

function buildSeedState(nowMs: number = Date.now()) {
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

  const task = (id: string, title: string, status: string) => ({
    id,
    user_id: "e2e-user",
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title,
    description: null,
    status,
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: daysBefore(10),
    updated_at: nowIso,
  });

  const block = (id: string, taskId: string, status: string, at: string) => ({
    id,
    user_id: "e2e-user",
    area_id: AREA_ID,
    proposal_id: null,
    task_id: taskId,
    google_event_id: null,
    start_at: at,
    end_at: at,
    status,
    created_at: at,
    updated_at: at,
  });

  return {
    areas: [
      {
        id: AREA_ID,
        user_id: "e2e-user",
        name: "Work",
        color: "#2563eb",
        created_at: daysBefore(100),
      },
    ],
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      task(DONE_TASK_ID, "Shipped onboarding flow", "done"),
      task(MISS_TASK_ID, "Skipped the review", "active"),
    ],
    timeBlockProposals: [],
    calendarBlocks: [
      block(BLOCK_DONE, DONE_TASK_ID, "completed", nowIso),
      block(BLOCK_MISS, MISS_TASK_ID, "missed", daysBefore(2)),
    ],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

async function openCloseMoment(page: Page, nowMs?: number) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState(nowMs) },
  );
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.getByTestId("close-moment")).toBeVisible();
}

test.describe("moments rollup readback (/, #260)", () => {
  test("approves the weekly rollup draft into the readback", async ({
    page,
  }) => {
    await openCloseMoment(page);

    const draft = page.getByTestId(`close-moment-rollup-${AREA_ID}`);
    await expect(draft).toBeVisible();
    await expect(draft).toContainText("Shipped onboarding flow");
    await expect(draft).toContainText("Skipped the review");

    await page.getByTestId(`close-moment-rollup-approve-${AREA_ID}`).click();

    await expect(
      page.getByTestId("close-moment-rollups-approved"),
    ).toContainText("Work");
    await expect(
      page.getByTestId(`close-moment-rollup-${AREA_ID}`),
    ).toHaveCount(0);
  });

  test("dismisses the weekly rollup draft, approving nothing", async ({
    page,
  }) => {
    await openCloseMoment(page);

    await expect(
      page.getByTestId(`close-moment-rollup-${AREA_ID}`),
    ).toBeVisible();
    await page.getByTestId(`close-moment-rollup-dismiss-${AREA_ID}`).click();

    await expect(
      page.getByTestId(`close-moment-rollup-${AREA_ID}`),
    ).toHaveCount(0);
    await expect(page.getByTestId("close-moment-rollups-approved")).toHaveCount(
      0,
    );
  });
});

/**
 * #1016 — at a 390px phone width the pending weekly rollup card must stay
 * inside the screen. The action row (Keep original / Dismiss / Approve
 * rollup) used to sit on one line that could not wrap; with the AI-polished
 * toggle present its three buttons need ~360px, which pushed the card (and
 * the whole page) to ~436px wide.
 *
 * The unenhanced case runs in the ordinary `e2e` job. The AI-polished case
 * needs a Supabase browser client to exist (the prose request is skipped
 * without one), which only the `e2e-signed-in` job's server has — so it
 * carries the @signed-in tag and runs there, and `requireSupabaseEnv()` makes
 * it fail loudly (never skip) if the env is missing. It never signs in and
 * never touches the account: the page stays signed out, every request to the
 * Supabase origin is aborted, and the prose response is a local stub, so no
 * AI provider is called. The class-level pin for both weekly and monthly rows
 * lives in CloseMoment.test.tsx.
 */

// Fixed clock + zone so the week label and moment are the same on every run.
const FIXED_NOW_MS = Date.parse("2026-09-16T14:00:00-04:00");

/**
 * The Supabase origin the page would talk to, checked to be loopback-only so
 * this spec can never be pointed at a hosted project. Throws (via
 * `requireSupabaseEnv`) when the env is missing.
 */
function localSupabaseOrigin(): string {
  const { url } = requireSupabaseEnv();
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error(
      `#1016 rollup layout spec only runs against a local Supabase; got host ${parsed.hostname}.`,
    );
  }
  return parsed.origin;
}

async function measureRollupCard(page: Page) {
  return page.evaluate((areaId) => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const card = document.querySelector(
      `[data-testid="close-moment-rollup-${areaId}"]`,
    );
    const stage = document.querySelector('[data-testid="close-moment"]');
    if (!card || !stage) {
      throw new Error("rollup card missing");
    }
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      viewportWidth: window.innerWidth,
      stage: rect(stage),
      card: rect(card),
      buttons: Array.from(card.querySelectorAll("button")).map((button) => ({
        label: (button.textContent ?? "").trim(),
        ...rect(button),
      })),
      text: Array.from(card.querySelectorAll("p, span")).map((node) => ({
        label: (node.textContent ?? "").trim().slice(0, 40),
        ...rect(node),
      })),
    };
  }, AREA_ID);
}

type Measured = Awaited<ReturnType<typeof measureRollupCard>>;

function expectContained(m: Measured, expectedLabels: string[]) {
  // The page never scrolls sideways and the stage/card fit the viewport.
  expect(m.docScrollWidth).toBeLessThanOrEqual(m.docClientWidth);
  expect(m.stage.right).toBeLessThanOrEqual(m.viewportWidth);
  expect(m.card.left).toBeGreaterThanOrEqual(0);
  expect(m.card.right).toBeLessThanOrEqual(m.viewportWidth);

  // Every control is still there, inside the card, and a full touch target.
  expect(m.buttons.map((b) => b.label)).toEqual(expectedLabels);
  for (const b of m.buttons) {
    expect(b.left, b.label).toBeGreaterThanOrEqual(m.card.left);
    expect(b.right, b.label).toBeLessThanOrEqual(m.card.right);
    expect(b.height, b.label).toBeGreaterThanOrEqual(44);
    expect(b.width, b.label).toBeGreaterThanOrEqual(44);
  }
  // No two controls overlap.
  for (let i = 0; i < m.buttons.length; i += 1) {
    for (let j = i + 1; j < m.buttons.length; j += 1) {
      const a = m.buttons[i];
      const b = m.buttons[j];
      const overlaps =
        a.left < b.right &&
        b.left < a.right &&
        a.top < b.bottom &&
        b.top < a.bottom;
      expect(overlaps, `${a.label} overlaps ${b.label}`).toBe(false);
    }
  }
  // Prose, labels and the AI badge stay inside the card.
  for (const t of m.text) {
    expect(t.left, t.label).toBeGreaterThanOrEqual(m.card.left);
    expect(t.right, t.label).toBeLessThanOrEqual(m.card.right);
  }
}

// Optional: where to save proof screenshots (never set in CI).
const SHOTS_DIR = process.env.LIFEOS_E2E_SHOTS_DIR;

async function maybeShoot(page: Page, name: string) {
  if (!SHOTS_DIR) {
    return;
  }
  await page
    .getByTestId(`close-moment-rollup-${AREA_ID}`)
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

for (const viewport of [
  { name: "390 mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test.describe(`rollup card stays on screen (#1016, ${viewport.name})`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      timezoneId: "America/Toronto",
    });

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW_MS);
    });

    test("unenhanced draft: Dismiss and Approve fit inside the card", async ({
      page,
    }) => {
      // Keep this case unenhanced in any lane: the prose request (if any)
      // falls back to the plain draft.
      await page.route("**/api/rollup-prose", (route) =>
        route.fulfill({ status: 503, body: "{}" }),
      );
      await openCloseMoment(page, FIXED_NOW_MS);
      const draft = page.getByTestId(`close-moment-rollup-${AREA_ID}`);
      await expect(draft).toBeVisible();
      await expect(
        page.getByTestId(`close-moment-rollup-toggleprose-${AREA_ID}`),
      ).toHaveCount(0);

      await maybeShoot(page, `unenhanced-${viewport.width}`);
      expectContained(await measureRollupCard(page), [
        "Dismiss",
        "Approve rollup",
      ]);
    });

    test(`${SIGNED_IN_TAG} AI-polished draft: all three actions fit inside the card`, async ({
      page,
    }) => {
      // Fails (never skips) without NEXT_PUBLIC_SUPABASE_*; loopback only.
      const supabaseOrigin = localSupabaseOrigin();
      // No account reads or writes: every Supabase request is aborted and
      // the page stays signed out.
      let supabaseRequests = 0;
      await page.route(`${supabaseOrigin}/**`, (route) => {
        supabaseRequests += 1;
        return route.abort();
      });
      let proseRequests = 0;
      await page.route("**/api/rollup-prose", async (route) => {
        proseRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            source: "ai",
            summary: {
              highlights: ["You shipped the onboarding flow this week."],
              misses: ["The weekly review slipped past its slot."],
              counts: { completed: 1, missed: 1 },
            },
          }),
        });
      });

      await openCloseMoment(page, FIXED_NOW_MS);
      const draft = page.getByTestId(`close-moment-rollup-${AREA_ID}`);
      // Assert the enhanced state is really on screen before measuring — a
      // two-button row would pass vacuously.
      await expect(
        page.getByTestId(`close-moment-rollup-aiflag-${AREA_ID}`),
      ).toHaveText("AI-polished");
      const toggle = page.getByTestId(
        `close-moment-rollup-toggleprose-${AREA_ID}`,
      );
      await expect(toggle).toHaveText("Keep original");
      await expect(draft).toContainText("You shipped the onboarding flow");
      expect(proseRequests).toBe(1);
      await expect(page.getByTestId("masthead-auth-signed-in")).toHaveCount(0);

      await maybeShoot(page, `enhanced-${viewport.width}`);
      expectContained(await measureRollupCard(page), [
        "Keep original",
        "Dismiss",
        "Approve rollup",
      ]);

      // Keyboard: the three actions are reachable in reading order.
      await toggle.focus();
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        page.getByTestId(`close-moment-rollup-dismiss-${AREA_ID}`),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        page.getByTestId(`close-moment-rollup-approve-${AREA_ID}`),
      ).toBeFocused();

      // Keep original still swaps back to the plain wording, and the row
      // stays contained with the "Use AI version" label.
      await toggle.click();
      await expect(toggle).toHaveText("Use AI version");
      await expect(
        page.getByTestId(`close-moment-rollup-aiflag-${AREA_ID}`),
      ).toHaveCount(0);
      await expect(draft).toContainText("Shipped onboarding flow");
      expectContained(await measureRollupCard(page), [
        "Use AI version",
        "Dismiss",
        "Approve rollup",
      ]);
      // Informational only: any Supabase call was aborted, never delivered.
      test.info().annotations.push({
        type: "aborted-supabase-requests",
        description: String(supabaseRequests),
      });
    });
  });
}
