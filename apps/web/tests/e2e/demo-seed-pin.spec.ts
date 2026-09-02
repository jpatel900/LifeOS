import { expect, test, type Page } from "@playwright/test";

/**
 * #687 demo-seed, independent verifier round 1 finding 1 — the seed revives
 * a control (`start-pending-triage`, StartMoment.tsx) this lane's own
 * hit-target-overlap-pin.spec.ts header comment had documented as
 * "unreachable" (a first move AND a pending triage decision at once never
 * happened together before the seed). That pin's surface list stays on the
 * pristine "no sample" state (`helpers/pinnedSurfaces.ts`'s
 * `seedNoSampleWorkflowState`) — this file is the ADDITIVE second pass over
 * the moment surfaces with the seed genuinely ON, so the control's fix
 * (StartMoment.tsx: `min-h-[44px] touch-manipulation`) is proven against
 * the real DOM the seed actually produces, not re-baselined away.
 *
 * Reaches the seeded state the same way `seedZeroWorkflowState`
 * (helpers/pinnedSurfaces.ts) reaches the onboarding zero-state: a
 * `sessionStorage` snapshot written via `page.addInitScript` before any
 * page script runs. This works regardless of the webServer's own
 * `NEXT_PUBLIC_DEMO_SEED` value (this lane runs with it OFF —
 * playwright.config.ts / scripts/run-playwright-e2e.mjs) because
 * `createInitialWorkflowState` (lib/workflow/shared.ts) checks for an
 * existing tab snapshot BEFORE ever consulting that flag.
 */

const WORKFLOW_STORAGE_KEY = "lifeos.phase2.workflow";
const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

async function seedDemoSampleWorkflowState(page: Page) {
  await page.addInitScript(
    ([key, userId]) => {
      const now = Date.now();
      const HOUR_MS = 60 * 60 * 1000;
      const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
      const areas = [
        {
          id: "area-main-job",
          user_id: userId,
          name: "Main Job",
          color: "#4c80cd",
          created_at: iso(0),
        },
        {
          id: "area-personal",
          user_id: userId,
          name: "Personal",
          color: "#439458",
          created_at: iso(0),
        },
      ];
      const state = {
        areas,
        // One unsorted capture — drives `counts.pendingTriage` > 0
        // (momentsViewModel/start.ts's `countUnsortedCaptures`), which is
        // what makes `pendingTriageLine`/`start-pending-triage` render at
        // all.
        captureItems: [
          {
            id: "seed-pin-capture-1",
            user_id: userId,
            area_id: "area-main-job",
            raw_text: "Follow up with the client",
            return_hook: null,
            client_capture_id: null,
            capture_mode: "text",
            inferred_area_confidence: null,
            status: "new",
            created_at: iso(-HOUR_MS),
          },
        ],
        taskDrafts: [],
        projectDrafts: [],
        ambiguityAssessments: [],
        timeBlockProposalDrafts: [],
        projects: [],
        // One scheduled task with a same-day block — `deriveFirstMove`
        // (momentsViewModel/start.ts) classifies it "upcoming" (start_at is
        // in the future, same calendar day, status not completed/running),
        // which is what makes `cardMove && vm.firstMove` true and renders
        // `pendingTriageLine` next to the first-move card instead of the
        // "Decide now" card.
        tasks: [
          {
            id: "seed-pin-task-1",
            user_id: userId,
            area_id: "area-main-job",
            title: "Prep slides",
            description: null,
            status: "scheduled",
            priority_score: 2,
            priority_confidence: null,
            task_type: null,
            energy_type: null,
            estimated_minutes_low: 30,
            estimated_minutes_high: 45,
            due_at: null,
            definition_of_done: null,
            first_tiny_step: null,
            created_at: iso(-HOUR_MS),
            updated_at: iso(-HOUR_MS),
            project_id: null,
            source_capture_item_id: null,
          },
        ],
        timeBlockProposals: [
          {
            id: "seed-pin-proposal-1",
            user_id: userId,
            area_id: "area-main-job",
            task_id: "seed-pin-task-1",
            proposed_start: iso(HOUR_MS),
            proposed_end: iso(HOUR_MS + 45 * 60 * 1000),
            rationale: "Block focused time.",
            conflict_flag: false,
            status: "accepted",
            created_at: iso(-HOUR_MS),
          },
        ],
        calendarBlocks: [
          {
            id: "seed-pin-block-1",
            user_id: userId,
            area_id: "area-main-job",
            task_id: "seed-pin-task-1",
            proposal_id: "seed-pin-proposal-1",
            google_event_id: null,
            start_at: iso(HOUR_MS),
            end_at: iso(HOUR_MS + 45 * 60 * 1000),
            status: "scheduled",
            created_at: iso(-HOUR_MS),
            updated_at: iso(-HOUR_MS),
          },
        ],
        executionSessions: [],
        healthChecks: [],
        reviewLog: [],
        wipRefusal: null,
      };
      window.sessionStorage.setItem(key, JSON.stringify(state));
    },
    [WORKFLOW_STORAGE_KEY, MOCK_USER_ID] as const,
  );
}

test.describe("demo seed additive pin (#687, independent verifier round 1 finding 1)", () => {
  test("start-pending-triage meets the 44px hit-target floor once the seed makes it reachable", async ({
    page,
  }) => {
    await seedDemoSampleWorkflowState(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/?moment=start");
    await expect(page.getByTestId("today-moments")).toBeVisible();

    const control = page.getByTestId("start-pending-triage");
    await expect(control).toBeVisible();

    const box = await control.boundingBox();
    expect(box, "start-pending-triage bounding box").not.toBeNull();
    expect(
      box!.height,
      "start-pending-triage height >= 44px",
    ).toBeGreaterThanOrEqual(44);
  });
});
