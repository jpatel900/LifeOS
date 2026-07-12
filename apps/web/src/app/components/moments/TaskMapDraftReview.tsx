"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  validateGraph,
  type TaskMapGraph,
  type TaskMapNode,
} from "@/lib/taskmap/graph";
import { groupIntoColumns } from "@/lib/taskmap/layout";
import { TaskMapNodeChip } from "./TaskMapNodeChip";
import { HIT_TARGET_INVISIBLE, HIT_TARGET_ROW } from "./hitTarget";

/**
 * FR-031 slice 5 — draft review + one-pass L1 approve.
 *
 * The owner reviews the full AI-drafted DAG in one pass (ADR 0002 D1 — a
 * single L1 approval of one suggestion instance, not an auto-execute
 * default). Editing is deliberately minimal: remove a node, edit a title,
 * add a node — enough to feed the override diff in `approveTaskMap`
 * without turning this into a graph editor. Reject/dismiss persists
 * nothing (NS-INV-4).
 */
export interface TaskMapDraftReviewProps {
  draft: TaskMapGraph & { schema_version: "1.0" };
  onApprove(graph: TaskMapGraph & { schema_version: "1.0" }): void;
  onDismiss(): void;
  /** FR-031 slice 8 — true when this draft is a regeneration of an
   * already-approved map (reached via the "Revise map" affordance). Swaps
   * the intro copy and the "Not now" label to make clear that approving
   * replaces the current map, and dismissing leaves it untouched. */
  isRevision?: boolean;
}

let nextCustomNodeSuffix = 0;

function newNodeId(): string {
  nextCustomNodeSuffix += 1;
  return `custom-${Date.now()}-${nextCustomNodeSuffix}`;
}

export function TaskMapDraftReview({
  draft,
  onApprove,
  onDismiss,
  isRevision = false,
}: TaskMapDraftReviewProps) {
  const [nodes, setNodes] = useState<TaskMapNode[]>(draft.nodes);
  const [edges, setEdges] = useState(draft.edges);
  const [addingTitle, setAddingTitle] = useState("");

  const currentGraph: TaskMapGraph = { nodes, edges };
  const validation = validateGraph(currentGraph);
  const columns = groupIntoColumns(currentGraph);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const removeNode = (id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) =>
      current.filter((edge) => edge.from !== id && edge.to !== id),
    );
  };

  const editTitle = (id: string, title: string) => {
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, title } : node)),
    );
  };

  const addNode = () => {
    const trimmed = addingTitle.trim();
    if (!trimmed) return;
    setNodes((current) => [
      ...current,
      { id: newNodeId(), title: trimmed, role: "optional" },
    ]);
    setAddingTitle("");
  };

  const handleApprove = () => {
    if (!validation.valid) return;
    onApprove({ schema_version: "1.0", nodes, edges });
  };

  return (
    <div
      className="workflow-flagship-card moments-card grid gap-3 rounded-xl border p-4"
      data-testid="taskmap-draft-review"
    >
      <p className="workflow-page-eyebrow m-0">
        {isRevision ? "Revised map draft" : "Task map draft"}
      </p>
      <p className="text-sm text-muted-foreground">
        {isRevision
          ? "Approving replaces the current map. Edit titles, drop a step, or add one — then approve the whole revision in one pass."
          : "Right enough to start? Edit titles, drop a step, or add one — then approve the whole map in one pass."}
      </p>

      <div
        className="flex flex-wrap items-start gap-3"
        data-testid="taskmap-draft-columns"
      >
        {columns.map((column) => (
          <div
            key={column.index}
            className="flex min-w-[220px] flex-1 flex-col gap-2"
          >
            {column.nodeIds.map((id) => {
              const node = nodesById.get(id);
              if (!node) return null;
              // One representation per node: red nodes render the shared
              // read-only chip (never editable, never actionable); every
              // other node renders a single chip-styled editable input
              // carrying the role treatment directly (optional = dashed,
              // de-emphasized) — no duplicate chip above it.
              return (
                <div key={id} className="flex w-full flex-col gap-1">
                  {node.role === "red" ? (
                    <TaskMapNodeChip node={node} />
                  ) : (
                    <input
                      type="text"
                      value={node.title}
                      onChange={(event) => editTitle(id, event.target.value)}
                      className={cn(
                        "workflow-compact-item w-full rounded-lg border px-3 py-2 text-xs font-medium",
                        node.role === "optional" &&
                          "border-dashed text-muted-foreground",
                      )}
                      aria-label={`Edit title for ${node.title} (${node.role} step)`}
                      data-testid={`taskmap-draft-edit-${id}`}
                      data-role={node.role}
                    />
                  )}
                  <button
                    type="button"
                    className={cn(
                      HIT_TARGET_INVISIBLE,
                      "self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:underline",
                    )}
                    onClick={() => removeNode(id)}
                    data-testid={`taskmap-draft-remove-${id}`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={addingTitle}
          onChange={(event) => setAddingTitle(event.target.value)}
          placeholder="Add a step"
          className={cn(
            HIT_TARGET_ROW,
            "workflow-compact-item rounded border px-2 py-1 text-xs",
          )}
          data-testid="taskmap-draft-add-input"
        />
        <button
          type="button"
          className={cn(
            HIT_TARGET_INVISIBLE,
            "text-xs font-medium underline-offset-2 hover:underline",
          )}
          onClick={addNode}
          data-testid="taskmap-draft-add"
        >
          Add step
        </button>
      </div>

      {!validation.valid ? (
        <p
          className="text-xs"
          style={{ color: "var(--state-risk)" }}
          data-testid="taskmap-draft-errors"
        >
          Fix before approving: {validation.errors.join("; ")}
        </p>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleApprove}
          disabled={!validation.valid}
          className="min-h-[44px] touch-manipulation"
          data-testid="taskmap-draft-approve"
        >
          {isRevision ? "Replace the map" : "Right enough to start"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="min-h-[44px] touch-manipulation"
          data-testid="taskmap-draft-dismiss"
        >
          {isRevision ? "Keep current map" : "Not now"}
        </Button>
      </div>
    </div>
  );
}
