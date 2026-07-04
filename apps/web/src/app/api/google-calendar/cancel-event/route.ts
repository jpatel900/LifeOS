import { NextResponse } from "next/server";
import { CancelGoogleCalendarEventInputSchema } from "@lifeos/schemas";
import { getGoogleCalendarStoredConnectionForAccessToken } from "@/lib/googleCalendar/server";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import {
  GoogleCalendarEventDriftError,
  GoogleCalendarMissingEtagError,
  deleteGoogleCalendarEventForConnection,
  getGoogleCalendarEventForConnection,
  isLifeOsOwnedGoogleEventId,
} from "@/lib/googleCalendar/events";
import {
  createPendingExternalWriteEventForAccessToken,
  updateExternalWriteEventResultForAccessToken,
} from "@/lib/externalWrites/server";
import {
  getCalendarBlockForAccessToken,
  markCalendarBlockCancelledForAccessToken,
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

  return "Google Calendar event could not be cancelled.";
}

function mapCancelEventFailure(error: unknown) {
  if (error instanceof GoogleCalendarEventDriftError) {
    return { status: 409, error: error.message };
  }

  if (error instanceof GoogleCalendarMissingEtagError) {
    return { status: 409, error: error.message };
  }

  const rawMessage = safeErrorMessage(error);

  if (/sign in|jwt|auth/i.test(rawMessage)) {
    return {
      status: 401,
      error: "Sign in before cancelling Google Calendar events.",
    };
  }

  if (/calendar_block_id|approved/i.test(rawMessage)) {
    return {
      status: 400,
      error:
        "Google Calendar cancel request was invalid. Review the block and approval and try again.",
    };
  }

  if (/only lifeos-created/i.test(rawMessage)) {
    return {
      status: 409,
      error:
        "Only calendar events created by LifeOS can be cancelled. Events you created elsewhere stay untouched.",
    };
  }

  return {
    status: 502,
    error:
      "Google Calendar cancel failed. Local block data is unchanged. Review connection status and retry.",
  };
}

export async function POST(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar is not configured on this server. Add server-only Google OAuth env vars and token encryption key before cancelling events.",
      },
      { status: 503 },
    );
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before cancelling Google Calendar events.",
      },
      { status: 401 },
    );
  }

  let auditEventId: string | null = null;

  try {
    const { user } = await requireSupabaseServerUser(accessToken);
    const body = await request.json().catch(() => null);
    const input = CancelGoogleCalendarEventInputSchema.parse(body);
    const { connection } =
      await getGoogleCalendarStoredConnectionForAccessToken(accessToken);

    if (!connection || connection.status !== "connected") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Connect Google Calendar before cancelling Google Calendar events.",
        },
        { status: 409 },
      );
    }

    if (!connection.encrypted_refresh_token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Reconnect Google Calendar before cancelling events. No refresh token is stored.",
        },
        { status: 409 },
      );
    }

    const block = await getCalendarBlockForAccessToken(
      accessToken,
      input.calendar_block_id,
    );

    if (!block || !block.google_event_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "This calendar block has no Google Calendar event to cancel.",
        },
        { status: 409 },
      );
    }

    if (block.status === "cancelled") {
      return NextResponse.json(
        {
          ok: false,
          error: "This calendar block is already cancelled.",
        },
        { status: 409 },
      );
    }

    if (!isLifeOsOwnedGoogleEventId(block.google_event_id)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only calendar events created by LifeOS can be cancelled. Events you created elsewhere stay untouched.",
        },
        { status: 409 },
      );
    }

    const eventRead = await getGoogleCalendarEventForConnection({
      connection,
      eventId: block.google_event_id,
      supabaseAccessToken: accessToken,
    });

    const auditEvent = await createPendingExternalWriteEventForAccessToken(
      accessToken,
      {
        areaId: block.area_id,
        operation: "calendar.events.delete",
        requestSummary: {
          calendar_block_id: block.id,
          calendar_id: connection.calendar_id,
          google_event_before_image: eventRead.eventSnapshot,
          google_event_etag: eventRead.googleEventEtag,
          google_event_id: block.google_event_id,
          google_event_status: eventRead.status,
          proposal_id: block.proposal_id,
        },
        targetId: block.id,
        targetType: "calendar_block",
        userId: user.id,
      },
    );
    auditEventId = auditEvent.id;

    if (eventRead.exists) {
      if (eventRead.status === "cancelled") {
        // Google keeps deleted events as readable tombstones and can resurrect
        // them with a PATCH. LifeOS treats its own cancelled state as final and
        // never patches a cancelled event back to confirmed.
      } else if (!eventRead.googleEventEtag) {
        throw new GoogleCalendarMissingEtagError();
      } else if (
        !eventRead.lifeosProposalId ||
        (block.proposal_id && eventRead.lifeosProposalId !== block.proposal_id)
      ) {
        const failure = {
          status: 409,
          error:
            "This Google Calendar event does not carry a matching LifeOS provenance marker. Cancel was aborted.",
        };
        await updateExternalWriteEventResultForAccessToken(
          accessToken,
          auditEvent.id,
          {
            errorMessage: failure.error,
            resultStatus: "failed",
            resultSummary: {
              provenance_marker_matched: false,
            },
          },
        );
        auditEventId = null;
        return NextResponse.json(
          { ok: false, error: failure.error },
          { status: failure.status },
        );
      } else {
        await deleteGoogleCalendarEventForConnection({
          connection,
          eventId: block.google_event_id,
          expectedEtag: eventRead.googleEventEtag,
          supabaseAccessToken: accessToken,
        });
      }
    }

    const cancelledBlock = await markCalendarBlockCancelledForAccessToken(
      accessToken,
      block.id,
    );
    const audit = await updateExternalWriteEventResultForAccessToken(
      accessToken,
      auditEvent.id,
      {
        errorMessage: null,
        resultStatus: "succeeded",
        resultSummary: {
          calendar_block_id: block.id,
          event_already_gone: !eventRead.exists,
          google_event_etag: eventRead.googleEventEtag,
          google_event_status: eventRead.status,
          provenance_marker_matched: eventRead.exists ? true : null,
        },
      },
    );

    return NextResponse.json({
      ok: true,
      audit,
      block: cancelledBlock,
      event_already_gone: !eventRead.exists,
    });
  } catch (error) {
    const failure = mapCancelEventFailure(error);

    if (auditEventId) {
      await updateExternalWriteEventResultForAccessToken(
        accessToken,
        auditEventId,
        {
          errorMessage: failure.error,
          resultStatus: "failed",
          resultSummary: {
            event_deleted: false,
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
