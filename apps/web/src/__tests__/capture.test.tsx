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

const mockPathname = vi.fn(() => "/capture");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    // Keep the mocked pathname in sync with in-app navigation so the
    // pathname-derived stage actually transitions between cockpit stages.
    push: (path: string) => mockPathname.mockReturnValue(path),
  }),
}));

describe("Capture cockpit", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    mockPathname.mockReturnValue("/capture");
    restoreFetch = stubParseCaptureFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  // #703: capture has ONE action and never parses. Saving is synchronous —
  // the thought is persisted verbatim and the surface says where it went. It
  // deliberately does NOT navigate to triage any more: no draft exists yet
  // (sorting is a separate action there), and staying put means the next
  // thought can go straight in.
  it("saves a thought through the single primary action and says where it went", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      {
        target: { value: "Draft agenda for the planning meeting" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(
      await screen.findByText("Saved — it's waiting in Triage", undefined, {
        timeout: 5000,
      }),
    ).toBeDefined();

    // No parse ran at the front door: no wait, no failure state.
    expect(screen.queryByTestId("capture-page-parsing")).toBeNull();
    expect(screen.queryByTestId("capture-page-degraded")).toBeNull();
  });

  it("blocks empty saves and keeps one primary capture action", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    expect(
      await screen.findByText(
        "Saved exactly as you write it. Sort it into a task later, in Triage.",
      ),
    ).toBeDefined();
    // The second save button is gone, not renamed.
    expect(screen.queryByTestId("capture-page-save-raw")).toBeNull();
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Capture" })).toHaveLength(1);
  });
});
