import { NextResponse } from "next/server";
import { CheckTimeBlockProposalConflictInputSchema } from "@lifeos/schemas";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import { checkGoogleCalendarFreeBusyForConnection } from "@/lib/googleCalendar/freebusy";
import { isGoogleOAuthProviderError } from "@/lib/googleCalendar/oauth";
import {
  isGoogleCalendarRouteAuthFailure,
  isRequestValidationError,
  logGoogleCalendarRouteFailure,
} from "@/lib/googleCalendar/routeErrors";
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

function mapFreeBusyFailure(error: unknown) {
  // #670: only fixed copy, or the message of a known user-facing domain
  // error class, ever reaches the client. Raw data-layer/provider text is
  // logged server-side instead.
  if (isGoogleCalendarRouteAuthFailure(error)) {
    return {
      status: 401,
      error: "Sign in before checking Google Calendar conflicts.",
    };
  }

  if (isRequestValidationError(error)) {
    return {
      status: 400,
      error: "Google Calendar conflict check request was invalid.",
    };
  }

  if (isGoogleOAuthProviderError(error)) {
    // Fixed, user-facing copy set in the GoogleOAuthProviderError constructor.
    return { status: 502, error: error.message };
  }

  logGoogleCalendarRouteFailure("google-calendar/freebusy", error);

  return { status: 502, error: "Google Calendar conflict check failed." };
}

export async function POST(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar isn't set up on LifeOS yet, so conflicts can't be checked right now.",
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
          error: "Connect Google Calendar before checking proposal conflicts.",
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
      timezone: input.timezone,
    });
    const updatedProposal = await updateTimeBlockProposalConflictForAccessToken(
      accessToken,
      proposal.id,
      {
        checked_at: result.checkedAt,
        has_conflict: result.hasConflict,
        provider: "google_calendar",
        status: "checked",
        all_day_contexts: result.allDayContexts,
      },
      result.hasConflict,
    );

    return NextResponse.json({
      ok: true,
      proposal: updatedProposal,
      checked_at: result.checkedAt,
      has_conflict: result.hasConflict,
      all_day_contexts: result.allDayContexts,
    });
  } catch (error) {
    const failure = mapFreeBusyFailure(error);

    return NextResponse.json(
      {
        ok: false,
        error: failure.error,
      },
      { status: failure.status },
    );
  }
}
