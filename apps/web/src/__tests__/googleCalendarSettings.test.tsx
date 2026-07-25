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
            "Google Calendar isn't connected yet. Connect it whenever you're ready.",
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

  it("shows a plain, non-crashing message when Google config is absent", async () => {
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
            "Google Calendar isn't set up on LifeOS yet. Local planning still works without it, and you can connect Google later once it's set up.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<GoogleCalendarConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByText(/isn't set up on LifeOS yet/i)).toBeDefined();
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
      await screen.findByText(/sign in to LifeOS to connect Google Calendar/i),
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
      screen.getByText(
        /Access you granted to Google: https:\/\/www\.googleapis\.com/i,
      ),
    ).toBeDefined();
  });

  // #743: the owner used to see only "connecting failed safely" with no way
  // to tell WHY. These assert the glance line reads the real reason and the
  // details disclosure carries the sanitized code/description underneath.
  it("shows the plain-language glance reason and sanitized details for a known Google error code", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    });
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: { getSession: mocks.getSession },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          configured: true,
          status: "error",
          message:
            "The sign-in code expired or was already used. Try connecting again.",
          reason: {
            code: "invalid_grant",
            description: "Malformed auth code.",
            glance:
              "The sign-in code expired or was already used. Try connecting again.",
          },
          connection: {
            id: "conn-1",
            status: "error",
            calendar_id: "primary",
            granted_scopes_json: [],
            connected_at: null,
            disconnected_at: "2026-07-25T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<GoogleCalendarConnectionPanel />);

    expect(
      await screen.findByText(
        "The sign-in code expired or was already used. Try connecting again.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Why this failed")).toBeDefined();
    expect(screen.getByText(/Google's code: invalid_grant/)).toBeDefined();
    expect(
      screen.getByText(/Google's message: Malformed auth code\./),
    ).toBeDefined();
  });

  it("falls back to the generic failure message and shows no details disclosure when no reason was stored", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    });
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: { getSession: mocks.getSession },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          configured: true,
          status: "error",
          message:
            "The last attempt to connect Google Calendar failed safely. Please connect again to retry.",
          reason: null,
          connection: {
            id: "conn-1",
            status: "error",
            calendar_id: "primary",
            granted_scopes_json: [],
            connected_at: null,
            disconnected_at: "2026-07-25T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<GoogleCalendarConnectionPanel />);

    expect(
      await screen.findByText(
        "The last attempt to connect Google Calendar failed safely. Please connect again to retry.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Why this failed")).toBeNull();
  });
});
