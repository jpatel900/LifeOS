import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #687: the demoted stage routes are flag-gated redirect shims. With the
// moments home live (default), each redirects to `/` carrying its target as
// query params; under the #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false) each
// still renders the seven-stage cockpit exactly as before. Mock redirect() so
// we can assert the target without the real NEXT_REDIRECT throw, and mock
// CockpitRoute so the rollback path is observable without provider setup.
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));
vi.mock("./components/CockpitRoute", () => ({
  CockpitRoute: ({ stage }: { stage: string }) => `cockpit:${stage}`,
}));

import TodayPage from "./today/page";
import CapturePage from "./capture/page";
import TriagePage from "./triage/page";
import CalendarPage from "./calendar/page";
import PlanPage from "./plan/page";
import ExecutePage from "./execute/page";
import ReviewPage from "./review/page";
import HealthPage from "./health/page";
import AreasOverviewPage from "./areas/page";

// C2-S6 (#687): all 8 demoted routes are redirect shims now. Plan/Review/
// Health/Areas capability parity was verified at file tier before this flip
// (ReviewSheet.tsx ports the legacy "Needs recovery" queue in full — see the
// #687 claim comment) — there is no more OWNER-GATE split.
//
// C2-S10 (#687 round-4): `/plan` joins as a 9th shim — a NEW route (not a
// port; `/calendar` already carried this capability and stays as its own
// working legacy bookmark), added purely so `/plan` matches its siblings'
// naming instead of 404ing.
const cases: Array<{
  name: string;
  Page: () => unknown;
  target: string;
  stage: string;
}> = [
  { name: "/today", Page: TodayPage, target: "/", stage: "today" },
  {
    name: "/capture",
    Page: CapturePage,
    target: "/?capture=1",
    stage: "capture",
  },
  {
    name: "/triage",
    Page: TriagePage,
    target: "/?sheet=triage",
    stage: "triage",
  },
  {
    name: "/execute",
    Page: ExecutePage,
    target: "/?moment=flow",
    stage: "execute",
  },
  {
    name: "/calendar",
    Page: CalendarPage,
    target: "/?sheet=plan",
    stage: "plan",
  },
  {
    name: "/plan",
    Page: PlanPage,
    target: "/?sheet=plan",
    stage: "plan",
  },
  // NOT `/?moment=close` — the Close moment is deliberately day-scoped and
  // lacks planned-vs-actual, needs-a-decision, aging waiting-on, open
  // commitments and policy proposals on purpose. See ReviewSheet.tsx.
  {
    name: "/review",
    Page: ReviewPage,
    target: "/?sheet=review",
    stage: "review",
  },
  {
    name: "/health",
    Page: HealthPage,
    target: "/?sheet=health",
    stage: "health",
  },
  {
    name: "/areas",
    Page: AreasOverviewPage,
    target: "/?sheet=areas",
    stage: "overview",
  },
];

describe("legacy stage-route redirect shims (#687)", () => {
  const original = process.env.NEXT_PUBLIC_MOMENTS_HOME;

  beforeEach(() => {
    redirectMock.mockReset();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = original;
    }
  });

  describe("moments home live (flag unset — default go-live)", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    });

    for (const { name, Page, target } of cases) {
      it(`${name} redirects to ${target}`, () => {
        Page();
        expect(redirectMock).toHaveBeenCalledWith(target);
      });
    }
  });

  describe("#590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false)", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
    });

    for (const { name, Page, stage } of cases) {
      it(`${name} renders the cockpit ${stage} stage and does not redirect`, () => {
        const result = Page() as { props: { stage: string } };
        expect(redirectMock).not.toHaveBeenCalled();
        // CockpitRoute is mocked; the element's stage prop identifies the view.
        expect(result.props.stage).toBe(stage);
      });
    }
  });
});
