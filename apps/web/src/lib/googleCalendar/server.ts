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
const googleCalendarStoredConnectionColumns = `${googleCalendarConnectionColumns},encrypted_access_token,encrypted_refresh_token,token_expires_at,token_type`;

type GoogleCalendarConnectionRow = {
  calendar_id: string;
  connected_at: string | null;
  disconnected_at: string | null;
  encrypted_access_token?: string | null;
  encrypted_refresh_token?: string | null;
  granted_scopes_json: string[];
  status: "connected" | "disconnected" | "error" | "metadata_only";
  token_expires_at?: string | null;
  token_type?: string | null;
  user_id: string;
};

export interface GoogleCalendarStoredConnection extends GoogleCalendarConnection {
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  token_type: string | null;
}

function parseGoogleCalendarConnection(row: unknown) {
  return GoogleCalendarConnectionSchema.parse(row);
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("Google Calendar stored connection row is invalid.");
  }

  return value as Record<string, unknown>;
}

function parseNullableText(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Google Calendar stored connection ${key} is invalid.`);
  }

  return value;
}

function parseNullableDatetime(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Google Calendar stored connection ${key} is invalid.`);
  }

  return value;
}

function parseGoogleCalendarStoredConnection(row: unknown) {
  const record = assertRecord(row);
  const base = parseGoogleCalendarConnection(row);

  return {
    ...base,
    encrypted_access_token: parseNullableText(record, "encrypted_access_token"),
    encrypted_refresh_token: parseNullableText(
      record,
      "encrypted_refresh_token",
    ),
    token_expires_at: parseNullableDatetime(record, "token_expires_at"),
    token_type: parseNullableText(record, "token_type"),
  };
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

export async function getGoogleCalendarStoredConnectionForAccessToken(
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
    .select(googleCalendarStoredConnectionColumns)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    user,
    connection: data ? parseGoogleCalendarStoredConnection(data) : null,
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

  const values: Record<string, unknown> = {
    user_id: row.user_id,
    provider: "google_calendar",
    calendar_id: row.calendar_id,
    granted_scopes_json: row.granted_scopes_json,
    status: row.status,
    connected_at: row.connected_at,
    disconnected_at: row.disconnected_at,
  };

  if ("encrypted_access_token" in row) {
    values.encrypted_access_token = row.encrypted_access_token ?? null;
  }

  if ("encrypted_refresh_token" in row) {
    values.encrypted_refresh_token = row.encrypted_refresh_token ?? null;
  }

  if ("token_expires_at" in row) {
    values.token_expires_at = row.token_expires_at ?? null;
  }

  if ("token_type" in row) {
    values.token_type = row.token_type ?? null;
  }

  const { data, error } = await query
    .upsert(values, { onConflict: "user_id" })
    .select(googleCalendarConnectionColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseGoogleCalendarConnection(data);
}
