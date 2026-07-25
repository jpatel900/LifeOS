import {
  GoogleCalendarConnectionErrorSchema,
  GoogleCalendarConnectionSchema,
  type GoogleCalendarConnection,
  type GoogleCalendarConnectionError,
} from "@lifeos/schemas";
import {
  createSupabaseServerClient,
  requireSupabaseServiceRoleClient,
  requireSupabaseServerUser,
} from "@/lib/supabase/server";

const googleCalendarConnectionColumns =
  "id,user_id,provider,calendar_id,granted_scopes_json,status,first_write_warning_acknowledged_at,connected_at,disconnected_at,last_error_json,created_at,updated_at";
const googleCalendarStoredConnectionColumns = `${googleCalendarConnectionColumns},encrypted_access_token,encrypted_refresh_token,token_expires_at,token_type`;

type GoogleCalendarConnectionRow = {
  calendar_id: string;
  connected_at: string | null;
  disconnected_at: string | null;
  encrypted_access_token?: string | null;
  encrypted_refresh_token?: string | null;
  first_write_warning_acknowledged_at?: string | null;
  granted_scopes_json: string[];
  // Sanitized diagnostics only (#743) -- see GoogleCalendarConnectionErrorSchema.
  // Omit the key to leave the stored value untouched; pass `null` to clear it.
  last_error_json?: GoogleCalendarConnectionError | null;
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

// #743: a malformed last_error_json must never take down the whole
// connection-status read (it's a diagnostics-only field, not core connection
// state) -- so an unparseable value is dropped to `null` here rather than
// failing the entire row's validation.
function sanitizeLastErrorJson(row: unknown): unknown {
  if (
    !row ||
    typeof row !== "object" ||
    !("last_error_json" in row) ||
    (row as Record<string, unknown>).last_error_json === null ||
    (row as Record<string, unknown>).last_error_json === undefined
  ) {
    return row;
  }

  const record = row as Record<string, unknown>;
  const check = GoogleCalendarConnectionErrorSchema.safeParse(
    record.last_error_json,
  );

  return check.success ? row : { ...record, last_error_json: null };
}

function parseGoogleCalendarConnection(row: unknown) {
  return GoogleCalendarConnectionSchema.parse(sanitizeLastErrorJson(row));
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

  const { user } = await requireSupabaseServerUser(accessToken);
  const client = requireSupabaseServiceRoleClient();
  const query = client.from("google_calendar_connections") as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(googleCalendarStoredConnectionColumns)
    .eq("user_id", user.id)
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

  const { user } = await requireSupabaseServerUser(accessToken);

  if (user.id !== row.user_id) {
    throw new Error("Google Calendar connection user mismatch.");
  }

  const client = requireSupabaseServiceRoleClient();

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

  if ("first_write_warning_acknowledged_at" in row) {
    values.first_write_warning_acknowledged_at =
      row.first_write_warning_acknowledged_at ?? null;
  }

  if ("last_error_json" in row) {
    values.last_error_json = row.last_error_json ?? null;
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

export async function acknowledgeGoogleCalendarFirstWriteWarningForAccessToken(
  accessToken: string,
  userId: string,
) {
  assertServerRuntime();

  const { user } = await requireSupabaseServerUser(accessToken);

  if (user.id !== userId) {
    throw new Error("Google Calendar connection user mismatch.");
  }

  const client = requireSupabaseServiceRoleClient();

  const query = client.from("google_calendar_connections") as unknown as {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      first_write_warning_acknowledged_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select(googleCalendarConnectionColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseGoogleCalendarConnection(data);
}
