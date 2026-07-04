import { expect, test } from "@playwright/test";
import {
  assertDesignedJson,
  canAuthenticate,
  login,
  readSmokeEnv,
  readSupabaseAccessToken,
} from "./helpers/smoke";

/**
 * Degraded-mode checks (issue #241, doctrine: local workflow survives a
 * provider outage). Each provider failing INDEPENDENTLY must degrade to the
 * DESIGNED state, not crash. These are always-run positive assertions: they
 * hit the surface, then assert the truthful designed contract.
 */

test.describe("degraded-mode: designed states, not crashes", () => {
  const env = readSmokeEnv();

  test("Supabase reachability degrades truthfully at /health", async ({
    page,
  }) => {
    // /health must render either persisted-user checks or an explicit
    // signed-out/mock-only surface — never a crashed page.
    await page.goto("/health");
    await expect(
      page.getByRole("button", { name: "Run system check" }),
    ).toBeVisible();

    // The health headline is one of the two designed states.
    const healthy = page.getByRole("heading", { name: "All systems healthy" });
    const attention = page.getByRole("heading", {
      name: /checks need attention/,
    });
    await expect(healthy.or(attention).first()).toBeVisible();
  });

  test("OpenAI parser config is configured/parseable, not a crash", async ({
    request,
  }) => {
    // GET /api/parse-capture exposes the parser runtime status as designed
    // JSON. Whether AI is configured or intentionally unavailable, the
    // contract holds and the status is a known value.
    await assertDesignedJson(request, "/api/parse-capture", (body) => {
      expect(body.ok).toBe(true);
      expect(["ready", "ai_unavailable"]).toContain(body.status);
      expect(["ai", "mock"]).toContain(body.preferredParser);
    });
  });

  test("Google connection status degrades to a designed state", async ({
    request,
  }) => {
    // Unauthenticated / unconfigured: the endpoint answers with a designed
    // payload (configured:false + disconnected, or a 401 asking to sign in).
    // This is the core always-run degraded-mode assertion and PASSES locally.
    const response = await request.get("/api/google-calendar/connection");
    expect(response.status(), "connection endpoint 5xx-crashed").toBeLessThan(
      500,
    );
    const anonBody = (await response.json()) as Record<string, unknown>;

    if (response.status() === 401) {
      // Configured server without a bearer token: designed "sign in" gate.
      expect(anonBody.ok).toBe(false);
      expect(String(anonBody.error)).toMatch(/sign in/i);
    } else {
      // Unconfigured server: designed local-only degradation.
      expect(anonBody.ok).toBe(true);
      expect(anonBody.configured).toBe(false);
      expect(["disconnected", "connected", "error"]).toContain(anonBody.status);
    }
  });

  test("authenticated Google connection status is a designed state", async ({
    page,
    request,
  }) => {
    // The authed branch must ALSO be a designed state, never a crash. This
    // leg needs a live provider, so it skips (does not fail) without it.
    test.skip(
      !canAuthenticate(env),
      "authenticated Google status needs SMOKE_EMAIL/SMOKE_PASSWORD + Supabase env",
    );

    const loggedIn = await login(page, env);
    test.skip(!loggedIn, "login failed; skipping authenticated Google probe");

    const accessToken = await readSupabaseAccessToken(page);
    test.skip(!accessToken, "no Supabase access token available after login");

    const authed = await request.get("/api/google-calendar/connection", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(authed.status()).toBeLessThan(500);
    const authedBody = (await authed.json()) as Record<string, unknown>;
    if (authedBody.ok) {
      expect(["disconnected", "connected", "error"]).toContain(
        authedBody.status,
      );
    } else {
      // A safe 503/401 with sanitized copy is still a designed degradation.
      expect(String(authedBody.error)).not.toMatch(/undefined|\[object/i);
    }
  });
});
