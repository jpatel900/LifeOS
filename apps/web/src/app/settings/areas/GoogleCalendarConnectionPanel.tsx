"use client";

import { useEffect, useState } from "react";
import { Button } from "@lifeos/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface GoogleCalendarConnectionSummary {
  id: string;
  status: "connected" | "disconnected" | "error" | "metadata_only";
  calendar_id: string;
  granted_scopes_json: string[];
  connected_at: string | null;
  disconnected_at: string | null;
}

type GoogleCalendarPanelState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      configured: boolean;
      connected: boolean;
      connection: GoogleCalendarConnectionSummary | null;
      message: string;
      severity: "info" | "warning" | "error" | "success";
    }
  | {
      status: "error";
      message: string;
    };

type GoogleCalendarActionState =
  | { status: "idle" }
  | { status: "submitting"; action: "connect" | "disconnect" };

type GoogleCalendarConnectionResponse = {
  ok: boolean;
  configured?: boolean;
  connection?: GoogleCalendarConnectionSummary | null;
  status?: "connected" | "disconnected" | "error";
  message?: string;
  error?: string;
};

type GoogleCalendarConnectResponse = {
  ok: boolean;
  authorizeUrl?: string;
  error?: string;
};

function getFlashMessage() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const successCode = params.get("googleCalendar");
  const errorCode = params.get("googleCalendarError");

  if (successCode === "connected") {
    return {
      severity: "success" as const,
      message:
        "Google Calendar OAuth completed. Tokens are stored encrypted on the server only. Free/busy checks and event writes remain disabled until later phases.",
    };
  }

  if (errorCode === "config_missing") {
    return {
      severity: "error" as const,
      message:
        "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key before connecting.",
    };
  }

  if (errorCode === "invalid_state") {
    return {
      severity: "error" as const,
      message:
        "Google Calendar OAuth callback was rejected because the request state was invalid or expired.",
    };
  }

  if (errorCode === "auth_required") {
    return {
      severity: "error" as const,
      message:
        "Google Calendar OAuth callback requires an authenticated Supabase session. Sign in and try again.",
    };
  }

  if (errorCode === "access_denied") {
    return {
      severity: "warning" as const,
      message:
        "Google Calendar access was not granted. No connection metadata was activated.",
    };
  }

  if (errorCode === "missing_code" || errorCode === "callback_failed") {
    return {
      severity: "error" as const,
      message:
        "Google Calendar OAuth callback failed safely. No calendar writes were attempted.",
    };
  }

  if (errorCode === "refresh_token_missing") {
    return {
      severity: "error" as const,
      message:
        "Google Calendar did not return a usable refresh token, so LifeOS refused to activate the connection. Reconnect and re-consent before continuing.",
    };
  }

  return null;
}

function getAccessTokenHeader(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function getPanelColors(severity: "info" | "warning" | "error" | "success") {
  switch (severity) {
    case "success":
      return {
        background: "#ecfdf5",
        border: "#86efac",
      };
    case "warning":
      return {
        background: "#fffbeb",
        border: "#fcd34d",
      };
    case "error":
      return {
        background: "#fef2f2",
        border: "#fca5a5",
      };
    default:
      return {
        background: "#eff6ff",
        border: "#93c5fd",
      };
  }
}

export function GoogleCalendarConnectionPanel() {
  const [panelState, setPanelState] = useState<GoogleCalendarPanelState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<GoogleCalendarActionState>({
    status: "idle",
  });
  const [flashMessage, setFlashMessage] = useState<ReturnType<
    typeof getFlashMessage
  >>(null);

  useEffect(() => {
    setFlashMessage(getFlashMessage());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadConnection() {
      const client = createSupabaseBrowserClient();

      if (!client) {
        if (!cancelled) {
          setPanelState({
            status: "ready",
            configured: false,
            connected: false,
            connection: null,
            message:
              "Supabase is not configured in this environment, so Google Calendar stays unavailable and mock/local mode remains intact.",
            severity: "warning",
          });
        }
        return;
      }

      if (!client.auth || typeof client.auth.getSession !== "function") {
        if (!cancelled) {
          setPanelState({
            status: "ready",
            configured: true,
            connected: false,
            connection: null,
            message:
              "Supabase auth helpers are unavailable in this browser session. Sign in again before connecting Google Calendar.",
            severity: "warning",
          });
        }
        return;
      }

      const { data, error } = await client.auth.getSession();

      if (error || !data.session?.access_token) {
        if (!cancelled) {
          setPanelState({
            status: "ready",
            configured: true,
            connected: false,
            connection: null,
            message:
              "Sign in before connecting Google Calendar. No OAuth flow can start without an authenticated Supabase session.",
            severity: "warning",
          });
        }
        return;
      }

      try {
        const response = await fetch("/api/google-calendar/connection", {
          headers: getAccessTokenHeader(data.session.access_token),
        });
        const payload =
          (await response.json()) as GoogleCalendarConnectionResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ??
              "Google Calendar connection status could not load.",
          );
        }

        if (!cancelled) {
          const connected = payload.status === "connected";
          const severity =
            payload.status === "error"
              ? "error"
              : connected
                ? "success"
                : payload.configured === false
                  ? "warning"
                  : "info";

          setPanelState({
            status: "ready",
            configured: payload.configured !== false,
            connected,
            connection: payload.connection ?? null,
            message:
              payload.message ??
              "Google Calendar connection status is available.",
            severity,
          });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setPanelState({
            status: "error",
            message:
              fetchError instanceof Error
                ? fetchError.message
                : "Google Calendar connection status could not load.",
          });
        }
      }
    }

    void loadConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  async function withAccessToken<T>(
    callback: (accessToken: string) => Promise<T>,
  ) {
    const client = createSupabaseBrowserClient();

    if (!client) {
      throw new Error(
        "Supabase is not configured. Google Calendar stays unavailable in mock mode.",
      );
    }

    if (!client.auth || typeof client.auth.getSession !== "function") {
      throw new Error(
        "Supabase auth helpers are unavailable. Sign in again before connecting Google Calendar.",
      );
    }

    const { data, error } = await client.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error("Sign in before connecting Google Calendar.");
    }

    return callback(data.session.access_token);
  }

  async function handleConnect() {
    setActionState({ status: "submitting", action: "connect" });

    try {
      const payload = await withAccessToken(async (accessToken) => {
        const response = await fetch("/api/google-calendar/connect", {
          method: "POST",
          headers: getAccessTokenHeader(accessToken),
        });
        const body = (await response.json()) as GoogleCalendarConnectResponse;

        if (!response.ok || !body.ok || !body.authorizeUrl) {
          throw new Error(
            body.error ?? "Google Calendar connection could not start.",
          );
        }

        return body;
      });

      if (!payload.authorizeUrl) {
        throw new Error("Google Calendar connection could not start.");
      }

      window.location.assign(payload.authorizeUrl);
    } catch (error) {
      setPanelState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Google Calendar connection could not start.",
      });
      setActionState({ status: "idle" });
    }
  }

  async function handleDisconnect() {
    setActionState({ status: "submitting", action: "disconnect" });

    try {
      await withAccessToken(async (accessToken) => {
        const response = await fetch("/api/google-calendar/disconnect", {
          method: "POST",
          headers: getAccessTokenHeader(accessToken),
        });
        const body = (await response.json()) as GoogleCalendarConnectionResponse;

        if (!response.ok || !body.ok) {
          throw new Error(
            body.error ?? "Google Calendar could not be disconnected.",
          );
        }
      });

      setPanelState({
        status: "ready",
        configured: true,
        connected: false,
        connection: null,
        message:
          "LifeOS cleared the local Google Calendar connection and encrypted token material. Google-side revocation still lives in your Google account if you want to remove consent there too.",
        severity: "info",
      });
      setActionState({ status: "idle" });
    } catch (error) {
      setPanelState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Google Calendar could not be disconnected.",
      });
      setActionState({ status: "idle" });
    }
  }

  const panelSeverity =
    panelState.status === "ready" ? panelState.severity : "error";
  const colors = getPanelColors(panelSeverity);

  return (
    <section
      style={{
        border: `1px solid ${colors.border}`,
        background: colors.background,
        borderRadius: "8px",
        padding: "1rem",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Google Calendar</h2>
      <p style={{ marginTop: 0, color: "#475569", fontSize: "0.92rem" }}>
        This page can store Google OAuth tokens encrypted on the server only. It
        still does not run free/busy checks or write Google Calendar events.
      </p>

      {flashMessage ? (
        <div
          role="status"
          style={{
            border: `1px solid ${getPanelColors(flashMessage.severity).border}`,
            background: getPanelColors(flashMessage.severity).background,
            borderRadius: "8px",
            padding: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          {flashMessage.message}
        </div>
      ) : null}

      {panelState.status === "loading" ? (
        <p role="status">Loading Google Calendar connection...</p>
      ) : null}

      {panelState.status === "error" ? (
        <div role="alert">
          <p style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            {panelState.message}
          </p>
        </div>
      ) : null}

      {panelState.status === "ready" ? (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>Connection status:</strong>{" "}
            {panelState.connected ? "Connected" : "Disconnected"}
            {panelState.connection?.status === "error" ? " (error)" : null}
          </p>
          <p>{panelState.message}</p>

          {panelState.connection?.granted_scopes_json?.length ? (
            <p style={{ fontSize: "0.9rem", color: "#334155" }}>
              Granted scopes: {panelState.connection.granted_scopes_json.join(", ")}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              type="button"
              onClick={handleConnect}
              disabled={
                actionState.status === "submitting" ||
                !panelState.configured ||
                panelState.connected
              }
            >
              {actionState.status === "submitting" &&
              actionState.action === "connect"
                ? "Connecting..."
                : "Connect Google Calendar"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={handleDisconnect}
              disabled={
                actionState.status === "submitting" || !panelState.connected
              }
            >
              {actionState.status === "submitting" &&
              actionState.action === "disconnect"
                ? "Disconnecting..."
                : "Disconnect Google Calendar"}
            </Button>
          </div>

          {!panelState.configured ? (
            <p style={{ marginBottom: 0, marginTop: "0.75rem", color: "#7c2d12" }}>
              Missing server config is non-fatal. Mock/local mode still works without
              Google env vars.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
