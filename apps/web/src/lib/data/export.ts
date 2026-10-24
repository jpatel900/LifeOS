import { SupabaseAuthRejectedError } from "@/lib/supabase/server";

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

interface ExportPage {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

interface ExportTableQuery {
  order: (column: string, options: { ascending: boolean }) => ExportTableQuery;
  range: (from: number, to: number) => PromiseLike<ExportPage>;
}

interface MinimalExportClient {
  from: (table: string) => {
    select: (columns: string) => ExportTableQuery;
  };
}

// W3-16 #3: the API returns at most `max_rows` rows per request
// (`supabase/config.toml`) and cuts the rest silently. So every table is read
// in pages, in a stable order, until a page comes back empty. Stopping on an
// EMPTY page, not a short one, keeps this correct even if the server cap is
// ever set below this page size.
const EXPORT_PAGE_SIZE = 1000;

// A stable order is what stops pages from skipping or repeating rows. Every
// export table is keyed by `id`, except these two composite keys.
const EXPORT_ORDER_KEYS: Partial<
  Record<UserDataExportTable, readonly string[]>
> = {
  brief_views: ["user_id", "viewed_on"],
  purpose_gauge_checkins: ["user_id", "checked_on"],
};

function exportOrderKeys(table: UserDataExportTable): readonly string[] {
  return EXPORT_ORDER_KEYS[table] ?? ["id"];
}

// PostgREST answers PGRST301 when the JWT is expired or invalid. Some paths
// only carry the "JWT ..." text, so match that too (same pattern the shared
// route classifier uses for mid-request expiry).
function isTableReadAuthRejection(error: { message?: string; code?: string }) {
  return error.code === "PGRST301" || /\bjwt\b/i.test(error.message ?? "");
}

function assertServerRuntime() {
  const isTestRuntime =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("User data export must run on the server.");
  }
}

/** A table read failed: the whole export stops, nothing partial leaves. */
function tableReadFailure(
  table: UserDataExportTable,
  error: { message?: string; code?: string },
): Error {
  // A sign-in that expires mid-export keeps its typed auth signal so the
  // route answers the 401 sign-in-again response. The raw text and any
  // rows read so far never leave this function.
  if (isTableReadAuthRejection(error)) {
    return new SupabaseAuthRejectedError();
  }

  return new Error(
    `Data export failed while reading ${table}. Nothing was exported; try again.`,
  );
}

/** Every row of one table the signed-in user can read, page by page. */
async function readWholeTable(
  client: MinimalExportClient,
  table: UserDataExportTable,
): Promise<unknown[]> {
  const rows: unknown[] = [];

  for (;;) {
    let query = client.from(table).select("*");
    for (const column of exportOrderKeys(table)) {
      query = query.order(column, { ascending: true });
    }
    const { data, error } = await query.range(
      rows.length,
      rows.length + EXPORT_PAGE_SIZE - 1,
    );

    if (error) {
      throw tableReadFailure(table, error);
    }

    const page = Array.isArray(data) ? data : [];
    if (page.length === 0) {
      return rows;
    }
    rows.push(...page);
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
    tables[table] = await readWholeTable(client, table);
  }

  return {
    format_version: USER_DATA_EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  };
}
