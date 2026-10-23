import { NextResponse } from "next/server";
import { CreateGoogleCalendarEventInputSchema } from "@lifeos/schemas";
import {
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken,
  getGoogleCalendarStoredConnectionForAccessToken,
} from "@/lib/googleCalendar/server";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import { insertGoogleCalendarEventForConnection } from "@/lib/googleCalendar/events";
import {
  claimGoogleCalendarApprovalForAccessToken,
  updateExternalWriteEventResultForAccessToken,
} from "@/lib/externalWrites/server";
import {
  findGoogleBackedScheduledBlockForTaskForAccessToken,
  getCalendarBlockForProposalForAccessToken,
  getTaskForAccessToken,
  getTimeBlockProposalForAccessToken,
  recordGoogleCalendarPlacementForAccessToken,
} from "@/lib/planning/server";
import {
  isGoogleCalendarRouteAuthFailure,
  isRequestValidationError,
  logGoogleCalendarRouteFailure,
} from "@/lib/googleCalendar/routeErrors";
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
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "CALENDAR_APPROVAL_CONFLICT"
  ) {
    return {
      status: 409,
      error:
        "This calendar approval conflicts with an earlier approval or its saved details changed. Retry the original proposal with the same calendar connection, or cancel its event before approving another time.",
    };
  }
  // #670: the raw message is only inspected to pick a status; the client
  // always gets fixed copy, and unexpected failures are logged server-side.
  const rawMessage = safeErrorMessage(error);

  if (
    isGoogleCalendarRouteAuthFailure(error) ||
    /sign in|jwt|auth/i.test(rawMessage)
  ) {
    return {
      status: 401,
      error: "Sign in before creating Google Calendar events.",
    };
  }

  if (
    isRequestValidationError(error) ||
    /proposal_id|approved/i.test(rawMessage)
  ) {
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

  logGoogleCalendarRouteFailure("google-calendar/create-event", error);

  return {
    status: 502,
    error:
      "Google Calendar write failed. Local proposal data is unchanged. Review connection status and retry.",
  };
}

function sameInstant(left: string, right: string) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && a === b;
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
          "Google Calendar isn't set up on LifeOS yet, so events can't be created right now.",
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
            "Reconnect Google Calendar before creating events. Its saved access is no longer available.",
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

    // Calendar hunt #4: Google gets exactly the time the person approved.
    // A local "Move later" that has not reached the account yet would
    // otherwise send the account's older time.
    if (
      !sameInstant(input.approved_start, proposal.proposed_start) ||
      !sameInstant(input.approved_end, proposal.proposed_end)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The time you approved isn't saved to your account yet. Wait a moment for it to reach your account, then approve again.",
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

    // Calendar hunt #1: one Google event per task. A sibling proposal of a
    // task that is already on Google Calendar must not create a second one.
    if (proposal.task_id) {
      const googleBackedBlock =
        await findGoogleBackedScheduledBlockForTaskForAccessToken(
          accessToken,
          proposal.task_id,
        );
      if (googleBackedBlock) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This task already has a Google Calendar event. Cancel that event first if you want a different time.",
          },
          { status: 409 },
        );
      }
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

    const auditEvent = await claimGoogleCalendarApprovalForAccessToken(
      accessToken,
      {
        proposalId: proposal.id,
        taskId: proposal.task_id,
        proposedStart: proposal.proposed_start,
        proposedEnd: proposal.proposed_end,
        connectionId: connection.id,
        connectedAt: connection.connected_at,
        calendarId: connection.calendar_id,
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

    // Calendar hunt #6: from here on the Google write HAS happened. Nothing
    // below may log it as failed or tell the person their calendar is
    // unchanged. Approving again is safe: the event id is derived from the
    // proposal, so Google answers with the same event instead of a second.
    let placement;
    try {
      // Calendar hunt #1: the account half lands in ONE transaction with the
      // same semantics as placing a block — block stored with its event id,
      // proposal accepted, the task's other pending proposals superseded,
      // and the task scheduled.
      placement = await recordGoogleCalendarPlacementForAccessToken(
        accessToken,
        proposal.id,
        insertResult.googleEventId,
      );
    } catch {
      await updateExternalWriteEventResultForAccessToken(
        accessToken,
        auditEvent.id,
        {
          errorMessage: null,
          resultStatus: "succeeded",
          resultSummary: {
            follow_up: "account_record_failed",
            google_event_etag: insertResult.googleEventEtag,
            google_event_id_stored: false,
            google_event_snapshot: insertResult.eventSnapshot,
            provider_event_id_present: true,
          },
        },
      ).catch(() => null);

      return NextResponse.json(
        {
          ok: false,
          google_event_created: true,
          error:
            "The event is on your Google Calendar, but LifeOS couldn't finish saving it here. Approve it again to finish — that won't add a second event.",
        },
        { status: 502 },
      );
    }

    const block = placement.block;
    const updatedProposal = placement.proposal;
    // The audit row must say succeeded; a failure in its own follow-up work
    // (the incident rule) must not turn a finished write into an error.
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
    ).catch(() => null);

    return NextResponse.json({
      ok: true,
      audit,
      block,
      google_event_id: insertResult.googleEventId,
      proposal: updatedProposal,
      task: placement.task,
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
