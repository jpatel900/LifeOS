import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MirrorPanel } from "./MirrorPanel";

const sample = (response: string, sampledAtMs: number) => ({
  response,
  sampledAtMs,
  sanctuaryContext: {},
});

describe("MirrorPanel", () => {
  it("renders the calm insufficient-data state below the minimum", () => {
    render(<MirrorPanel samples={[sample("even", 1)]} />);
    expect(screen.getByTestId("mirror-insufficient-data")).toBeInTheDocument();
    expect(
      screen.queryByTestId("mirror-trend-sparkline"),
    ).not.toBeInTheDocument();
  });

  it("fails closed to insufficient data on hostile input", () => {
    render(<MirrorPanel samples={"garbage"} />);
    expect(screen.getByTestId("mirror-insufficient-data")).toBeInTheDocument();
  });

  it("renders the up state", () => {
    render(
      <MirrorPanel
        samples={[
          sample("heavier", 1),
          sample("even", 2),
          sample("lighter", 3),
        ]}
      />,
    );
    expect(screen.getByTestId("mirror-trend-up")).toHaveTextContent("Lighter");
    expect(screen.getByTestId("mirror-trend-sparkline")).toBeInTheDocument();
  });

  it("renders the flat state", () => {
    render(
      <MirrorPanel
        samples={[sample("even", 1), sample("even", 2), sample("even", 3)]}
      />,
    );
    expect(screen.getByTestId("mirror-trend-flat")).toHaveTextContent("Even");
  });

  it("renders the down state", () => {
    render(
      <MirrorPanel
        samples={[
          sample("lighter", 1),
          sample("even", 2),
          sample("heavier", 3),
        ]}
      />,
    );
    expect(screen.getByTestId("mirror-trend-down")).toHaveTextContent(
      "Heavier",
    );
  });

  it("always renders the fixed four proxy gauges, none hideable", () => {
    render(<MirrorPanel samples={[]} />);
    for (const id of [
      "inflow-outflow",
      "override-rate",
      "re-entry-latency",
      "build-use",
    ]) {
      expect(screen.getByTestId(`mirror-proxy-${id}`)).toBeInTheDocument();
    }
  });

  it("carries no coaching, streak, or engagement copy", () => {
    const { container } = render(
      <MirrorPanel
        samples={[
          sample("lighter", 1),
          sample("even", 2),
          sample("heavier", 3),
        ]}
      />,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const banned of [
      /streak/,
      /\btry\b/,
      /\bshould\b/,
      /\btips?\b/,
      /recommend/,
      /keep it up/,
      /\bgoals?\b/,
    ]) {
      expect(text).not.toMatch(banned);
    }
    expect(text).toContain("describe the system, not you");
  });
});
