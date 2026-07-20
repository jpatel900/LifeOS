import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import CapturePage from "../app/capture/page";
import TriagePage from "../app/triage/page";
import { AppShell } from "../app/components/AppShell";
import { stubParseCaptureFetch } from "./helpers/parseCaptureFetch";

// #687: the demoted stage pages (/capture, /triage, /execute, ...) are
// redirect shims into the moments home under the shipping config. This suite
// exercises the cockpit surfaces themselves, which render only under the
// #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false) — pin that config here.
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;
beforeEach(() => {
  // beforeEach, not beforeAll: process.env is process-global and shared by
  // every test file in a vitest worker, so re-pin before each test rather
  // than once per file.
  process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
});
afterAll(() => {
  if (ORIGINAL_MOMENTS_HOME === undefined) {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  } else {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
  }
});

const mockPathname = vi.fn(() => "/triage");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    // Keep the mocked pathname in sync with in-app navigation so the
    // pathname-derived stage actually transitions, mirroring the real
    // app router (LifeOSCockpit derives its stage from usePathname()).
    push: (path: string) => mockPathname.mockReturnValue(path),
  }),
}));

describe("Triage cockpit", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    mockPathname.mockReturnValue("/triage");
    window.sessionStorage.clear();
    restoreFetch = stubParseCaptureFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  /**
   * #703: capture and sorting are separate steps now. Capture saves the thought
   * verbatim and stays put; the person then goes to Triage and taps Sort, which
   * is what turns it into a draft. This drives that real two-step journey.
   */
  async function captureThenSortIntoTriage(text: string) {
    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      { target: { value: text } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    // Dismiss the "back to: <hook>" conclusion rather than waiting out its
    // ~2.5s dwell — it locks stage nav while shown.
    fireEvent.click(await screen.findByTestId("capture-page-conclusion"));

    fireEvent.click(await screen.findByRole("button", { name: /Triage/ }));
    fireEvent.click(
      await screen.findByTestId(/^triage-sheet-sort-/, undefined, {
        timeout: 5000,
      }),
    );
  }

  it("shows the empty verdict-first triage state", async () => {
    render(
      <AppShell>
        <TriagePage />
      </AppShell>,
    );

    expect(await screen.findByText("Inbox clear")).toBeDefined();
    expect(screen.getByRole("button", { name: "Plan the day" })).toBeDefined();
  });

  it("lets a captured item move to Someday", async () => {
    mockPathname.mockReturnValue("/capture");
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    await captureThenSortIntoTriage("Review old someday notes");

    fireEvent.click(
      await screen.findByRole("button", { name: "Someday" }, { timeout: 5000 }),
    );

    expect(await screen.findByText("Inbox clear")).toBeDefined();
  });

  it("shows the anti-procrastination breakdown on a parsed task draft", async () => {
    mockPathname.mockReturnValue("/capture");
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    await captureThenSortIntoTriage("Prepare the sponsor update deck");

    expect(
      await screen.findByText("Start here (same first move)", undefined, {
        timeout: 4000,
      }),
    ).toBeDefined();
    expect(
      screen.getAllByText(
        "Clarify the next concrete step for: Prepare the sponsor update deck",
      ),
    ).toHaveLength(3);
    expect(
      screen.getByText("Do the core work for: Prepare the sponsor update deck"),
    ).toBeDefined();
    expect(screen.getAllByText("critical path")).toHaveLength(3);
    expect(screen.getByText("~30m")).toBeDefined();
    expect(screen.getAllByText("~10m")).toHaveLength(2);
    expect(
      screen.getByText(
        "Clarify the step, do the core work, then confirm the outcome.",
      ),
    ).toBeDefined();
  });

  it("renders split drafts without a breakdown section", async () => {
    mockPathname.mockReturnValue("/capture");
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    await captureThenSortIntoTriage("Tidy the garage shelves");

    // Generous timeouts: this journey chains two async state flushes (sort
    // response, then split). Under CI worker contention the default 1s findBy
    // window flaked twice on 2026-07-05 (CI run 28738354680 + a Codex sandbox)
    // while always passing warm — the wait is load-bound, not behavioral.
    expect(
      await screen.findByText("Start here (same first move)", undefined, {
        timeout: 10_000,
      }),
    ).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("First split task"), {
      target: { value: "Sort tools into bins" },
    });
    fireEvent.change(screen.getByPlaceholderText("Second split task"), {
      target: { value: "Donate the spare shelf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Split draft" }));

    expect(
      await screen.findByText("Sort tools into bins", undefined, {
        timeout: 10_000,
      }),
    ).toBeDefined();
    expect(screen.queryByText("Start here (same first move)")).toBeNull();
  });
});
