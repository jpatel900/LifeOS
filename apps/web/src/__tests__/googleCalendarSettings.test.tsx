import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarConnectionPanel } from "../app/settings/areas/GoogleCalendarConnectionPanel";

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

describe("Google Calendar settings panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the connect button when the server reports a disconnected state", async () => {
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "supabase-access-token",
        },
      },
      error: null,
    });
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: {
        getSession: mocks.getSession,
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          configured: true,
          connection: null,
          status: "disconnected",
          message:
            "Google Calendar is ready to connect, but no active connection metadata exists yet.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<GoogleCalendarConnectionPanel />);

    expect(
      await screen.findByRole("button", { name: "Connect Google Calendar" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Disconnect Google Calendar" }),
    ).toBeDisabled();
  });

  it("shows a non-crashing mock-safe message when Google config is absent", async () => {
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "supabase-access-token",
        },
      },
      error: null,
    });
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: {
        getSession: mocks.getSession,
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          configured: false,
          connection: null,
          status: "disconnected",
          message:
            "Google Calendar is not configured on this server. Mock/local mode remains available.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<GoogleCalendarConnectionPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(/mock.local mode remains available|mock.local mode remains intact/i),
      ).toBeDefined();
    });
    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeDisabled();
  });
});
