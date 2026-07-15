"use client";

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
 * prototype-2's `.area-row` list — one row per area, colored dot on the
 * left, a visible status word on the right (previously that same word only
 * lived in the dot's `aria-label`; now it's on-screen text too, still
 * backed by the same `STATUS_LABEL` map, no new data).
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
 */

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

  return (
    <ul className="divide-y divide-border/60" data-testid="area-health-dots">
      {areas.map((area) => (
        <li
          key={area.id}
          className="flex items-center justify-between gap-2 py-1.5 text-sm first:pt-0 last:pb-0"
          data-testid={`area-health-row-${area.id}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full border border-border/60 bg-[var(--area-accent)]"
              style={buildAreaAccentStyle(area.color)}
              data-testid={`area-health-swatch-${area.id}`}
            />
            <span
              aria-label={`${area.name}: ${STATUS_LABEL[area.status]} — ${area.note}`}
              role="img"
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: STATUS_VAR[area.status] }}
              data-testid={`area-health-dot-${area.id}`}
            />
            <span className="truncate text-muted-foreground">{area.name}</span>
          </span>
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: STATUS_VAR[area.status] }}
            data-testid={`area-health-status-${area.id}`}
          >
            {STATUS_LABEL[area.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
