import { expect, test, type Route } from "@playwright/test";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  requireSupabaseEnv,
} from "./helpers/signedInAccount";

/**
 * #969: browser-tier proof for the one remaining cross-tab timing boundary.
 *
 * Page A reaches /settings/areas without a session and queues the page's
 * sign-in redirect. Its actual /login navigation is held in flight. Page B,
 * in the same browser profile, signs in as the seeded account; Supabase's
 * real cross-tab event reaches page A before that held navigation can unmount
 * it. The recovery must land back on Areas with real page content.
 */
test.beforeAll(() => {
  requireSupabaseEnv();
});

test(`${SIGNED_IN_TAG} #969: a session restored before a queued Areas redirect unmounts the page recovers on Areas`, async ({
  browser,
}) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  let releaseHeldLogin: (() => void) | undefined;
  const allowHeldLogin = new Promise<void>((resolve) => {
    releaseHeldLogin = resolve;
  });
  let resolveLoginHeld: (() => void) | undefined;
  const loginHeld = new Promise<void>((resolve) => {
    resolveLoginHeld = resolve;
  });
  let resolveHeldLoginRoute: (() => void) | undefined;
  const heldLoginRouteSettled = new Promise<void>((resolve) => {
    resolveHeldLoginRoute = resolve;
  });
  let heldLoginRouteFailure: unknown;

  await pageA.route(
    "**/login?next=%2Fsettings%2Fareas**",
    async (route: Route) => {
      resolveLoginHeld?.();
      await allowHeldLogin;
      try {
        await route.continue();
      } catch (error) {
        heldLoginRouteFailure = error;
      } finally {
        resolveHeldLoginRoute?.();
      }
    },
  );

  try {
    await pageA.goto("/settings/areas");
    await loginHeld;
    const areasDocumentAfterSession = pageA.waitForEvent("framenavigated", {
      predicate: (frame) =>
        frame === pageA.mainFrame() &&
        new URL(frame.url()).pathname === "/settings/areas",
    });

    await pageB.goto("/login");
    await pageB.getByLabel("Email").fill(SEEDED_USERS.a.email);
    await pageB.getByLabel("Password").fill(SEEDED_USERS.a.password);
    const signInResponse = pageB.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/auth/v1/token") &&
        response.url().includes("grant_type=password"),
    );
    await pageB.getByRole("button", { name: /^sign in$/i }).click();
    expect((await signInResponse).ok()).toBe(true);
    await expect
      .poll(async () =>
        (await context.cookies()).some((cookie) =>
          /-auth-token(?:\.\d+)?$/.test(cookie.name),
        ),
      )
      .toBe(true);

    await areasDocumentAfterSession;
    releaseHeldLogin?.();
    await heldLoginRouteSettled;
    if (heldLoginRouteFailure) throw heldLoginRouteFailure;

    await expect(pageA).toHaveURL(/\/settings\/areas$/);
    await expect(
      pageA.getByRole("heading", { level: 1, name: "Areas" }),
    ).toBeVisible();
    await expect(pageA.getByTestId("areas-create-card")).toBeVisible();
  } finally {
    releaseHeldLogin?.();
    await context.close();
  }
});
