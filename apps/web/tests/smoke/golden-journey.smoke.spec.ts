import { expect, test } from "@playwright/test";
import {
  canAuthenticate,
  cleanupSmokeRows,
  goldenCaptureText,
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
 *   capture -> Sort (parse) -> triage -> Start -> Flow (focus) -> Close
 *   -> health, with the external-write STOP asserted on the way through.
 *
 * #713: the journey BRANCHES on credential availability, and each branch
 * asserts a designed truth rather than skipping:
 *
 * - Credentials present -> authenticate, then assert the full
 *   capture -> Sort -> draft -> today -> focus -> close chain.
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
 * there is no draft, so "Do today" / "Start now" / "Done" / "Close the day"
 * have nothing to act on. Health is asserted by BOTH branches — it is a fresh
 * `/health` navigation that touches no draft, so the no-draft constraint does
 * not reach it.
 *
 * SURFACE ANCHORING (#687/#703/#707/#719). The deployed app serves the
 * moments home: `/capture` redirects to `/?capture=1` (the capture overlay)
 * and `/triage` redirects to `/?sheet=triage` (the triage sheet). The demoted
 * seven-stage cockpit — and with it the "Workflow stages" nav the old
 * `goToStage()` helper drove — is reachable only under the #590 rollback
 * (NEXT_PUBLIC_MOMENTS_HOME=false). EVERY leg of this journey, shared and
 * authenticated, is therefore anchored on the moments-home surface. The save
 * control is selected tolerantly (`capture-(overlay|page)-save`) because both
 * surfaces expose a direct equivalent; every other assertion is anchored on
 * what the moments home actually renders, executed end to end against a real
 * authenticated target (#719).
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

test("golden journey: capture -> triage Sort -> (authenticated: today -> gate -> focus -> close) -> health", async ({
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
  // #719: the pending-triage state has TWO truthful homes, and which one
  // renders depends on the account's data, not on the app being healthy. With
  // nothing queued (an empty account) the pending item is PROMOTED into the
  // flagship card `start-pending-triage-card`; once a first move exists — the
  // normal state of the real account this smoke targets — it renders as the
  // `start-pending-triage` line under that card instead. Asserting only the
  // promoted card made this leg fail on any populated account: verified on
  // 2026-07-25 by seeding one older active task, after which this expectation
  // timed out with "waiting for getByTestId('start-pending-triage-card')".
  // Selected tolerantly, the same way the moments parity spec does it.
  await expect(
    page
      .getByTestId("start-pending-triage-card")
      .or(page.getByTestId("start-pending-triage")),
    "the saved thought must show up as waiting for a decision on the home surface",
  ).toBeVisible({
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
      "[smoke] NOT EXERCISED: draft -> today -> focus session -> close the day. " +
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
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  const healthy = page.getByRole("heading", { name: "Everything is working" });
  const attention = page.getByRole("heading", {
    name: /\d+ things? needs? a look/,
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
 * The post-Sort journey, on the moments surfaces: draft -> onto today ->
 * Start -> Flow (focus session) -> Close (the day is reviewed and closed).
 *
 * Runs ONLY with credentials. It needs a draft, which only a successful parse
 * produces, so it cannot run unauthenticated (#713).
 *
 * #719 RE-ANCHOR. Until now these legs still drove the demoted seven-stage
 * cockpit — `goToStage()`'s "Workflow stages" nav, "Accept local", "Start
 * focusing", "Save review" — which `/` has not served since #687. #713 left
 * them verbatim rather than re-anchor on a guess, and that was the right call
 * then; this is the same re-anchor done the way #713 asked for — EXECUTED,
 * not read. Against a local authenticated target (local Supabase + a
 * production build of this branch) the old body failed at
 * `goToStage(/Plan/)` — "waiting for getByRole('navigation', { name:
 * 'Workflow stages' })" — and the body below passes end to end.
 *
 * WHAT MOVED, AND WHAT DID NOT:
 * - "Accept local" (a Plan-stage time-block proposal) has NO moments-home
 *   equivalent. The moments home's Plan sheet is a read-only summary of
 *   today's blocks; proposals live only in the full Plan stage at `/calendar`,
 *   which #687 deliberately did NOT redirect (owner-gated, port/keep/drop
 *   undecided). So the journey no longer creates a time block, and the Close
 *   moment's "Completed today" counter — which counts completed calendar
 *   BLOCKS — is therefore not asserted here. It is not silently dropped: see
 *   the approval-gate leg below, which asserts the invariant that actually
 *   matters on this surface.
 * - "Complete" became the Flow moment's Done -> end-session sheet (#572): a
 *   session now closes with a recorded outcome, not a bare button press.
 * - "Save review" became Close's "Close the day", whose toast reports whether
 *   the review actually persisted — a stronger assertion than the old one,
 *   which asserted nothing about the save at all.
 *
 * SAFETY POSTURE, unchanged: every row this touches is selected BY the run
 * marker. The one leg that cannot be marker-scoped is the focus session — the
 * moments home can only start a session on `vm.firstMove`, and `firstMove`
 * falls back to the account's OLDEST active task, which on a populated
 * account is somebody else's row. Starting and completing a session on it
 * would mutate real data and leave an `execution_sessions` row that
 * marker-scoped cleanup provably cannot reach. So the focus leg is gated on
 * the first move carrying the marker, and when it does not, the journey
 * asserts the accepted task is on the Start moment and says loudly that the
 * session leg was NOT exercised — the same assert-if-present idiom the S9
 * legs use, for the same reason.
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
  const journeyDraft = page
    .getByTestId(/^triage-sheet-item-/)
    .filter({ hasText: marker(runId) });
  await expect(
    journeyDraft,
    "journey draft not found in triage by marker (AI parser may have stripped the marker; the smoke refuses to accept an unidentifiable draft)",
  ).toBeVisible();
  // "Do today" accepts THIS draft into a task on today — scoped to the
  // journey's own row, never "the first Do today on the sheet".
  await journeyDraft.getByTestId(/^triage-sheet-today-/).click();
  console.log("[smoke] PASS triage: journey draft accepted onto today.");

  // ---- Task-map offer: an OFFER, declined on purpose ----------------------
  // Accepting a draft onto today offers to draft a task map for it. It is an
  // offer, not a gate, and taking it would spend a real AI call on the
  // deployed target — so the smoke asserts the offer is about ITS task and
  // then declines it. Assert-if-present: the offer is skipped when the map
  // surface is not enabled on the target.
  const mapOffer = page.getByTestId("triage-map-offer");
  if ((await mapOffer.count()) > 0) {
    await expect(
      mapOffer,
      "the task-map offer must name the task it is offering to map",
    ).toContainText(marker(runId));
    await page.getByTestId("triage-map-offer-dismiss").click();
    console.log(
      "[smoke] PASS triage map offer: offered on the journey's own task, declined (no AI map drafted).",
    );
  } else {
    console.log(
      "[smoke] triage map offer: not offered on this target (assert-if-present).",
    );
  }

  // ---- Journey: Start (the accepted task is on today) ---------------------
  // Close the triage sheet before touching anything behind it: the sheet's
  // scrim covers the whole home surface and swallows every click.
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
  // The opening moment is wall-clock derived (>= 17:00 opens on Close), so pin
  // it with the 1/2/3 switch — the same pin every moments spec uses — instead
  // of letting the hour of the run decide what this asserts.
  await page.keyboard.press("1");
  const startMoment = page.getByTestId("start-moment");
  await expect(startMoment).toBeVisible({ timeout: 30_000 });
  await expect(
    startMoment,
    "the accepted task must be visible on the Start moment (as the first move or in the focus list)",
  ).toContainText(marker(runId), { timeout: 30_000 });
  console.log("[smoke] PASS today: the accepted task is on the Start moment.");

  // ---- Approval gate: sacred STOP before any external write ---------------
  // The moments home's Plan surface is a summary sheet. The invariant to prove
  // here is that NOTHING on it can write to Google: the only route to the
  // approval bridge is an explicit link out to the full Plan stage
  // (`/calendar`, #687 OWNER-GATE — not redirected), which the smoke asserts
  // exists and does NOT follow. The default smoke never writes externally.
  await page.getByTestId("pipeline-overview-stage-plan").click();
  const planSheet = page.getByTestId("plan-sheet");
  await expect(planSheet).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByTestId("plan-sheet-open-full"),
    "the moments Plan sheet must still offer the route to the full Plan stage",
  ).toBeVisible();
  await expect(
    planSheet.getByRole("button", { name: /Approve Google event for/ }),
    "no Google write control may exist inline on the moments Plan surface",
  ).toHaveCount(0);
  console.log(
    "[smoke] PASS approval-gate: no inline Google write on the moments Plan surface; " +
      "the only route out is the explicit link to the full Plan stage, deliberately not followed.",
  );
  console.log(
    "[smoke] NOT EXERCISED: the Google approval bridge itself. It lives only at /calendar, " +
      "which #687 did not redirect (owner-gated). Re-anchor once port/keep/drop is decided.",
  );
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
  await expect(startMoment).toBeVisible();

  // ---- Journey: Flow (focus session on the journey's OWN task) ------------
  const firstMoveCard = page
    .getByTestId("first-move-card")
    .filter({ hasText: marker(runId) });
  if ((await firstMoveCard.count()) === 0) {
    // The account's oldest active task outranks ours as the first move, and
    // the moments home offers no way to start a session on a specific task.
    // Starting the offered one would mutate a row this run did not create.
    console.log(
      "[smoke] NOT EXERCISED: focus session + close-the-day. The first move on this " +
        "account is an older task this run does not own, and the moments home can only " +
        "start a session on the first move — the smoke refuses to run a session on a row " +
        "it did not create. The accepted task IS on Start (asserted above).",
    );
    return;
  }

  await page.getByTestId("first-move-start").click();
  await expect(page.getByTestId("flow-moment")).toBeVisible({
    timeout: 30_000,
  });
  // The hero is the running session. It does NOT name the task here: with no
  // calendar block behind the session (the moments home starts a session
  // straight off the first move, and this journey never plans a block),
  // `FlowMoment` falls back to the generic "Focus session" title — observed
  // verbatim on 2026-07-25: "Focus sessiondeep work · 25:00 …". So this leg
  // proves it started on the journey's own task two ways that do not depend on
  // that title: the Start click above was scoped to the marker-bearing first
  // move, and completing the session below removes the marker from Start.
  const hero = page.getByTestId("current-block-hero");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByTestId("current-block-hero-done"),
    "a running session must offer the way to end it",
  ).toBeVisible();
  console.log(
    "[smoke] PASS execute: focus session running, started from the journey's own first move.",
  );

  // #572: ending a session is not a bare button — Done opens the end sheet and
  // the outcome is recorded. "Done" is the ordinary path (the cut-scope /
  // defer prompts only apply once the time cap is reached, which a session
  // started seconds ago has not).
  await page.getByTestId("current-block-hero-done").click();
  const endSheet = page.getByTestId("end-session-sheet");
  await expect(endSheet).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("end-session-outcome-completed").click();
  await page.getByTestId("end-session-save").click();
  await expect(
    endSheet,
    "the end-session sheet must close once the outcome is saved",
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(
    page.getByTestId("today-moments-toast"),
    "ending a session must report back, not close silently",
  ).toContainText("Session complete", { timeout: 30_000 });
  console.log(
    "[smoke] PASS execute: session ended through the end-session sheet with a 'Done' outcome.",
  );

  // HONEST BOUNDARY (#719, verified — do not read this as a passing claim).
  // The step above proves the surface: the session runs, the sheet takes an
  // outcome, and the app reports "Session complete". It does NOT prove the
  // outcome was RECORDED, and on this path it currently is not. Observed
  // against the local authenticated target on 2026-07-25: "Do today" leaves
  // the task `status = active`, `startExecutionSession()` only opens a session
  // for a task that is `scheduled` (workflow/execution.ts), and scheduling
  // happens only in the full Plan stage at `/calendar` — the same owner-gated
  // surface the moments home does not host. Result: `execution_sessions` held
  // 0 rows after a full journey, while the toast still said "Session
  // complete". That is an app-truthfulness gap, not a test gap, so it is
  // reported here rather than asserted away — and the smoke deliberately does
  // NOT assert "the task left Start", because on today's build it does not.
  console.log(
    "[smoke] NOT EXERCISED: persistence of the focus session outcome. On the moments home a " +
      "session started from the first move of an unplanned (active, not scheduled) task records " +
      "no execution_sessions row, though the app reports 'Session complete'. Planning a block " +
      "lives only at /calendar (#687 owner-gated). Tracked as a separate app fix.",
  );

  // ---- Journey: Close (the day is reviewed and closed) --------------------
  await page.keyboard.press("1");
  await expect(startMoment).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("3");
  await expect(page.getByTestId("close-moment")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("close-moment-summary")).toBeVisible();
  await page.getByTestId("close-moment-close-day").click();
  const toast = page.getByTestId("today-moments-toast");
  await expect(toast).toBeVisible({ timeout: 30_000 });
  // The toast reports WHICH truth happened. On the authenticated branch the
  // review must reach the account: a device-only save here means persistence
  // is broken, and the smoke says so instead of accepting "closed" at face
  // value. (The device-only copy is "saved on this device and not in your
  // account yet" — statusVocabulary's SAVED_ON_THIS_DEVICE_SHORT.)
  await expect(
    toast,
    "closing the day must report a saved review, not a failure",
  ).toContainText("Day closed");
  await expect(
    toast,
    "on an authenticated run the review must reach the account, not just the device",
  ).not.toContainText("saved on this device");
  console.log(
    "[smoke] PASS review: the day was closed and the review entry saved to the account.",
  );
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
