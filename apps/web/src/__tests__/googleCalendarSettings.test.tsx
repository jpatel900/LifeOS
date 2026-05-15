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

    expect(await screen.findByText("Disconnected")).toBeDefined();
    expect(screen.getByText("info")).toBeDefined();
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
        screen.getByText(
          /mock.local mode remains available|mock.local mode remains intact/i,
        ),
      ).toBeDefined();
    });
    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeDisabled();
  });

  it("shows an actionable unauthenticated message when no Supabase session is present", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: {
        getSession: mocks.getSession,
      },
    });

    render(<GoogleCalendarConnectionPanel />);

    expect(
      await screen.findByText(
        /Sign in before connecting Google Calendar|OAuth actions require an authenticated Supabase session/i,
      ),
    ).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes unexpected status-load failures without exposing raw route text", async () => {
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
    vi.mocked(fetch).mockRejectedValue(new Error("connection stack trace"));

    render(<GoogleCalendarConnectionPanel />);

    expect(
      await screen.findByText(
        /Google Calendar status could not load right now\. Local planning remains available\./i,
      ),
    ).toBeDefined();
    expect(screen.getByText("error")).toBeDefined();
    expect(screen.queryByText(/connection stack trace/i)).toBeNull();
  });

  it("keeps granted OAuth scopes in advanced details", async () => {
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
          status: "connected",
          message: "Google Calendar is connected.",
          connection: {
            id: "conn-1",
            status: "connected",
            calendar_id: "primary",
            granted_scopes_json: [
              "https://www.googleapis.com/auth/calendar.events",
            ],
            connected_at: "2026-05-10T00:00:00.000Z",
            disconnected_at: null,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<GoogleCalendarConnectionPanel />);

    expect(await screen.findByText("Connected")).toBeDefined();
    expect(screen.getByText("Advanced details")).toBeDefined();
    expect(
      screen.getByText(/Granted OAuth scopes: https:\/\/www\.googleapis\.com/i),
    ).toBeDefined();
  });
});
