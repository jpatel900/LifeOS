import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PipelineOverview } from "./PipelineOverview";

describe("PipelineOverview", () => {
  it("renders a label + count badge for each of the five pipeline stages", () => {
    render(
      <PipelineOverview
        counts={{
          capture: 2,
          triage: 3,
          plan: 1,
          execute: 0,
          review: 5,
        }}
        onDrill={() => {}}
      />,
    );

    expect(
      screen.getByTestId("pipeline-overview-count-capture"),
    ).toHaveTextContent("2");
    expect(
      screen.getByTestId("pipeline-overview-count-triage"),
    ).toHaveTextContent("3");
    expect(
      screen.getByTestId("pipeline-overview-count-plan"),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId("pipeline-overview-count-execute"),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId("pipeline-overview-count-review"),
    ).toHaveTextContent("5");
  });

  // R4-A: an empty `counts` object means every stage is 0, which is exactly
  // the all-zero trigger for explain mode (see the "empty pipeline (explain
  // mode)" describe block below) — so a fully-missing counts object no
  // longer renders a "0" badge at all. The "one missing stage among
  // nonzero siblings still defaults to 0" guarantee (counts mode) is
  // covered by the next test instead.
  it("renders in explain mode, not a '0' count badge, when counts is entirely empty", () => {
    render(<PipelineOverview counts={{}} onDrill={() => {}} />);
    expect(
      screen.queryByTestId("pipeline-overview-count-triage"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("pipeline-overview-caption-triage"),
    ).toBeInTheDocument();
  });

  it("defaults a missing stage count to 0 in counts mode, when a sibling stage is nonzero", () => {
    render(
      <PipelineOverview
        counts={{ capture: 3 }}
        onDrill={() => {}}
      />,
    );
    expect(
      screen.getByTestId("pipeline-overview-count-triage"),
    ).toHaveTextContent("0");
  });

  it("fires onDrill with the stage key when a node is clicked", () => {
    const onDrill = vi.fn();
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={onDrill}
      />,
    );

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));
    expect(onDrill).toHaveBeenCalledWith("triage");

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-plan"));
    expect(onDrill).toHaveBeenCalledWith("plan");
  });

  // SP-3 numeric steadiness: count badges use tabular figures and reserve a
  // stable width so a 9->10 digit rollover never shifts sibling nodes, and a
  // zero count still renders a stable "0" rather than collapsing the badge.
  //
  // D-9 (#483): digits also carry `lining-nums` alongside `tabular-nums` —
  // both compose into the element's `font-variant-numeric` — so the glyphs
  // read as deliberate, aligned figures rather than default proportional
  // text rendering.
  it("gives each count badge tabular-nums, lining-nums, and a reserved width", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 3, plan: 1, execute: 0, review: 5 }}
        onDrill={() => {}}
      />,
    );

    const badge = screen.getByTestId("pipeline-overview-count-triage");
    expect(badge).toHaveClass("tabular-nums");
    expect(badge).toHaveClass("lining-nums");
    expect(badge).toHaveClass("min-w-[2ch]");

    const zeroBadge = screen.getByTestId("pipeline-overview-count-execute");
    expect(zeroBadge).toHaveClass("tabular-nums");
    expect(zeroBadge).toHaveClass("lining-nums");
    expect(zeroBadge).toHaveClass("min-w-[2ch]");
    expect(zeroBadge).toHaveTextContent("0");
  });

  // SP-9: each stage node reaches a >=44px effective hit area and drops
  // the 300ms double-tap delay on coarse pointers.
  it("stage nodes carry hit-area and touch-manipulation utilities", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );
    const node = screen.getByTestId("pipeline-overview-stage-triage");
    expect(node).toHaveClass("min-h-[44px]");
    expect(node).toHaveClass("touch-manipulation");
  });

  // D-9 (#483): clicking a stage marks it `aria-current="step"` (and only
  // that stage) — the semantic, non-visual-string way to assert the
  // active-step state a sighted user sees as the accent-tinted node.
  it("marks exactly the clicked stage aria-current=step and clears the rest", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );

    for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
      expect(
        screen.getByTestId(`pipeline-overview-stage-${stage}`),
      ).not.toHaveAttribute("aria-current");
    }

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-plan"));
    expect(
      screen.getByTestId("pipeline-overview-stage-plan"),
    ).toHaveAttribute("aria-current", "step");
    for (const stage of ["capture", "triage", "execute", "review"]) {
      expect(
        screen.getByTestId(`pipeline-overview-stage-${stage}`),
      ).not.toHaveAttribute("aria-current");
    }

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-review"));
    expect(
      screen.getByTestId("pipeline-overview-stage-review"),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByTestId("pipeline-overview-stage-plan"),
    ).not.toHaveAttribute("aria-current");
  });

  // R2-D (issue #483 round 2): D-9's tint/weight/separator fixes left the
  // rail force-stretched across the full desktop content column (five
  // `flex-1` cells, each mostly empty flex-grow space) — round-2 critics
  // flagged the objective as still unmet. At `sm:` and up the rail now
  // shrinks to its own five cells' content width instead of stretching to
  // fill whatever column it sits in. Below `sm:` it deliberately keeps the
  // original `flex-1`/full-width behavior — the rail's intrinsic content
  // width doesn't shrink with the viewport, so unconditionally hugging it
  // would overflow a 390px screen (confirmed by measurement during the
  // round-2 visual check).
  it("shrinks the rail to its own content width at sm: and up, without dropping the mobile full-width fallback", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );

    const rail = screen.getByTestId("pipeline-overview");
    expect(rail.className).toMatch(/\bsm:w-fit\b/);
    expect(rail.className).toMatch(/\bw-full\b/);

    for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
      const cell = screen.getByTestId(`pipeline-overview-stage-${stage}`);
      expect(cell.className).toMatch(/\bsm:flex-none\b/);
    }
  });

  // D-9 (#483): the rail renders as one composed strip — a decorative
  // chevron sits between each pair of stages (4 separators for 5 stages),
  // hidden from assistive tech since it carries no information beyond the
  // visual joint between nodes.
  it("renders a decorative chevron between each pair of stages", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );

    const rail = screen.getByTestId("pipeline-overview");
    const chevrons = Array.from(rail.querySelectorAll('[aria-hidden="true"]'));
    expect(chevrons).toHaveLength(4);
    for (const chevron of chevrons) {
      expect(chevron).toHaveTextContent("›");
    }
  });
});

// R4-A (#483 round 4): explain mode replaces the deleted LoopOrientation
// card — when every stage's count is zero, this same rail shows a
// label + short caption per stage instead of a "0" badge, rather than a
// second card stacked underneath restating the same five-stage taxonomy.
// This describe block carries over LoopOrientation.test.tsx's content
// coverage (deleted with that component) onto the merged rail's explain
// mode, plus a couple of R4-A-specific regression tests.
describe("PipelineOverview — empty pipeline (explain mode, #483 round 4)", () => {
  const ALL_ZERO = { capture: 0, triage: 0, plan: 0, execute: 0, review: 0 };

  it("renders every PIPELINE_OVERVIEW_STAGES entry, in order, with a visible caption", () => {
    render(<PipelineOverview counts={ALL_ZERO} onDrill={() => {}} />);

    const stages = ["capture", "triage", "plan", "execute", "review"];
    for (const stage of stages) {
      const label = screen.getByTestId(`pipeline-overview-label-${stage}`);
      const caption = screen.getByTestId(
        `pipeline-overview-caption-${stage}`,
      );
      expect(label).toBeInTheDocument();
      expect(caption.textContent?.trim().length).toBeGreaterThan(0);
    }

    const captions = screen.getAllByTestId(/^pipeline-overview-caption-/);
    expect(captions.map((node) => node.dataset.testid)).toEqual(
      stages.map((stage) => `pipeline-overview-caption-${stage}`),
    );
  });

  // No node's caption should run long enough to read as a sentence — the
  // rail (position + chevron), not prose, carries the sequence; captions
  // only add what a bare label can't.
  it("keeps every caption short — a fragment, not a sentence", () => {
    render(<PipelineOverview counts={ALL_ZERO} onDrill={() => {}} />);

    for (const node of screen.getAllByTestId(/^pipeline-overview-caption-/)) {
      expect((node.textContent ?? "").length).toBeLessThan(40);
    }
  });

  // R4-A defect 4: the deleted LoopOrientation's "time-blocked, locally"
  // caption failed a cold read ("locally" is meaningless without already
  // knowing the app). Every caption is plain language a first-time user can
  // parse without context, and the old jargon string is gone.
  it("never renders the old cold-read-failing 'time-blocked, locally' caption", () => {
    render(<PipelineOverview counts={ALL_ZERO} onDrill={() => {}} />);

    const rail = screen.getByTestId("pipeline-overview");
    expect(rail.textContent).not.toContain("time-blocked, locally");
    expect(
      screen.getByTestId("pipeline-overview-caption-plan"),
    ).toHaveTextContent("proposed time blocks");
  });

  it("carries no shame/urgency/gamified language and no exclamation marks", () => {
    render(<PipelineOverview counts={ALL_ZERO} onDrill={() => {}} />);

    const rail = screen.getByTestId("pipeline-overview");
    expect(rail.textContent).not.toContain("!");
    expect(rail.textContent?.toLowerCase()).not.toMatch(
      /you failed|you didn't|blame|should have|let's go|great job|nice work/,
    );
  });

  it("never implies a state change: no caption claims anything is done/scheduled/in progress", () => {
    render(<PipelineOverview counts={ALL_ZERO} onDrill={() => {}} />);

    const rail = screen.getByTestId("pipeline-overview");
    expect(rail.textContent?.toLowerCase()).not.toMatch(
      /done|scheduled|in progress|completed/,
    );
  });

  it("switches back to counts mode the instant any single stage goes nonzero", () => {
    render(
      <PipelineOverview
        counts={{ ...ALL_ZERO, triage: 1 }}
        onDrill={() => {}}
      />,
    );

    // All-or-nothing: one nonzero stage puts every cell back in counts
    // mode, never a mix of numerals and captions in the same rail.
    for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
      expect(
        screen.getByTestId(`pipeline-overview-count-${stage}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`pipeline-overview-caption-${stage}`),
      ).not.toBeInTheDocument();
    }
  });

  // Structural regressions this mode must not re-introduce: R4-A defect 3
  // (the deleted LoopOrientation's node rail re-committed R2-D's
  // force-stretch defect one card up) — explain mode reuses the exact same
  // sm:w-fit/sm:flex-none skeleton as counts mode, so it inherits the
  // content-sized rail rather than a `flex-1`/`justify-between` stretch.
  it("stays content-sized (sm:w-fit / sm:flex-none), the same as counts mode", () => {
    render(<PipelineOverview counts={ALL_ZERO} onDrill={() => {}} />);

    const rail = screen.getByTestId("pipeline-overview");
    expect(rail.className).toMatch(/\bsm:w-fit\b/);
    for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
      const cell = screen.getByTestId(`pipeline-overview-stage-${stage}`);
      expect(cell.className).toMatch(/\bsm:flex-none\b/);
    }
  });

  it("stage buttons still fire onDrill and carry hit-area classes in explain mode", () => {
    const onDrill = vi.fn();
    render(<PipelineOverview counts={ALL_ZERO} onDrill={onDrill} />);

    const node = screen.getByTestId("pipeline-overview-stage-triage");
    expect(node).toHaveClass("min-h-[44px]");
    expect(node).toHaveClass("touch-manipulation");

    fireEvent.click(node);
    expect(onDrill).toHaveBeenCalledWith("triage");
  });
});
