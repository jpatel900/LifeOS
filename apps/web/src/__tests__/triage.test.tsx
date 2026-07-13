import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import TriagePage from "../app/triage/page";
import { AppShell } from "../app/components/AppShell";
import { stubParseCaptureFetch } from "./helpers/parseCaptureFetch";

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

    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      {
        target: { value: "Review old someday notes" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));
    fireEvent.click(await screen.findByRole("button", { name: "Someday" }));

    expect(await screen.findByText("Inbox clear")).toBeDefined();
  });

  it("shows the anti-procrastination breakdown on a parsed task draft", async () => {
    mockPathname.mockReturnValue("/capture");
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      {
        target: { value: "Prepare the sponsor update deck" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    expect(
      await screen.findByText("Start here (same first move)"),
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

    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      {
        target: { value: "Tidy the garage shelves" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    // Generous timeouts: this journey chains two async state flushes (parse
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
