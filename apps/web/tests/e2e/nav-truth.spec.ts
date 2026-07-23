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
 *
 * #687 update: /today, /capture, /triage, and /execute are now flag-gated
 * redirect shims into the moments home (the demoted cockpit surfaces there
 * were old versions of live moments surfaces). Their URL truth is asserted
 * as redirects below. /calendar, /review, /health, and /areas keep the
 * cockpit renderer (OWNER-GATE: capabilities exist only there).
 */

interface StageCase {
  path: string;
  assertLandmark(page: Page): Promise<void>;
}

const STAGES: StageCase[] = [
  {
    path: "/calendar",
    assertLandmark: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Hour rail" }),
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
];

// #687: each redirected legacy route must land on `/` with the matching
// moments surface open — no cockpit shell anywhere on the path.
const REDIRECTED: Array<{
  path: string;
  landedUrl: RegExp;
  assertSurface(page: Page): Promise<void>;
}> = [
  {
    path: "/today",
    landedUrl: /\/$/,
    assertSurface: async (page) => {
      await expect(page.getByTestId("today-moments")).toBeVisible();
    },
  },
  {
    path: "/capture",
    landedUrl: /\/\?capture=1$/,
    assertSurface: async (page) => {
      await expect(
        page.getByRole("dialog", { name: "Capture a thought" }),
      ).toBeVisible();
    },
  },
  {
    path: "/triage",
    landedUrl: /\/\?sheet=triage$/,
    assertSurface: async (page) => {
      await expect(page.getByTestId("triage-sheet-empty")).toBeVisible();
    },
  },
  {
    path: "/execute",
    landedUrl: /\/\?moment=flow$/,
    assertSurface: async (page) => {
      await expect(page.getByTestId("flow-moment")).toBeVisible();
    },
  },
];

for (const target of REDIRECTED) {
  test(`direct entry to ${target.path} redirects to the moments home surface`, async ({
    page,
  }) => {
    await page.goto(target.path);
    await expect(page).toHaveURL(target.landedUrl, { timeout: 30_000 });
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
    await target.assertSurface(page);
  });
}

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
  // #687: /capture and /execute are redirect shims now; the cockpit-internal
  // round-trip runs between the two cockpit surfaces that stay live.
  await page.goto("/calendar");
  await STAGES.find((s) => s.path === "/calendar")!.assertLandmark(page);

  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: "Review" })
    .click();

  await expect(page).toHaveURL(/\/review$/);
  await STAGES.find((s) => s.path === "/review")!.assertLandmark(page);

  await page.goBack();

  await expect(page).toHaveURL(/\/calendar$/);
  await STAGES.find((s) => s.path === "/calendar")!.assertLandmark(page);
});

test("/ renders the moments home, including after a cockpit round-trip", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  await page.goto("/calendar");
  await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();

  // The cockpit's brand affordance is a real navigation to `/`, not a stage
  // transition — clicking it must land back on the moments home, not on the
  // cockpit-today grid at /today.
  await page.getByRole("button", { name: "LifeOS" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("today-moments")).toBeVisible();
});

test("cockpit stage rail's Capture node lands on the moments home, not a legacy shell (#687)", async ({
  page,
}) => {
  await page.goto("/calendar");
  await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: "Capture" })
    .click();

  // The push goes to /capture, whose page redirects into the moments home
  // with the capture overlay open — the legacy capture shell never renders.
  await expect(page).toHaveURL(/\/\?capture=1$/, { timeout: 30_000 });
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Capture a thought" }),
  ).toBeVisible();
});

test("/settings/areas content is centered, not stretched edge-to-edge (#687)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings/areas");

  const heading = page.getByRole("heading", { level: 1, name: "Areas" });
  await expect(heading).toBeVisible();

  // AdminShell now wraps content in the same centered max-w-6xl container as
  // its header; at 1280px the content column must start well inside the
  // viewport instead of flush against its left edge.
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThan(40);
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
