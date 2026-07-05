"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgressionNode } from "./progressionNodes";

/**
 * Moments pass P4 — packet: ProgressionRail v0.
 *
 * Horizontal node chain rendered from `buildProgressionNodes`. Collapsed by
 * default to the last done node, the current/next node, and fold
 * affordances for the rest ("+N done" leading, "+N steps" trailing).
 * Expanding reveals the full chain. Speculative nodes are dashed/muted —
 * client-side placeholders (plan §6 R5), never a fetched or persisted
 * signal. Color never carries status alone: every node's aria-label
 * spells out its textual status.
 */

export interface ProgressionRailProps {
  nodes: ProgressionNode[];
  onExpand?(): void;
}

const STATUS_LABEL: Record<ProgressionNode["status"], string> = {
  done: "done",
  current: "in progress",
  next: "up next",
  speculative: "possible next step, not yet available",
};

function frontierIndex(nodes: ProgressionNode[]): number {
  const index = nodes.findIndex(
    (node) => node.status === "current" || node.status === "next",
  );
  return index === -1 ? nodes.length - 1 : index;
}

function NodeChip({ node }: { node: ProgressionNode }) {
  const isSpeculative = node.kind === "speculative";
  const isDone = node.status === "done";
  const isCurrent = node.status === "current";

  return (
    <li
      className={cn(
        "workflow-compact-item flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        isDone && "border-transparent",
        isSpeculative && "border-dashed text-muted-foreground",
        isCurrent && "ring-2 ring-offset-1 ring-offset-background",
      )}
      style={{
        background: isDone
          ? "color-mix(in oklch, var(--acc) 18%, transparent)"
          : undefined,
        color: isDone ? "var(--acc)" : undefined,
        borderColor: isCurrent ? "var(--acc)" : undefined,
        ...(isCurrent ? { ["--tw-ring-color" as string]: "var(--acc)" } : {}),
      }}
      aria-label={`${node.label}: ${STATUS_LABEL[node.status]}`}
      data-testid={`progression-node-${node.id}`}
      data-status={node.status}
    >
      {node.label}
    </li>
  );
}

export function ProgressionRail({ nodes, onExpand }: ProgressionRailProps) {
  const [expanded, setExpanded] = useState(false);

  if (nodes.length === 0) {
    return null;
  }

  const handleExpand = () => {
    setExpanded(true);
    onExpand?.();
  };

  const handleCollapse = () => {
    setExpanded(false);
  };

  if (expanded) {
    return (
      <div data-testid="progression-rail" data-expanded="true">
        <ul className="flex flex-wrap items-center gap-2">
          {nodes.map((node) => (
            <NodeChip key={node.id} node={node} />
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          onClick={handleCollapse}
          data-testid="progression-rail-collapse"
        >
          Collapse
        </button>
      </div>
    );
  }

  const frontier = frontierIndex(nodes);
  const lastDoneIndex = frontier > 0 ? frontier - 1 : -1;
  const leadingFoldCount = lastDoneIndex; // done nodes before the last-done node
  const trailingFoldCount = nodes.length - frontier - 1;

  const visible: ProgressionNode[] = [];
  if (lastDoneIndex >= 0) visible.push(nodes[lastDoneIndex]);
  visible.push(nodes[frontier]);

  return (
    <div data-testid="progression-rail" data-expanded="false">
      <ul className="flex flex-wrap items-center gap-2">
        {leadingFoldCount > 0 ? (
          <li
            className="text-xs tabular-nums text-muted-foreground"
            data-testid="progression-rail-fold-done"
          >
            +{leadingFoldCount} done
          </li>
        ) : null}
        {visible.map((node) => (
          <NodeChip key={node.id} node={node} />
        ))}
        {trailingFoldCount > 0 ? (
          <li>
            <button
              type="button"
              className="text-xs font-medium tabular-nums text-muted-foreground underline-offset-2 hover:underline"
              onClick={handleExpand}
              data-testid="progression-rail-fold-steps"
            >
              +{trailingFoldCount} steps
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
