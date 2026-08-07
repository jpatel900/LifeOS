/**
 * Final UX Loop C2-S3 — the one list of sheet names.
 *
 * Deliberately its own module, with no `"use client"` and no React import:
 * the INBOUND parser (`deepLink.ts`, read on the server from `searchParams`)
 * and the OUTBOUND writer (`useSheetUrlState.ts`, a client hook) both need it,
 * and a client module cannot hand a callable function to a server component.
 *
 * Why they must share it rather than each keep a literal: those two lists
 * drifting apart is exactly the Target Card 2 failure #804 fixed — a sheet that
 * opens from the rail but closes itself on refresh, because one side of the URL
 * contract had never heard of it.
 */

export const SHEET_VALUES = ["triage", "plan", "review", "health"] as const;

export type SheetValue = (typeof SHEET_VALUES)[number];

export function isSheetValue(value: unknown): value is SheetValue {
  return SHEET_VALUES.includes(value as SheetValue);
}
