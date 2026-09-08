import { expect, test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

/**
 * #581 (epic #555 item 7) — the three-step onboarding ritual.
 *
 * C3 (Part of #687, C3 card 10) — the ritual now lives at its own route,
 * `/welcome`, instead of rendering inline on top of `/`. A zero-state
 * session landing on `/` hands off there via a client-side `replace` (no
 * reload — Target Card 10 criterion 1); reloading `/welcome` BEFORE any
 * step has persisted anything re-derives the same eligibility and shows the
 * ritual again, at step 1. A reload AFTER step 1 (areas already persisted)
 * does NOT resume the ritual — the live areaCount/captureCount predicate
 * (unchanged by this slice) is no longer zero, so it bounces to Today; this
 * is pre-existing `shouldShowOnboarding` behavior, not new here, and is
 * pinned explicitly below rather than left implied. Completing or skipping
 * through the ritual hands back to `/` (Today), where the #551 state-truth
 * surfaces are the payoff.
 *
 * Trigger truth (design note): first session with zero areas AND zero
 * captures, deterministic over WorkflowContext state. The demo provider
 * seeds four mock areas into a fresh context, so a *plain* fresh demo load
 * never sees the ritual (second describe below proves that, which is also
 * why every other spec in this suite is unaffected). To produce a genuine
 * zero-state account in demo mode, seed the provider's sessionStorage slot
 * (`lifeos.phase2.workflow`) with an empty-but-valid workflow state before
 * the app boots — the exact shape createInitialWorkflowState() produces,
 * minus the seeded areas/healthChecks. The init script only writes when the
 * slot is empty so the post-ritual state (areas + capture) survives the
 * reload that proves the ritual never re-shows.
 */

const WORKFLOW_STORAGE_KEY = "lifeos.phase2.workflow";

const ZERO_WORKFLOW_STATE = {
  areas: [],
  captureItems: [],
  taskDrafts: [],
  projectDrafts: [],
  ambiguityAssessments: [],
  timeBlockProposalDrafts: [],
  projects: [],
  tasks: [],
  timeBlockProposals: [],
  calendarBlocks: [],
  executionSessions: [],
  healthChecks: [],
  reviewLog: [],
  wipRefusal: null,
};

test.describe("onboarding ritual on a zero-state session (#581)", () => {
  test.beforeEach(async ({ page }) => {
    // HIGH-1 (#670): /api/parse-capture requires a verified bearer token and
    // E2E has no Supabase env, so any parse this suite touches must run
    // against the deterministic mock-parser stub (task-map lifecycle
    // precedent). Since #703 the ritual's capture step never parses — the
    // stub stays as the guard that makes that observable: if a parse ever
    // reappears here it answers deterministically instead of 401-ing.
    await stubParseCaptureRoute(page);
    await page.addInitScript(
      ([key, value]) => {
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, value);
        }
      },
      [WORKFLOW_STORAGE_KEY, JSON.stringify(ZERO_WORKFLOW_STATE)] as const,
    );
  });

  // C3 own-URL, criteria 1 + the reload contract: a brand-new (zero-state)
  // session hands off from `/` to `/welcome` with no full reload — a single
  // `page.goto("/")` is the only navigation this test ever issues; the URL
  // change to `/welcome` happens on its own, client-side. Reloading BEFORE
  // any step has persisted anything keeps the ritual showing at that same
  // URL, at step 1 (the honest scope of this claim — see the next test for
  // what a reload AFTER step 1 actually does, which is different).
  test("a zero-state session hands off from / to /welcome with no reload, and a reload there (before any step completes) keeps the ritual", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("welcome-screen")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();
  });

  // C3 verifier correction (MEDIUM): an earlier version of this PR's own
  // commit message overclaimed "a reload there keeps the ritual at the same
  // step" — true only for step 1 (pinned above), false from step 2 onward.
  // The zero-state trigger (`shouldShowOnboarding`, unchanged by this slice)
  // reads LIVE `areaCount`/`captureCount` — once step 1 persists real areas,
  // a reload re-derives eligibility from that now-non-zero count and finds
  // it false, same as it always would have on the pre-C3 inline ritual (a
  // full reload of `/` there re-mounted the SAME hook fresh, with the SAME
  // predicate). This is not a regression this slice introduced; it is
  // pre-existing behavior of the shared predicate, now simply visible as an
  // address-bar change (`/welcome` -> `/`) instead of an in-place swap.
  // Recoverable via Settings' "Run setup again", which the rerun flag makes
  // unconditional regardless of area/capture count.
  test("a reload at /welcome AFTER step 1 persists areas does NOT resume the ritual — it bounces to Today (pre-existing predicate behavior, not a C3 regression)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByTestId("onboarding-areas-continue").click();
    await expect(page.getByTestId("onboarding-step-day")).toBeVisible();

    await page.reload();
    // Root + optional query — same lenient "back on Today" shape used
    // throughout this file.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });

  test("runs areas -> day -> first capture to a truthful home, and never re-shows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();

    // Step 1 — areas: the three prefilled editable chips persist on continue.
    await expect(page.getByTestId("onboarding-step-areas")).toBeVisible();
    await expect(page.getByTestId("onboarding-area-name")).toHaveCount(3);
    await page.getByTestId("onboarding-areas-continue").click();

    // Step 2 — day shape: prefilled 9-17 / 45; continue accepts the
    // prefill. The Google Calendar link-out is present but optional.
    await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
    await expect(page.getByTestId("onboarding-calendar-link")).toBeVisible();
    await page.getByTestId("onboarding-day-continue").click();

    // Step 3 — first capture through the shared CaptureCore. #703: capture
    // is a pure raw save now — nothing is parsed here, so this step has ONE
    // action and never waits on /api/parse-capture. (The capture -> parse ->
    // draft round-trip moved to the triage Sort action with the parse
    // itself, and is proven by capture-sort-triage.spec.ts and
    // moments-home-parity.spec.ts on this same moments home.)
    await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();
    await expect(page.getByTestId("onboarding-capture-save-raw")).toHaveCount(
      0,
    );
    const textarea = page.getByTestId("onboarding-capture-textarea");
    await textarea.fill("Plan the kickoff agenda for Monday");
    await textarea.press("Enter");

    // FR-026 containment: the raw text stays visible through the closing
    // beat rather than vanishing the instant Enter is pressed.
    await expect(textarea).toHaveValue("Plan the kickoff agenda for Monday");
    await expect(
      page.getByTestId("onboarding-capture-conclusion"),
    ).toContainText("back to: what you were doing");

    // The ritual hands off to Today at a truthful URL — no reload, a plain
    // client-side replace — where the #551 state-truth surfaces are the
    // payoff: hero visible, and a pending-triage surface showing the
    // captured thought waiting for a decision (also proof the capture
    // stayed RAW: a parsed capture would have left the pending-triage count
    // and become a draft instead).
    // A bare `/\/$/` would be too strict here: Today's own moment self-heal
    // (`useMomentUrlState`, unrelated to this slice) legitimately appends
    // `?moment=...` the instant it mounts — the truthful-URL claim this test
    // owns is "back on Today's root", not "no query string at all", the same
    // lenient shape the pre-existing rerun test below already used.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
    await expect(page.getByTestId("start-moment")).toBeVisible();
    await expect(page.getByTestId("start-hero")).toBeVisible();
    // With no first move queued (zero state), the pending item is PROMOTED
    // into the flagship card (start-pending-triage-card); with a first move
    // it renders as the start-pending-triage line. Either surface is the
    // #551 truth.
    const pendingTriageSurface = page
      .getByTestId("start-pending-triage-card")
      .or(page.getByTestId("start-pending-triage"));
    await expect(pendingTriageSurface).toBeVisible();
    await expect(pendingTriageSurface).toContainText(/waiting for a decision/);

    // Second visit: reload the same context — the ritual never re-shows.
    await page.reload();
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });

  test("every step is skippable and skipping still completes for good", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();

    // Skip step 1 (persists the default areas), skip step 2 (keeps app
    // defaults), skip step 3 (no capture required — never a gate).
    await page.getByTestId("onboarding-areas-skip").click();
    await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
    await page.getByTestId("onboarding-day-skip").click();
    await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();
    await page.getByTestId("onboarding-capture-skip").click();

    // Root + optional query, same lenient shape as the other "back on
    // Today" assertions in this file (see the first one's own comment).
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
    await expect(page.getByTestId("today-moments")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });
});

test.describe("onboarding ritual stays out of the way (#581)", () => {
  test("a plain fresh demo context (seeded areas) never shows the ritual, and / never hands off", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
    await expect(page).toHaveURL(/\/(?:\?.*)?$/);
  });

  // C3 own-URL: `/welcome` is exactly as ineligible for an established
  // account as the old inline ritual was — visiting it directly (bookmark,
  // typed URL) bounces straight back to Today rather than stranding the
  // account on a screen with nothing left to set up.
  test("an established account visiting /welcome directly bounces back to Today", async ({
    page,
  }) => {
    await page.goto("/welcome");
    // A bare `/\/$/` would be too strict here: Today's own moment self-heal
    // (`useMomentUrlState`, unrelated to this slice) legitimately appends
    // `?moment=...` the instant it mounts — the truthful-URL claim this test
    // owns is "back on Today's root", not "no query string at all", the same
    // lenient shape the pre-existing rerun test below already used.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });

  test("Settings offers 'Run setup again', which re-admits the ritual once, at its own URL", async ({
    page,
  }) => {
    await page.goto("/settings/areas");
    // The affordance lives inside a <details> disclosure titled the same.
    await page.locator("summary", { hasText: "Run setup again" }).click();
    await page.getByTestId("onboarding-rerun-button").click();

    // C3 own-URL: the rerun button now navigates straight to `/welcome`
    // (OnboardingRerunPanel.tsx) rather than to `/` and relying on Today to
    // hand off a second time — one client-side navigation, not two.
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();

    // #687 (trigger-truth split verdict) defect 2 — the "once" this test's
    // title claims was never actually asserted. Abandon the ritual here (no
    // step completed) and reload — the rerun request is consumed the moment
    // the ritual activated above, so it must NOT re-admit a second time.
    // With nothing left to set up, `/welcome` bounces straight back to Today.
    await page.reload();
    // A bare `/\/$/` would be too strict here: Today's own moment self-heal
    // (`useMomentUrlState`, unrelated to this slice) legitimately appends
    // `?moment=...` the instant it mounts — the truthful-URL claim this test
    // owns is "back on Today's root", not "no query string at all", the same
    // lenient shape the pre-existing rerun test below already used.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });

  // Verifier-found regression (HIGH): a rerun request that reaches `/`
  // BEFORE it ever reaches `/welcome` — the exact trail a sign-in used to
  // produce before `login/page.tsx` was fixed to route straight to
  // `/welcome` — used to be silently swallowed. `useOnboardingRitual`'s own
  // mount effect used to consume the one-shot rerun flag the moment ANY
  // hook instance latched active, and `TodayMoments.tsx`'s thin wrapper on
  // `/` ran its own separate instance that latched (to redirect) BEFORE
  // `/welcome`'s instance — the one that actually renders — ever got a
  // chance to see the flag: `shouldShowOnboarding({ rerunRequested: false,
  // completed: true })` is false, so `/welcome` bounced straight back to
  // `/`. Fixed by `consumeRerunOnActivate: false` on the detect-only `/`
  // instance (useOnboardingRitual.ts) — only the instance that renders the
  // ritual ever consumes the flag now.
  //
  // The rerun flag is set directly (localStorage), not via the Settings
  // button — the button (OnboardingRerunPanel.tsx) already navigates
  // straight to `/welcome`, so clicking it and THEN going to `/` would only
  // prove the flag survives being consumed once already (it does, trivially
  // — `/welcome`'s own instance consumed it on that first landing, and nothing
  // is left for a later `/` visit to lose). The bug this pins is about a
  // rerun request that reaches `/` FIRST, never having touched `/welcome`
  // yet — exactly what a sign-in produced before login/page.tsx's own fix,
  // and the only real gap `consumeRerunOnActivate: false` needed to close.
  // `src/__tests__/login.test.tsx`'s own rerun tests separately pin that
  // `/login` now routes straight to `/welcome`, so a real sign-in no longer
  // takes this path at all — this test guards the mechanism itself, for any
  // OTHER path that might still land on `/` first.
  test("a rerun request reaching / first (before /welcome ever sees it) still lands on the ritual, not a bounce", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("lifeos.onboarding.rerun", "true");
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();
  });
});
