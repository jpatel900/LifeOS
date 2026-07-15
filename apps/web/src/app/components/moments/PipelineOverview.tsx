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
 *
 * R2-D (issue #483 round 2): D-9's tint/weight/separator fixes above left
 * the rail's underlying composition problem untouched — five `flex-1`
 * cells force-stretched a five-numeral rail across the full 952px desktop
 * content column, so each cell's actual ink (one glyph + a ~40px label)
 * sat in ~180-190px of forced-empty flex-grow space regardless of
 * viewport. Still data-blocked from filling that space honestly (see
 * above — no delta history, no total/capacity to bar-fill), so the fix is
 * compositional, not decorative: at `sm:` and up the rail no longer
 * force-fills its container — the outer `<ul>` switches to `sm:w-fit` and
 * each `<li>`/button switches to `sm:flex-none`, so the rail's own box
 * shrinks to match its five cells' actual content width and left-aligns
 * under the greeting/day-synthesis text above it, instead of stretching to
 * a width it has no ink to cover. Below `sm:` the original `flex-1`/
 * full-width behavior stays: the rail's *intrinsic* content width doesn't
 * shrink with the viewport (it's driven by five numerals + labels, not by
 * available space), so hugging it unconditionally would overflow a 390px
 * screen — confirmed by measurement during the round-2 visual check, this
 * is why mobile keeps the original stretched layout while desktop gets the
 * new hugged one, not the same treatment at both sizes. */

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
      className="moments-card flex w-full items-stretch overflow-hidden border border-border p-1 sm:w-fit"
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
            <li className="flex flex-1 items-stretch sm:flex-none">
              <button
                type="button"
                onClick={() => {
                  setActiveStage(stage);
                  onDrill(stage);
                }}
                aria-current={active ? "step" : undefined}
                className={cn(
                  HIT_TARGET_ROW,
                  "flex flex-1 flex-col gap-0.5 rounded-[var(--surface-radius-sm)] px-3.5 py-2.5 text-left transition-colors duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:duration-0 sm:flex-none sm:px-4",
                  active ? "bg-[var(--blu-sf)]" : "hover:bg-muted/60",
                )}
                data-testid={`pipeline-overview-stage-${stage}`}
              >
                <span
                  className={cn(
                    "min-w-[2ch] text-xl font-[650] leading-none tracking-tight tabular-nums lining-nums sm:text-2xl",
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
