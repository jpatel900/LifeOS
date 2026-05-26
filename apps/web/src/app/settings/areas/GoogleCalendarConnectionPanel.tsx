"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        "Google Calendar OAuth completed. Tokens are stored encrypted on the server only. Event creation still requires explicit approval from an existing local proposal.",
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

function getSeverityClasses(
  severity: "info" | "warning" | "error" | "success",
) {
  switch (severity) {
    case "success":
      return "border-border bg-muted";
    case "warning":
      return "border-border bg-muted/80";
    case "error":
      return "border-destructive/40 bg-destructive/10";
    default:
      return "border-border bg-card";
  }
}

function getConnectionBadgeClasses(connected: boolean) {
  return connected
    ? {
        variant: "outline" as const,
        className: "border-border bg-muted text-primary",
      }
    : {
        variant: "secondary" as const,
        className: "",
      };
}

function normalizePanelFailure(rawMessage: string) {
  const message = rawMessage.toLowerCase();

  if (message.includes("not configured")) {
    return {
      severity: "warning" as const,
      message:
        "Google Calendar is not configured on this server. Local planning still works without Google integration.",
    };
  }

  if (
    message.includes("sign in before") ||
    message.includes("auth") ||
    message.includes("session")
  ) {
    return {
      severity: "warning" as const,
      message:
        "Sign in before connecting Google Calendar. OAuth actions require an authenticated Supabase session.",
    };
  }

  if (message.includes("could not start")) {
    return {
      severity: "error" as const,
      message:
        "Google Calendar OAuth could not start. No connection changes were applied.",
    };
  }

  if (message.includes("could not be disconnected")) {
    return {
      severity: "error" as const,
      message:
        "Google Calendar disconnect failed. Existing connection state is unchanged.",
    };
  }

  return {
    severity: "error" as const,
    message:
      "Google Calendar status could not load right now. Local planning remains available.",
  };
}

export function GoogleCalendarConnectionPanel() {
  const [panelState, setPanelState] = useState<GoogleCalendarPanelState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<GoogleCalendarActionState>({
    status: "idle",
  });
  const [flashMessage, setFlashMessage] =
    useState<ReturnType<typeof getFlashMessage>>(null);

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
        const normalized = normalizePanelFailure(
          fetchError instanceof Error
            ? fetchError.message
            : "Google Calendar connection status could not load.",
        );
        if (!cancelled) {
          setPanelState({
            status: "ready",
            configured: true,
            connected: false,
            connection: null,
            message: normalized.message,
            severity: normalized.severity,
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
      const normalized = normalizePanelFailure(
        error instanceof Error
          ? error.message
          : "Google Calendar connection could not start.",
      );
      setPanelState({
        status: "ready",
        configured: true,
        connected: false,
        connection: null,
        message: normalized.message,
        severity: normalized.severity,
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
        const body =
          (await response.json()) as GoogleCalendarConnectionResponse;

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
      const normalized = normalizePanelFailure(
        error instanceof Error
          ? error.message
          : "Google Calendar could not be disconnected.",
      );
      setPanelState({
        status: "ready",
        configured: true,
        connected: true,
        connection: null,
        message: normalized.message,
        severity: normalized.severity,
      });
      setActionState({ status: "idle" });
    }
  }

  const panelSeverity =
    panelState.status === "ready" ? panelState.severity : "warning";
  const panelClassName = getSeverityClasses(panelSeverity);
  const connectionBadge = getConnectionBadgeClasses(
    panelState.status === "ready" && panelState.connected,
  );

  return (
    <Card className={panelClassName}>
      <CardHeader>
        <CardTitle className="text-xl">Google Calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect Google Calendar so LifeOS can check conflicts and create
          events only after approval.
        </p>

        {flashMessage ? (
          <Alert className={getSeverityClasses(flashMessage.severity)}>
            <AlertDescription>{flashMessage.message}</AlertDescription>
          </Alert>
        ) : null}

        {panelState.status === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading Google Calendar connection...
          </p>
        ) : null}

        {panelState.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{panelState.message}</AlertDescription>
          </Alert>
        ) : null}

        {panelState.status === "ready" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={connectionBadge.variant}
                className={connectionBadge.className}
              >
                {panelState.connected ? "Connected" : "Disconnected"}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {panelState.severity}
              </Badge>
              {panelState.connection?.status === "error" ? " (error)" : null}
            </div>
            <p className="text-sm text-foreground">{panelState.message}</p>

            <div className="flex flex-wrap gap-3">
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
              <p className="mb-0 mt-3 text-sm text-muted-foreground">
                Missing server config is non-fatal. Mock/local mode still works
                without Google env vars.
              </p>
            ) : null}

            {panelState.connection?.granted_scopes_json?.length ? (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Advanced details
                </summary>
                <p className="mt-2">
                  Granted OAuth scopes:{" "}
                  {panelState.connection.granted_scopes_json.join(", ")}
                </p>
              </details>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
