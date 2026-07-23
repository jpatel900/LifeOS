import { expect, test } from "@playwright/test";

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

/**
 * Browser proof of the #703 journey on the legacy cockpit surfaces: capture
 * saves raw and never parses, and the Sort action on the cockpit's own triage
 * stage is what round-trips through /api/parse-capture and produces drafts.
 *
 * HIGH-1 (#670): the route requires a verified bearer token and the E2E dev
 * server has no Supabase env, so the route is stubbed with the deterministic
 * mock-parser payload (task-map lifecycle precedent); the server-side
 * contract is proven by the vitest route tests.
 */
test("cockpit capture saves raw, then triage Sort round-trips through /api/parse-capture in mock mode", async ({
  page,
}) => {
  await stubParseCaptureRoute(page);
  await page.goto("/capture");

  const textarea = page.getByPlaceholder("Drop the thought here.");
  await textarea.fill("Mock mode parse proof capture");

  // #703: one action, and no second save button beside it.
  await expect(page.getByTestId("capture-page-save")).toHaveText("Capture");
  await expect(page.getByTestId("capture-page-save-raw")).toHaveCount(0);
  await page.getByTestId("capture-page-save").click();

  // Saving is synchronous and nothing parsed: the closing "back to: <hook>"
  // conclusion renders with no wait before it (no hook was entered, so it
  // falls back to the default label), and the surface does NOT navigate away
  // — there is no draft in triage yet to navigate to.
  await expect(page.getByTestId("capture-page-parsing")).toHaveCount(0);
  await expect(page.getByTestId("capture-page-conclusion")).toContainText(
    "back to: what you were doing",
  );
  await expect(page).toHaveURL(/\/capture$/);

  // #703: sorting is the separate, explicit step, taken on the triage stage.
  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );

  // The first client-side navigation in a dev run can spend several seconds
  // compiling, so give the stage switch a wide window.
  await page.getByRole("button", { name: /Triage/ }).click();
  await expect(page.getByTestId("triage-sheet-captures")).toContainText(
    "Mock mode parse proof capture",
    { timeout: 30_000 },
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

  await expect(
    page.getByRole("heading", { name: "Mock mode parse proof capture" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();

  // The UI states plainly that the mock parser produced these drafts.
  await expect(page.getByTestId("capture-parse-notice")).toContainText(
    /mock parser/i,
  );
});
