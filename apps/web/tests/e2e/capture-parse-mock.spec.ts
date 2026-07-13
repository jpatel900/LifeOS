import { expect, test } from "@playwright/test";

/**
 * Browser proof that the cockpit capture surface exercises the real
 * /api/parse-capture route. Without AI env vars the server answers in mock
 * mode, the drafts land in triage, and the UI says the mock parser ran.
 */
test("cockpit capture round-trips through /api/parse-capture in mock mode", async ({
  page,
}) => {
  await page.goto("/capture");

  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );

  await page.getByRole("textbox").fill("Mock mode parse proof capture");
  await page.getByRole("button", { name: "Save thought" }).click();

  const parseResponse = await parseResponsePromise;
  expect(parseResponse.status()).toBe(200);
  const body = await parseResponse.json();
  expect(body.ok).toBe(true);
  expect(body.parser).toBe("mock");

  // #555: capture -> triage is a real router.push now; the first client-side
  // navigation to /triage in a dev run can spend several seconds compiling,
  // so give the URL commit more than the default 5s expect window.
  await expect(page).toHaveURL(/\/triage$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Mock mode parse proof capture" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();

  // The UI states plainly that the mock parser produced these drafts.
  await expect(page.getByTestId("capture-parse-notice")).toContainText(
    /mock parser/i,
  );
});
