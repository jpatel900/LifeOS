import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared primitives used across the cockpit stage views (extracted from
// LifeOSCockpit.tsx, issue #590 slice 2 — mechanical split, no behavior
// change).

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // C2 (#660 surface audit): retokened off the one-off --cockpit-radius
      // (22px) onto the moments --surface-radius family (16px) plus its
      // shadow, matching the .moments-card grammar (globals.css) other
      // routed surfaces already follow.
      className={cn(
        "rounded-[var(--surface-radius)] border border-[var(--ln)] bg-[var(--sf)] p-5 shadow-[var(--surface-shadow-sm)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function formatHour(hour: number) {
  if (hour === 12) return "12p";
  return hour > 12 ? `${hour - 12}p` : `${hour}a`;
}

export function estimate(task: { estimated_minutes_high: number | null }) {
  return task.estimated_minutes_high ?? 45;
}

// The scheduled length of a proposal in whole minutes (E1: apply-on-accept
// retimes proposed_end, so this reflects the adjusted duration once applied).
export function proposalMinutes(proposal: {
  proposed_start: string;
  proposed_end: string;
}) {
  return Math.max(
    1,
    Math.round(
      (new Date(proposal.proposed_end).getTime() -
        new Date(proposal.proposed_start).getTime()) /
        60000,
    ),
  );
}

export function ringStyle(value: number, total: number, radius: number) {
  const dash = 2 * Math.PI * radius;
  const safeTotal = Math.max(total, 1);
  return {
    strokeDasharray: dash,
    strokeDashoffset: dash * (1 - Math.min(value / safeTotal, 1)),
  };
}
