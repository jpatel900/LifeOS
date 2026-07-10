"use client";

import { useState } from "react";
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
          <li key={stage} className="relative flex flex-1 items-stretch">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-px top-1/2 z-10 -translate-y-1/2 text-xs text-muted-foreground"
              >
                {"›"}
              </span>
            ) : null}
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
                active ? "bg-primary/10" : "hover:bg-muted/60",
              )}
              data-testid={`pipeline-overview-stage-${stage}`}
            >
              <span
                className={cn(
                  "min-w-[2ch] text-xl font-semibold leading-none tracking-tight tabular-nums",
                  active ? "text-primary" : "text-foreground",
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
        );
      })}
    </ul>
  );
}
