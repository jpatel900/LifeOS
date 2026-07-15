"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_OVERVIEW_STAGES,
  type PipelineOverviewStage,
} from "./pipelineCounts";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 * D-3 (design alignment, #483): ports prototype-2's `.pipe`/`.pstep` stage
 * rail — a horizontal strip of capture/triage/plan/execute/review nodes,
 * each a big tabular count over a small label, chevron-separated, with an
 * active-stage highlight — replacing the old label+pill-badge row. Rendered
 * directly on the Start moment (no longer behind a collapsed disclosure —
 * see StartMoment.tsx), never in the masthead, never a seventh nav item.
 *
 * D-9 (signature-element pass, #483): the D-3 port read as "a bare number
 * strip" per the visual audit — flat label+number pairs with no hierarchy.
 * Three fixes, all scoped to composition/density, not new data:
 *  - Active-step tint now matches the prototype's `.pstep.active` treatment
 *    (`background: var(--accent-soft)` / `color: var(--accent)` on the
 *    count) instead of the old shadcn `bg-primary/10`. This app's accent
 *    family lives under two names: `--acc/--acc-sf` (cockpit-scoped,
 *    theme-independent hex) and `--blu-fg/--blu-sf` (same accent hue,
 *    ported through the amber/green *state*-token pattern). Only the
 *    `--blu-*` pair is redefined per theme — `--acc-sf` stays pinned to its
 *    dark hex (`#2b314a`) in the light block (globals.css's own comment:
 *    "not redefined here... since the prototype's accent doesn't vary by
 *    theme" — true of the hue, not true of a flattened-over-surface tint).
 *    `bg-[var(--blu-sf)]`/`text-[var(--blu-fg)]` is the theme-correct
 *    equivalent already used the same way in PlanView/ReviewView/TriageView.
 *  - Counts add `lining-nums` alongside the existing `tabular-nums` (both
 *    compose into `font-variant-numeric`) and move from `font-semibold`
 *    (600) to the prototype's own `font-weight: 650` (`font-[650]`) —
 *    verbatim precedent for a non-standard weight already exists in this
 *    file's sibling `.moments-card-title` (620, globals.css).
 *  - The stage chevron used to be an absolutely-positioned overlay
 *    (`absolute -left-px z-10`) painted on top of the button's own
 *    hover/active fill — visually it read as a stray mark sitting on the
 *    highlight rather than a deliberate rail joint. It's now a real sibling
 *    `<li>` in normal flow (own flex slot, own gutter), so the strip reads
 *    as one continuous composed rail rather than five independently-hovered
 *    boxes with a decal on top.
 *
 * Two prototype elements are deliberately NOT ported, per the packet's
 * truthful-data rule: the demo's `+5`/`-3` count deltas (no capture/triage/
 * etc. history table exists to diff against) and its `--f` progress-bar
 * fills (the demo values are hand-tuned decoration, not derived from any
 * count/total — porting them as a visual "progress" bar would read as a
 * completion signal that doesn't exist). Purely presentational otherwise:
 * counts come straight from `buildPipelineCounts`, no derivation of its own.
 *
 * Active-stage highlight is local last-clicked UI state, not a data
 * derivation: the prototype's `.pstep.active` is itself just "which node
 * did the demo user last click" (see its click handler toggling `.active`
 * onto the clicked node) — there is no "you are here" signal in
 * WorkflowContext to derive from truthfully, so this starts with nothing
 * active rather than seeding a fake default stage.
 */

export interface PipelineOverviewProps {
  counts: Record<string, number>;
  onDrill(stage: string): void;
}

const STAGE_LABELS: Record<PipelineOverviewStage, string> = {
  capture: "Capture",
  triage: "Triage",
  plan: "Plan",
  execute: "Execute",
  review: "Review",
};

export function PipelineOverview({ counts, onDrill }: PipelineOverviewProps) {
  const [activeStage, setActiveStage] = useState<string | null>(null);

  return (
    <ul
      className="moments-card flex items-stretch overflow-hidden border border-border p-1"
      data-testid="pipeline-overview"
      aria-label="Pipeline stages"
    >
      {PIPELINE_OVERVIEW_STAGES.map((stage, index) => {
        const active = activeStage === stage;
        return (
          <Fragment key={stage}>
            {index > 0 ? (
              <li
                aria-hidden="true"
                className="flex flex-none items-center justify-center px-0.5 text-sm text-muted-foreground/70"
              >
                {"›"}
              </li>
            ) : null}
            <li className="flex flex-1 items-stretch">
              <button
                type="button"
                onClick={() => {
                  setActiveStage(stage);
                  onDrill(stage);
                }}
                aria-current={active ? "step" : undefined}
                className={cn(
                  HIT_TARGET_ROW,
                  "flex flex-1 flex-col gap-0.5 rounded-[var(--surface-radius-sm)] px-3.5 py-2.5 text-left transition-colors duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:duration-0",
                  active ? "bg-[var(--blu-sf)]" : "hover:bg-muted/60",
                )}
                data-testid={`pipeline-overview-stage-${stage}`}
              >
                <span
                  className={cn(
                    "min-w-[2ch] text-xl font-[650] leading-none tracking-tight tabular-nums lining-nums",
                    active ? "text-[var(--blu-fg)]" : "text-foreground",
                  )}
                  data-testid={`pipeline-overview-count-${stage}`}
                >
                  {counts[stage] ?? 0}
                </span>
                <span className="text-[11.5px] font-medium text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </span>
              </button>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
