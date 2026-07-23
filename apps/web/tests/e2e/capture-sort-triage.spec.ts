import { expect, test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

/**
 * #703 browser proof of the relocated slice, end to end on the shipping
 * moments surface: capture -> the thought is listed in triage, unsorted ->
 * tap Sort -> a draft appears for review.
 *
 * This is the journey the corrected #703 contract is about. Before this
 * slice, capture parsed immediately and triage had no parse action at all;
 * after it, capture is a pure raw save and Sort is the only thing that turns
 * a thought into a draft.
 *
 * HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
 * E2E dev server has no Supabase env, so the route is stubbed with the
 * deterministic mock-parser payload (task-map lifecycle precedent). The
 * server-side contract is proven by the vitest route tests, and the INV-8
 * containment of this new call site by
 * src/lib/ai/triageSortContainment.test.tsx.
 */

const CAPTURE_TEXT = "Sort proof capture";

test("capture stays raw, then the triage Sort action turns it into a draft", async ({
  page,
}) => {
  await stubParseCaptureRoute(page);
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  // The home's opening moment is wall-clock derived (heuristicMoment in
  // TodayMoments.tsx: >=17:00 local opens on Close), and the Pipeline rail
  // this spec drills through to reach triage lives on Start only. Pin the
  // moment with the 1/2/3 switch so the run is deterministic at any hour —
  // the same pin every other moments spec uses.
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  // --- Capture: one action, no parse, no wait -------------------------------
  await page.getByTestId("capture-affordance").click();
  const textarea = page.getByTestId("capture-overlay-textarea");
  await textarea.fill(CAPTURE_TEXT);

  // The second save button is gone: exactly one save control on the surface.
  await expect(page.getByTestId("capture-overlay-save")).toHaveText("Capture");
  await expect(page.getByTestId("capture-overlay-save-raw")).toHaveCount(0);

  await page.getByTestId("capture-overlay-save").click();

  // Saving is synchronous — it goes straight to the "back to: <hook>"
  // conclusion with no parse wait to sit through, and nothing was parsed.
  await expect(page.getByTestId("capture-overlay-parsing")).toHaveCount(0);
  await expect(page.getByTestId("capture-overlay-conclusion")).toContainText(
    "back to: what you were doing",
  );
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 15_000,
  });

  // --- Triage: the thought is listed, unsorted ------------------------------
  await page.getByTestId("pipeline-overview-stage-triage").click();
  const capturesList = page.getByTestId("triage-sheet-captures");
  await expect(capturesList).toBeVisible({ timeout: 15_000 });
  await expect(capturesList).toContainText(CAPTURE_TEXT);
  await expect(capturesList).toContainText("Saved as you wrote it");

  // No draft exists yet — sorting has not happened.
  await expect(page.getByTestId("triage-sheet-list")).toHaveCount(0);

  // --- Sort: the parse runs, on demand, and a draft appears ----------------
  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );

  await page
    .getByTestId(/^triage-sheet-sort-/)
    .first()
    .click();

  const parseResponse = await parseResponsePromise;
  expect(parseResponse.status()).toBe(200);
  const body = await parseResponse.json();
  expect(body.ok).toBe(true);
  expect(body.parser).toBe("mock");

  // A draft is now waiting for review, with the review actions on it...
  const draftList = page.getByTestId("triage-sheet-list");
  await expect(draftList).toBeVisible({ timeout: 15_000 });
  await expect(draftList).toContainText(CAPTURE_TEXT);
  await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();

  // ...and the same thought is no longer listed as unsorted, so it is never
  // shown twice.
  await expect(page.getByTestId("triage-sheet-captures")).toHaveCount(0);
});
