"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RollupSummaryContent } from "@lifeos/schemas";
import {
  requestRollupProse,
  type RequestRollupProseResult,
} from "@/lib/ai/rollupProseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RollupDraftVM } from "./momentsViewModel";

function proseInputKey(draft: RollupDraftVM, periodType: "week" | "month") {
  return JSON.stringify([
    periodType,
    draft.areaId,
    draft.areaLabel,
    draft.periodStart,
    draft.periodEnd,
    draft.periodLabel,
    draft.summary.highlights,
    draft.summary.misses,
    Object.entries(draft.summary.counts).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** Keep one request per area while effects observe the matching draft. */
export function useRollupProseSummaries(
  drafts: readonly RollupDraftVM[],
  periodType: "week" | "month",
): Record<string, RollupSummaryContent> {
  const requests = useRef(
    new Map<
      string,
      {
        inputKey: string;
        promise: Promise<RequestRollupProseResult | null>;
      }
    >(),
  );
  const requestTail = useRef<Promise<void>>(Promise.resolve());
  const currentInputs = useRef<Map<string, string> | null>(null);
  const [resolved, setResolved] = useState<
    Record<
      string,
      {
        inputKey: string;
        summary: RollupSummaryContent;
      }
    >
  >({});

  // Publish committed inputs before async continuations can send a request.
  useLayoutEffect(() => {
    currentInputs.current = new Map(
      drafts.map((draft) => [draft.areaId, proseInputKey(draft, periodType)]),
    );
    return () => {
      currentInputs.current = null;
    };
  }, [drafts, periodType]);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    let active = true;
    for (const draft of client ? drafts : []) {
      const inputKey = proseInputKey(draft, periodType);
      let request = requests.current.get(draft.areaId);
      // Preserve the existing one-request-per-area budget. A changed draft
      // remains deterministic instead of inheriting stale prose or spending
      // another request in this mounted session.
      if (request && request.inputKey !== inputKey) continue;
      if (!request) {
        const promise = requestTail.current
          .then(async () => {
            // A fresh effect can keep the same input alive. Removed/changed
            // drafts and unmounts must not start a queued provider request.
            const stillCurrent = () =>
              currentInputs.current?.get(draft.areaId) === inputKey;
            if (!stillCurrent() || !client) return null;
            const accessToken =
              (await client.auth.getSession()).data.session?.access_token ??
              null;
            if (!stillCurrent()) return null;
            return requestRollupProse(
              {
                areaLabel: draft.areaLabel,
                periodType,
                periodLabel: draft.periodLabel,
                draft: draft.summary,
              },
              { accessToken },
            );
          })
          .catch(() => null);
        request = { inputKey, promise };
        requests.current.set(draft.areaId, request);
        requestTail.current = promise.then(() => undefined);
      }
      // Cleanup removes this observer, not the request. A replacement effect
      // can observe the same promise after an equivalent projection refresh.
      void request.promise.then((result) => {
        if (
          !active ||
          !result?.enhanced ||
          currentInputs.current?.get(draft.areaId) !== inputKey
        )
          return;
        setResolved((previous) =>
          previous[draft.areaId]?.inputKey === inputKey
            ? previous
            : {
                ...previous,
                [draft.areaId]: { inputKey, summary: result.summary },
              },
        );
      });
    }
    return () => {
      active = false;
    };
  }, [drafts, periodType]);

  return useMemo(() => {
    const current: Record<string, RollupSummaryContent> = {};
    for (const draft of drafts) {
      const entry = resolved[draft.areaId];
      if (entry?.inputKey === proseInputKey(draft, periodType)) {
        current[draft.areaId] = entry.summary;
      }
    }
    return current;
  }, [drafts, periodType, resolved]);
}
