import { expect, test, type Locator, type Page } from "@playwright/test";

async function gotoCapture(page: Page) {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { level: 1, name: "Capture" }),
  ).toBeVisible();
}

async function createLocalDraftCandidate(page: Page, text: string) {
  await gotoCapture(page);
  await page
    .getByPlaceholder("What's on your mind? Type anything...")
    .fill(text);
  await page.getByRole("button", { name: "Save and organize" }).click();
  await page.getByRole("link", { name: "Triage" }).click();
  await expect(page).toHaveURL(/\/triage$/);
  await expect(
    page.getByRole("button", { name: "Accept task draft" }).first(),
  ).toBeVisible();
}

async function waitForHealthResult(page: Page) {
  await expect
    .poll(
      async () => {
        if (
          await page
            .getByRole("alert")
            .isVisible()
            .catch(() => false)
        ) {
          return "error";
        }
        if (
          await page
            .getByRole("heading", { name: "What needs attention now" })
            .isVisible()
            .catch(() => false)
        ) {
          return "ready";
        }
        if (
          await page
            .getByRole("heading", { name: "No active warnings" })
            .isVisible()
            .catch(() => false)
        ) {
          return "ready";
        }
        return "loading";
      },
      { timeout: 30_000 },
    )
    .not.toBe("loading");
}

async function assertNoHorizontalOverflow(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const layout = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(
        html.scrollWidth,
        body?.scrollWidth ?? 0,
        html.clientWidth,
      ),
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
}

async function tabUntilFocused(page: Page, locator: Locator, maxTabs = 80) {
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await locator
      .first()
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (focused) {
      return;
    }
  }

  throw new Error(`Could not focus target by tabbing within ${maxTabs} tabs.`);
}

test("header quick note save feedback shows clear error then success", async ({
  page,
}) => {
  await gotoCapture(page);

  await page.getByRole("button", { name: "Save quick note" }).click();
  await expect(
    page.getByText(
      "Quick note was not saved. Type a note first, or use Capture.",
    ),
  ).toBeVisible();

  await page.getByLabel("Quick note text").fill("P0 quick note check");
  await page.getByRole("button", { name: "Save quick note" }).click();

  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Triage" }).first(),
  ).toBeVisible();
});

test("home cockpit quick capture shows truthful error/success and route links", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily loop" })).toBeVisible();
  await expect(
    page.getByText("No sample data is created until you save something."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save quick capture" }).click();
  await expect(page.getByText("Type a note first.")).toBeVisible();

  await page
    .getByLabel("Home quick capture text")
    .fill("Home cockpit capture test");
  await page.getByRole("button", { name: "Save quick capture" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(
    page.getByText("Saved on this device only. Review in Triage or Review."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open Triage" }).first().click();
  await expect(page).toHaveURL(/\/triage$/);
});

test("review page can create a basic review log entry and keeps next actions visible", async ({
  page,
}) => {
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { level: 1, name: "Review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Past reviews and notes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Plan the next block" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create daily review" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create daily review" }).click();

  await expect(page.getByText("Daily review saved")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Planning" }),
  ).toBeVisible();
});

test("capture save feedback and save-and-organize route to triage", async ({
  page,
}) => {
  await gotoCapture(page);

  await page
    .getByPlaceholder("What's on your mind? Type anything...")
    .fill("Call dentist and bring insurance details");
  await page.getByRole("button", { name: "Save thought" }).click();

  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText(/raw capture was saved/i)).toBeVisible();

  await page
    .getByPlaceholder("What's on your mind? Type anything...")
    .fill("Need a focused block for project proposal");
  await page.getByRole("button", { name: "Save and organize" }).click();

  await expect(page.getByText("Drafts ready for Triage.")).toBeVisible();
  await page.getByRole("link", { name: "Review it now" }).click();
  await expect(page).toHaveURL(/\/triage$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Triage" }),
  ).toBeVisible();
});

test("triage edit and note actions work when an item exists", async ({
  page,
}) => {
  await createLocalDraftCandidate(
    page,
    "Triage candidate task for notes and edit",
  );

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Title").fill("Edited triage draft title");
  await page.getByRole("button", { name: "Save edit" }).click();

  await expect(
    page.getByText("AI notes are from the original capture"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mark for later" }).first().click();
  await expect(
    page.getByText("Added note: review later.").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add area note" }).first().click();
  await expect(
    page.getByText("Added note: consider changing area.").first(),
  ).toBeVisible();
});

test("accepting triage item leads to planning path", async ({ page }) => {
  await createLocalDraftCandidate(page, "Acceptable triage item for planning");

  await page.getByRole("button", { name: "Accept task draft" }).first().click();
  await expect(page.getByText("Ready for Planning")).toBeVisible();

  await page.getByRole("link", { name: "Plan time for this" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Planning" }),
  ).toBeVisible();
});

test("health page loads and run-check shows disabled and enabled states", async ({
  page,
}) => {
  await page.goto("/health");
  const runCheck = page.getByRole("button", { name: "Run system check" });
  const statusLine = page.getByRole("status").first();
  await expect(runCheck).toBeVisible();
  await expect(statusLine).toHaveText(
    /Run in progress\. Please wait\.|System check complete\./,
  );

  await waitForHealthResult(page);
  await expect(runCheck).toBeEnabled();
  await runCheck.click();
  await expect(statusLine).toHaveText(
    /Run in progress\. Please wait\.|System check complete\./,
  );
  await expect(page.getByText("System check complete.")).toBeVisible();
});

test("areas reset cancel preserves state and confirm shows success", async ({
  page,
}) => {
  await page.goto("/settings/areas");
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset this browser" }).click();
  await expect(
    page.getByText("Reset local data on this browser?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText("Reset local data on this browser?"),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Reset this browser" }).click();
  await page.getByRole("button", { name: "Yes, reset this browser" }).click();
  await expect(page.getByText("Local browser data reset.")).toBeVisible();
});

test("execute empty state presents the primary fallback CTA", async ({
  page,
}) => {
  await page.goto("/execute");
  await expect(
    page.getByRole("heading", { level: 1, name: "Execute" }),
  ).toBeVisible();
  await expect(
    page.getByText("No current task is in execution."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Planning" }),
  ).toBeVisible();
});

test.describe("mobile overflow checks", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px viewport has no horizontal overflow on core routes", async ({
    page,
  }) => {
    await assertNoHorizontalOverflow(page, "/");
    await assertNoHorizontalOverflow(page, "/capture");
    await assertNoHorizontalOverflow(page, "/triage");
    await assertNoHorizontalOverflow(page, "/calendar");
    await assertNoHorizontalOverflow(page, "/execute");
    await assertNoHorizontalOverflow(page, "/review");
    await assertNoHorizontalOverflow(page, "/health");
    await assertNoHorizontalOverflow(page, "/settings/areas");
  });
});

test("keyboard tab path reaches key controls", async ({ page }) => {
  await gotoCapture(page);
  await page.locator("body").click({ position: { x: 10, y: 10 } });

  await tabUntilFocused(page, page.getByLabel("Quick note text"));
  await tabUntilFocused(
    page,
    page.getByRole("button", { name: "Save quick note" }),
  );
  await tabUntilFocused(
    page,
    page.getByLabel("Area for this saved thought"),
  );
  await tabUntilFocused(page, page.getByLabel("What are you thinking about?"));
  await tabUntilFocused(
    page,
    page.getByRole("button", { name: "Save thought" }),
  );
});

test("home keyboard tab path reaches cockpit controls", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").click({ position: { x: 10, y: 10 } });

  await tabUntilFocused(page, page.getByLabel("Home quick capture text"));
  await tabUntilFocused(
    page,
    page.getByRole("button", { name: "Save quick capture" }),
  );
  await tabUntilFocused(
    page,
    page.getByRole("link", { name: "Capture a thought" }),
  );
});

test("triage and planning keyboard paths reach primary actions when a draft exists", async ({
  page,
}) => {
  await createLocalDraftCandidate(page, "Keyboard-path planning candidate");
  await page.locator("body").click({ position: { x: 10, y: 10 } });

  await tabUntilFocused(
    page,
    page.getByRole("button", { name: "Accept task draft" }),
  );
  await page.getByRole("button", { name: "Accept task draft" }).first().click();

  await expect(page.getByText("Ready for Planning")).toBeVisible();
  await page.getByRole("link", { name: "Plan time for this" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("button", { name: "Suggest a time" }).first(),
  ).toBeVisible();

  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await tabUntilFocused(
    page,
    page.getByRole("button", { name: "Suggest a time" }),
  );
});

test("execute, review, and areas keyboard paths reach key controls", async ({
  page,
}) => {
  await createLocalDraftCandidate(page, "Keyboard-path execute candidate");
  await page.getByRole("button", { name: "Accept task draft" }).first().click();
  await page.getByRole("link", { name: "Plan time for this" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("button", { name: "Suggest a time" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Suggest a time" }).first().click();
  await page.getByRole("button", { name: "Plan this time" }).first().click();

  await page.goto("/execute");
  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await tabUntilFocused(page, page.getByRole("button", { name: "Start" }));

  await page.goto("/review");
  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await tabUntilFocused(
    page,
    page.getByRole("button", { name: "Create daily review" }),
  );

  await page.goto("/settings/areas");
  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await tabUntilFocused(page, page.getByRole("button", { name: "Teal" }).first());
});
