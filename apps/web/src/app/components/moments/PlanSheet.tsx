"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MomentSheet } from "./MomentSheet";
import { ScheduleList } from "./ScheduleList";
import type { ScheduleBlockVM } from "./momentsViewModel";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 *
 * Thin summary sheet for the Plan stage. Reuses the existing ScheduleList
 * primitive (already used by StartMoment) to show today's blocks — no new
 * derivation, `blocks`/`now`/`timeDisplay` are passed straight through from
 * the caller's existing StartVM/now/timeDisplay. Anything beyond today's
 * schedule (the hour-rail placement UI, proposals, unplan) stays in the
 * full Plan stage shell until P7; the "Open full view" link goes to the
 * existing `/calendar` route (no new route added).
 */

export interface PlanSheetProps {
  open: boolean;
  onClose(): void;
  blocks: ScheduleBlockVM[];
  timeDisplay: "countdown" | "clock";
  now: Date;
}

export function PlanSheet({
  open,
  onClose,
  blocks,
  timeDisplay,
  now,
}: PlanSheetProps) {
  return (
    <MomentSheet open={open} title="Plan" onClose={onClose}>
      <div className="grid gap-4" data-testid="plan-sheet">
        <ScheduleList blocks={blocks} timeDisplay={timeDisplay} now={now} />
        <Link
          href="/calendar"
          className={cn(
            HIT_TARGET_INVISIBLE,
            // #690 Part 1: start-aligned (see TriageSheet's open-full link).
            "justify-self-start text-sm font-semibold text-primary hover:underline",
          )}
          data-testid="plan-sheet-open-full"
        >
          Open full view →
        </Link>
      </div>
    </MomentSheet>
  );
}
