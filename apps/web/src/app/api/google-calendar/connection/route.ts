import { NextResponse } from "next/server";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import { getGoogleCalendarConnectionForAccessToken } from "@/lib/googleCalendar/server";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value?.trim()) {
    return null;
  }

  return value.trim();
}

export async function GET(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      connection: null,
      status: "disconnected",
      message:
        "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key when you want real Google integration. Mock/local mode remains available.",
    });
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before loading Google Calendar connection status.",
      },
      { status: 401 },
    );
  }

  try {
    await requireSupabaseServerUser(accessToken);
    const { connection } =
      await getGoogleCalendarConnectionForAccessToken(accessToken);

    return NextResponse.json({
      ok: true,
      configured: true,
      connection,
      status:
        connection?.status === "connected"
          ? "connected"
          : connection?.status === "error"
            ? "error"
            : "disconnected",
      message:
        connection?.status === "connected"
          ? "Google Calendar is connected with encrypted server-only token storage. Free/busy checks and event creation run only from explicit user actions."
          : connection?.status === "error"
            ? "The last Google Calendar OAuth callback failed safely. Reconnect to try again."
            : "Google Calendar is ready to connect, but no active encrypted token connection exists yet.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar connection status could not load.",
      },
      { status: 401 },
    );
  }
}
