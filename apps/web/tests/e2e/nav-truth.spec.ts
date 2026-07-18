import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

/**
 * One shell, one renderer per URL — the acceptance-bar oracle for epic #555
 * item 1 (docs/implementation-planning/plan-one-shell-routing.md). The URL
 * is the only source of navigation truth: Back/Forward, refresh, and direct
 * URL entry must always render the same screen, and Health + Settings must
 * be reachable in at most two interactions from `/`.
 */

interface StageCase {
  path: string;
  assertLandmark(page: Page): Promise<void>;
}

const STAGES: StageCase[] = [
  {
    path: "/capture",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Capture" }),
      ).toBeVisible();
    },
  },
  {
    path: "/calendar",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Hour rail" }),
      ).toBeVisible();
    },
  },
  {
    path: "/execute",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Focus queue" }),
      ).toBeVisible();
    },
  },
  {
    path: "/review",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", { name: /Ready to close|carry over/ }),
      ).toBeVisible();
    },
  },
  {
    path: "/health",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", {
          name: /All systems healthy|checks need attention/,
        }),
      ).toBeVisible();
    },
  },
  {
    path: "/areas",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", { name: "All areas overview" }),
      ).toBeVisible();
    },
  },
  {
    path: "/today",
    assertLandmark: async (page) => {
      await expect(page.getByText("At a glance")).toBeVisible();
    },
  },
];

for (const stage of STAGES) {
  test(`direct entry to ${stage.path} renders its screen`, async ({ page }) => {
    await page.goto(stage.path);
    await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();
    await stage.assertLandmark(page);
  });

  test(`refresh on ${stage.path} renders the same screen`, async ({ page }) => {
    await page.goto(stage.path);
    await stage.assertLandmark(page);

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`${stage.path}$`));
    await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();
    await stage.assertLandmark(page);
  });
}

test("in-app navigate then Back renders the previous screen's URL and landmark", async ({
  page,
}) => {
  await page.goto("/capture");
  await STAGES.find((s) => s.path === "/capture")!.assertLandmark(page);

  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: "Execute" })
    .click();

  await expect(page).toHaveURL(/\/execute$/);
  await STAGES.find((s) => s.path === "/execute")!.assertLandmark(page);

  await page.goBack();

  await expect(page).toHaveURL(/\/capture$/);
  await STAGES.find((s) => s.path === "/capture")!.assertLandmark(page);
});

test("/ renders the moments home, including after a cockpit round-trip", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  await page.goto("/capture");
  await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: "Execute" })
    .click();
  await expect(page).toHaveURL(/\/execute$/);

  // The cockpit's brand affordance is a real navigation to `/`, not a stage
  // transition — clicking it must land back on the moments home, not on the
  // cockpit-today grid at /today.
  await page.getByRole("button", { name: "LifeOS" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("today-moments")).toBeVisible();
});

test("moments home: View area health reaches /health in one interaction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  // The home's default moment is time-of-day derived; pin it to Start for a
  // deterministic run regardless of the wall clock.
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  await page.getByRole("button", { name: /View area health/ }).click();

  await expect(page).toHaveURL(/\/health$/);
  await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /All systems healthy|checks need attention/,
    }),
  ).toBeVisible();
});

test("moments home: Settings link reaches /settings/areas in one interaction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  await page.getByTestId("moments-settings-link").click();

  // First client-side visit to /settings/areas in a dev run can spend several
  // seconds compiling; allow more than the default 5s expect window.
  await expect(page).toHaveURL(/\/settings\/areas$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
});
