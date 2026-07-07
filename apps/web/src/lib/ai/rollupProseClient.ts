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

export async function requestRollupProse(
  input: RequestRollupProseInput,
  options: RequestRollupProseOptions = {},
): Promise<RollupSummaryContent> {
  const fetchImpl = options.fetchImpl ?? fetch;
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
      return input.draft;
    }
    const data = (await response.json()) as {
      ok?: boolean;
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
      return input.draft;
    }
    return summary;
  } catch {
    return input.draft;
  }
}
