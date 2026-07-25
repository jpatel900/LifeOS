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
import {
  isSignedOutError,
  persistedLoadFailureMessage,
} from "@/lib/workflowContext/reducerCore";

export type AreasLoadState =
  | { status: "loading" }
  // #742: nobody is signed in. `@supabase/ssr`'s auth.getUser() rejects one
  // branch before our own data layer's "Sign in before …" messages with its
  // own AuthSessionMissingError ("Auth session missing!"), so this used to
  // be the only status this hook produced for a signed-out visitor — the
  // page rendered that raw library string verbatim inside a destructive
  // alert. `isSignedOutError` (the same classifier `WorkflowContext.tsx`
  // uses for `markPersistedLoadFailure`) recognizes it here too so a
  // signed-out session gets its own calm status instead of sharing "error".
  // Deliberately carries no message: the copy for this state lives in
  // page.tsx next to the sign-in door, same split `OperatorProfilePanel`
  // and `AreaCharterPanel` already use on this screen.
  | { status: "signed-out" }
  // A GENUINE failure — Supabase reachable, someone is signed in, and the
  // request still failed. `message` is always plain language: never the raw
  // caught error (see the catch block below), so nothing library- or
  // provider-specific reaches this type's consumers.
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
          // #742: the boundary. Never hand the caught error's own message to
          // `setState` — that is exactly how the library's raw
          // "Auth session missing!" reached the page before. Signed-out gets
          // its own calm status (no message to leak); every other failure
          // gets one fixed plain-language sentence, reused from
          // `persistedLoadFailureMessage` rather than invented here so this
          // screen reads the same words `WorkflowContext` already uses for
          // the identical "saved data would not load" state. The real error
          // still reaches the developer console for debugging.
          if (isSignedOutError(error)) {
            setState({ status: "signed-out" });
          } else {
            console.error(
              "[settings/areas] areas failed to load",
              error instanceof Error ? error : new Error(String(error)),
            );
            setState({ status: "error", message: persistedLoadFailureMessage });
          }
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
