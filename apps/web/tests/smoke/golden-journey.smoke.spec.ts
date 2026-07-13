import { expect, test } from "@playwright/test";
import {
  canAuthenticate,
  cleanupSmokeRows,
  goldenCaptureText,
  goToStage,
  login,
  marker,
  newRunId,
  readSmokeEnv,
  readSupabaseAccessToken,
  type SmokeEnv,
} from "./helpers/smoke";

/**
 * Golden journey production smoke (issue #241, B8).
 *
 * Walks the canonical journey against a deployed target:
 *   capture -> parse -> triage -> plan -> approve-gate (STOP) -> execute
 *   -> review -> health
 *
 * Safety posture:
 * - Every created row carries the run marker; selection is BY marker so a
 *   populated prod account never derails the journey (unlike the clean-slate
 *   goldenJourneyState() seed helper, which finds "first pending").
 * - The default run asserts UP TO the Google approval gate and performs NO
 *   real external write. The Google write path only runs when
 *   SMOKE_GOOGLE_TEST_CALENDAR_ID is set, and it cleans up after itself.
 * - Best-effort marker-scoped cleanup runs at the end; failures are reported.
 */

const env: SmokeEnv = readSmokeEnv();
const runId = newRunId();

test("golden journey: capture -> triage -> plan -> gate -> execute -> review -> health", async ({
  page,
  request,
}) => {
  const captureText = goldenCaptureText(runId);

  // ---- Authenticate so the journey exercises the PERSISTED path -----------
  // With creds + Supabase configured, log in first so the cockpit's browser
  // session carries a real Supabase session and rows persist (enabling the
  // marker/cleanup contract). Without creds we fall back to the proven
  // local-only demo path instead of failing.
  let authenticated = false;
  if (canAuthenticate(env)) {
    authenticated = await login(page, env);
    console.log(
      authenticated
        ? "[smoke] authenticated: journey runs against persisted storage."
        : "[smoke] login failed: journey falls back to local-only demo mode.",
    );
  } else {
    console.log(
      "[smoke] no credentials: journey runs in local-only demo mode (no persisted rows).",
    );
  }

  // ---- Journey: capture -> parse ------------------------------------------
  // Force the deterministic MOCK parser for this journey's parse request. The
  // smoke's entire marker/cleanup safety contract depends on the draft title
  // carrying the run marker verbatim, and only the mock parser guarantees
  // that: the live AI parser classifies the marker-prefixed capture text as
  // an unactionable placeholder (parse_status "unsupported", zero drafts), so
  // the journey draft never reaches triage (observed in prod 2026-07-05 once
  // the AI provider came back healthy — issue #379). The AI provider's own
  // health is asserted separately by degraded-modes.smoke.spec.ts; this
  // journey exercises the app's capture→triage→plan→execute plumbing against
  // the deployed target, which the real /api/parse-capture route still serves
  // (only the provider call inside it is pinned to mock).
  await page.route("**/api/parse-capture", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    await route.continue({
      postData: JSON.stringify({ ...body, parserMode: "mock" }),
    });
  });
  await page.goto("/capture");
  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );
  await page.getByRole("textbox").first().fill(captureText);
  await page.getByRole("button", { name: "Save thought" }).click();

  const parseResponse = await parseResponsePromise;
  expect(parseResponse.status(), "parse-capture route did not answer").toBe(
    200,
  );
  const parseBody = (await parseResponse.json()) as { ok?: boolean };
  expect(parseBody.ok, "parse-capture degraded to an error").toBe(true);
  console.log("[smoke] PASS capture -> parse: raw capture round-tripped.");

  // ---- Journey: triage (select the journey's own draft by marker) ---------
  await page.waitForURL(/\/triage$/, { timeout: 30_000 });
  // Match by the run MARKER, not the full text: the mock parser (pinned
  // above) preserves the title verbatim, so the marker is guaranteed present.
  // If the marker is absent we FAIL LOUDLY rather than accept an
  // ambiguous/foreign draft — the smoke never touches rows it cannot identify.
  const journeyDraft = page.getByRole("heading", {
    name: new RegExp(marker(runId)),
  });
  await expect(
    journeyDraft,
    "journey draft not found in triage by marker (AI parser may have stripped the marker; the smoke refuses to accept an unidentifiable draft)",
  ).toBeVisible();
  // The triage surface shows one draft at a time; "Do today" accepts it.
  await page.getByRole("button", { name: "Do today" }).click();
  console.log("[smoke] PASS triage: journey draft accepted into a task.");

  // ---- Journey: plan (local proposal, no external write) ------------------
  await goToStage(page, /Plan/);

  // S9 (#261) point 6a — assert-if-present: a fresh journey account has no
  // duration-recalibration history (needs >= 3 completed sessions in the area
  // running off-estimate), so the sourced card is absent here. When it IS
  // present we assert it renders without crashing. The data-dependent behaviour
  // is proven deterministically in CI with seeded history (learningLoopSurfaces).
  const recalCard = page.getByTestId("proposal-recalibration");
  if ((await recalCard.count()) > 0) {
    await expect(recalCard.first()).toBeVisible();
    console.log(
      "[smoke] PASS S9 6a: recalibration surface present + rendered.",
    );
  } else {
    console.log(
      "[smoke] S9 6a: no recalibration history on this account (expected on a fresh journey).",
    );
  }

  await page.getByRole("button", { name: "Accept local", exact: true }).click();
  console.log(
    "[smoke] PASS plan: local proposal accepted (no external write).",
  );

  // ---- Approval gate: sacred STOP before any external write ---------------
  // The Google approval bridge must be present and safely gated. We assert it
  // exists and DO NOT click it — the default smoke never writes externally.
  await expect(page.getByText("Google approvals")).toBeVisible();
  const approveButton = page.getByRole("button", {
    name: /Approve Google event for/,
  });
  if ((await approveButton.count()) > 0) {
    // When Google is unavailable the control is disabled with plain-language
    // copy; when available it is present but we still refuse to click it.
    await expect(approveButton.first()).toBeVisible();
  }
  console.log(
    "[smoke] PASS approval-gate: Google write gate visible; STOP before external write.",
  );

  // ---- Journey: execute ---------------------------------------------------
  await page.getByRole("button", { name: "Start focusing" }).click();
  await goToStage(page, /Execute/);
  // Pick the planned block, then complete the session.
  const focusBlock = page.getByRole("button", {
    name: new RegExp(marker(runId)),
  });
  if ((await focusBlock.count()) > 0) {
    await focusBlock.first().click();
  }
  const completeButton = page.getByRole("button", { name: "Complete" });
  await expect(completeButton).toBeVisible();
  await completeButton.click();
  console.log("[smoke] PASS execute: focus session completed.");

  // ---- Journey: review ----------------------------------------------------
  await goToStage(page, /Review/);

  // S9 (#261) point 6b — assert-if-present: an override-pattern policy proposal
  // needs >= 3 overrides of one policy in the recent window, which a fresh
  // journey account has not accumulated, so the surface is absent here. When it
  // IS present we assert it renders. The propose->approve decision recording is
  // proven in CI (learningLoopSurfaces + workflow data-layer tests).
  const policySurface = page.getByTestId("policy-proposals");
  if ((await policySurface.count()) > 0) {
    await expect(policySurface.first()).toBeVisible();
    console.log(
      "[smoke] PASS S9 6b: policy-proposal surface present + rendered.",
    );
  } else {
    console.log(
      "[smoke] S9 6b: no override-pattern proposals on this account (expected on a fresh journey).",
    );
  }

  await page.getByRole("button", { name: "Save review" }).click();
  // Saving a review navigates back to the "today" stage by design; the smoke
  // does not depend on that transition and reaches health directly below.
  console.log("[smoke] PASS review: review entry saved.");

  // ---- Journey: health ----------------------------------------------------
  await page.goto("/health");
  await expect(
    page.getByRole("button", { name: "Run system check" }),
  ).toBeVisible();
  const healthy = page.getByRole("heading", { name: "All systems healthy" });
  const attention = page.getByRole("heading", {
    name: /checks need attention/,
  });
  await expect(
    healthy.or(attention).first(),
    "health surface did not reflect a truthful state",
  ).toBeVisible();
  console.log("[smoke] PASS health: health surface reflects a truthful state.");

  // ---- Best-effort marker-scoped cleanup ----------------------------------
  if (authenticated) {
    // Reuse the session established at the start of the journey.
    const accessToken = await readSupabaseAccessToken(page);
    if (accessToken) {
      const results = await cleanupSmokeRows(request, env, accessToken, runId);
      const failures = results.filter((result) => !result.ok);
      for (const result of results) {
        console.log(
          `[smoke] cleanup ${result.ok ? "ok" : "FAIL"} ${result.table}: ${result.detail}`,
        );
      }
      if (failures.length > 0) {
        console.warn(
          `[smoke] cleanup had ${failures.length} failure(s); rows may need manual removal (marker=${marker(runId)}).`,
        );
      }
    } else {
      console.warn(
        `[smoke] cleanup could not authenticate; rows may persist (marker=${marker(runId)}).`,
      );
    }
  } else {
    console.log(
      "[smoke] cleanup no-op: local mock/demo mode created no persisted rows.",
    );
  }
});

/**
 * Opt-in external write leg. Only runs when an explicit low-risk test
 * calendar id is provided. Even then it must clean up the created event.
 * Absent that var, this leg is skipped and the default run never writes.
 */
test("opt-in: explicit Google write against SMOKE_GOOGLE_TEST_CALENDAR_ID", async () => {
  // QA doctrine #269: deliberate external-write opt-in gate; default smoke runs skip unless an explicit low-risk test calendar id is supplied.
  test.skip(
    !env.googleTestCalendarId,
    "SMOKE_GOOGLE_TEST_CALENDAR_ID not set; external write path is intentionally not exercised.",
  );
  // QA doctrine #269: deliberate provider-auth opt-in gate; Google write proof requires SMOKE_EMAIL/SMOKE_PASSWORD and Supabase env.
  test.skip(
    !canAuthenticate(env),
    "authenticated session required to exercise the Google write path.",
  );

  // Intentionally conservative: the write path requires a live, connected
  // Google account plus a real proposal. This lane is the OWNER-ONLY,
  // opt-in path and is documented as unverified in this environment (no prod
  // credentials exist here). The guard above keeps the default run safe.
  test.fixme(
    true,
    "External Google write requires live prod Google connection; documented as an owner-run, unverified lane.",
  );
});
