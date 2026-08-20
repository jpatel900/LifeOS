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
import ExecutePage from "./execute/page";
import ReviewPage from "./review/page";

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
];

// OWNER-GATE routes: capabilities exist ONLY on the old page (plan placement/
// proposals/Google approval; review diagnostics/policy proposals) — they must
// NOT redirect until the owner decides port/keep/drop.
const ownerGateCases: Array<{
  name: string;
  Page: () => unknown;
  stage: string;
}> = [
  { name: "/calendar", Page: CalendarPage, stage: "plan" },
  { name: "/review", Page: ReviewPage, stage: "review" },
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

    for (const { name, Page, stage } of ownerGateCases) {
      it(`${name} stays on the cockpit ${stage} stage (OWNER-GATE — no moments equivalent)`, () => {
        const result = Page() as { props: { stage: string } };
        expect(redirectMock).not.toHaveBeenCalled();
        expect(result.props.stage).toBe(stage);
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
