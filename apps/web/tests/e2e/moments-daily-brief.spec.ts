import { expect, test, type Page } from "@playwright/test";

/**
 * S6 (#258) — daily brief read-only synthesis, Playwright evidence.
 *
 * Proves two things against the dev-only `/moments-preview` route (live
 * WorkflowContext, live wall-clock — `now` is left undefined so
 * TodayMoments defaults to `new Date()`, same as the existing
 * moments-home-parity spec):
 *
 * 1. The brief's two new S6 sections (stale-project line, recovery-nudge
 *    card) render when their signal is present ("complete" variant, seeded
 *    below) AND are cleanly absent when it isn't ("degraded/default"
 *    variant, the route's out-of-the-box mock state).
 * 2. Loading and interacting with the brief issues ZERO mutating network
 *    calls — a `page.on("request")` listener records every request to
 *    `/api/*` using a mutating HTTP method (POST/PUT/PATCH/DELETE) for the
 *    lifetime of the page, and each test asserts that list is empty. Scoped
 *    to `/api/*` (not every POST) so Next.js RSC/server-infrastructure
 *    requests, which can legitimately POST for framework plumbing unrelated
 *    to this feature, do not produce a false positive.
 *
 * Seeding seam: WorkflowContext hydrates from `sessionStorage` (key
 * `lifeos.phase2.workflow`) on mount if a valid stored state is present,
 * falling back to the default mock state otherwise (see
 * `loadStoredStateFromSession` / `isStoredWorkflowState` in
 * `src/lib/WorkflowContext.tsx`, read-only — not modified by this slice).
 * `page.addInitScript` writes a minimal valid `WorkflowState` shape into
 * that key before any app script runs, giving a deterministic "complete"
 * fixture without touching WorkflowContext, LifeOSCockpit, or any
 * mutation path.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function trackMutations(page: Page): string[] {
  const mutations: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) return;
    if (!MUTATING_METHODS.has(request.method())) return;
    mutations.push(`${request.method()} ${url}`);
  });
  return mutations;
}

/**
 * A minimal but fully valid `WorkflowState` (per `isStoredWorkflowState` in
 * WorkflowContext.tsx): one area, one active project last touched 10 days
 * ago (qualifies as stale — over the 7-day threshold), one task linked to
 * a calendar block that was missed yesterday. Every other collection is an
 * empty array (vacuously valid) or `null` (wipRefusal).
 */
function buildSeedState() {
  const nowMs = Date.now();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

  const areaId = "e2e-area-1";
  const projectId = "e2e-project-stale";
  const taskId = "e2e-task-missed-yesterday";
  const blockId = "e2e-block-missed-yesterday";

  return {
    areas: [
      {
        id: areaId,
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
    projects: [
      {
        id: projectId,
        user_id: "e2e-user",
        area_id: areaId,
        title: "Q2 planning doc",
        description: null,
        status: "active",
        created_at: daysBefore(60),
        updated_at: daysBefore(10),
      },
    ],
    tasks: [
      {
        id: taskId,
        user_id: "e2e-user",
        area_id: areaId,
        project_id: null,
        source_capture_item_id: null,
        title: "Draft the proposal",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: null,
        estimated_minutes_high: null,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: null,
        created_at: daysBefore(5),
        updated_at: daysBefore(1),
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [
      {
        id: blockId,
        user_id: "e2e-user",
        area_id: areaId,
        proposal_id: null,
        task_id: taskId,
        google_event_id: null,
        start_at: daysBefore(1),
        end_at: daysBefore(1),
        status: "missed",
        created_at: daysBefore(1),
        updated_at: daysBefore(1),
      },
    ],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

test.describe("moments daily brief (/moments-preview, #258)", () => {
  test("complete variant: renders the stale-project line and recovery-nudge card, zero mutations", async ({
    page,
  }) => {
    const mutations = trackMutations(page);
    const seed = buildSeedState();

    await page.addInitScript(
      ({ key, value }) => {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      },
      { key: STORAGE_KEY, value: seed },
    );

    await page.goto("/moments-preview");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    // Pin Start deterministically regardless of wall-clock time-of-day.
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    const staleLine = page.getByTestId("start-stale-project");
    await expect(staleLine).toBeVisible();
    await expect(staleLine).toContainText("Hasn't moved in");
    await expect(staleLine).toContainText("Q2 planning doc");

    const nudgeCard = page.getByTestId("start-recovery-nudge");
    await expect(nudgeCard).toBeVisible();
    await expect(nudgeCard).toContainText("Draft the proposal");

    // Interact with the nudge's single forward action — it must route
    // (switch to Close), never mutate.
    await page.getByTestId("start-recovery-nudge-open").click();
    await expect(page.getByTestId("close-moment")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    expect(mutations).toEqual([]);
  });

  test("degraded/default variant: both sections are cleanly absent, zero mutations", async ({
    page,
  }) => {
    const mutations = trackMutations(page);

    // No seed — the route's default mock state has no active project old
    // enough to be stale and no missed block from yesterday, so both
    // sections should be omitted entirely (not an error state).
    await page.goto("/moments-preview");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    await expect(page.getByTestId("start-stale-project")).toHaveCount(0);
    await expect(page.getByTestId("start-recovery-nudge")).toHaveCount(0);

    expect(mutations).toEqual([]);
  });
});
