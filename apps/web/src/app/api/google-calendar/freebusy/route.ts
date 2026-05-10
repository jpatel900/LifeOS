import { NextResponse } from "next/server";
import { CheckTimeBlockProposalConflictInputSchema } from "@lifeos/schemas";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import { checkGoogleCalendarFreeBusyForConnection } from "@/lib/googleCalendar/freebusy";
import { getGoogleCalendarStoredConnectionForAccessToken } from "@/lib/googleCalendar/server";
import {
  getTimeBlockProposalForAccessToken,
  updateTimeBlockProposalConflictForAccessToken,
} from "@/lib/planning/server";
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

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Google Calendar conflict check failed.";
}

export async function POST(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar is not configured on this server. Add the server-only Google OAuth env vars and token encryption key before checking conflicts.",
      },
      { status: 503 },
    );
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before checking Google Calendar conflicts.",
      },
      { status: 401 },
    );
  }

  try {
    await requireSupabaseServerUser(accessToken);

    const body = await request.json().catch(() => null);
    const input = CheckTimeBlockProposalConflictInputSchema.parse(body);
    const { connection } =
      await getGoogleCalendarStoredConnectionForAccessToken(accessToken);

    if (!connection || connection.status !== "connected") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Connect Google Calendar before checking proposal conflicts.",
        },
        { status: 409 },
      );
    }

    const proposal = await getTimeBlockProposalForAccessToken(
      accessToken,
      input.proposal_id,
    );

    if (proposal.status !== "proposed" && proposal.status !== "edited") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only proposed or edited time-block proposals can be checked for conflicts.",
        },
        { status: 409 },
      );
    }

    const result = await checkGoogleCalendarFreeBusyForConnection({
      connection,
      proposedEnd: proposal.proposed_end,
      proposedStart: proposal.proposed_start,
      supabaseAccessToken: accessToken,
    });
    const updatedProposal = await updateTimeBlockProposalConflictForAccessToken(
      accessToken,
      proposal.id,
      {
        checked_at: result.checkedAt,
        has_conflict: result.hasConflict,
        provider: "google_calendar",
        status: "checked",
      },
      result.hasConflict,
    );

    return NextResponse.json({
      ok: true,
      proposal: updatedProposal,
      checked_at: result.checkedAt,
      has_conflict: result.hasConflict,
    });
  } catch (error) {
    const message = getSafeErrorMessage(error);
    const status =
      /sign in/i.test(message) || /jwt/i.test(message)
        ? 401
        : /proposal_id/i.test(message)
          ? 400
          : 502;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status },
    );
  }
}
