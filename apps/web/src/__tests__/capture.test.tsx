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
    // pathname-derived stage actually transitions (Save and sort -> triage).
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

  // #556 FR-026: saving no longer navigates instantly — the capture stage
  // holds the user through the parse wait (raw text stays visible, no
  // second submit possible) and only navigates/toasts once the parse
  // actually resolves ("back to: <hook>" conclusion), never ahead of that
  // truth. This test now drives that full wait instead of asserting the old
  // instant-navigate behavior.
  it("saves a thought through the single primary action and routes it to triage", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Save and sort" }));

    // Held in context through the wait: raw text stays visible, save
    // controls lock, no premature toast/navigation yet.
    expect(screen.getByPlaceholderText("Drop the thought here.")).toHaveValue(
      "Draft agenda for the planning meeting",
    );
    expect(screen.queryByText("Saved; waiting in Triage")).toBeNull();

    expect(
      await screen.findByText("Saved; waiting in Triage", undefined, {
        timeout: 5000,
      }),
    ).toBeDefined();
    expect(
      await screen.findByText("Draft agenda for the planning meeting"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Do today" })).toBeDefined();
  });

  it("blocks empty saves and keeps one primary capture action", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    expect(await screen.findByText("Saves raw text first")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Organize after save" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Save and sort" }),
    ).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Save and sort" }),
    ).toHaveLength(1);
  });
});
