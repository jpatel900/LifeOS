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

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Google Calendar connection status could not load.";
}

export async function GET(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      connection: null,
      status: "disconnected",
      message:
        "Google Calendar isn't set up on LifeOS yet. Local planning still works without it, and you can connect Google later once it's set up.",
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
          ? "Google Calendar is connected. LifeOS only checks your availability or adds events when you explicitly ask — never on its own."
          : connection?.status === "error"
            ? "The last attempt to connect Google Calendar failed safely. Please connect again to retry."
            : "Google Calendar isn't connected yet. Connect it whenever you're ready.",
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    const unauthenticated = /sign in|auth|jwt|session/i.test(message);

    return NextResponse.json(
      {
        ok: false,
        error: unauthenticated
          ? "Sign in before loading Google Calendar connection status."
          : "Google Calendar connection status could not load. Local planning is still available.",
      },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
