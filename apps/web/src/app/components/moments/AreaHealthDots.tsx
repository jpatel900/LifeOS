"use client";

import { cn } from "@/lib/utils";
import { buildAreaAccentStyle } from "@/lib/areaAccent";
import type { AreaHealthVM } from "./momentsViewModel";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Renders one dot per area, colored by `--state-ok/watch/risk/idle`. Color
 * is never the only signal: each dot's aria-label spells out the textual
 * status plus its note so the same information survives without color.
 *
 * D-4 (design alignment, #483): restyles the flex-wrap chip row to
 * prototype-2's `.area-row` list — one row per area, a visible status word
 * on the right (previously that same word only lived in the dot's
 * `aria-label`; now it's on-screen text too, still backed by the same
 * `STATUS_LABEL` map, no new data).
 *
 * D-11 (design alignment, #483): ports the prototype's per-area color
 * *swatch* (`.aswatch`) — a distinct identity hue per area, separate from
 * the status dot — using `AreaHealthVM.color` (now threaded through from
 * `Phase2MockArea.color`, the same real per-area color Settings already
 * renders). The swatch sits via the existing `--area-accent` token family
 * (`buildAreaAccentStyle`, same helper the area registry/onboarding use),
 * never a hardcoded hex. It is `aria-hidden`: identity color is redundant
 * with the visible area-name text next to it, and the status dot remains
 * the sole accessible status signal (its aria-label is unchanged).
 *
 * R2-C (#483 round 2): D-11 shipped the identity swatch as a same-size
 * circle sitting ~8px from the status dot — two identical circles with
 * unrelated meaning read as a duplication bug, not "identity + status"
 * (confirmed regression vs the D-8 evidence shot, which had one dot per
 * row). Fixed by differentiating shape *and* position rather than adding a
 * third element: the identity mark is now a small rounded bar (never a
 * circle, so it can never be mistaken for a status dot at a glance) next to
 * the area name, and the status dot moved to sit directly against the
 * status word it labels on the right — the two marks no longer neighbor
 * each other anywhere in the row. Same tokens, same aria-label, same
 * testids; only shape and position changed.
 *
 * R5 (premium push #483 round 5, blocker 2): this list used to render one
 * row per configured area with no cap, so the Areas card's own height (and
 * therefore how far its bottom edge sits from the fixed capture pill at
 * rest, scroll zero) scaled linearly with area count. R4-A measured the
 * demo seed's 4 areas clearing the pill by only 4.78-7.33px at 1366x768 and
 * proved arithmetically that a 5th area goes negative (a real row is
 * ~32.8px). The owner will have more than four areas, so "works for the
 * demo's 4" was never the bar.
 * Fix: bound the list to a fixed `max-height` + `overflow-y: auto`
 * (`--rail-areas-max-h`, globals.css) once area count exceeds
 * `AREAS_SCROLL_THRESHOLD` — the card's rendered height, and so the pill's
 * clearance under it, is now constant regardless of whether there are 4, 5,
 * 8, or 12 areas. This is a real internal scroll pane, not a silent
 * truncation: every area is still in the DOM (never removed, never
 * `display:none`'d, still reachable by a screen reader's normal
 * next-item/read-through navigation regardless of visual scroll position)
 * and reachable by scrolling.
 * Per this app's truthfulness doctrine — never hide content the user needs
 * to know exists — capping needs an honest affordance, but a first attempt
 * at a dedicated on-screen "N areas — scroll for more" text row cost MORE
 * height (a new line + gap) than a tight cap saved, which is exactly the
 * kind of self-defeating fix this doctrine exists to catch: measured before
 * committing to it, not assumed. The affordance is now zero-height instead:
 * (1) the real total moves to SideRail's own "Areas" card header (`· N`,
 * see SideRail.tsx) — always visible, costs no list space since it reuses
 * an existing text line; (2) a bottom edge-fade (`aria-hidden`,
 * `pointer-events-none`, absolutely positioned so it adds no layout height)
 * signals "more below" using the same visual language as any native
 * scrollable pane; (3) an `sr-only` note (zero visual footprint) gives
 * screen reader users the same "N total, scrollable" fact explicitly
 * instead of relying on them to infer it while reading through the list.
 */

// R5: area count at which the list starts scrolling instead of growing the
// card. Deliberately small — the demo seed's 4 areas already exceed it, so
// the scroll mechanism is exercised by real seed data, not only by areas
// beyond what anyone has today. The actual visible height is
// --rail-areas-max-h (globals.css); this only decides *whether* the cap
// applies (unnecessary below this many areas — nothing to gain by capping a
// list shorter than the cap already allows).
const AREAS_SCROLL_THRESHOLD = 3;

export interface AreaHealthDotsProps {
  areas: AreaHealthVM[];
}

const STATUS_LABEL: Record<AreaHealthVM["status"], string> = {
  ok: "on track",
  watch: "needs attention",
  risk: "at risk",
  idle: "idle",
};

const STATUS_VAR: Record<AreaHealthVM["status"], string> = {
  ok: "var(--state-ok)",
  watch: "var(--state-watch)",
  risk: "var(--state-risk)",
  idle: "var(--state-idle)",
};

export function AreaHealthDots({ areas }: AreaHealthDotsProps) {
  if (areas.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="area-health-dots-empty"
      >
        No areas yet — add one in Settings to start tracking health.
      </p>
    );
  }

  const overflowing = areas.length > AREAS_SCROLL_THRESHOLD;

  return (
    <div className="relative" data-testid="area-health-dots-wrap">
      {overflowing ? (
        <p className="sr-only" data-testid="area-health-dots-overflow-hint">
          Showing a scrollable list of {areas.length} areas — scroll to see
          all of them.
        </p>
      ) : null}
      <ul
        className={cn(
          "divide-y divide-border/60",
          overflowing && "moments-rail-scroll overflow-y-auto pr-1",
        )}
        data-testid="area-health-dots"
      >
        {areas.map((area) => (
          <li
            key={area.id}
            className="flex items-center justify-between gap-2 py-1.5 text-sm first:pt-0 last:pb-0"
            data-testid={`area-health-row-${area.id}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3.5 w-1 shrink-0 rounded-sm bg-[var(--area-accent)]"
                style={buildAreaAccentStyle(area.color)}
                data-testid={`area-health-swatch-${area.id}`}
              />
              <span className="truncate text-muted-foreground">
                {area.name}
              </span>
            </span>
            <span
              className="flex shrink-0 items-center gap-1.5 text-xs font-medium"
              style={{ color: STATUS_VAR[area.status] }}
              data-testid={`area-health-status-${area.id}`}
            >
              <span
                aria-label={`${area.name}: ${STATUS_LABEL[area.status]} — ${area.note}`}
                role="img"
                className="inline-block size-1.5 shrink-0 rounded-full"
                style={{ background: STATUS_VAR[area.status] }}
                data-testid={`area-health-dot-${area.id}`}
              />
              {STATUS_LABEL[area.status]}
            </span>
          </li>
        ))}
      </ul>
      {overflowing ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-card to-transparent"
          data-testid="area-health-dots-fade"
        />
      ) : null}
    </div>
  );
}
