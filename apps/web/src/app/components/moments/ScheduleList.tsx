"use client";

import { ScheduleBlock, type ScheduleTimeDisplay } from "./ScheduleBlock";
import type { ScheduleBlockVM } from "./momentsViewModel";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Renders today's schedule as a list of ScheduleBlock rows. Purely
 * presentational: takes ScheduleBlockVM[] straight from momentsViewModel
 * plus a pinned `now`, no derivation of its own.
 */

export interface ScheduleListProps {
  blocks: ScheduleBlockVM[];
  timeDisplay: ScheduleTimeDisplay;
  now: Date;
}

export function ScheduleList({ blocks, timeDisplay, now }: ScheduleListProps) {
  if (blocks.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="schedule-list-empty"
      >
        Nothing on today&apos;s schedule.
      </p>
    );
  }

  return (
    <ul className="workflow-compact-list" data-testid="schedule-list">
      {blocks.map((block) => (
        <ScheduleBlock
          key={block.id}
          block={block}
          timeDisplay={timeDisplay}
          now={now}
        />
      ))}
    </ul>
  );
}
