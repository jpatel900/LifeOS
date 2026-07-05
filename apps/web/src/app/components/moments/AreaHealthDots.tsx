"use client";

import type { AreaHealthVM } from "./momentsViewModel";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Renders one dot per area, colored by `--state-ok/watch/risk/idle`. Color
 * is never the only signal: each dot's aria-label spells out the textual
 * status plus its note so the same information survives without color.
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
        No areas yet.
      </p>
    );
  }

  return (
    <ul
      className="flex flex-wrap items-center gap-3"
      data-testid="area-health-dots"
    >
      {areas.map((area) => (
        <li key={area.id} className="flex items-center gap-1.5">
          <span
            aria-label={`${area.name}: ${STATUS_LABEL[area.status]} — ${area.note}`}
            role="img"
            className="inline-block size-2.5 rounded-full"
            style={{ background: STATUS_VAR[area.status] }}
            data-testid={`area-health-dot-${area.id}`}
          />
          <span className="text-xs text-muted-foreground">{area.name}</span>
        </li>
      ))}
    </ul>
  );
}
