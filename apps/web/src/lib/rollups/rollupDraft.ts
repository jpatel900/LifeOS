import type { RollupSummaryContent } from "@lifeos/schemas";

/**
 * S8 (#260) — rollup draft composition.
 *
 * Rollups are generated at review time, user-triggered, and the user must
 * approve a draft before anything persists (NS-INV-4). This module builds the
 * draft deterministically from that period's review data (wins, misses, and
 * counts), so the draft is testable and never depends on a live model.
 *
 * The `summary` shape is the strict `RollupSummaryContent` zod contract
 * (highlights[]/misses[]/counts). An AI provider may later rewrite the
 * highlights/misses prose for a more human summary — that enhancement routes
 * through the context-assembly choke point (NS-INV-1) and replaces the strings
 * below, but the shape and the approve-before-persist gate are unchanged.
 */

const MAX_WEEKLY_ITEMS = 10;
const MAX_MONTHLY_ITEMS = 12;

export interface WeeklyRollupInput {
  /** Titles of wins logged in the period (highlights). */
  winTitles: string[];
  /** Titles of tasks whose blocks were missed in the period (misses). */
  missedTitles: string[];
  counts: {
    wins: number;
    completedSessions: number;
    missedSessions: number;
  };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildWeeklyRollupDraft(
  input: WeeklyRollupInput,
): RollupSummaryContent {
  return {
    highlights: dedupe(input.winTitles).slice(0, MAX_WEEKLY_ITEMS),
    misses: dedupe(input.missedTitles).slice(0, MAX_WEEKLY_ITEMS),
    counts: {
      wins: input.counts.wins,
      completed_sessions: input.counts.completedSessions,
      missed_sessions: input.counts.missedSessions,
    },
  };
}

/**
 * Compose a monthly rollup draft from the month's already-approved weekly
 * rollups: union the highlights/misses (deduped, capped) and sum every count
 * key across the weeks. Returns null when there are no weeks to compose.
 */
export function composeMonthlyRollupDraft(
  weeklySummaries: RollupSummaryContent[],
): RollupSummaryContent | null {
  if (weeklySummaries.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const week of weeklySummaries) {
    for (const [key, value] of Object.entries(week.counts)) {
      counts[key] = (counts[key] ?? 0) + value;
    }
  }

  return {
    highlights: dedupe(
      weeklySummaries.flatMap((week) => week.highlights),
    ).slice(0, MAX_MONTHLY_ITEMS),
    misses: dedupe(weeklySummaries.flatMap((week) => week.misses)).slice(
      0,
      MAX_MONTHLY_ITEMS,
    ),
    counts,
  };
}
