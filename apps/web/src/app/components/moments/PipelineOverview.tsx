"use client";

import { cn } from "@/lib/utils";
import {
  PIPELINE_OVERVIEW_STAGES,
  type PipelineOverviewStage,
} from "./pipelineCounts";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 *
 * Horizontal strip of workflow-stage nodes (capture/triage/plan/execute/
 * review), each a label + count badge. Rendered only inside the Start
 * moment's collapsed "Pipeline" disclosure (NFR-005) — never in the
 * masthead, never a seventh nav item. Purely presentational: takes counts
 * straight from `buildPipelineCounts`, no derivation of its own.
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
  return (
    <ul
      className="flex flex-wrap items-center gap-2"
      data-testid="pipeline-overview"
    >
      {PIPELINE_OVERVIEW_STAGES.map((stage) => (
        <li key={stage}>
          <button
            type="button"
            onClick={() => onDrill(stage)}
            className={cn(
              HIT_TARGET_ROW,
              "workflow-compact-item flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60",
            )}
            data-testid={`pipeline-overview-stage-${stage}`}
          >
            <span>{STAGE_LABELS[stage]}</span>
            <span
              className="grid size-5 min-w-[2ch] place-items-center rounded-full bg-muted text-[0.7rem] font-semibold tabular-nums text-muted-foreground"
              data-testid={`pipeline-overview-count-${stage}`}
            >
              {counts[stage] ?? 0}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
