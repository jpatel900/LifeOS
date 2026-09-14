import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  expectOnlyKnownAccountFailures,
  gotoWithAccountSync,
  purgeOwnRows,
  requireSupabaseEnv,
  signIn,
  watchAccountFailures,
  type AccountClient,
  type AccountFailureWatch,
  type SupabaseEnv,
} from "./helpers/signedInAccount";

/**
 * C3 / Target Card 10 (Part of #687) — the device-tier onboarding spec seeds
 * sessionStorage, so it cannot prove the real password-login boundary. This
 * signed-in pin clears one seeded LOCAL Supabase user's own workflow, throws
 * away that preparation profile, and drives a new browser profile through the
 * actual login form. The first post-auth route must be `/welcome`, where the
 * ritual is already visible, with no document reload and no intermediate `/`.
 */

const ONBOARDING_COMPLETED_KEY = "lifeos.onboarding.completed";
const POST_AUTH_NAVIGATION_KEY = "lifeos.e2e.postAuthNavigations";
const POST_AUTH_NAVIGATION_RECORDING_KEY =
  "lifeos.e2e.recordPostAuthNavigations";

let env: SupabaseEnv;

test.beforeAll(() => {
  env = requireSupabaseEnv();

  // This spec mutates a seeded user's rows only through the authenticated
  // PostgREST helper. The signed-in CI lane obtains API_URL from `supabase
  // status -o env`; reject any other target before a delete can be attempted.
  const host = new URL(env.url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
    throw new Error(
      `The ${SIGNED_IN_TAG} onboarding regression only permits local Supabase; received ${env.url}.`,
    );
  }
});

const watches: AccountFailureWatch[] = [];

function watchPage(page: Page): void {
  watches.push(watchAccountFailures(page));
}

test.afterEach(() => {
  const seen = [...watches];
  watches.length = 0;
  expectOnlyKnownAccountFailures(seen);
});

/**
 * `signIn` deliberately finishes by synchronizing `/`, which is correct for
 * ordinary established-account drives but cannot prepare an empty account on
 * a fresh device. Mark only this disposable preparation profile completed so
 * the helper can safely land on Today, purge with the user's own JWT, then
 * close the profile. The actual assertion always starts from a new profile
 * whose storage is empty.
 */
async function clearSeededUserWorkflow(
  browser: Browser,
): Promise<AreaFixture[]> {
  const preparation = await browser.newContext();
  const page = await preparation.newPage();
  let account: AccountClient | null = null;
  let originalAreas: AreaFixture[] = [];
  let areaFixtureHidden = false;
  let handedOffToFreshProfile = false;
  try {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({ completedAt: "e2e" }));
    }, ONBOARDING_COMPLETED_KEY);

    await signIn(page, SEEDED_USERS.b);
    watchPage(page);
    account = await accountClient(page, SEEDED_USERS.b, env);
    originalAreas = await account.rows<AreaFixture>(
      "areas?select=id,is_active",
    );
    await purgeOwnRows(account);
    // Areas are deliberately soft-deleted: the schema revoked hard deletes.
    // `listAreas` admits only `is_active=true`, so this gives the canonical
    // trigger zero active areas without bypassing the product's data policy.
    await account.patch("areas?is_active=eq.true", { is_active: false });
    areaFixtureHidden = true;

    // Rebuild the provider from the cleared local account before closing this
    // profile. The completion marker remains profile-local, so it cannot
    // suppress the ritual in the fresh profile used by the real login drive.
    await gotoWithAccountSync(page, "/");
    await expect(page.getByTestId("today-moments")).toBeVisible({
      timeout: 30_000,
    });
    handedOffToFreshProfile = true;
    return originalAreas;
  } finally {
    if (areaFixtureHidden && !handedOffToFreshProfile && account) {
      for (const area of originalAreas) {
        await account.patch(`areas?id=eq.${area.id}`, {
          is_active: area.is_active,
        });
      }
    }
    await preparation.close();
  }
}

interface AreaFixture {
  id: string;
  is_active: boolean;
}

/** Restore the active/inactive state the seeded local account had on entry. */
async function restoreSeededAreaFixture(
  browser: Browser,
  originalAreas: AreaFixture[],
): Promise<void> {
  const restoration = await browser.newContext();
  const page = await restoration.newPage();
  try {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({ completedAt: "e2e" }));
    }, ONBOARDING_COMPLETED_KEY);
    await signIn(page, SEEDED_USERS.b);
    watchPage(page);
    const account = await accountClient(page, SEEDED_USERS.b, env);

    // The onboarding skip creates its default areas. They must not remain
    // active for later serial signed-in specs, whose fixture is User B's one
    // private area. Inactive rows are retained by the product's no-hard-delete
    // policy; re-enable each exact fixture row with its original state.
    await account.patch("areas?is_active=eq.true", { is_active: false });
    for (const area of originalAreas) {
      await account.patch(`areas?id=eq.${area.id}`, {
        is_active: area.is_active,
      });
    }
  } finally {
    await restoration.close();
  }
}

test.describe("C3 onboarding after real sign-in", () => {
  test(`${SIGNED_IN_TAG} a fresh profile reaches /welcome first after password sign-in, without a reload, and does not restore the completed ritual`, async ({
    browser,
  }) => {
    const originalAreas = await clearSeededUserWorkflow(browser);

    // New context means no cookie, localStorage, sessionStorage, or IndexedDB
    // survives from setup. This is the first device view of the emptied local
    // account, not a disguised rerun in the preparation profile.
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    try {
      await page.addInitScript(
        ([recordingKey, navigationKey]) => {
          let lastRecordedPath = window.location.pathname;
          const record = () => {
            if (window.sessionStorage.getItem(recordingKey) !== "true") return;
            if (window.location.pathname === lastRecordedPath) return;
            const paths = JSON.parse(
              window.sessionStorage.getItem(navigationKey) ?? "[]",
            ) as string[];
            paths.push(window.location.pathname);
            window.sessionStorage.setItem(navigationKey, JSON.stringify(paths));
            lastRecordedPath = window.location.pathname;
          };

          const pushState = window.history.pushState.bind(window.history);
          window.history.pushState = (...args) => {
            const result = pushState(...args);
            record();
            return result;
          };

          const replaceState = window.history.replaceState.bind(window.history);
          window.history.replaceState = (...args) => {
            const result = replaceState(...args);
            record();
            return result;
          };
        },
        [POST_AUTH_NAVIGATION_RECORDING_KEY, POST_AUTH_NAVIGATION_KEY] as const,
      );

      await page.goto("/login");
      await expect(page.getByLabel("Email")).toBeVisible();
      await page.getByLabel("Email").fill(SEEDED_USERS.b.email);
      await page.getByLabel("Password").fill(SEEDED_USERS.b.password);

      const postAuthDocumentNavigations: string[] = [];
      let observingPostAuthNavigation = false;
      page.on("request", (request) => {
        if (
          observingPostAuthNavigation &&
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        ) {
          postAuthDocumentNavigations.push(request.url());
        }
      });

      await page.evaluate((recordingKey) => {
        window.sessionStorage.setItem(recordingKey, "true");
      }, POST_AUTH_NAVIGATION_RECORDING_KEY);
      watchPage(page);
      observingPostAuthNavigation = true;
      await page.getByRole("button", { name: /^sign in$/i }).click();

      // This is the first post-auth observation: app-router history records
      // the client navigation synchronously, while the document-request watch
      // catches a hidden hard reload. A temporary `/` hop would make the
      // recorded first path `/`, even if it later arrived at `/welcome`.
      await expect(page).toHaveURL(/\/welcome$/);
      await expect(page.getByTestId("welcome-screen")).toBeVisible();
      await expect(page.getByTestId("onboarding-ritual")).toBeVisible();
      expect(postAuthDocumentNavigations).toEqual([]);
      await expect
        .poll(async () =>
          page.evaluate((navigationKey) => {
            return JSON.parse(
              window.sessionStorage.getItem(navigationKey) ?? "[]",
            ) as string[];
          }, POST_AUTH_NAVIGATION_KEY),
        )
        .toEqual(["/welcome"]);

      await page.getByTestId("onboarding-areas-skip").click();
      await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
      await page.getByTestId("onboarding-day-skip").click();
      await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();
      await page.getByTestId("onboarding-capture-skip").click();

      await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
    } finally {
      await fresh.close();
      await restoreSeededAreaFixture(browser, originalAreas);
    }
  });
});
