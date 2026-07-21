import { expect, test, type Page } from "@playwright/test";

// #687: this suite drives the DEMOTED cockpit stage surfaces through routes
// (/capture, /triage, /execute, /today) that are now flag-gated redirect
// shims into the moments home under the shipping config. The cockpit flows it
// covers remain live ONLY under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false, set for BOTH the dev server and this
// runner). AGENT-TODO(#687): migrate the still-relevant flow coverage to the
// moments surfaces, then retire this suite with the legacy code.
test.skip(
  process.env.NEXT_PUBLIC_MOMENTS_HOME !== "false",
  "#687: cockpit stage routes redirect to the moments home under the shipping config; run with NEXT_PUBLIC_MOMENTS_HOME=false to exercise the legacy cockpit flows",
);

import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

async function goToStage(page: Page, stage: RegExp) {
  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: stage })
    .click();
}

async function captureTask(page: Page, title: string) {
  await page.goto("/capture");
  await page.getByPlaceholder("Drop the thought here.").fill(title);
  await page.getByRole("button", { name: "Save thought" }).click();
  // #556 FR-026: saving no longer navigates instantly — the capture stage
  // holds the user through the parse wait (raw text + hook visible, no
  // second submit possible) and only navigates to Triage once the parse
  // truly resolves ("back to: <hook>" conclusion). Every caller of this
  // helper immediately assumes it landed on /triage, so wait for that here.
  // 30s: the first capture-submit of a dev run can hit multi-second cold
  // compiles (/_error, /triage) that starve a 15s window under load.
  await expect(page).toHaveURL(/\/triage$/, { timeout: 30_000 });
}

async function planTaskAtEight(page: Page, title: string) {
  await captureTask(page, title);
  await page.getByRole("button", { name: "Do today" }).click();
  await goToStage(page, /Plan/);
  // Anchored: the Google approval bridge also labels buttons with the title.
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await page.getByRole("button", { name: /8a\s+Drop here/ }).click();
}

test("capture blocks empty saves", async ({ page }) => {
  await page.goto("/capture");

  await expect(
    page.getByRole("button", { name: "Save thought" }),
  ).toBeDisabled();
});

test("empty plan routes to capture instead of execute", async ({ page }) => {
  await page.goto("/calendar");

  await expect(
    page.getByRole("button", { name: "Start focusing" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Capture a thought" }).click();

  await expect(page).toHaveURL(/\/capture$/);
});

test("all areas pipeline board includes work from every area", async ({
  page,
}) => {
  await captureTask(page, "Main area board repair item");
  // #555: saving navigates to /triage for real now, and a second capture
  // submitted while the first parse is still in flight is dropped by the
  // capture guard (WorkflowContext submitCaptureText) — settle the first
  // parse (draft visible in triage) before starting the second capture.
  await expect(page).toHaveURL(/\/triage$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();

  await page.getByRole("button", { name: "Personal" }).click();
  await goToStage(page, /Capture/);
  await page
    .getByPlaceholder("Drop the thought here.")
    .fill("Personal board repair item");
  await page.getByRole("button", { name: "Save thought" }).click();

  await page.getByRole("button", { name: "All areas" }).click();
  // #555: in-app stage navigation is a real router.push now — settle on the
  // /areas URL before asserting the overview content.
  await expect(page).toHaveURL(/\/areas$/);

  await expect(page.getByText("Global scope")).toBeVisible();
  await expect(page.getByText("Main area board repair item")).toBeVisible();
  await expect(page.getByText("Personal board repair item")).toBeVisible();
});

test("started execution remains finishable and can complete into review", async ({
  page,
}) => {
  await planTaskAtEight(page, "Complete execution repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  // #555: stage navigation is a real router.push now (async), so wait for the
  // URL to settle before touching execute-stage controls — the plan screen
  // (still rendered mid-transition) matches the task-title locator twice.
  await expect(page).toHaveURL(/\/execute$/, { timeout: 15_000 });
  await page
    .getByRole("button", { name: /Complete execution repair item/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "Complete execution repair item" }),
  ).toBeVisible();
  // #572: ending a session opens the end sheet (outcome/duration/note)
  // before any closed verdict — "Done" is preselected, so Save alone
  // completes this flow.
  await page.getByTestId("cockpit-end-session").click();
  await page.getByTestId("end-session-save").click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("completed")).toBeVisible();
});

test("stuck execution is recoverable from review", async ({ page }) => {
  await planTaskAtEight(page, "Stuck execution repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await expect(page).toHaveURL(/\/execute$/, { timeout: 15_000 });
  await page
    .getByRole("button", { name: /Stuck execution repair item/ })
    .click();
  await page.getByTestId("cockpit-end-session").click();
  await page.getByTestId("end-session-outcome-stuck").click();
  await page.getByTestId("end-session-save").click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("Stuck execution repair item")).toBeVisible();

  await page.getByRole("button", { name: "Carry forward" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("button", { name: /^Stuck execution repair item/ }),
  ).toBeVisible();
});

test("skipped execution is recoverable from review", async ({ page }) => {
  await planTaskAtEight(page, "Skipped execution repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await expect(page).toHaveURL(/\/execute$/, { timeout: 15_000 });
  await page
    .getByRole("button", { name: /Skipped execution repair item/ })
    .click();
  // #572: "skipped" is a first-class outcome (audit P1) — no more instant
  // "Missed" button; it's a choice in the end sheet.
  await page.getByTestId("cockpit-end-session").click();
  await page.getByTestId("end-session-outcome-skipped").click();
  await page.getByTestId("end-session-save").click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("Skipped execution repair item")).toBeVisible();

  await page.getByRole("button", { name: "Carry forward" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("button", { name: /^Skipped execution repair item/ }),
  ).toBeVisible();
});

test("pause, resume, and side capture do not interrupt execution", async ({
  page,
}) => {
  await planTaskAtEight(page, "Pause and side capture repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await expect(page).toHaveURL(/\/execute$/, { timeout: 15_000 });
  await page
    .getByRole("button", { name: /Pause and side capture repair item/ })
    .click();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();

  await page
    .getByPlaceholder("Capture without leaving focus.")
    .fill("Side thought during focus");
  await page.getByRole("button", { name: "Save side thought" }).click();

  await expect(page).toHaveURL(/\/execute$/);
  await expect(page.getByText("Side thought saved")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pause and side capture repair item" }),
  ).toBeVisible();
});

test("all areas has a stable route alias", async ({ page }) => {
  await page.goto("/areas");

  await expect(
    page.getByRole("heading", { name: "All areas overview" }),
  ).toBeVisible();
  await expect(page.getByText("Global scope")).toBeVisible();
});

test("triage supports local edit and reassignment", async ({ page }) => {
  await captureTask(page, "Original triage edit item");

  await page.getByText("Adjust draft").click();
  const adjustPanel = page
    .locator("details")
    .filter({ hasText: "Adjust draft" });
  await adjustPanel.getByLabel("Title").fill("Edited triage item");
  await adjustPanel.getByLabel("First move").fill("Open the edited draft");
  await adjustPanel.getByLabel("Area").selectOption({ label: "Personal" });
  await page.getByRole("button", { name: "Save edits" }).click();

  await expect(page.getByText("Draft edit saved locally")).toBeVisible();
  await page.getByRole("button", { name: "Personal" }).click();
  await goToStage(page, /Triage/);

  await expect(
    page.getByRole("heading", { name: "Edited triage item" }),
  ).toBeVisible();
});

test("triage supports local split and merge", async ({ page }) => {
  await captureTask(page, "Split this bundled triage item");

  await page.getByText("Split or merge").click();
  await page.getByPlaceholder("First split task").fill("First split item");
  await page.getByPlaceholder("Second split task").fill("Second split item");
  await page.getByRole("button", { name: "Split draft" }).click();

  await expect(
    page.getByRole("heading", { name: "First split item" }),
  ).toBeVisible();
  await expect(page.getByText("Draft split saved locally")).toBeVisible();

  await page.getByRole("button", { name: /Merge next:/ }).click();

  await expect(
    page.getByRole("heading", { name: "First split item; Second split item" }),
  ).toBeVisible();
});

// #580 (one planning model — placement wins): the audit's exact journey.
// Capture → parse auto-creates a proposal → the user places the task
// directly on the hour rail. The placement supersedes the pending proposal
// atomically: ONE scheduled block, ZERO active proposals, and the old
// dual-model "accepting adds another block" warning copy never appears.
test("placing a task supersedes its parse-created proposal — one block, zero active proposals, no warning", async ({
  page,
}) => {
  const title = "Placement wins audit item";
  await captureTask(page, title);
  await page.getByRole("button", { name: "Do today" }).click();
  await goToStage(page, /Plan/);

  // The parse-created proposal is pending in the Proposals panel.
  await expect(
    page.getByRole("button", { name: "Accept local", exact: true }),
  ).toBeVisible();

  // Direct placement at 8am — THE scheduling action.
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await page.getByRole("button", { name: /8a\s+Drop here/ }).click();

  // ONE scheduled block on the rail (exactly one slot carries the title).
  await expect(
    page.getByRole("button", { name: new RegExp(`8a\\s+${title}`) }),
  ).toBeVisible();
  await expect(page.getByText("Tap to unplan")).toHaveCount(1);

  // ZERO active proposals: the pending proposal was superseded, so its
  // accept control is gone and the empty-proposals copy shows instead.
  await expect(
    page.getByRole("button", { name: "Accept local", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Select a task, then draft a local proposal."),
  ).toBeVisible();

  // The dual-model warning copy is dead.
  await expect(page.getByText(/already has a scheduled block/i)).toHaveCount(0);
  await expect(page.getByText(/Accepting adds/i)).toHaveCount(0);
});

test("plan exposes local proposal edit, reject, and accept controls", async ({
  page,
}) => {
  await captureTask(page, "Proposal parity repair item");
  await page.getByRole("button", { name: "Do today" }).click();
  await goToStage(page, /Plan/);

  await expect(page.getByText("Proposals")).toBeVisible();
  await page.getByRole("button", { name: "Move later" }).first().click();
  await expect(page.getByText("Proposal moved later")).toBeVisible();
  await expect(page.getByText("edited")).toBeVisible();

  await page.getByRole("button", { name: "Reject" }).first().click();
  await expect(page.getByText("Proposal rejected locally")).toBeVisible();

  await page
    .getByRole("button", { name: "Proposal parity repair item" })
    .click();
  await page.getByRole("button", { name: "Draft block" }).click();
  await expect(page.getByText("Proposal drafted locally")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).first().click();

  await expect(
    page.getByRole("button", { name: "Start focusing" }),
  ).toBeVisible();
});
