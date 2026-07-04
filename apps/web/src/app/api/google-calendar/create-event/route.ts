import { NextResponse } from "next/server";
import { CreateGoogleCalendarEventInputSchema } from "@lifeos/schemas";
import {
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken,
  getGoogleCalendarStoredConnectionForAccessToken,
} from "@/lib/googleCalendar/server";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import { insertGoogleCalendarEventForConnection } from "@/lib/googleCalendar/events";
import {
  createPendingExternalWriteEventForAccessToken,
  updateExternalWriteEventResultForAccessToken,
} from "@/lib/externalWrites/server";
import {
  createCalendarBlockForProposalForAccessToken,
  getCalendarBlockForProposalForAccessToken,
  getTaskForAccessToken,
  getTimeBlockProposalForAccessToken,
  markTimeBlockProposalAcceptedForAccessToken,
  updateCalendarBlockGoogleEventForAccessToken,
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

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Google Calendar event could not be created.";
}

function mapCreateEventFailure(error: unknown) {
  const rawMessage = safeErrorMessage(error);

  if (/sign in|jwt|auth/i.test(rawMessage)) {
    return {
      status: 401,
      error: "Sign in before creating Google Calendar events.",
    };
  }

  if (/proposal_id|approved/i.test(rawMessage)) {
    return {
      status: 400,
      error:
        "Google Calendar write request was invalid. Review proposal approval and try again.",
    };
  }

  if (/already has a google calendar event|duplicate/i.test(rawMessage)) {
    return {
      status: 409,
      error:
        "This proposal already has a Google Calendar event. Duplicate event creation is blocked.",
    };
  }

  return {
    status: 502,
    error:
      "Google Calendar write failed. Local proposal data is unchanged. Review connection status and retry.",
  };
}

function isEligibleProposalStatus(status: string) {
  return status === "proposed" || status === "edited" || status === "accepted";
}

export async function POST(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar is not configured on this server. Add server-only Google OAuth env vars and token encryption key before creating events.",
      },
      { status: 503 },
    );
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before creating Google Calendar events.",
      },
      { status: 401 },
    );
  }

  let auditEventId: string | null = null;

  try {
    const { user } = await requireSupabaseServerUser(accessToken);
    const body = await request.json().catch(() => null);
    const input = CreateGoogleCalendarEventInputSchema.parse(body);
    const { connection } =
      await getGoogleCalendarStoredConnectionForAccessToken(accessToken);

    if (!connection || connection.status !== "connected") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Connect Google Calendar before creating Google Calendar events.",
        },
        { status: 409 },
      );
    }

    if (!connection.encrypted_refresh_token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Reconnect Google Calendar before creating events. No refresh token is stored.",
        },
        { status: 409 },
      );
    }

    if (
      !connection.first_write_warning_acknowledged_at &&
      !input.acknowledge_first_write_warning
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Acknowledge the first Google Calendar write warning before creating the first event.",
          first_write_warning_required: true,
        },
        { status: 428 },
      );
    }

    const proposal = await getTimeBlockProposalForAccessToken(
      accessToken,
      input.proposal_id,
    );

    if (!isEligibleProposalStatus(proposal.status)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only proposed, edited, or accepted local proposals can create Google Calendar events.",
        },
        { status: 409 },
      );
    }

    const existingBlock = await getCalendarBlockForProposalForAccessToken(
      accessToken,
      proposal.id,
    );

    if (existingBlock?.google_event_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This proposal already has a Google Calendar event. Duplicate event creation is blocked.",
        },
        { status: 409 },
      );
    }

    const task = proposal.task_id
      ? await getTaskForAccessToken(accessToken, proposal.task_id)
      : null;
    const title = task?.title ?? "LifeOS time block";

    if (
      !connection.first_write_warning_acknowledged_at &&
      input.acknowledge_first_write_warning
    ) {
      await acknowledgeGoogleCalendarFirstWriteWarningForAccessToken(
        accessToken,
        user.id,
      );
    }

    const auditEvent = await createPendingExternalWriteEventForAccessToken(
      accessToken,
      {
        areaId: proposal.area_id,
        operation: "calendar.events.insert",
        requestSummary: {
          calendar_id: connection.calendar_id,
          first_write_warning_acknowledged:
            Boolean(connection.first_write_warning_acknowledged_at) ||
            input.acknowledge_first_write_warning,
          proposal_id: proposal.id,
          proposed_end: proposal.proposed_end,
          proposed_start: proposal.proposed_start,
          timezone: input.timezone,
          title_source: task ? "task.title" : "fallback",
        },
        targetId: proposal.id,
        targetType: "time_block_proposal",
        userId: user.id,
      },
    );
    auditEventId = auditEvent.id;

    const insertResult = await insertGoogleCalendarEventForConnection({
      connection,
      description:
        "Created by LifeOS from an explicitly approved local time-block proposal.",
      proposalId: proposal.id,
      proposedEnd: proposal.proposed_end,
      proposedStart: proposal.proposed_start,
      supabaseAccessToken: accessToken,
      timezone: input.timezone,
      title,
    });

    const block = existingBlock
      ? await updateCalendarBlockGoogleEventForAccessToken(
          accessToken,
          existingBlock.id,
          insertResult.googleEventId,
        )
      : await createCalendarBlockForProposalForAccessToken(
          accessToken,
          proposal,
          insertResult.googleEventId,
        );
    const updatedProposal =
      proposal.status === "accepted"
        ? proposal
        : await markTimeBlockProposalAcceptedForAccessToken(
            accessToken,
            proposal.id,
          );
    const audit = await updateExternalWriteEventResultForAccessToken(
      accessToken,
      auditEvent.id,
      {
        errorMessage: null,
        resultStatus: "succeeded",
        resultSummary: {
          calendar_block_id: block.id,
          google_event_etag: insertResult.googleEventEtag,
          google_event_id_stored: true,
          google_event_snapshot: insertResult.eventSnapshot,
          provider_event_id_present: true,
        },
      },
    );

    return NextResponse.json({
      ok: true,
      audit,
      block,
      google_event_id: insertResult.googleEventId,
      proposal: updatedProposal,
    });
  } catch (error) {
    const failure = mapCreateEventFailure(error);

    if (auditEventId) {
      await updateExternalWriteEventResultForAccessToken(
        accessToken,
        auditEventId,
        {
          errorMessage: failure.error,
          resultStatus: "failed",
          resultSummary: {
            google_event_id_stored: false,
          },
        },
      ).catch(() => null);
    }

    return NextResponse.json(
      {
        ok: false,
        error: failure.error,
      },
      { status: failure.status },
    );
  }
}
