import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  collectUserFacingStrings,
  findPlainLanguageViolations,
} from "./helpers/plainLanguageScan";

// #761 — collectUserFacingStrings() walks apps/web/src and packages/ui/src;
// helpers/repoWalk.ts's readDirCached dedupes repeated directory reads
// across the repo-walking guards, and this timeout is belt-and-braces for
// whatever IO load remains.
vi.setConfig({ testTimeout: 30_000 });

/**
 * REPO-WIDE PLAIN-LANGUAGE GUARD (#692 / NFR-006)
 * ===============================================
 * #724 proved the doctrine on one screen by rendering it and reading the DOM.
 * This guard applies the same banned vocabulary to the whole app by walking
 * source text, so a plain-language regression fails in CI wherever it lands
 * rather than only on the health screen.
 *
 * `helpers/plainLanguageScan.ts` states, in its own comments, exactly what it
 * treats as a user-facing string and what it cannot see. Read that before
 * trusting or extending this file.
 *
 * IT LANDS AS A RATCHET, NOT A CLEAN BILL OF HEALTH
 * -------------------------------------------------
 * Several areas of the app still carry jargon, inventoried on #692. Turning the
 * guard on today would fail on all of them, so the violations that exist right
 * now are enumerated in `BASELINE` below, each annotated with the #692 slice
 * that will delete it. The list is the technical-debt registry, visible in the
 * repo instead of hidden in an issue.
 *
 * Three assertions make it a ratchet:
 *   1. `no banned vocabulary outside the baseline` — new or CHANGED copy fails
 *      immediately. Editing a baselined string breaks the exact-text match, so
 *      touching old jargon means fixing it, not re-baselining it.
 *   2. `the baseline holds no stale entries` — once a slice removes a string,
 *      its entry must be deleted in the same PR. This is what forces the list
 *      DOWN; nothing else does.
 *   3. `the baseline never grows` — the total is pinned to
 *      `BASELINE_PINNED_STRINGS` by strict equality, so a slice that removes
 *      strings MUST lower the constant and nothing can quietly grow back into
 *      the space it freed. Honest limit: that constant lives in this file, so
 *      a determined author can raise it. The guard makes growth a visible
 *      one-line diff on a numbered constant instead of a silent extra array
 *      element.
 *
 * A SLICE MAY LEGITIMATELY MOVE THIS BY LESS THAN ITS INVENTORY SAYS
 * -----------------------------------------------------------------
 * Slice D was inventoried as 15 strings and lowered the pin by 3, because
 * tracing each string to its renderer showed twelve of them are never rendered
 * to anyone. The number that matters is strings a person can read, not strings
 * the scanner can see. When a slice comes in under its inventory the baseline
 * comment must say which strings stayed and why — see the Slice D block — so
 * the gap is a recorded finding rather than an abandoned slice.
 *
 * TWO MECHANISMS, DELIBERATELY SEPARATE — DO NOT MIX THEM
 * ------------------------------------------------------
 * - PERMANENT exemptions (the developer-disclosure layer #724 built, where
 *   "Supabase" and "subsystem" are the CORRECT words) live in the scanner as
 *   `DEVELOPER_LAYER_PROPERTIES` and the `plain-language-guard:
 *   developer-layer` marker comment. They are keyed on the field the string
 *   flows into, never on a file path, and they are never "fixed".
 * - TEMPORARY debt lives in `BASELINE` and only ever shrinks.
 * Nothing from the #692 "Not a violation" list belongs in `BASELINE`; putting
 * it there would eventually make the ratchet demand deleting correct copy.
 */

const SLICE_LABELS = {
  A: "Google Calendar settings panel and its API routes",
  B: "sync and storage banners (highest-frequency surface)",
  C: "toasts and inline notices",
  D: "AI failure copy",
  E: "server-action and data-layer messages that can reach a user",
  F: "found by this scan, NOT in the #692 inventory comment",
} as const;

type SliceId = keyof typeof SLICE_LABELS;

type BaselineEntry = {
  slice: SliceId;
  /** Repo-relative, forward-slash path, as the scanner reports it. */
  file: string;
  /** Exact violating text. Change the copy and the entry stops matching. */
  strings: readonly string[];
};

/**
 * Every user-facing string in the app that carries banned vocabulary today.
 * Derived by running the scanner, not hand-written. Grouped by the #692 slice
 * that owns its removal.
 *
 * Slice F is this guard's own finding: five strings the manual inventory on
 * #692 missed. Three of them (the now-fixed `global-error.tsx` entry #723
 * removed, the now-fixed `settings/areas/page.tsx` entry #742 removed,
 * `AreaRegistryCards.tsx`) were rendered copy a person can read.
 */
const BASELINE: readonly BaselineEntry[] = [
  // ===== SLICE A (21 strings) =====
  // Panel + all six google-calendar API routes were de-jargoned in #692 Slice A
  // (PR: plain language on the calendar settings screen). What remains here is
  // server-internal: helpers that throw "must stay server-only" guards and the
  // planning presentation strings — a later slice owns those.
  {
    slice: "A",
    file: "apps/web/src/lib/googleCalendar/config.ts",
    strings: ["Google Calendar config must stay server-only."],
  },
  {
    slice: "A",
    file: "apps/web/src/lib/googleCalendar/events.ts",
    strings: ["Google Calendar event helpers must stay server-only."],
  },
  {
    slice: "A",
    file: "apps/web/src/lib/googleCalendar/freebusy.ts",
    strings: [
      "Google Calendar free/busy helper must stay server-only.",
      "Google Calendar refresh token is unavailable.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/lib/googleCalendar/oauth.ts",
    strings: [
      "Google Calendar OAuth helpers must stay server-only.",
      // #743: the two bare `!response.ok` throws that used to say "...
      // failed." were replaced with GoogleOAuthProviderError, which carries
      // Google's real code/description instead of discarding them. Its own
      // message ("Google Calendar connection step did not complete.")
      // contains no banned term, so it needs no baseline entry.
      "Google token exchange returned an invalid payload.",
      "Google Calendar refresh token is required.",
      "Google access token refresh returned an invalid payload.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/lib/googleCalendar/server.ts",
    strings: [
      "Google Calendar server helpers must stay server-only.",
      "Supabase request failed.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/lib/googleCalendar/tokens.ts",
    strings: [
      "Google Calendar token helpers must stay server-only.",
      "Google Calendar is not configured for secure token storage.",
      "Google Calendar token encryption requires token text.",
      "Google Calendar token decryption requires ciphertext.",
      "Google Calendar token ciphertext is invalid.",
      "Google Calendar token expiry must be a positive number.",
      "Google Calendar token issue time is invalid.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/lib/planning/presentation.ts",
    strings: [
      "requires supabase configuration",
      "Keep local planning in this view or configure Google Calendar server env vars.",
    ],
  },
  // ===== SLICE B — DONE, 37 strings removed =====
  // The sync and storage banners were de-jargoned in #692 Slice B. This was
  // the largest slice and the highest-frequency copy in the app: these fire on
  // ordinary saving, not on rare errors, so the normal state now reads as
  // normal. 24 of the 37 were the same fact Slice C had already named — the
  // work is on this device, it is not in the account — spelled 20 different
  // ways; they all call `savedOnThisDeviceBanner(subject)` from
  // `lib/statusVocabulary.ts` now, and the remaining 13 are named constants in
  // that same file. `calendarApproval.ts` imports Slice A's already-shipped
  // GOOGLE_CALENDAR_UNAVAILABLE_HERE rather than keep its own copy of it.
  // Slices D and E say the same things again in `lib/ai/*` and
  // `lib/data/workflow/*` — import from statusVocabulary, do not re-phrase.
  // ===== SLICE C — DONE, 8 strings removed =====
  // Toasts and inline notices were de-jargoned in #692 Slice C. Five of those
  // eight strings were three different phrasings of one fact ("it is on this
  // device, not in your account yet"); they now all render
  // `SAVED_ON_THIS_DEVICE_SHORT` from `lib/statusVocabulary.ts`. Slice B is
  // the same fact again on the banner surfaces — reuse that constant there
  // rather than writing a fourth phrasing.
  // ===== SLICE D — 3 strings removed, 12 REMAIN ON PURPOSE =====
  // Slice D was inventoried as "AI failure copy, 15 strings". Tracing each one
  // to its renderer before rewriting showed only THREE of the fifteen can be
  // read by a person. They were the two `safeParserFailureMessage` branches in
  // `api/parse-capture/route.ts` and `SAFE_FAILURE_MESSAGE` in
  // `lib/ai/parseCaptureClient.ts`; all three land in `captureParse.message`,
  // which renders in `moments/UnsortedCaptures.tsx` (inside the "What
  // happened?" disclosure) and in `cockpit/StatusBanners.tsx`
  // (`CaptureParseNotice`, where it is the only sentence in the banner). Those
  // three now read `AI_SORTING_UNAVAILABLE_NOT_SORTED` /
  // `AI_SORTING_FAILED_NOT_SORTED` from `lib/statusVocabulary.ts`.
  //
  // The other twelve stay baselined, and the reason is per-string, not
  // laziness. NONE of them reaches a renderer:
  //
  //  - The five `... must run on the server.` throws are developer guardrails
  //    for a bundling mistake, and two of them are asserted verbatim by
  //    `sourceOfTruth.test.ts` ("marks parser modules with explicit server
  //    runtime guards"). All five are also matched by the
  //    `/must run on the server/i` branch of `categorizeParseCaptureError` /
  //    `categorizeTaskMapDraftError`, so rewording them silently reclassifies
  //    the error. Same for the two `failed schema validation:` template heads
  //    and the `/failed schema validation/i` branch.
  //  - Both `parserMode must be auto or mock when provided.` throws are
  //    swallowed: parse-capture catches and replaces them with
  //    `safeParserFailureMessage`, and task-map echoes the text but
  //    `workflowContext/taskMapDraft.ts` discards it.
  //  - `AI provider is temporarily unavailable.` and `AI task-map draft
  //    response failed schema validation.` are `safeDegradeMessage` output. It
  //    travels in the route's `errors` array, which `taskMapDraftClient.ts`
  //    never reads — it reads `body.error`. Even that is discarded:
  //    `workflowContext/taskMapDraft.ts` substitutes
  //    `SAFE_TASK_MAP_FAILURE_MESSAGE`.
  //  - `Mock parser output requires user review before persistence.` is a
  //    `triage_reasons` entry. `triageReasons` has no renderer anywhere in
  //    `apps/` or `packages/`, and the mock response sets its own
  //    `review_trigger`, so it never even reaches that fallback.
  //
  // Rewriting any of those twelve buys a reader nothing and costs either a
  // source-of-truth guard or an error classification. Two of them are worth a
  // FIX rather than a rewrite — the discarded task-map messages are a UI
  // defect, not a copy defect. Both are follow-ups on #692, not this slice.
  {
    slice: "D",
    file: "apps/web/src/app/api/parse-capture/route.ts",
    strings: ["parserMode must be auto or mock when provided."],
  },
  {
    slice: "D",
    file: "apps/web/src/app/api/task-map/route.ts",
    strings: ["parserMode must be auto or mock when provided."],
  },
  {
    slice: "D",
    file: "apps/web/src/lib/ai/parseCapture.ts",
    strings: [
      "parseCapture must run on the server.",
      "AI capture parsing response failed schema validation:",
    ],
  },
  {
    slice: "D",
    file: "apps/web/src/lib/ai/parseCaptureService.ts",
    strings: [
      "parseCaptureService must run on the server.",
      "Mock parser output requires user review before persistence.",
    ],
  },
  {
    slice: "D",
    file: "apps/web/src/lib/ai/rollupProseService.ts",
    strings: ["rollupProseService must run on the server."],
  },
  {
    slice: "D",
    file: "apps/web/src/lib/ai/taskMapDraft.ts",
    strings: [
      "taskMapDraft must run on the server.",
      "AI task-map draft response failed schema validation:",
    ],
  },
  {
    slice: "D",
    file: "apps/web/src/lib/ai/taskMapDraftService.ts",
    strings: [
      "taskMapDraftService must run on the server.",
      "AI provider is temporarily unavailable.",
      "AI task-map draft response failed schema validation.",
    ],
  },
  // ===== SLICE E (36 strings) — TRACED, 0 REACH A USER. NOT COPY DEBT. =====
  // Slice E traced all 36 of these to their terminus before writing any copy
  // (table + correction on #692). None reaches a person, so none was rewritten
  // and the pin below did not move. Recorded here so a later slice does not
  // re-open the work:
  //   - 7 are CAUGHT: the text is discarded and replaced before display, by
  //     `markPersistedSaveFailure` / `markPersistedLoadFailure`
  //     (`WorkflowContext.tsx`) or by the generic
  //     `{ ok: false, error: "Something went wrong." }` body every Route
  //     Handler has returned since #670.
  //   - 29 are DEAD: unreachable `if (!client)` guards whose every caller
  //     already returns early on a null client; `assertServerRuntime` throws in
  //     modules no client bundle imports; `getSupabaseMessage` defaults no real
  //     PostgrestError can trigger; three exported functions with no production
  //     caller at all; one mock `constraints[]` entry no component renders.
  //
  // FIVE OF THESE ARE DEAD FOR A NON-OBVIOUS REASON, and reading the source
  // alone gets it wrong: `areas.ts`'s four "Sign in before …" strings and
  // `capture.ts`'s "Sign in before loading captures from Supabase.". (The
  // other "Sign in before …" strings in this slice are dead or caught for
  // ordinary reasons — `supabase/server.ts`'s is routed by error TYPE, and
  // `planning.ts`/`capture.ts`'s save-path ones are replaced by
  // `markPersistedSaveFailure`.) These five are `requireSupabaseUser`'s
  // `unauthenticatedMessage`, reached only when `auth.getUser()` resolves
  // `{ user: null, error: null }`. The real @supabase/ssr client never does —
  // a signed-out session rejects one branch earlier with AuthSessionMissingError
  // — so before #742, what `/settings/areas` actually rendered was the
  // library's own "Auth session missing!". Rewriting these strings would have
  // been pure motion; renaming to plain language would not have touched the
  // real path.
  //
  // #742 fixed the real path directly, at both catch sites the trace found
  // (this hook's `useAreasLoadState.ts`, and `CreateAreaForm.tsx`'s create
  // failure): each now classifies a signed-out error with the shared
  // `isSignedOutError` check before it ever reaches a message string, so the
  // raw provider text cannot reach either alert regardless of what this
  // static scanner can see. Proven by rendering the page, not by reading it —
  // before/after: .github/pr-evidence/692-server-copy/ (before) and this
  // issue's PR body (after). The scanner's blind spot (provider text arrives
  // at runtime, not as a source literal) is still real and still applies to
  // every OTHER runtime error message in this slice; it no longer applies to
  // these two call sites specifically.
  {
    slice: "E",
    file: "apps/web/src/lib/data/export.ts",
    strings: ["User data export must run on the server."],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/areas.ts",
    strings: [
      "Sign in before loading areas from Supabase.",
      "Sign in before creating areas in Supabase.",
      "Sign in before removing areas from Supabase.",
      "Sign in before updating area colors in Supabase.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/calendar.ts",
    strings: [
      "Mock proposal edits use the local workflow context.",
      "Mock proposal rejection uses the local workflow context.",
      "Mock proposal acceptance uses the local workflow context.",
      "Supabase RPC support is unavailable.",
      "Google Calendar conflict checks require Supabase configuration.",
      "Supabase auth is unavailable.",
      "Google Calendar event creation requires Supabase configuration.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/capture.ts",
    strings: [
      "Sign in before saving captures to Supabase.",
      "Sign in to sync offline captures.",
      "Sign in before loading captures from Supabase.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/execution.ts",
    strings: [
      "Supabase RPC support is unavailable.",
      "Mock cap-defer uses the local workflow context.",
      "Mock unplanning uses the local workflow context.",
      "Mock review task transitions use local workflow state.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/planning.ts",
    strings: [
      "Sign in before saving tasks to Supabase.",
      "Sign in before saving projects to Supabase.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/shared.ts",
    strings: ["Supabase request failed.", "Supabase auth is unavailable."],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflow/taskMap.ts",
    strings: [
      "Mock task-map approval uses the local workflow context.",
      "Mock task-map completion uses the local workflow context.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/data/workflowServerLoad.ts",
    strings: ["Supabase request failed."],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/externalWrites/reconciliation.ts",
    strings: ["Supabase request failed."],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/externalWrites/server.ts",
    strings: [
      "External write audit helpers must stay server-only.",
      "Supabase request failed.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/planning/server.ts",
    strings: [
      "Planning server helpers must stay server-only.",
      "Supabase request failed.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/supabase/server.ts",
    strings: [
      "Supabase server helpers must stay server-only.",
      "Supabase service role key is not configured.",
      "Sign in before using this server action.",
      "Supabase is not configured.",
    ],
  },
  {
    slice: "E",
    file: "apps/web/src/lib/workflow/capture.ts",
    strings: ["No external calendar write in mock mode."],
  },
  // ===== SLICE F (5 strings inventoried; 3 remain) =====
  // Like every slice header here, the count is what the scan first FOUND, not
  // what is listed below. Two entries are gone: `settings/areas/page.tsx`
  // (#742) and `global-error.tsx` (#723). `AreaRegistryCards.tsx` is the one
  // remaining entry the original note flagged as rendered copy a person can
  // read; it is still owned by #692 and still unfixed.
  {
    slice: "F",
    file: "apps/web/src/app/api/v1/capabilities/route.ts",
    strings: [
      "supabase user access token; service-role tokens are never accepted",
    ],
  },
  {
    slice: "F",
    file: "apps/web/src/app/settings/areas/AreaRegistryCards.tsx",
    strings: [
      "Preview updates immediately on this card. Reset uses the default accent token.",
    ],
  },
  {
    slice: "F",
    file: "apps/web/src/lib/observability/aiCallTraces.ts",
    strings: [
      "ai_call_traces: skipped trace insert because no user access token was provided.",
    ],
  },
];

/**
 * Pinned total of baselined strings. MAY ONLY EVER BE LOWERED.
 *
 * Asserted with strict equality, not `<=`. A high-water mark would let the
 * baseline grow back into the space a finished slice freed up: Slice B shrank
 * this from 114 to 77, and a `<=114` pin would silently permit 37 new
 * violations in the space it freed. Equality means every slice must lower this
 * constant by exactly what it deleted, and any growth has to raise a numbered
 * constant in the diff where a reviewer sees it.
 *
 * Slice D took it 77 -> 74: three rendered strings, not the fifteen its
 * inventory listed. See the Slice D block in `BASELINE` for the twelve that
 * stayed and the per-string reason each one is not copy.
 *
 * #743 took it 74 -> 72: replacing the two bare `!response.ok` throws in
 * `oauth.ts` with `GoogleOAuthProviderError` (whose own message carries no
 * banned term) removed both baselined strings without adding a replacement.
 *
 * #742 took it 72 -> 71: `settings/areas/page.tsx`'s developer-jargon
 * paragraph ("If Supabase is configured, sign in and make sure the local
 * stack is running…") is deleted outright, not reworded — the signed-out
 * state it used to explain now renders its own calm copy instead of sharing
 * the generic error alert. The other half of this issue (the raw
 * "Auth session missing!" library string both this file and
 * `CreateAreaForm.tsx` used to render) was never a scanner-visible literal,
 * so it carried no baseline entry to remove; see `useAreasLoadState.ts` and
 * `CreateAreaForm.tsx` for that fix.
 *
 * #723 took it 71 -> 70: `global-error.tsx`'s "The error was captured through
 * the privacy-safe observability layer." is deleted, not reworded around the
 * banned term. It was the app-wide error screen's only paragraph, and it was
 * not merely jargon — it was FALSE whenever no adapter is configured, because
 * `lib/observability/index.ts` returns a no-op adapter in that case. The
 * replacement says only what that component can prove (a render did not
 * finish) and adds an escape link, so there is no new string to baseline. See
 * `globalError.test.tsx`, which renders the screen and asserts the absence
 * from the DOM rather than from source — the same standard #724 set for the
 * health screen and #742 met for the areas screen.
 */
const BASELINE_PINNED_STRINGS = 70;

const repoRoot = resolve(__dirname, "../../../..");

/** Unambiguous key for a (file, exact text) pair. */
const keyOf = (file: string, text: string) => JSON.stringify([file, text]);

const baselineKeys = new Set(
  BASELINE.flatMap((entry) =>
    entry.strings.map((text) => keyOf(entry.file, text)),
  ),
);

const baselineStringCount = BASELINE.reduce(
  (total, entry) => total + entry.strings.length,
  0,
);

// The scan parses ~500 files; one pass is shared by every assertion below.
const scanned = collectUserFacingStrings();
const violations = findPlainLanguageViolations();

describe("repo-wide plain-language guard (#692 / NFR-006)", () => {
  // Anti-vacuum: a scanner that silently returned nothing would make every
  // other assertion in this file pass. These floors are well under today's
  // numbers and exist only to catch a scanner that stopped working.
  it("still sees the app it is supposed to be guarding", () => {
    expect(scanned.length).toBeGreaterThan(1500);
    expect(new Set(scanned.map((s) => s.file)).size).toBeGreaterThan(150);
    // ...and the banned list is still doing something.
    expect(violations.length).toBeGreaterThan(0);
  });

  it("keeps banned vocabulary out of every string outside the baseline", () => {
    const unbaselined = violations.filter(
      (violation) => !baselineKeys.has(keyOf(violation.file, violation.text)),
    );

    expect(
      unbaselined.map((v) => `${v.file}:${v.line} ${v.term} ${v.text}`),
    ).toEqual([]);
  });

  it("holds no stale baseline entries, so fixed copy must leave the list", () => {
    const live = new Set(
      violations.map((violation) => keyOf(violation.file, violation.text)),
    );
    const stale = [...baselineKeys].filter((key) => !live.has(key));

    expect(stale).toEqual([]);
  });

  it("never grows the baseline", () => {
    expect(baselineStringCount).toBe(BASELINE_PINNED_STRINGS);
  });

  it("keeps the baseline unambiguous and slice-annotated", () => {
    expect(baselineKeys.size).toBe(baselineStringCount);
    expect(
      BASELINE.filter((entry) => !(entry.slice in SLICE_LABELS)).map(
        (entry) => entry.file,
      ),
    ).toEqual([]);
    expect(BASELINE.filter((entry) => entry.strings.length === 0)).toEqual([]);
  });

  // Hard requirement: the developer-disclosure layer #724 built must not
  // produce false positives, and must be exempt on purpose. These assertions
  // fail if either exemption mechanism is removed, which is what makes them
  // proof rather than a coincidence of the health screen being clean.
  it("exempts the developer-disclosure layer by an explicit mechanism", () => {
    const healthFile = "apps/web/src/lib/data/health.ts";
    const source = readFileSync(resolve(repoRoot, healthFile), "utf8");

    // The banned words really are in this file...
    expect(source).toContain('"supabase config"');
    expect(source).toContain('"capture persistence"');
    expect(source).toContain('"transition RPCs"');
    expect(source).toContain('return "Supabase request failed."');

    // ...and the scan reports none of them, because `subsystem` is a
    // DEVELOPER_LAYER_PROPERTIES field name and the `getErrorMessage` default
    // carries the developer-layer marker comment.
    expect(violations.filter((v) => v.file === healthFile)).toEqual([]);

    // The screen that renders them is clean too, which is the same verdict
    // healthPage.test.tsx reaches from the rendered DOM.
    expect(
      violations.filter((v) =>
        v.file.startsWith("apps/web/src/app/components/cockpit/HealthView"),
      ),
    ).toEqual([]);
  });
});
