import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloseMomentRollups } from "@/app/components/moments/useCloseMomentRollups";
import { createInitialWorkflowState } from "@/lib/workflow";
import type { RollupSummary } from "@lifeos/schemas";
import type { ApprovedRollupSummary } from "@/lib/review/approvedRollups";

/**
 * REGRESSION GUARD — an approved rollup is never offered for approval again
 * (#737 C1 fresh-eyes re-score, ROUND 2, GAP 2 — the last open gap).
 *
 * ## What broke, and why it needs a pin of exactly this shape
 *
 * The judge approved a weekly rollup, opened a new tab, and was offered the
 * SAME period again as though it had never been approved. Re-approving wrote
 * no second row (`rollup_summaries_period_key` held), so the data was safe —
 * **the offer was the lie**.
 *
 * The cause is an id-space race, not a missing readback. The readback fires,
 * returns 200, and carries the row. But `listApprovedRollups` resolves the
 * account row's PERSISTED AREA UUID into workflow id space through
 * `persistedAreasRef.current`, which hydration fills LATER. The readback
 * effect runs once per mount and usually wins that race, so the resolution
 * falls through to `?? persistedAreaId` and the suppression set ends up
 * holding `00000000-…-101|week|2026-07-23` while the draft asks about
 * `area-main-job|week|2026-07-23`. The keys can never meet, and nothing
 * re-runs the readback.
 *
 * The judge proved it by experiment rather than by reading: delaying ONLY the
 * `rollup_summaries` GET by 25 s — so hydration wins the race instead — made
 * the card disappear on the same build, same data, same click path.
 *
 * ## Why this guard, in the `unit` job
 *
 * The shipped e2e pin (`tests/e2e/close-offer-truth.spec.ts:326`) is green and
 * the app is not. The `e2e` CI job runs a Supabase-less dev server, so
 * `createSupabaseBrowserClient()` returns null, `listApprovedRollups()` returns
 * `[]` immediately, and there is no persisted uuid in play at all — both id
 * spaces collapse to one and the defect is invisible to that tier by
 * construction. **A device-tier pin cannot hold an account-tier criterion.**
 *
 * So the race is reproduced here directly: the readback resolves FIRST with a
 * row in persisted-uuid space, and the workflow-area alias map arrives after,
 * exactly as hydration does. Every absence assertion below is paired with a
 * positive control, because an empty offer list is also what a broken harness
 * looks like.
 *
 * The account tier of the same fix, against a real signed-in Postgres, is
 * pinned in `phase4aRls.local.rollupOfferTruth.test.tsx`.
 */

const PERSISTED_AREA_ID = "00000000-0000-4000-8000-000000000101";
const WORKFLOW_AREA_ID = "area-main-job";
const PERIOD_START = "2026-07-23";
const PERIOD_END = "2026-07-29";

const APPROVED_ROW: ApprovedRollupSummary = {
  id: "ca9a6505-17a9-4e2d-90e7-7fdcb7fb7b35",
  user_id: "00000000-0000-4000-8000-000000000001",
  // The row as `listApprovedRollups` hands it over when the readback lands
  // BEFORE hydration: the mapping fell through to the persisted uuid.
  area_id: PERSISTED_AREA_ID,
  areaIdAliases: [PERSISTED_AREA_ID],
  period_type: "week",
  period_start: PERIOD_START,
  period_end: PERIOD_END,
  summary: { highlights: ["Shipped the rollup fix"], misses: [], counts: {} },
  created_at: "2026-07-29T03:30:00.000Z",
};

function buildState() {
  const state = createInitialWorkflowState();
  return {
    ...state,
    areas: [
      {
        id: WORKFLOW_AREA_ID,
        user_id: "00000000-0000-4000-8000-000000000001",
        name: "Main Job",
        color: "#2563eb",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function buildCloseVM() {
  return {
    completedToday: 1,
    missedToday: 0,
    carryForward: [],
    tomorrowFirstMove: null,
    loggedWinsToday: [],
    winCandidates: [],
    rollupDrafts: [
      {
        areaId: WORKFLOW_AREA_ID,
        areaLabel: "Main Job",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        periodLabel: "2026-07-23 – 2026-07-29",
        summary: {
          highlights: ["Shipped the rollup fix"],
          misses: [],
          counts: {},
        },
      },
    ],
    dayClose: null,
  };
}

/**
 * Drives the REAL hook, not a re-implementation of it. `approvedRows` and
 * `aliases` are props so a rerender can land hydration AFTER the readback has
 * already settled — which is the race, expressed as the only thing the test
 * controls.
 */
function RollupOfferHarness({
  approvedRows,
  aliases,
  areasSettled,
}: {
  approvedRows: readonly ApprovedRollupSummary[];
  aliases: Readonly<Record<string, string>>;
  areasSettled: boolean;
}) {
  const { displayedRollups } = useCloseMomentRollups({
    state: buildState(),
    closeVM: buildCloseVM(),
    now: new Date("2026-07-29T20:30:00.000Z"),
    showToast: () => {},
    confirmWin: async () => "device-only",
    confirmRollup: async () => {},
    listApprovedRollups: async () => approvedRows as RollupSummary[],
    workflowAreaIdByPersistedId: aliases,
    areasReadbackSettled: areasSettled,
  });

  return (
    <div>
      <span data-testid="offer-count">{displayedRollups.length}</span>
      <span data-testid="offer-areas">
        {displayedRollups.map((rollup) => rollup.areaId).join(",")}
      </span>
    </div>
  );
}

beforeEach(() => {
  // No Supabase client in this harness: the AI-prose effect short-circuits and
  // the readback is entirely the injected stub, so nothing here depends on the
  // network or on env ordering.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("#737 C1 re-score GAP 2 guard: an approved rollup is not re-offered", () => {
  it("withdraws the offer once hydration lands, even though the readback resolved first", async () => {
    // POSITIVE CONTROL, asserted before the absence check: with no account row
    // at all the offer IS made. Without this the test below would pass on a
    // harness that simply renders nothing.
    const control = render(
      <RollupOfferHarness approvedRows={[]} aliases={{}} areasSettled />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("offer-count")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("offer-areas")).toHaveTextContent(
      WORKFLOW_AREA_ID,
    );
    control.unmount();

    // THE REPRODUCTION. A fresh mount — the judge's new tab. The readback
    // resolves while the alias map is still empty (hydration has not landed),
    // so the row can only be keyed in persisted-uuid space.
    const { rerender } = render(
      <RollupOfferHarness
        approvedRows={[APPROVED_ROW]}
        aliases={{}}
        areasSettled={false}
      />,
    );
    // Let the readback settle FIRST — that ordering is the defect, so it is
    // waited for rather than hoped for.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Hydration lands. Nothing re-fetches; the suppression set must resolve the
    // uuid it is already holding into the id space the draft speaks.
    rerender(
      <RollupOfferHarness
        approvedRows={[APPROVED_ROW]}
        aliases={{ [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID }}
        areasSettled
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("offer-count")).toHaveTextContent("0"),
    );
  });

  it("keeps offering a period the account has NOT approved", async () => {
    // The suppression must be keyed on the period, not on the area. A rollup
    // approved for the PREVIOUS week must not silence this week's offer — the
    // failure mode a fix that over-suppresses would ship.
    render(
      <RollupOfferHarness
        approvedRows={[{ ...APPROVED_ROW, period_start: "2026-07-16" }]}
        aliases={{ [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID }}
        areasSettled
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("offer-count")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("offer-areas")).toHaveTextContent(
      WORKFLOW_AREA_ID,
    );
  });

  it("withholds the offer until the areas readback has settled", async () => {
    // The in-flight window is the same lie for as long as it lasts, which is
    // the reasoning `rollupReadbackSettled` already encodes for the rollup
    // fetch. The area mapping the key is BUILT from has the same window, so it
    // gets the same gate. Note this is settled-not-present: mock/demo has no
    // persisted areas ever and must still be able to approve a rollup, which
    // the first test's positive control (empty alias map, settled) proves.
    render(
      <RollupOfferHarness
        approvedRows={[APPROVED_ROW]}
        aliases={{}}
        areasSettled={false}
      />,
    );

    // Give the readback effect every chance to settle and render an offer.
    await waitFor(() =>
      expect(screen.getByTestId("offer-count")).toHaveTextContent("0"),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("offer-count")).toHaveTextContent("0");
  });
});
