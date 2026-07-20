import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MirrorPurposeSample } from "@/lib/mirror/mirrorTrendKernel";

// createSupabaseBrowserClient returns null under test (no env) — the health
// check takes its mock path and the sample read is exercised through the
// mocked reader below, so this test never touches Supabase.
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => null,
}));

const readPurposeGaugeSamples = vi.fn();
vi.mock("@/lib/data/purposeGaugeSamples", () => ({
  readPurposeGaugeSamples: (...args: unknown[]) =>
    readPurposeGaugeSamples(...args),
}));

import { HealthView } from "./HealthView";

type HealthViewVm = React.ComponentProps<typeof HealthView>["vm"];

const vm = {
  healthChecks: [],
  agingSummary: { agingWaitingOnCount: 0, staleCommitmentCount: 0 },
} as unknown as HealthViewVm;

function samplesAt(responses: MirrorPurposeSample["response"][]) {
  return responses.map((response, index) => ({
    response,
    sampledAtMs: Date.UTC(2026, 6, 4 + index),
    sanctuaryContext: {},
  }));
}

afterEach(() => {
  readPurposeGaugeSamples.mockReset();
});

describe("HealthView — Mirror reads real persisted check-ins", () => {
  it("feeds fetched samples into the Mirror kernel so a trend renders", async () => {
    // Three valid samples clear MIRROR_MIN_TREND_SAMPLE_COUNT, so the panel
    // must render a real trend rather than the insufficient-data state.
    readPurposeGaugeSamples.mockResolvedValue(
      samplesAt(["heavier", "even", "lighter"]),
    );

    render(<HealthView vm={vm} />);

    expect(
      await screen.findByTestId("mirror-trend-sparkline"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("mirror-insufficient-data")).toBeNull();
    expect(readPurposeGaugeSamples).toHaveBeenCalledTimes(1);
  });

  it("shows the calm insufficient-data state when no samples are persisted yet", async () => {
    readPurposeGaugeSamples.mockResolvedValue([]);

    render(<HealthView vm={vm} />);

    expect(
      await screen.findByTestId("mirror-insufficient-data"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("mirror-trend-sparkline")).toBeNull();
  });
});
