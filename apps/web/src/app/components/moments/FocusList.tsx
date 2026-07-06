"use client";

import type { FocusItemVM } from "./momentsViewModel";

/**
 * Moments pass S5 (#257) — calendar-load-aware daily focus.
 *
 * Renders today's ranked focus items *after* the #1 item (which
 * StartMoment already renders as FirstMoveCard) plus the over-budget
 * `deferred` tail. Deferred items are shown, not hidden, with a calm
 * "Deferred" pill — reusing the neutral `--state-idle` token (the same
 * "nothing alarming here" color AreaHealthDots uses for idle areas), not
 * red/risk, because being over budget on a heavy day is expected, not a
 * failure.
 */

export interface FocusListProps {
  items: FocusItemVM[];
  deferred: FocusItemVM[];
}

function focusItemKey(item: FocusItemVM, index: number): string {
  return item.taskId ?? `focus-item-${index}`;
}

export function FocusList({ items, deferred }: FocusListProps) {
  if (items.length === 0 && deferred.length === 0) {
    return null;
  }

  return (
    <ul className="workflow-compact-list" data-testid="focus-list">
      {items.map((item, index) => (
        <li
          key={focusItemKey(item, index)}
          className="workflow-compact-item flex items-center justify-between gap-3"
          data-testid="focus-list-item"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{item.title}</span>
            <span className="text-xs text-muted-foreground">
              {item.areaLabel || item.why}
            </span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {item.estMinutes} min
          </span>
        </li>
      ))}
      {deferred.map((item, index) => (
        <li
          key={focusItemKey(item, index)}
          className="workflow-compact-item flex items-center justify-between gap-3 opacity-80"
          data-testid="focus-list-deferred-item"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{item.title}</span>
            <span className="text-xs text-muted-foreground">
              {item.areaLabel || item.why}
            </span>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              background:
                "color-mix(in oklch, var(--state-idle) 18%, transparent)",
              color: "var(--state-idle)",
            }}
            data-testid="focus-list-deferred-pill"
          >
            Deferred
          </span>
        </li>
      ))}
    </ul>
  );
}
