import type { RollupSummary } from "@lifeos/schemas";

/**
 * Final UX Loop C1 re-score ROUND 2, GAP 2 — "has this period already been
 * rolled up?" answered in an id space the question can actually be asked in.
 *
 * The fresh-eyes judge approved a weekly rollup, opened a new tab, and was
 * offered the same period again. Re-approving wrote no second row — the unique
 * index `rollup_summaries_period_key` held — so the data was never at risk.
 * **The offer was the lie**, which is the same class as GAP 1's re-offered win
 * one surface over: the account knows, and the screen forgets.
 *
 * ## The failure is a race between two id spaces, not a missing readback
 *
 * The readback fires, returns 200, and carries the row. But an account
 * `rollup_summaries` row names its area by PERSISTED UUID, while a Close-moment
 * draft names it by WORKFLOW id (`area-main-job`). The bridge between them is
 * the loaded area list, and it arrives from hydration LATER than the readback
 * usually resolves. Resolving at FETCH time therefore silently kept the uuid
 * (`workflowAreaIdForPersistedAreaId` falls through to `?? persistedAreaId`),
 * and the keys could never meet. The judge isolated it by delaying only the
 * `rollup_summaries` GET by 25 s: hydration then won the race and the offer
 * withdrew correctly, same build, same data, same click path.
 *
 * ## Deliberately the same shape as `LoggedWinRecord.taskIdAliases`
 *
 * The win path already solved this class, and this module mirrors it on
 * purpose: a record carries EVERY id space its subject is known by, and the
 * consumer resolves them at USE — inside the memo that recomputes as hydration
 * lands — rather than freezing one guess at fetch time. Aliases widen
 * SUPPRESSION only; they are never counted, and they never mint a key for a
 * period nobody approved.
 *
 * The mapped `area_id` stays on the row because the monthly composer and the
 * month-over-month readback look their area LABEL up by it (`state.areas` is
 * workflow-scoped); stripping it back to a raw uuid would render an empty area
 * name on the monthly card.
 */

/**
 * One approved rollup as the provider hands it to the Close moment.
 *
 * `area_id` is the provider's best resolution into WORKFLOW id space at fetch
 * time — correct once hydration has landed, and the raw persisted uuid before
 * it. `areaIdAliases` carries every id the row's area is known by regardless,
 * so a consumer holding a live area map can finish the resolution later.
 */
export interface ApprovedRollupSummary extends RollupSummary {
  /**
   * Other ids that name the SAME area, when more than one space is in play.
   *
   * Always includes the raw persisted uuid the account row was read with. That
   * is the one the fetch-time mapping loses when it runs before hydration, and
   * losing it is the whole defect.
   */
  areaIdAliases?: readonly string[];
}

/** `areaId|periodType|periodStart` — one approved period, in one string. */
export function rollupKey(
  areaId: string,
  periodType: "week" | "month",
  periodStart: string,
): string {
  return `${areaId}|${periodType}|${periodStart}`;
}

/** Every id that names this row's area — the resolved id plus its aliases. */
export function approvedRollupAreaIdsOf(
  record: ApprovedRollupSummary,
): readonly string[] {
  return [record.area_id, ...(record.areaIdAliases ?? [])];
}

/**
 * This row's area in WORKFLOW id space, resolved against the live area map.
 *
 * The same late-resolution the key set does, for the consumers that need the
 * id itself rather than a key: the monthly composer looks the area's LABEL up
 * by it in `state.areas`, which is workflow-scoped, so an unresolved uuid
 * renders a monthly card with an empty area name.
 */
export function resolvedRollupAreaId(
  record: ApprovedRollupSummary,
  workflowAreaIdByPersistedId: Readonly<Record<string, string>>,
): string {
  return workflowAreaIdByPersistedId[record.area_id] ?? record.area_id;
}

/**
 * Every `areaId|periodType|periodStart` this user has already approved, across
 * both durable tiers and both id spaces.
 *
 * `workflowAreaIdByPersistedId` is the LIVE area map — empty until hydration
 * lands, filled after. Passing it here rather than baking it into the rows is
 * what makes the answer recompute instead of staying wrong for the life of the
 * mount.
 *
 * `journalledKeys` is the DEVICE tier: rollups this device holds and has not
 * sent. Those are journalled in workflow space already (`workflow_area_id`), so
 * they need no resolution — without them a rollup approved offline would be
 * re-offered on the next mount, which is the same failure one tier down.
 *
 * Both the raw and the resolved id are emitted for every row. A row is one
 * approval however many names it answers to; emitting both can only ever widen
 * suppression to ids that already name the same area, never invent a period.
 */
export function resolveDurablyApprovedRollupKeys(
  approved: readonly ApprovedRollupSummary[],
  journalledKeys: readonly string[],
  workflowAreaIdByPersistedId: Readonly<Record<string, string>>,
): Set<string> {
  const keys = new Set<string>(journalledKeys);
  for (const record of approved) {
    for (const areaId of approvedRollupAreaIdsOf(record)) {
      keys.add(rollupKey(areaId, record.period_type, record.period_start));
      const resolved = workflowAreaIdByPersistedId[areaId];
      if (resolved) {
        keys.add(rollupKey(resolved, record.period_type, record.period_start));
      }
    }
  }
  return keys;
}
