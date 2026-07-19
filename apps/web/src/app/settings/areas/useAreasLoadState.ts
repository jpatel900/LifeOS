"use client";

import { useEffect, useState } from "react";
import type { Area, CalendarBlock, ReviewEntry, Task } from "@lifeos/schemas";
import {
  listAreas,
  listExecutionReviewItems,
  type DataProvider,
} from "../../../lib/data/workflow";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";

export type AreasLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
      areas: Area[];
      tasks: Task[];
      blocks: CalendarBlock[];
      reviewEntries: ReviewEntry[];
    };

function sortAreas(areas: Area[]) {
  return [...areas].sort((left, right) => left.sort_order - right.sort_order);
}

/**
 * #590 slice 5: owns the areas page's data wiring — the initial Supabase (or
 * mock) load, the ready/loading/error state, and the shared
 * `replaceReadyAreas` updater used by both the create-area form and the area
 * registry cards after a mutation. Extracted from AreasSettingsPage so the
 * page component itself stays composition-only.
 */
export function useAreasLoadState() {
  const { syncPersistedAreas } = useWorkflow();
  const [state, setState] = useState<AreasLoadState>({ status: "loading" });

  function replaceReadyAreas(nextAreas: Area[]) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            areas: sortAreas(nextAreas),
          }
        : current,
    );
    syncPersistedAreas(nextAreas);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const client = createSupabaseBrowserClient();
        const [areasResult, executionResult] = await Promise.all([
          listAreas(client),
          listExecutionReviewItems(client),
        ]);

        if (!cancelled) {
          setState({
            status: "ready",
            provider: areasResult.provider,
            areas: areasResult.areas,
            tasks: executionResult.tasks,
            blocks: executionResult.blocks,
            reviewEntries: executionResult.reviewEntries,
          });
          // #691: push the fresh Supabase rows into WorkflowContext so this
          // page and every other screen resolve areas from ONE list (the
          // context loads its own list once at mount and can go stale — the
          // "Current area: None selected while other screens act selected"
          // divergence). Same supabase-only guard as the context's own
          // mount load: mock rows must never enter the persisted-area map.
          if (areasResult.provider === "supabase") {
            syncPersistedAreas(areasResult.areas);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load areas right now.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
    // syncPersistedAreas is WorkflowContext's stable `applyPersistedAreas`
    // useCallback, so this still runs exactly once on mount.
  }, [syncPersistedAreas]);

  return { state, setState, replaceReadyAreas };
}
