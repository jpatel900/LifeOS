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
 * Five areas of the app still carry jargon, inventoried on #692. Turning the
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
 *      `BASELINE_MAX_STRINGS`. Honest limit: that constant lives in this file,
 *      so a determined author can raise it. The guard makes growth a visible
 *      one-line diff on a numbered constant instead of a silent extra array
 *      element. Lower it freely; raising it needs review.
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
  // ===== SLICE A (50 strings) =====
  {
    slice: "A",
    file: "apps/web/src/app/api/google-calendar/cancel-event/route.ts",
    strings: [
      "Google Calendar is not configured on this server. Add server-only Google OAuth env vars and token encryption key before cancelling events.",
      "Reconnect Google Calendar before cancelling events. No refresh token is stored.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/app/api/google-calendar/connect/route.ts",
    strings: [
      "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key before connecting.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/app/api/google-calendar/connection/route.ts",
    strings: [
      "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key when you want real Google integration. Mock/local mode remains available.",
      "Google Calendar is connected with encrypted server-only token storage. Free/busy checks and event creation run only from explicit user actions.",
      "The last Google Calendar OAuth callback failed safely. Reconnect to try again.",
      "Google Calendar is ready to connect, but no active encrypted token connection exists yet.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/app/api/google-calendar/create-event/route.ts",
    strings: [
      "Google Calendar is not configured on this server. Add server-only Google OAuth env vars and token encryption key before creating events.",
      "Reconnect Google Calendar before creating events. No refresh token is stored.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/app/api/google-calendar/disconnect/route.ts",
    strings: [
      "LifeOS cleared local Google Calendar token material and connection metadata. Google-side revoke still lives in your Google account if you want to remove consent there too.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/app/api/google-calendar/freebusy/route.ts",
    strings: [
      "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key before checking conflicts.",
    ],
  },
  {
    slice: "A",
    file: "apps/web/src/app/settings/areas/GoogleCalendarConnectionPanel.tsx",
    strings: [
      "Google Calendar OAuth completed. Tokens are stored encrypted on the server only. Event creation still requires explicit approval from an existing local proposal.",
      "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key before connecting.",
      "Google Calendar OAuth callback was rejected because the request state was invalid or expired.",
      "Google Calendar OAuth callback requires an authenticated Supabase session. Sign in and try again.",
      "Google Calendar access was not granted. No connection metadata was activated.",
      "Google Calendar OAuth callback failed safely. No calendar writes were attempted.",
      "Google Calendar did not return a usable refresh token, so LifeOS refused to activate the connection. Reconnect and re-consent before continuing.",
      "Google Calendar is not configured on this server. Local planning still works without Google integration.",
      "Sign in before connecting Google Calendar. OAuth actions require an authenticated Supabase session.",
      "Google Calendar OAuth could not start. No connection changes were applied.",
      "Supabase is not configured in this environment, so Google Calendar stays unavailable and mock/local mode remains intact.",
      "Supabase auth helpers are unavailable in this browser session. Sign in again before connecting Google Calendar.",
      "Sign in before connecting Google Calendar. No OAuth flow can start without an authenticated Supabase session.",
      "Supabase is not configured. Google Calendar stays unavailable in local-only mode.",
      "Supabase auth helpers are unavailable. Sign in again before connecting Google Calendar.",
      "LifeOS cleared the local Google Calendar connection and encrypted token material. Google-side revocation still lives in your Google account if you want to remove consent there too.",
      "Missing server config is non-fatal. Mock/local mode still works without Google env vars.",
      "Granted OAuth scopes:",
    ],
  },
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
  // ===== SLICE B (37 strings) =====
  {
    slice: "B",
    file: "apps/web/src/app/components/cockpit/StatusBanners.tsx",
    strings: [
      "Browser storage is blocked; this session may not restore after reload.",
      "Account sync is unavailable; changes stay local.",
      "Account sync failed; changes stay local.",
      "Some local changes still need account sync.",
      "AI parser is unavailable right now, so the built-in mock parser drafted this capture.",
      "AI parsing is turned off, so the built-in mock parser drafted this capture.",
      "Parse with mock parser",
    ],
  },
  {
    slice: "B",
    file: "apps/web/src/lib/WorkflowContext.tsx",
    strings: [
      "Some local changes still need account sync.",
      "Account sync is unavailable; work is staying local.",
      "Win saved locally; account sync is pending.",
      "Rollup saved locally; account sync is pending.",
      "Browser storage is blocked; this session will not reliably restore after reload.",
      "Dropped draft locally; account sync is pending.",
      "Draft edit saved locally; account sync is pending.",
      "Draft split saved locally; account sync is pending.",
      "Draft merge saved locally; account sync is pending.",
      "First move saved locally; account sync is pending.",
      "WIP swap saved locally; account sync is pending.",
    ],
  },
  {
    slice: "B",
    file: "apps/web/src/lib/workflowContext/calendarApproval.ts",
    strings: [
      "Google Calendar is unavailable in local-only mode. Local planning keeps working.",
      "This proposal has not synced to your account yet, so it cannot be written to Google. Try again after sync.",
    ],
  },
  {
    slice: "B",
    file: "apps/web/src/lib/workflowContext/persistenceSync.ts",
    strings: [
      "Capture saved locally; account sync is not available.",
      "Triage decision saved locally; account sync is pending.",
      "Plan saved locally; account sync is pending.",
      "Proposal created locally; account sync is pending.",
      "Proposal edit saved locally; account sync is pending.",
      "Proposal rejected locally; account sync is pending.",
      "Proposal accepted locally; account sync is pending.",
      "Unplanned locally; account sync is pending.",
      "Recovery choice saved locally; account sync is pending.",
      "Review saved locally; account sync is pending.",
      "Execution session saved locally; account sync is pending.",
      "Session outcome saved locally; account sync is pending.",
      "Deferral saved locally; account sync is pending.",
    ],
  },
  {
    slice: "B",
    file: "apps/web/src/lib/workflowContext/reducerCore.ts",
    strings: [
      "Change saved locally, but account sync failed; it will stay local until sync recovers.",
      "Account sync needs a server update; the app and database look out of step. Check Health for the next step.",
    ],
  },
  {
    slice: "B",
    file: "apps/web/src/lib/workflowContext/taskMapDraft.ts",
    strings: [
      "Map approved locally; account sync is pending.",
      "Completion saved locally; account sync is pending.",
    ],
  },
  // ===== SLICE C (8 strings) =====
  {
    slice: "C",
    file: "apps/web/src/app/components/GoogleCalendarApprovalBridge.tsx",
    strings: [
      "Google Calendar is unavailable in local-only mode. Local planning keeps working.",
      "Google Calendar is not configured on this server. Local planning keeps working.",
    ],
  },
  {
    slice: "C",
    file: "apps/web/src/app/components/LifeOSCockpit.tsx",
    strings: ["Review saved locally — account sync pending"],
  },
  {
    slice: "C",
    file: "apps/web/src/app/components/moments/BottomNavigator.tsx",
    strings: ["waiting to sync"],
  },
  {
    slice: "C",
    file: "apps/web/src/app/components/moments/CaptureAffordance.tsx",
    strings: ["waiting to sync"],
  },
  {
    slice: "C",
    file: "apps/web/src/app/components/moments/TodayMoments.tsx",
    strings: ["Day closed locally — account sync pending"],
  },
  {
    slice: "C",
    file: "apps/web/src/app/settings/areas/DataExportPanel.tsx",
    strings: [
      "Data export needs a signed-in account. Local-only data stays on this device and is not included.",
      "Download a JSON copy of your account data: areas, captures, tasks, projects, planning proposals, calendar blocks, execution sessions, reviews, health history, and the external-write audit log. Google connection tokens are never included.",
    ],
  },
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
  // ===== SLICE E (36 strings) =====
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
 * Each #692 slice that lands should bring this down by the number of strings
 * it deleted from `BASELINE`.
 */
const BASELINE_MAX_STRINGS = 151;

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
    expect(baselineStringCount).toBeLessThanOrEqual(BASELINE_MAX_STRINGS);
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
