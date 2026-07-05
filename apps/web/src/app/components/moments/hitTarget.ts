/**
 * SP-9 — packet: touch parity + hit targets (pre-G1 floor).
 *
 * Shared Tailwind utility sets so every interactive element in
 * components/moments/** reaches a >=44x44px effective hit area and drops
 * the 300ms double-tap delay on coarse pointers, without editing the
 * shared `@/components/ui/button` primitive (out of scope for this
 * packet) or globals.css.
 *
 * Three flavors:
 * - `HIT_TARGET_MIN`: `min-h-[44px] min-w-[44px]` plus centering and
 *   `touch-manipulation`, for standalone elements with a visible
 *   background/border (chips, pills, standalone backgrounded buttons)
 *   where padding grows the element's own box. `min-w-[44px]` is a
 *   no-op on anything already wider; height is the binding dimension.
 * - `HIT_TARGET_ROW`: just `min-h-[44px]` + `touch-manipulation`, for
 *   any element that already owns its own `display`/alignment classes
 *   (full-width rows like palette options/schedule rows/triage items,
 *   or flex pills like the moment switcher/clock toggle tabs) — no
 *   `inline-flex`/centering here so it never fights the caller's own
 *   layout classes. `min-w-[44px]` is omitted: full-width rows always
 *   exceed it, and the flex-pill call sites already have `gap`-separated
 *   multi-word content wider than 44px.
 * - `HIT_TARGET_INVISIBLE`: `min-h-[44px] min-w-[44px]` for the box size
 *   (guaranteeing the 44px floor) combined with a negative margin
 *   (`-m-2.5`) so the element's own footprint expands *into* the
 *   surrounding layout gap rather than pushing siblings around, for
 *   text-only, no-background affordances (e.g. a bare "Close" label)
 *   where a visible border/fill box would be a real desktop appearance
 *   change. The rendered text itself is unchanged size; only the
 *   (invisible, backgroundless) tappable box grows. Because these
 *   elements have no background/border, the larger box paints nothing
 *   extra — visually identical, functionally larger.
 */

export const HIT_TARGET_MIN =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center touch-manipulation";

export const HIT_TARGET_ROW = "min-h-[44px] touch-manipulation";

export const HIT_TARGET_INVISIBLE =
  "-m-2.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center touch-manipulation";
