import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectUserFacingStrings,
  findPlainLanguageViolations,
} from "./helpers/plainLanguageScan";

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
 * #692 missed. Three of them (`global-error.tsx`, `settings/areas/page.tsx`,
 * `AreaRegistryCards.tsx`) are rendered copy a person can read.
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
      "Google token exchange failed.",
      "Google token exchange returned an invalid payload.",
      "Google Calendar refresh token is required.",
      "Google access token refresh failed.",
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
  // ===== SLICE D (15 strings) =====
  {
    slice: "D",
    file: "apps/web/src/app/api/parse-capture/route.ts",
    strings: [
      "parserMode must be auto or mock when provided.",
      "AI parser is unavailable right now. You can retry with the mock parser.",
      "Parsing failed safely. You can retry with the mock parser.",
    ],
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
    file: "apps/web/src/lib/ai/parseCaptureClient.ts",
    strings: [
      "Parsing is unavailable right now. Your capture is saved; you can retry with the mock parser.",
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
  // — so what `/settings/areas` actually renders is the library's own "Auth
  // session missing!". Rewriting these would have been pure motion. Proven by
  // rendering the page, not by reading it: .github/pr-evidence/692-server-copy/.
  //
  // The genuinely user-visible jargon on that screen is therefore provider text
  // this scanner cannot see by construction (see its blind-spot list). That is
  // an open OWNER-GATE on #692, not a copy edit.
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
  // ===== SLICE F (5 strings) =====
  {
    slice: "F",
    file: "apps/web/src/app/api/v1/capabilities/route.ts",
    strings: [
      "supabase user access token; service-role tokens are never accepted",
    ],
  },
  {
    slice: "F",
    file: "apps/web/src/app/global-error.tsx",
    strings: [
      "The error was captured through the privacy-safe observability layer.",
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
    file: "apps/web/src/app/settings/areas/page.tsx",
    strings: [
      "If Supabase is configured, sign in and make sure the local stack is running. Without Supabase env vars, this page uses local-only areas.",
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
 * baseline grow back into the space a finished slice freed up: Slice B just
 * shrank this from 114 to 77, and a `<=114` pin would silently permit 37 new
 * violations in the space it freed. Equality means every slice must lower this
 * constant by exactly what it deleted, and any growth has to raise a numbered
 * constant in the diff where a reviewer sees it.
 */
const BASELINE_PINNED_STRINGS = 77;

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
