import type { RollupSummaryContent } from "@lifeos/schemas";

/**
 * E3 (#260 follow-up) — client caller for /api/rollup-prose.
 *
 * The client is the ULTIMATE fallback: on any failure — network error, non-OK
 * response, malformed payload, or a summary whose item counts don't match the
 * draft — it returns the caller's deterministic draft unchanged. The rollup
 * still shows and stays approvable; enhancement is purely additive.
 */

export interface RequestRollupProseInput {
  areaLabel: string;
  periodType: "week" | "month";
  periodLabel: string;
  draft: RollupSummaryContent;
}

export interface RequestRollupProseOptions {
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
}

export interface RequestRollupProseResult {
  summary: RollupSummaryContent;
  /**
   * Honest provenance signal. True ONLY when the server returned a faithful
   * AI-generated summary (source "ai") that we are displaying. False on every
   * deterministic fallback — no key, disabled, outage, malformed, unfaithful,
   * or the server echoing the draft (source "deterministic"). Callers must not
   * label a false result as AI-polished: the returned summary is the caller's
   * own deterministic draft.
   */
  enhanced: boolean;
}

export async function requestRollupProse(
  input: RequestRollupProseInput,
  options: RequestRollupProseOptions = {},
): Promise<RequestRollupProseResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fallback: RequestRollupProseResult = {
    summary: input.draft,
    enhanced: false,
  };
  try {
    const response = await fetchImpl("/api/rollup-prose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.accessToken
          ? { authorization: `Bearer ${options.accessToken}` }
          : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return fallback;
    }
    const data = (await response.json()) as {
      ok?: boolean;
      source?: string;
      summary?: RollupSummaryContent;
    };
    const summary = data?.summary;
    if (
      !data?.ok ||
      !summary ||
      !Array.isArray(summary.highlights) ||
      !Array.isArray(summary.misses) ||
      // Defense in depth: the enhanced summary must preserve the item counts.
      summary.highlights.length !== input.draft.highlights.length ||
      summary.misses.length !== input.draft.misses.length
    ) {
      return fallback;
    }
    // The server returns source "deterministic" (ok:true, draft echoed) when it
    // fell back — display it, but never claim AI provenance for it.
    return { summary, enhanced: data.source === "ai" };
  } catch {
    return fallback;
  }
}
