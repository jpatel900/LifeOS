"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
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
        "Google Calendar is connected. LifeOS never adds anything to your calendar on its own — every event still needs your approval first.",
    };
  }

  if (errorCode === "config_missing") {
    return {
      severity: "error" as const,
      message:
        "Google Calendar isn't set up on LifeOS yet, so you can't connect it right now. Local planning still works.",
    };
  }

  if (errorCode === "invalid_state") {
    return {
      severity: "error" as const,
      message:
        "Connecting Google Calendar didn't finish in time, so LifeOS stopped for safety. Please try connecting again.",
    };
  }

  if (errorCode === "auth_required") {
    return {
      severity: "error" as const,
      message:
        "Please sign in to LifeOS first, then try connecting Google Calendar again.",
    };
  }

  if (errorCode === "access_denied") {
    return {
      severity: "warning" as const,
      message:
        "You didn't grant Google Calendar access, so nothing was connected.",
    };
  }

  if (errorCode === "missing_code" || errorCode === "callback_failed") {
    return {
      severity: "error" as const,
      message:
        "Connecting Google Calendar failed safely. Nothing was added to or changed in your calendar.",
    };
  }

  if (errorCode === "refresh_token_missing") {
    return {
      severity: "error" as const,
      message:
        "Google didn't give LifeOS lasting permission, so the connection wasn't turned on. Please connect again and allow access when Google asks.",
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
        "Google Calendar isn't set up on LifeOS yet. Local planning still works without it.",
    };
  }

  if (
    message.includes("sign in before") ||
    message.includes("auth") ||
    message.includes("session")
  ) {
    return {
      severity: "warning" as const,
      message: "Please sign in to LifeOS before connecting Google Calendar.",
    };
  }

  if (message.includes("could not start")) {
    return {
      severity: "error" as const,
      message:
        "LifeOS couldn't start connecting Google Calendar. Nothing was changed.",
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
              "LifeOS isn't fully set up here, so Google Calendar isn't available. Local planning still works.",
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
              "LifeOS can't check your sign-in right now. Please sign in again before connecting Google Calendar.",
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
            message: "Please sign in to LifeOS to connect Google Calendar.",
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
        "Google Calendar is not configured for LifeOS here, so it stays unavailable.",
      );
    }

    if (!client.auth || typeof client.auth.getSession !== "function") {
      throw new Error(
        "LifeOS can't check your sign-in. Sign in before connecting Google Calendar again.",
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
          "LifeOS disconnected Google Calendar and deleted its saved access on our side. Your permission still lives in your Google account — remove it there too if you want to fully revoke access.",
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
      {/* #660 audit line S7: `text-xl` (1.25rem) sat off both the h1 and
          card-title tiers of the ratified scale — pinned to the fixed
          card-title numbers (1.5rem/620, `.settings-card-title`; same
          class S3's CreateAreaForm title uses). */}
      <CardHeader>
        <CardTitle className="settings-card-title">Google Calendar</CardTitle>
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
          <div role="status" className="space-y-3" aria-live="polite">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 max-w-xl" />
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-44" />
              <Skeleton className="h-10 w-40" />
            </div>
          </div>
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
                {
                  "Google Calendar isn't set up here, and that's okay — local planning keeps working without it."
                }
              </p>
            ) : null}

            {panelState.connection?.granted_scopes_json?.length ? (
              <DiagnosticsDisclosure
                title="Advanced details"
                className="text-sm text-muted-foreground"
                summaryClassName="text-sm font-medium text-foreground"
              >
                <p>
                  Access you granted to Google:{" "}
                  {panelState.connection.granted_scopes_json.join(", ")}
                </p>
              </DiagnosticsDisclosure>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
