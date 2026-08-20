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
 * as redirects below. /calendar, /review, /health, and /areas still RENDER the
 * cockpit, so their URL truth is asserted against it here.
 *
 * C2-S4 note: for /health that is now a sequencing fact, not a capability one.
 * Every Health capability lives on the moments home at `?sheet=health`; the
 * route survives only until C2-S6 retires the legacy shell in one piece. The
 * assertion below is kept exactly because the route is still live — retiring it
 * early would leave that window unpinned.
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
          name: /Everything is working|\d+ things? needs? a look/,
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

// Final UX Loop C2-S0 (#742): signed-out visits to /settings/areas now
// redirect to the sign-in door (`useAreasLoadState.ts`'s status:"signed-out"
// drives a `router.replace("/login?next=…")` in page.tsx). This spec's dev
// server runs with NO Supabase env (see the file-level comment at the top of
// this suite), the same "demo mode" every other test here already relies on
// -- `createSupabaseBrowserClient()` returns null, `listAreas(null)` resolves
// with `provider: "mock"` and never rejects, so `status` goes straight to
// "ready" and the "signed-out" branch this redirect lives in is never
// reached. That is true of every ordinary (non-`@signed-in`) e2e spec in this
// repo, and was equally true of the in-place calm state #753 shipped before
// this change -- neither ever had device-tier coverage, only vitest coverage
// (`src/__tests__/areasSignedOutBoundary.test.tsx`, which drives the real
// client-side code path against a mocked Supabase client that actually
// rejects `getUser()`). Reaching the redirect in a real browser needs a
// Supabase-configured dev server, which only the `e2e-signed-in` CI job
// boots -- and that job signs a seeded user IN, so it cannot exercise a
// signed-OUT visit either without a second, differently-configured server
// this lane does not own (workflows are out of scope here). So: what THIS
// tier can honestly prove is the regression guard -- demo-mode visits keep
// loading normally and do not accidentally redirect -- at both viewports.
test.describe("/settings/areas demo-mode load is unaffected by the C2-S0 redirect (#742)", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    test(`${viewport.name}: stays on /settings/areas, no accidental redirect to /login`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/settings/areas");

      await expect(
        page.getByRole("heading", { level: 1, name: "Areas" }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/settings\/areas$/);
      await expect(page.getByTestId("areas-create-card")).toBeVisible();
    });
  }
});

/**
 * C2-S4 RE-ANCHOR (#687), not a deletion.
 *
 * This test used to assert that "View area health" LEFT the moments home for
 * the legacy `/health` route, and that the cockpit shell rendered there. Both
 * halves were true, and both were the Target Card 2 violation the Health port
 * exists to remove. The criterion the test is really pinning — "Health is
 * reachable from the home in one interaction" — is unchanged and still
 * asserted; what changed is where one interaction now lands.
 */
test("moments home: View area health opens Health in one interaction, without leaving the home", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  // The home's default moment is time-of-day derived; pin it to Start for a
  // deterministic run regardless of the wall clock.
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  await page.getByRole("button", { name: /View area health/ }).click();

  // One interaction, and the moments home is still the shell.
  await expect(page.getByTestId("health-sheet")).toBeVisible();
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);

  // The state change is in the URL, which is the half the old jump got right
  // for the wrong reason.
  //
  // Read as a PARAM, not as a URL suffix: `urlWithSheet` preserves whatever
  // query the home already carried, so `/?moment=start&sheet=health` is an
  // equally correct result and a `/\?sheet=health$/` regex would fail on it.
  // Pinning the suffix would pass today only because nothing else writes the
  // home's query yet, and break silently the day something does.
  expect(new URL(page.url()).searchParams.get("sheet")).toBe("health");
  await expect(
    page.getByRole("heading", {
      name: /Everything is working|\d+ things? needs? a look/,
    }),
  ).toBeVisible();

  // Back steps the moment, it does not leave the shell.
  await page.goBack();
  await expect(page.getByTestId("health-sheet")).toHaveCount(0);
  await expect(page.getByTestId("today-moments")).toBeVisible();
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
