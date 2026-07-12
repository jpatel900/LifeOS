"use client";

import { cn } from "@/lib/utils";
import { isNodeComplete, type TaskMapNode } from "@/lib/taskmap/graph";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * FR-031 slice 5 — shared node presentation for both the draft review and
 * the approved collapsed map view. Role carries the primary visual
 * distinction (required / optional de-emphasized / red never-actionable);
 * color never carries status alone — every chip's aria-label spells out
 * role and done-state in words. Red nodes are rendered as plain, non-
 * interactive text (no button, no tabIndex, no click handler wired here)
 * so a caller cannot accidentally make one actionable.
 *
 * FR-031 slice 6: an `onToggleComplete` handler makes required/optional
 * chips a real button — tapping toggles completion (reversible: tap again
 * to undo). Omitting the handler (e.g. in the draft-review surface, where
 * nothing is approved yet) keeps the chip as plain, non-interactive
 * presentation, same as a red node.
 */
export interface TaskMapNodeChipProps {
  node: TaskMapNode;
  emphasized?: boolean;
  onToggleComplete?: (nodeId: string) => void;
}

const ROLE_LABEL: Record<TaskMapNode["role"], string> = {
  required: "required step",
  optional: "optional step",
  red: "do-not / conditional",
};

export function TaskMapNodeChip({
  node,
  emphasized,
  onToggleComplete,
}: TaskMapNodeChipProps) {
  const isRed = node.role === "red";
  const isOptional = node.role === "optional";
  const isDone = isNodeComplete(node);
  const isInteractive = !isRed && Boolean(onToggleComplete);

  const statusWords = isDone ? "done" : ROLE_LABEL[node.role];
  const ariaLabel = isRed
    ? `${node.title}: do-not or conditional step. ${node.red_reason ?? ""}`.trim()
    : isInteractive
      ? `${node.title}: ${statusWords}. Tap to mark ${isDone ? "not done" : "done"}.`
      : `${node.title}: ${statusWords}`;

  const sharedClassName = cn(
    "workflow-compact-item flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs font-medium",
    isOptional && "border-dashed text-muted-foreground",
    isRed && "cursor-default border-dashed",
    emphasized && "ring-2 ring-offset-1 ring-offset-background",
    // HIT_TARGET_ROW (not the invisible/centering variants): the chip
    // already owns a visible background/border and its own flex-col
    // layout, so only the 44px min-height floor is added.
    isInteractive && HIT_TARGET_ROW,
  );

  const sharedStyle = {
    background: isDone
      ? "color-mix(in oklch, var(--acc) 18%, transparent)"
      : isRed
        ? "color-mix(in oklch, var(--state-risk) 12%, transparent)"
        : undefined,
    color: isDone ? "var(--acc)" : isRed ? "var(--state-risk)" : undefined,
    borderColor: emphasized
      ? "var(--acc)"
      : isRed
        ? "var(--state-risk)"
        : undefined,
    ...(emphasized ? { ["--tw-ring-color" as string]: "var(--acc)" } : {}),
  };

  const content = (
    <>
      <span>{node.title}</span>
      {isRed && node.red_reason ? (
        <span className="text-[11px] font-normal opacity-90">
          {node.red_reason}
          {node.red_condition ? ` (unless: ${node.red_condition})` : ""}
        </span>
      ) : null}
    </>
  );

  if (isInteractive && onToggleComplete) {
    return (
      <button
        type="button"
        className={cn(sharedClassName, "text-left")}
        style={sharedStyle}
        aria-label={ariaLabel}
        aria-pressed={isDone}
        onClick={() => onToggleComplete(node.id)}
        data-testid={`taskmap-node-${node.id}`}
        data-role={node.role}
        data-done={isDone ? "true" : "false"}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={sharedClassName}
      style={sharedStyle}
      aria-label={ariaLabel}
      aria-disabled={isRed ? true : undefined}
      data-testid={`taskmap-node-${node.id}`}
      data-role={node.role}
      data-done={isDone ? "true" : "false"}
    >
      {content}
    </div>
  );
}
