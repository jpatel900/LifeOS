import { expect, test } from "@playwright/test";
import { PARSE_CAPTURE_CLIENT_DEADLINE_MS } from "../../src/lib/ai/requestDeadline";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

const STALLED_TEXT = "Synthetic timeout thought";
const OTHER_TEXT = "Synthetic second thought";

test.beforeAll(async ({ browser }) => {
  const warmup = await browser.newPage();
  await warmup.goto("/", { timeout: 180_000 });
  await warmup.close();
});

test("a stalled sort shows its existing failure, keeps raw text and releases other rows", async ({
  page,
}) => {
  await page.clock.install();
  await stubParseCaptureRoute(page, { stallFirstRawText: STALLED_TEXT });
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  for (const text of [STALLED_TEXT, OTHER_TEXT]) {
    await page.getByTestId("capture-affordance").click();
    await page.getByTestId("capture-overlay-textarea").fill(text);
    await page.getByTestId("capture-overlay-save").click();
    await expect(page.getByTestId("capture-overlay")).toHaveCount(0);
  }
  await page.getByTestId("pipeline-overview-stage-triage").click();
  const captures = page.getByTestId("triage-sheet-captures");
  const stalledRow = captures
    .getByTestId(/^triage-sheet-capture-/)
    .filter({ hasText: STALLED_TEXT });
  const otherRow = captures
    .getByTestId(/^triage-sheet-capture-/)
    .filter({ hasText: OTHER_TEXT });
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/parse-capture") &&
      request.method() === "POST",
  );
  await stalledRow.getByRole("button", { name: "Sort", exact: true }).click();
  await request;
  await expect(
    stalledRow.getByRole("button", { name: "Sorting…" }),
  ).toBeVisible();
  await expect(stalledRow).toContainText(STALLED_TEXT);
  await page.clock.fastForward(PARSE_CAPTURE_CLIENT_DEADLINE_MS + 1);

  const failure = stalledRow.getByTestId(/^triage-sheet-sort-failed-/);
  await expect(failure).toBeVisible();
  await expect(failure).toHaveClass(/border-amber-500/);
  await expect(stalledRow).toContainText(STALLED_TEXT);
  // This device-tier fixture stubs parsing, not sign-in. Basic sorting still
  // needs the auth-only route, so a signed-out recovery cannot offer it.
  await expect(failure).toContainText("Sorting requires you to be signed in.");
  await expect(failure).not.toContainText("Try again, or use basic sorting.");
  await expect(stalledRow.getByTestId(/^triage-sheet-sort-basic-/)).toHaveCount(
    0,
  );
  await expect(
    otherRow.getByRole("button", { name: "Sort", exact: true }),
  ).toBeEnabled();
  await expect(
    stalledRow.getByRole("button", { name: "Sort", exact: true }),
  ).toBeEnabled();

  // A different row completes while the failed raw capture remains available.
  await otherRow.getByRole("button", { name: "Sort", exact: true }).click();
  await expect(page.getByTestId("triage-sheet-list")).toContainText(OTHER_TEXT);
  await expect(stalledRow).toContainText(STALLED_TEXT);
  const savedRaw = await page.evaluate(() => {
    const state = JSON.parse(
      window.sessionStorage.getItem("lifeos.phase2.workflow") ?? "{}",
    );
    return (state.captureItems ?? []).map(
      (item: { raw_text: string }) => item.raw_text,
    );
  });
  expect(savedRaw).toContain(STALLED_TEXT);

  // Retrying the original row uses the same helper's normal successful response.
  await stalledRow.getByRole("button", { name: "Sort", exact: true }).click();
  await expect(page.getByTestId("triage-sheet-list")).toContainText(
    STALLED_TEXT,
  );
  await expect(captures).toHaveCount(0);
});
