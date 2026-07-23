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
 * #713: the journey BRANCHES on credential availability, and each branch
 * asserts a designed truth rather than skipping:
 *
 * - Credentials present -> authenticate, then assert the full
 *   capture -> Sort -> draft -> plan -> gate -> execute -> review chain.
 * - Credentials absent (the weekly reality today, since SMOKE_EMAIL /
 *   SMOKE_PASSWORD and the Supabase repo variables are unset) -> assert the
 *   DESIGNED DEGRADED TRUTH: `/api/parse-capture` answers 401
 *   `auth_rejected` (the HIGH-1 / #670 guard rejects a tokenless request
 *   before any provider call), the capture is still saved raw, still listed
 *   in triage, and the failure surfaces as `triage-sheet-sort-failed-<id>`
 *   with the "sort it the simple way" retry offered. It must never silently
 *   skip and report success — before #713 it asserted 200 unconditionally and
 *   the weekly run failed with "Expected: 200 / Received: 401".
 *
 * The degraded branch STOPS at triage on purpose: with no successful parse
 * there is no draft, so "Do today" / "Accept local" / "Complete" / "Save
 * review" have nothing to act on. Health is asserted by BOTH branches — it is
 * a fresh `/health` navigation that touches no draft, so the no-draft
 * constraint does not reach it.
 *
 * SURFACE ANCHORING (#687/#703/#707). The deployed app serves the moments
 * home: `/capture` redirects to `/?capture=1` (the capture overlay) and
 * `/triage` redirects to `/?sheet=triage` (the triage sheet). The demoted
 * seven-stage cockpit — and with it the "Workflow stages" nav that
 * `goToStage()` drives — is reachable only under the #590 rollback
 * (NEXT_PUBLIC_MOMENTS_HOME=false). The shared capture/triage legs below are
 * therefore anchored on the moments-home surface, verified against the
 * deployed target. The save control is selected tolerantly
 * (`capture-(overlay|page)-save`) because both surfaces expose a direct
 * equivalent; the post-save and triage-crossing assertions are anchored on
 * what the deployed app actually renders.
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

test("golden journey: capture -> triage -> (authenticated: plan -> gate -> execute -> review) -> health", async ({
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
  // #703: capture is a pure raw save with ONE action ("Capture") and no
  // parse at the front door — the surface stays put instead of navigating.
  // The parse round-trip this leg asserts is now driven by the Sort action on
  // the triage stage, so the journey crosses there explicitly.
  //
  // #713: `/capture` redirects to the moments home with the capture overlay
  // open (#687), so the control is `capture-overlay-save`, not the cockpit
  // page's `capture-page-save`. Selected tolerantly so the #590 rollback
  // surface (`capture-page-save`) still resolves.
  await page.goto("/capture");
  await page.getByRole("textbox").first().fill(captureText);
  await page.getByTestId(/^capture-(overlay|page)-save$/).click();
  // Saving closes the overlay and the thought lands in the pending-triage
  // card on the home surface — the observable proof the raw save happened
  // without a parse (there is no parse spinner on this surface any more).
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("start-pending-triage-card")).toBeVisible({
    timeout: 30_000,
  });
  console.log("[smoke] PASS capture: raw capture saved without a parse.");

  // ---- Journey: triage Sort -> parse --------------------------------------
  // #713: navigate by URL rather than `goToStage()`. The "Workflow stages"
  // nav that helper drives exists only on the demoted seven-stage cockpit;
  // on the deployed moments-home surface `/triage` redirects to
  // `/?sheet=triage` and opens the triage sheet.
  await page.goto("/triage");
  // Marker-scoped, same safety posture as the draft selection below: a
  // populated prod account may hold other unsorted captures, and the smoke
  // never acts on a row it cannot identify as its own.
  const journeyCaptureRow = page
    .getByTestId(/^triage-sheet-capture-/)
    .filter({ hasText: marker(runId) });
  await expect(
    journeyCaptureRow,
    "journey capture not found in triage by marker",
  ).toBeVisible({ timeout: 30_000 });
  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );
  await journeyCaptureRow.getByTestId(/^triage-sheet-sort-/).click();

  const parseResponse = await parseResponsePromise;
  const parseBody = (await parseResponse.json()) as {
    ok?: boolean;
    errorCategory?: string;
  };

  if (!authenticated) {
    // ---- Degraded truth: unauthenticated Sort is REJECTED, not skipped ----
    // `captureParse.ts` attaches `Authorization` only when a Supabase browser
    // session exists, so with no credentials the Sort request goes out
    // tokenless and `/api/parse-capture` rejects it with 401 before any
    // provider call (HIGH-1 / #670 — an unauthenticated denial-of-wallet
    // path would otherwise reach the AI provider on the server key).
    //
    // This is a DESIGNED state, so the smoke asserts it exactly rather than
    // skipping: a silent skip is how a real break in this chain would hide.
    expect(
      parseResponse.status(),
      "unauthenticated parse-capture must be rejected with 401, not served",
    ).toBe(401);
    expect(parseBody.ok, "401 body must report ok:false").toBe(false);
    expect(
      parseBody.errorCategory,
      "401 must be the auth guard rejecting a tokenless request, not some other failure",
    ).toBe("auth_rejected");

    // Doctrine: raw capture survives an AI/auth failure. The thought is still
    // listed in triage, still verbatim — nothing was lost to the rejection.
    await expect(
      journeyCaptureRow,
      "capture must survive the rejected sort and stay listed in triage",
    ).toBeVisible();
    await expect(
      journeyCaptureRow,
      "capture text must be preserved verbatim after the rejected sort",
    ).toContainText(captureText);

    // The failure is SURFACED, in plain language, on the row it belongs to —
    // and a retry is offered rather than the person being left stuck.
    await expect(
      journeyCaptureRow.getByTestId(/^triage-sheet-sort-failed-/),
      "rejected sort must surface a plain-language failure on its own row",
    ).toBeVisible();
    await expect(
      journeyCaptureRow.getByTestId(/^triage-sheet-sort-basic-/),
      "rejected sort must still offer the simple-parser retry",
    ).toBeVisible();
    // Deliberately NOT clicked: the retry re-posts the same tokenless request
    // and is rejected the same way, so it can never produce a draft here.

    console.log(
      "[smoke] PASS triage Sort (degraded): parse-capture rejected 401 auth_rejected; " +
        "capture preserved, listed, failure surfaced, retry offered.",
    );
    console.log(
      "[smoke] NOT EXERCISED: draft -> plan -> approval-gate -> execute -> review. " +
        "No successful parse means no draft exists for those legs to act on. " +
        "Set SMOKE_EMAIL/SMOKE_PASSWORD + NEXT_PUBLIC_SUPABASE_URL/" +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY to exercise the full journey.",
    );
  } else {
    expect(parseResponse.status(), "parse-capture route did not answer").toBe(
      200,
    );
    expect(parseBody.ok, "parse-capture degraded to an error").toBe(true);
    console.log("[smoke] PASS triage Sort -> parse: capture round-tripped.");

    await runAuthenticatedJourney(page, runId);
  }

  // ---- Journey: health (BOTH branches) ------------------------------------
  // A fresh navigation that acts on no draft, so the degraded branch's
  // "no draft exists" constraint does not reach it — prod's truthfulness here
  // is worth asserting whether or not credentials were available.
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
 * The post-triage journey: draft -> plan -> approval gate -> execute -> review.
 *
 * Runs ONLY with credentials. It needs a draft, which only a successful parse
 * produces, so it cannot run unauthenticated (#713).
 *
 * UNVERIFIED SURFACE (#713): these legs are still anchored on the demoted
 * seven-stage cockpit — `goToStage()`'s "Workflow stages" nav, "Accept local",
 * "Start focusing", "Save review" — which the deployed moments-home surface no
 * longer serves at `/` (#687). They are preserved verbatim rather than
 * re-anchored on a guess: re-anchoring them touches `/calendar` and `/review`,
 * which #687 deliberately did NOT redirect because their capabilities are
 * owner-gated (port/keep/drop undecided). Unverified re-anchoring is exactly
 * what shipped the capture-leg break this issue had to fix. With no
 * credentials configured this path is dormant; when credentials are added it
 * will fail LOUDLY here rather than pass silently, which is the correct
 * signal that the re-anchor is still owed.
 */
async function runAuthenticatedJourney(
  page: import("@playwright/test").Page,
  runId: string,
) {
  // ---- Journey: triage (select the journey's own draft by marker) ---------
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
  // does not depend on that transition, and health is asserted by the caller
  // for BOTH branches.
  console.log("[smoke] PASS review: review entry saved.");
}

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
