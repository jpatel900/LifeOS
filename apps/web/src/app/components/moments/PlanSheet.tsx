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
 * schedule (the hour-rail placement UI, proposals, unplan) still lives only
 * in the full Plan stage shell at `/calendar` (#687 OWNER-GATE — not
 * redirected), which the "Open full view" link reaches.
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
        {/* #687 OWNER-GATE: `/calendar` is intentionally NOT redirected — the
            hour-rail placement UI, proposals, and Google approval exist only
            there — so this link stays until the owner decides
            port/keep/drop. */}
        <Link
          href="/calendar"
          className={cn(
            HIT_TARGET_INVISIBLE,
            "text-sm font-semibold text-primary hover:underline",
          )}
          data-testid="plan-sheet-open-full"
        >
          Open full view →
        </Link>
      </div>
    </MomentSheet>
  );
}
