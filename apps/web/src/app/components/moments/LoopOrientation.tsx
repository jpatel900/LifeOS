"use client";

import { Fragment } from "react";
import { momentKeyLabel } from "@/lib/keys/keymap";
import {
  PIPELINE_OVERVIEW_STAGES,
  type PipelineOverviewStage,
} from "./pipelineCounts";
import { KBD_CHIP_NEUTRAL } from "./kbdChip";

/**
 * R3-A (design alignment, #483 round 3) — orientation content for the
 * genuinely-empty Start day (`StartVM.dayIsEmpty`; see momentsViewModel/
 * start.ts).
 *
 * Issue #478 named this surface's problem three rounds running: below the
 * Pipeline rail the empty day had ~200-250px of unexplained void at
 * 1440x900 — "sparse-by-accident," not "generous-calm." Rounds 1-2 tried
 * composition-only fixes (items-start, card de-hollowing); the void
 * persisted because the empty state genuinely had nothing else to say. The
 * owner ratified the fix directly on #478: fill it with orientation
 * content, not more padding.
 *
 * MAP-FIRST, NOT PROSE: the owner's cognition is documented as
 * spatial-first — status read via position/shape/color, not a paragraph
 * requiring decode. This renders the five pipeline stages as a connected
 * node rail (numbered position + a short connecting line, the same visual
 * grammar as the prototype's `.prograil` node map and this repo's own
 * ProgressionRail) with a few words per node, not a sentence — if a node
 * needed a sentence, the diagram would have stopped carrying the load. It
 * deliberately does NOT re-render `PipelineOverview`'s counts (that rail
 * already owns "how many are in each stage right now"; every count is 0 on
 * an empty day, so repeating them here would be the exact same
 * same-fact-said-twice defect R2-B fixed elsewhere on this page). This
 * component only explains the STRUCTURE of the loop — what each stage
 * means — which the numeric rail doesn't and shouldn't carry.
 *
 * TRUTHFUL, GROUNDED: stage ids/order come from `PIPELINE_OVERVIEW_STAGES`
 * (pipelineCounts.ts) — the same single source `PipelineOverview` reads, so
 * this can never list a stage that doesn't exist or in a different order.
 * The capture keybinding is read from `momentKeyLabel("open-capture")`
 * (keymap.ts), not hardcoded, so it can never drift from what "C" actually
 * does. The per-stage captions are static prose, but every one is a
 * verifiable fact about the app's real, shipped mechanics (docs/
 * UX_FLOWS.md Flows 2-9: capture saves raw text and decides nothing;
 * triage's real choices include accept/edit/reject; planning proposals
 * stay local until an explicit Google Calendar write is approved; execute
 * shows one task at a time; daily review is where items move to
 * tomorrow/drop/reschedule) — never a per-item claim, so nothing here can
 * assert a state change that didn't happen. No done/current/next styling:
 * every node renders identically (numbered, neutral) because, truthfully,
 * nothing has moved through the loop yet on an empty day — a highlighted
 * "current" node would overclaim state that doesn't exist.
 *
 * NOT ONBOARDING: OnboardingRitual.tsx is the one-time first-use wizard
 * (areas -> day shape -> first capture) and is untouched by this packet.
 * This renders on every genuinely-empty day, not once, and never asks for
 * input — it's a quiet explanatory map, not a step the user completes.
 *
 * DEGRADES HONESTLY: gated in StartMoment by `vm.dayIsEmpty` only — the
 * instant a block, a focus item, a deferred item, or a pending-triage
 * capture exists, this section is not rendered at all (see StartMoment.tsx
 * and the co-located "recedes with real data" tests).
 */

const STAGE_LABEL: Record<PipelineOverviewStage, string> = {
  capture: "Capture",
  triage: "Triage",
  plan: "Plan",
  execute: "Execute",
  review: "Review",
};

// Short fragments, not sentences — the diagram (position + connector line)
// carries the sequence; these two-to-four words carry only what a numeral
// alone can't. Grounded in docs/UX_FLOWS.md — see the file doc comment.
const STAGE_CAPTION: Record<PipelineOverviewStage, string> = {
  capture: "goes in, unsorted",
  triage: "accept, edit, or reject",
  plan: "time-blocked, locally",
  execute: "one task, one focus",
  review: "see what moved",
};

export function LoopOrientation() {
  return (
    <section
      className="grid gap-3"
      aria-label="How a captured thought moves through the loop"
      data-testid="start-loop-orientation"
    >
      <h2 className="workflow-page-eyebrow m-0">The loop</h2>
      <ol
        className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4 sm:flex-nowrap sm:justify-between sm:gap-0"
        data-testid="start-loop-orientation-nodes"
      >
        {PIPELINE_OVERVIEW_STAGES.map((stage, index) => (
          <Fragment key={stage}>
            {index > 0 ? (
              <li
                aria-hidden="true"
                className="hidden h-px flex-1 bg-border sm:mt-3.5 sm:block"
              />
            ) : null}
            <li
              className="flex basis-[28%] flex-col items-center gap-1.5 px-1 text-center sm:flex-1 sm:basis-0"
              data-testid={`start-loop-orientation-stage-${stage}`}
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground"
              >
                {index + 1}
              </span>
              <span className="text-xs font-medium">{STAGE_LABEL[stage]}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">
                {STAGE_CAPTION[stage]}
              </span>
              {stage === "capture" ? (
                <kbd
                  className={KBD_CHIP_NEUTRAL}
                  data-testid="start-loop-orientation-capture-key"
                >
                  {momentKeyLabel("open-capture")}
                </kbd>
              ) : null}
            </li>
          </Fragment>
        ))}
      </ol>
    </section>
  );
}
