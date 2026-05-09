import {
  GoogleCalendarConnectionSchema,
  type GoogleCalendarConnection,
} from "@lifeos/schemas";
import {
  createSupabaseServerClient,
  requireSupabaseServerUser,
} from "@/lib/supabase/server";

const googleCalendarConnectionColumns =
  "id,user_id,provider,calendar_id,granted_scopes_json,status,first_write_warning_acknowledged_at,connected_at,disconnected_at,created_at,updated_at";

type GoogleCalendarConnectionRow = {
  calendar_id: string;
  connected_at: string | null;
  disconnected_at: string | null;
  granted_scopes_json: string[];
  status: "connected" | "disconnected" | "error" | "metadata_only";
  user_id: string;
};

function parseGoogleCalendarConnection(row: unknown) {
  return GoogleCalendarConnectionSchema.parse(row);
}

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Google Calendar server helpers must stay server-only.");
  }
}

function getSupabaseMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Supabase request failed.";
}

export async function getGoogleCalendarConnectionForAccessToken(
  accessToken: string,
) {
  assertServerRuntime();

  const { client, user } = await requireSupabaseServerUser(accessToken);
  const query = client.from("google_calendar_connections") as unknown as {
    select: (columns: string) => {
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data, error } = await query
    .select(googleCalendarConnectionColumns)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    user,
    connection: data ? parseGoogleCalendarConnection(data) : null,
  };
}

export async function upsertGoogleCalendarConnectionForAccessToken(
  accessToken: string,
  row: GoogleCalendarConnectionRow,
) {
  assertServerRuntime();

  const client = createSupabaseServerClient({ accessToken });

  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const query = client.from("google_calendar_connections") as unknown as {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .upsert(
      {
        user_id: row.user_id,
        provider: "google_calendar",
        calendar_id: row.calendar_id,
        granted_scopes_json: row.granted_scopes_json,
        status: row.status,
        connected_at: row.connected_at,
        disconnected_at: row.disconnected_at,
      },
      { onConflict: "user_id" },
    )
    .select(googleCalendarConnectionColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseGoogleCalendarConnection(data);
}
