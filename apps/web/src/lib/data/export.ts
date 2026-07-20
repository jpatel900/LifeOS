export const USER_DATA_EXPORT_FORMAT_VERSION = 1;

// Every user-owned table except google_calendar_connections, which holds
// encrypted OAuth token material and must never leave the database through
// an export surface.
export const USER_DATA_EXPORT_TABLES = [
  "areas",
  "capture_items",
  "people",
  "operator_profiles",
  "tasks",
  "projects",
  "time_block_proposals",
  "calendar_blocks",
  "execution_sessions",
  "review_entries",
  "win_records",
  "rollup_summaries",
  "duration_profiles",
  "external_write_events",
  "suggestion_records",
  "override_records",
  "health_checks",
  "health_incidents",
  "ai_call_traces",
  "brief_views",
  "purpose_gauge_checkins",
] as const;

export type UserDataExportTable = (typeof USER_DATA_EXPORT_TABLES)[number];

export interface UserDataExport {
  format_version: number;
  exported_at: string;
  tables: Record<UserDataExportTable, unknown[]>;
}

interface MinimalExportClient {
  from: (table: string) => {
    select: (columns: string) => PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
}

function assertServerRuntime() {
  const isTestRuntime =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("User data export must run on the server.");
  }
}

/**
 * Assemble a full JSON export of the signed-in user's data. The client must
 * be a user-scoped (anon key + user access token) client so RLS bounds every
 * select to the requesting user; never call this with a service-role client.
 */
export async function buildUserDataExport(
  client: MinimalExportClient,
): Promise<UserDataExport> {
  assertServerRuntime();

  const tables = {} as Record<UserDataExportTable, unknown[]>;

  for (const table of USER_DATA_EXPORT_TABLES) {
    const { data, error } = await client.from(table).select("*");

    if (error) {
      throw new Error(
        `Data export failed while reading ${table}. Nothing was exported; try again.`,
      );
    }

    tables[table] = Array.isArray(data) ? data : [];
  }

  return {
    format_version: USER_DATA_EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  };
}
