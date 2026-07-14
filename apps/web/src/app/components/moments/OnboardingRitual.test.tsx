import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area } from "@lifeos/schemas";
import type { CaptureParseState } from "@/lib/WorkflowContext";
import {
  DAY_SHAPE_PREFERENCES_KEY,
  readDayShapePreferences,
} from "@/lib/onboarding/onboarding";
import { OnboardingRitual } from "./OnboardingRitual";

const mocks = vi.hoisted(() => ({
  listAreas: vi.fn(),
  createArea: vi.fn(),
  softDeleteArea: vi.fn(),
  updateAreaColor: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => null,
}));

vi.mock("@/lib/data/workflow", () => ({
  listAreas: mocks.listAreas,
  createArea: mocks.createArea,
  softDeleteArea: mocks.softDeleteArea,
  updateAreaColor: mocks.updateAreaColor,
}));

function areaRow(name: string, color: string | null = null): Area {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `00000000-0000-4000-8000-${slug.padEnd(12, "0").slice(0, 12)}`,
    user_id: "00000000-0000-4000-8000-000000000001",
    name,
    slug,
    description: null,
    color,
    icon: null,
    sort_order: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Area;
}

function renderRitual(
  overrides: Partial<Parameters<typeof OnboardingRitual>[0]> = {},
) {
  const props = {
    captureParse: { phase: "idle" } as CaptureParseState,
    onSubmitParse: vi.fn(),
    onSubmitRaw: vi.fn(),
    onRetryWithMock: vi.fn(),
    onAreasPersisted: vi.fn(),
    onComplete: vi.fn(),
    ...overrides,
  };
  const view = render(<OnboardingRitual {...props} />);
  return { props, view };
}

async function advanceToStep(step: "day" | "capture") {
  fireEvent.click(screen.getByTestId("onboarding-areas-continue"));
  await screen.findByTestId("onboarding-step-day");
  if (step === "capture") {
    fireEvent.click(screen.getByTestId("onboarding-day-skip"));
    await screen.findByTestId("onboarding-step-capture");
  }
}

describe("OnboardingRitual (#581)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [] });
    mocks.createArea.mockImplementation(
      async (
        _client: unknown,
        input: { name: string; color?: string | null },
      ) => ({
        provider: "mock",
        area: areaRow(input.name, input.color ?? null),
      }),
    );
  });

  describe("step 1 — areas", () => {
    it("prefills the three editable default chips", () => {
      renderRitual();
      const names = screen
        .getAllByTestId("onboarding-area-name")
        .map((input) => (input as HTMLInputElement).value);
      expect(names).toEqual(["Main Job", "Personal", "Side Project"]);
    });

    it("supports rename, add, and remove before persisting", async () => {
      const { props } = renderRitual();

      const inputs = screen.getAllByTestId("onboarding-area-name");
      fireEvent.change(inputs[0], { target: { value: "Freelance" } });
      fireEvent.click(screen.getAllByTestId("onboarding-area-remove")[1]);
      fireEvent.click(screen.getByTestId("onboarding-area-add"));
      const afterAdd = screen.getAllByTestId("onboarding-area-name");
      fireEvent.change(afterAdd[afterAdd.length - 1], {
        target: { value: "Health" },
      });

      fireEvent.click(screen.getByTestId("onboarding-areas-continue"));
      await screen.findByTestId("onboarding-step-day");

      const createdNames = mocks.createArea.mock.calls.map(
        (call) => (call[1] as { name: string }).name,
      );
      expect(createdNames).toEqual(["Freelance", "Side Project", "Health"]);
      const onAreasPersisted = props.onAreasPersisted as ReturnType<
        typeof vi.fn
      >;
      expect(onAreasPersisted).toHaveBeenCalledTimes(1);
      expect(
        (onAreasPersisted.mock.calls[0][0] as Area[]).map((area) => area.name),
      ).toEqual(["Freelance", "Side Project", "Health"]);
    });

    it("skip persists the pristine defaults even after edits (skip = keep defaults)", async () => {
      renderRitual();

      const inputs = screen.getAllByTestId("onboarding-area-name");
      fireEvent.change(inputs[0], { target: { value: "Renamed away" } });
      fireEvent.click(screen.getAllByTestId("onboarding-area-remove")[2]);

      fireEvent.click(screen.getByTestId("onboarding-areas-skip"));
      await screen.findByTestId("onboarding-step-day");

      const createdNames = mocks.createArea.mock.calls.map(
        (call) => (call[1] as { name: string }).name,
      );
      expect(createdNames).toEqual(["Main Job", "Personal", "Side Project"]);
    });

    it("mock-provider rerun keeps existing areas the chips never covered (nothing is deleted)", async () => {
      // Demo/mock accounts don't prefill chips from rows, so an existing
      // area absent from the default chips must still survive the sync —
      // syncPersistedAreas replaces the whole list.
      const seeded = [
        areaRow("Main Job"),
        areaRow("Personal"),
        areaRow("Volunteer Work"),
        areaRow("Side Project"),
      ];
      mocks.listAreas.mockResolvedValue({ provider: "mock", areas: seeded });
      mocks.updateAreaColor.mockImplementation(
        async (_client: unknown, input: { area_id: string; color: string }) => {
          const area = seeded.find((row) => row.id === input.area_id)!;
          return { provider: "mock", area: { ...area, color: input.color } };
        },
      );
      const { props } = renderRitual();
      await waitFor(() => expect(mocks.listAreas).toHaveBeenCalled());

      fireEvent.click(screen.getByTestId("onboarding-areas-continue"));
      await screen.findByTestId("onboarding-step-day");

      const onAreasPersisted = props.onAreasPersisted as ReturnType<
        typeof vi.fn
      >;
      const persistedNames = (onAreasPersisted.mock.calls[0][0] as Area[]).map(
        (area) => area.name,
      );
      expect(persistedNames).toContain("Volunteer Work");
      expect(mocks.softDeleteArea).not.toHaveBeenCalled();
      expect(mocks.createArea).not.toHaveBeenCalled();
    });

    it("surfaces a sanitized, recovery-oriented failure and stays on the step (#592: raw error is diagnostics-only)", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const rawError = new Error(
        "duplicate key value violates unique constraint areas_user_id_slug_key",
      );
      mocks.createArea.mockRejectedValue(rawError);
      renderRitual();

      fireEvent.click(screen.getByTestId("onboarding-areas-continue"));

      const errorNode = await screen.findByTestId("onboarding-areas-error");
      expect(errorNode).toHaveTextContent(
        "Areas could not be saved right now.",
      );
      expect(errorNode).toHaveTextContent(/retry/i);
      expect(errorNode).toHaveTextContent(/skip/i);
      // The raw Supabase/db error text never reaches the DOM.
      expect(errorNode).not.toHaveTextContent(
        "duplicate key value violates unique constraint",
      );
      expect(screen.getByTestId("onboarding-step-areas")).toBeInTheDocument();

      // Raw details still reach diagnostics.
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("area persistence failed"),
        rawError,
      );
      consoleError.mockRestore();
    });
  });

  describe("step 2 — day shape", () => {
    it("skip writes no preference (defaults stay in effect)", async () => {
      renderRitual();
      await advanceToStep("day");

      fireEvent.click(screen.getByTestId("onboarding-day-skip"));
      await screen.findByTestId("onboarding-step-capture");

      expect(window.localStorage.getItem(DAY_SHAPE_PREFERENCES_KEY)).toBeNull();
      expect(readDayShapePreferences()).toBeNull();
    });

    it("continue writes the chosen work window and session length", async () => {
      renderRitual();
      await advanceToStep("day");

      fireEvent.change(screen.getByTestId("onboarding-day-start"), {
        target: { value: "8" },
      });
      fireEvent.change(screen.getByTestId("onboarding-day-end"), {
        target: { value: "16" },
      });
      fireEvent.click(screen.getByTestId("onboarding-session-60"));
      fireEvent.click(screen.getByTestId("onboarding-day-continue"));
      await screen.findByTestId("onboarding-step-capture");

      expect(readDayShapePreferences()).toEqual({
        workStartHour: 8,
        workEndHour: 16,
        sessionMinutes: 60,
      });
    });

    it("offers Google Calendar as a quiet optional link-out, never a gate", async () => {
      renderRitual();
      await advanceToStep("day");

      const link = screen.getByTestId("onboarding-calendar-link");
      expect(link).toHaveAttribute("href", "/settings/areas");
      // Continue works without touching the link — connecting is optional.
      fireEvent.click(screen.getByTestId("onboarding-day-continue"));
      await screen.findByTestId("onboarding-step-capture");
    });
  });

  describe("step 3 — first capture (shared CaptureCore containment)", () => {
    it("composes the shared CaptureCore and submits through the parse path", async () => {
      const { props } = renderRitual();
      await advanceToStep("capture");

      // The FR-026 containment widget itself, not a reimplementation.
      expect(screen.getByTestId("onboarding-capture-core")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("onboarding-capture-textarea"), {
        target: { value: "Plan the kickoff agenda" },
      });
      fireEvent.click(screen.getByTestId("onboarding-capture-save"));

      expect(props.onSubmitParse).toHaveBeenCalledWith(
        "Plan the kickoff agenda",
        null,
      );
    });

    it("completes with 'captured' only after the containment sequence resolves", async () => {
      const { props, view } = renderRitual();
      await advanceToStep("capture");

      fireEvent.change(screen.getByTestId("onboarding-capture-textarea"), {
        target: { value: "Plan the kickoff agenda" },
      });
      fireEvent.click(screen.getByTestId("onboarding-capture-save"));
      expect(props.onComplete).not.toHaveBeenCalled();

      // The global parse resolves (WorkflowContext truth) — CaptureCore
      // shows its conclusion, and dismissing it fires onResolved.
      view.rerender(
        <OnboardingRitual
          {...props}
          captureParse={{
            phase: "parsed",
            captureId: "capture-1",
            parser: "mock",
            status: "mock",
          }}
        />,
      );
      const conclusion = await screen.findByTestId(
        "onboarding-capture-conclusion",
      );
      fireEvent.click(conclusion);

      await waitFor(() => {
        expect(props.onComplete).toHaveBeenCalledWith("captured");
      });
    });

    it("skip completes the ritual without a capture", async () => {
      const { props } = renderRitual();
      await advanceToStep("capture");

      fireEvent.click(screen.getByTestId("onboarding-capture-skip"));
      expect(props.onComplete).toHaveBeenCalledWith("skipped");
    });
  });

  describe("44px hit targets (#594)", () => {
    // #594: every actionable control on the ritual reaches the shared
    // >=44px floor via hitTarget.ts — never a raw min-h-10/size-9 (both
    // 40/36px). jsdom does not compute layout, so this is a className-level
    // guard; the real geometric proof is the Playwright e2e at 390px
    // (tests/e2e/hit-targets-390.spec.ts).
    it("step 1 (areas) controls carry a 44px hit-target class", () => {
      renderRitual();

      expect(
        screen.getAllByTestId("onboarding-area-color")[0].className,
      ).toContain("min-h-[44px]");
      expect(
        screen.getAllByTestId("onboarding-area-name")[0].className,
      ).toContain("min-h-[44px]");
      expect(
        screen.getAllByTestId("onboarding-area-remove")[0].className,
      ).toContain("min-h-[44px]");
      expect(screen.getByTestId("onboarding-area-add").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("onboarding-areas-skip").className).toContain(
        "min-h-[44px]",
      );
      expect(
        screen.getByTestId("onboarding-areas-continue").className,
      ).toContain("min-h-[44px]");
    });

    it("step 2 (day shape) controls carry a 44px hit-target class", async () => {
      renderRitual();
      fireEvent.click(screen.getByTestId("onboarding-areas-continue"));
      await screen.findByTestId("onboarding-step-day");

      expect(screen.getByTestId("onboarding-day-start").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("onboarding-day-end").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("onboarding-session-45").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("onboarding-day-skip").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("onboarding-day-continue").className).toContain(
        "min-h-[44px]",
      );
    });

    it("step 3 (capture) skip control carries a 44px hit-target class", async () => {
      renderRitual();
      await advanceToStep("capture");

      expect(screen.getByTestId("onboarding-capture-skip").className).toContain(
        "min-h-[44px]",
      );
    });
  });
});
