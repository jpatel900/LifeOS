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
 * Browser proof that the cockpit capture surface round-trips through
 * /api/parse-capture, the drafts land in triage, and the UI says the mock
 * parser ran. HIGH-1 (#670): the route now requires a verified bearer token
 * and the E2E dev server has no Supabase env, so the route is stubbed with
 * the deterministic mock-parser payload (task-map lifecycle precedent); the
 * server-side contract is proven by the vitest route tests.
 */
test("cockpit capture round-trips through /api/parse-capture in mock mode", async ({
  page,
}) => {
  await stubParseCaptureRoute(page);
  await page.goto("/capture");

  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );

  const textarea = page.getByPlaceholder("Drop the thought here.");
  await textarea.fill("Mock mode parse proof capture");
  await page.getByRole("button", { name: "Save thought" }).click();

  // #556 FR-026 containment: the capture stage holds the user through the
  // wait instead of navigating instantly — raw text stays fully visible,
  // the surface is locked against a second submit, and the "Saved; waiting
  // in Triage" toast has not fired yet. The mock parser resolves fast, so
  // this assertion races the response; it still catches a regression back
  // to instant navigation because the URL check below requires the wait to
  // have actually happened (the textarea would already be gone otherwise).
  await expect(textarea).toHaveValue("Mock mode parse proof capture");
  await expect(page.getByText("Saved; waiting in Triage")).toHaveCount(0);

  const parseResponse = await parseResponsePromise;
  expect(parseResponse.status()).toBe(200);
  const body = await parseResponse.json();
  expect(body.ok).toBe(true);
  expect(body.parser).toBe("mock");

  // Containment's closing beat: the "back to: <hook>" conclusion renders on
  // the capture stage itself before the toast/navigation fire (no hook was
  // entered, so it falls back to the default label).
  await expect(page.getByTestId("capture-page-conclusion")).toContainText(
    "back to: what you were doing",
  );

  // #555: capture -> triage is a real router.push now; the first client-side
  // navigation to /triage in a dev run can spend several seconds compiling
  // (a cold /_error compile alone has been observed north of 20s when this
  // spec leads a multi-file run), so give the URL commit a wide window.
  await expect(page).toHaveURL(/\/triage$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Mock mode parse proof capture" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();

  // The UI states plainly that the mock parser produced these drafts.
  await expect(page.getByTestId("capture-parse-notice")).toContainText(
    /mock parser/i,
  );
});
