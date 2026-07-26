import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const supabaseDir = resolve(repoRoot, "supabase");
const migrationsDir = resolve(supabaseDir, "migrations");

const scopedTables = [
  "areas",
  "capture_items",
  "projects",
  "tasks",
  "time_block_proposals",
  "calendar_blocks",
  "execution_sessions",
  "review_entries",
  "health_checks",
  "health_incidents",
  "suggestion_records",
  "override_records",
] as const;

function loadInitialMigration() {
  expect(existsSync(migrationsDir)).toBe(true);

  const migrationFile = readdirSync(migrationsDir).find((file) =>
    file.endsWith("_create_v1_core_tables.sql"),
  );

  expect(migrationFile).toBeDefined();

  return readFileSync(resolve(migrationsDir, migrationFile!), "utf8");
}

function loadAllMigrations() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
    .join("\n");
}

function loadSeedSql() {
  return readFileSync(resolve(supabaseDir, "seed.sql"), "utf8");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function loadMigrationFilenames() {
  expect(existsSync(migrationsDir)).toBe(true);

  return readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
}

const dataApiCommands = ["select", "insert", "update", "delete"] as const;
type DataApiCommand = (typeof dataApiCommands)[number];

/**
 * #758: replay every migration in apply order and reduce it to two facts per
 * table — which commands `authenticated` has an RLS policy for, and which
 * commands it actually holds a privilege for. Statement order matters (a later
 * `revoke` or `drop policy` must win), so this walks statements rather than
 * grepping the concatenated text.
 *
 * Column-level grants (`grant select (a, b) on table ...`) count as the
 * privilege: `google_calendar_connections` deliberately holds SELECT on a
 * subset of columns and no others, and that is a satisfied door, not a gap.
 */
function parseAuthenticatedAccess() {
  const policies = new Map<string, Set<DataApiCommand>>();
  const grants = new Map<string, Set<DataApiCommand>>();
  const revoked = new Map<string, Set<DataApiCommand>>();
  const policyCommandByName = new Map<string, [string, DataApiCommand]>();

  const statements = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .flatMap((file) =>
      readFileSync(resolve(migrationsDir, file), "utf8")
        // Drop `--` comments first: their prose contains semicolons that would
        // otherwise split a statement in half.
        .replace(/--[^\n]*/g, " ")
        .split(";"),
    )
    .map(normalizeWhitespace)
    .filter(Boolean);

  function addTo(
    target: Map<string, Set<DataApiCommand>>,
    table: string,
    commands: DataApiCommand[],
  ) {
    const existing = target.get(table) ?? new Set<DataApiCommand>();
    for (const command of commands) existing.add(command);
    target.set(table, existing);
  }

  function expandPrivileges(raw: string): DataApiCommand[] {
    const normalized = raw.toLowerCase();
    if (/\ball\b/.test(normalized)) return [...dataApiCommands];
    return dataApiCommands.filter((command) =>
      new RegExp(`\\b${command}\\b`).test(normalized),
    );
  }

  for (const statement of statements) {
    const lower = statement.toLowerCase();

    const policyMatch = lower.match(
      /^create policy (\w+) on public\.(\w+) for (select|insert|update|delete|all) to ([\w\s,]+?) (using|with check)\b/,
    );
    if (policyMatch && /\bauthenticated\b/.test(policyMatch[4])) {
      const [, name, table, command] = policyMatch;
      const commands =
        command === "all" ? [...dataApiCommands] : [command as DataApiCommand];
      addTo(policies, table, commands);
      for (const each of commands) policyCommandByName.set(name, [table, each]);
      continue;
    }

    const dropMatch = lower.match(
      /^drop policy (?:if exists )?(\w+) on public\.(\w+)$/,
    );
    if (dropMatch) {
      const known = policyCommandByName.get(dropMatch[1]);
      if (known) policies.get(known[0])?.delete(known[1]);
      continue;
    }

    // `grant a, b (col, col) on table public.x to authenticated`
    const grantMatch = lower.match(
      /^grant ([\w\s,()]+?) on table public\.(\w+) to ([\w\s,]+)$/,
    );
    if (grantMatch && /\bauthenticated\b/.test(grantMatch[3])) {
      addTo(grants, grantMatch[2], expandPrivileges(grantMatch[1]));
      continue;
    }

    const revokeMatch = lower.match(
      /^revoke ([\w\s,()]+?) on table public\.(\w+) from ([\w\s,]+)$/,
    );
    if (revokeMatch && /\bauthenticated\b/.test(revokeMatch[3])) {
      const held = grants.get(revokeMatch[2]);
      for (const command of expandPrivileges(revokeMatch[1])) {
        held?.delete(command);
        addTo(revoked, revokeMatch[2], [command]);
      }
    }
  }

  return { policies, grants, revoked };
}

describe("Supabase local database scaffold", () => {
  it("includes local config and seed documentation", () => {
    expect(existsSync(resolve(supabaseDir, "config.toml"))).toBe(true);
    expect(existsSync(resolve(supabaseDir, "seed.sql"))).toBe(true);
  });

  it("creates every Phase 3 public table with RLS and own-row policies", () => {
    const sql = loadInitialMigration();

    for (const table of scopedTables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain(`on public.${table} for select to authenticated`);
      expect(sql).toContain(`on public.${table} for insert to authenticated`);
      expect(sql).toContain(`on public.${table} for update to authenticated`);
      expect(sql).toContain(`on public.${table} for delete to authenticated`);
    }
  });

  it("adds required compound indexes for area, status, and time-based screens", () => {
    const sql = loadInitialMigration();

    const requiredIndexes = [
      "areas_user_id_idx",
      "areas_user_is_active_idx",
      "areas_user_sort_order_idx",
      "capture_items_user_created_at_idx",
      "capture_items_user_area_id_idx",
      "capture_items_user_status_idx",
      "projects_user_id_idx",
      "projects_user_area_status_idx",
      "tasks_user_id_idx",
      "tasks_user_area_status_idx",
      "tasks_user_due_at_idx",
      "tasks_user_project_id_idx",
      "time_block_proposals_user_id_idx",
      "time_block_proposals_user_area_status_idx",
      "time_block_proposals_user_proposed_start_idx",
      "time_block_proposals_user_task_id_idx",
      "calendar_blocks_user_id_idx",
      "calendar_blocks_user_area_status_idx",
      "calendar_blocks_user_start_at_idx",
      "calendar_blocks_user_google_event_id_idx",
      "calendar_blocks_user_task_id_idx",
      "execution_sessions_user_id_idx",
      "execution_sessions_user_area_id_idx",
      "execution_sessions_user_task_id_idx",
      "execution_sessions_user_calendar_block_id_idx",
      "execution_sessions_user_created_at_idx",
      "review_entries_user_id_idx",
      "review_entries_user_area_id_idx",
      "review_entries_user_review_type_idx",
      "review_entries_user_period_start_idx",
      "health_checks_user_id_idx",
      "health_checks_user_area_id_idx",
      "health_checks_user_status_idx",
      "health_checks_user_checked_at_idx",
      "health_incidents_user_id_idx",
      "health_incidents_user_area_id_idx",
      "health_incidents_user_status_idx",
      "health_incidents_user_opened_at_idx",
      "suggestion_records_user_id_idx",
      "suggestion_records_user_area_id_idx",
      "suggestion_records_user_status_idx",
      "suggestion_records_user_created_at_idx",
      "suggestion_records_user_subject_idx",
      "override_records_user_id_idx",
      "override_records_user_area_id_idx",
      "override_records_user_created_at_idx",
      "override_records_user_subject_idx",
    ];

    for (const indexName of requiredIndexes) {
      expect(sql).toContain(`create index ${indexName}`);
    }
  });

  it("grants authenticated Data API access for Phase 4 persistence tables", () => {
    const sql = loadAllMigrations();

    expect(sql).toContain("grant usage on schema public to authenticated");
    for (const table of [
      "areas",
      "capture_items",
      "projects",
      "tasks",
      "time_block_proposals",
      "calendar_blocks",
      "execution_sessions",
      "review_entries",
      "health_checks",
    ]) {
      expect(sql).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated`,
      );
    }
  });

  /**
   * #758 — the guard whose absence let a whole table class stay broken for its
   * entire lifetime.
   *
   * In Postgres an RLS policy is a FILTER and `GRANT` is the DOOR. A table with
   * four own-row policies for `authenticated` and no matching table privilege
   * refuses every request first, with `42501 permission denied for table`, so
   * the policies never run. `suggestion_records`, `override_records` and
   * `health_incidents` shipped in that state in the v1 core migration and no
   * test noticed, because the grants test above listed its tables by hand and
   * the local RLS suite never touched them.
   *
   * This derives both sides from the migrations themselves, so a NEW table with
   * a policy and no grant fails here — in every CI job, with no Supabase stack
   * required — instead of failing silently in a signed-in browser.
   */
  it("grants authenticated every privilege its own RLS policies declare (#758)", () => {
    const { policies, grants, revoked } = parseAuthenticatedAccess();

    const gaps: string[] = [];
    for (const [table, commands] of [...policies].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const granted = grants.get(table) ?? new Set<string>();
      // A privilege a migration explicitly REVOKED is a recorded decision
      // (`google_calendar_connections`, `external_write_events`, `areas`), not
      // the omission this guard is looking for.
      const deliberatelyWithheld = revoked.get(table) ?? new Set<string>();
      const missing = [...commands].filter(
        (command) =>
          !granted.has(command) && !deliberatelyWithheld.has(command),
      );
      if (missing.length > 0) {
        gaps.push(
          `  public.${table}: policy for ${[...missing].sort().join(", ")} with no grant`,
        );
      }
    }

    expect(
      gaps,
      `every table with an "to authenticated" RLS policy needs the matching\n` +
        `"grant ... on table public.<t> to authenticated". Without it Postgres\n` +
        `refuses with 42501 before the policy is ever consulted:\n${gaps.join("\n")}`,
    ).toEqual([]);
  });

  it("revokes authenticated hard delete for areas so removal stays soft-delete only", () => {
    const sql = loadAllMigrations();

    expect(sql).toContain(
      "revoke delete on table public.areas from authenticated",
    );
    expect(sql).toContain(
      "drop policy if exists areas_delete_own on public.areas",
    );
  });

  it("adds Phase 7B calendar connection and external-write audit scaffolding", () => {
    const sql = loadAllMigrations();

    for (const table of [
      "google_calendar_connections",
      "external_write_events",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain(`on public.${table} for select to authenticated`);
      expect(sql).toContain(`on public.${table} for insert to authenticated`);
      expect(sql).toContain(`on public.${table} for update to authenticated`);
      expect(sql).toContain(`on public.${table} for delete to authenticated`);
    }

    expect(sql).toContain(
      "constraint google_calendar_connections_user_id_key unique (user_id)",
    );
    expect(sql).toContain(
      "constraint google_calendar_connections_provider_check check (provider = 'google_calendar')",
    );
    expect(sql).toContain(
      "constraint external_write_events_area_fk foreign key (area_id, user_id)",
    );
    expect(sql).toContain(
      "constraint external_write_events_result_status_check check (result_status in ('pending', 'succeeded', 'failed'))",
    );
    expect(sql).toContain("encrypted_access_token text");
    expect(sql).toContain("encrypted_refresh_token text");
    expect(sql).toContain("token_expires_at timestamptz");
    expect(sql).toContain("token_type text");
    expect(sql).not.toMatch(/(^|[^a-z_])access_token([^a-z_]|$)/i);
    expect(sql).not.toMatch(/(^|[^a-z_])refresh_token([^a-z_]|$)/i);
    expect(sql).not.toMatch(/client_secret/i);
  });

  it("hardens Phase 7 calendar token and audit Data API grants", () => {
    const sql = loadAllMigrations();

    expect(sql).toContain(
      "revoke select, insert, update, delete on table public.google_calendar_connections from authenticated",
    );
    expect(sql).toMatch(
      /grant select \(\s*id,\s*user_id,\s*provider,\s*calendar_id,\s*granted_scopes_json,\s*status,\s*first_write_warning_acknowledged_at,\s*connected_at,\s*disconnected_at,\s*created_at,\s*updated_at\s*\) on table public\.google_calendar_connections to authenticated/,
    );
    expect(sql).toContain(
      "revoke insert, update, delete on table public.external_write_events from authenticated",
    );
    expect(sql).toContain(
      "grant select on table public.external_write_events to authenticated",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.google_calendar_connections to service_role",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.external_write_events to service_role",
    );
    expect(sql).toContain(
      "constraint calendar_blocks_proposal_id_key unique (proposal_id)",
    );
  });

  it("migration adds a composite override_records suggestion_id FK referencing (id, user_id)", () => {
    const sql = normalizeWhitespace(loadAllMigrations());

    expect(sql).toContain("add column suggestion_id uuid");
    expect(sql).toContain(
      "constraint override_records_suggestion_fk foreign key (suggestion_id, user_id) references public.suggestion_records (id, user_id) on delete set null",
    );
  });

  it("migration replaces the schema_version check with the v1/v2 enum form", () => {
    const sql = normalizeWhitespace(loadAllMigrations());

    expect(sql).toContain(
      "drop constraint suggestion_records_schema_version_check",
    );
    expect(sql).toContain(
      "drop constraint override_records_schema_version_check",
    );
    expect(sql).toContain(
      "add constraint suggestion_records_schema_version_check check (schema_version in ('meta-learning-event-v1', 'meta-learning-event-v2'))",
    );
    expect(sql).toContain(
      "add constraint override_records_schema_version_check check (schema_version in ('meta-learning-event-v1', 'meta-learning-event-v2'))",
    );
  });

  it("adds duration_profiles with same-user area FK, RLS, grants, and last-updated trigger", () => {
    const sql = normalizeWhitespace(loadAllMigrations());

    expect(sql).toContain("create table public.duration_profiles");
    expect(sql).toContain(
      "constraint duration_profiles_sample_count_check check (sample_count >= 1)",
    );
    expect(sql).toContain(
      "constraint duration_profiles_area_task_key unique (user_id, area_id, task_type)",
    );
    expect(sql).toContain(
      "constraint duration_profiles_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict",
    );
    expect(sql).toContain(
      "create index duration_profiles_user_id_idx on public.duration_profiles (user_id)",
    );
    expect(sql).toContain(
      "create index duration_profiles_user_area_task_idx on public.duration_profiles (user_id, area_id, task_type)",
    );
    expect(sql).toContain(
      "alter table public.duration_profiles enable row level security",
    );
    expect(sql).toContain(
      "create policy duration_profiles_select_own on public.duration_profiles for select to authenticated using ((select auth.uid()) = user_id)",
    );
    expect(sql).toContain(
      "create policy duration_profiles_insert_own on public.duration_profiles for insert to authenticated with check ((select auth.uid()) = user_id)",
    );
    expect(sql).toContain(
      "create policy duration_profiles_update_own on public.duration_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)",
    );
    expect(sql).toContain(
      "create policy duration_profiles_delete_own on public.duration_profiles for delete to authenticated using ((select auth.uid()) = user_id)",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.duration_profiles to authenticated",
    );
    expect(sql).toContain(
      "create or replace function public.set_last_updated_at()",
    );
    expect(sql).toContain(
      "create trigger duration_profiles_set_last_updated_at before insert or update on public.duration_profiles for each row execute function public.set_last_updated_at()",
    );
  });

  it("has no duplicate leading timestamps across migration filenames", () => {
    const filenames = loadMigrationFilenames();

    const filenamesByTimestamp = new Map<string, string[]>();
    for (const filename of filenames) {
      const match = filename.match(/^(\d{14})_/);
      const timestamp = match ? match[1] : filename;
      const existing = filenamesByTimestamp.get(timestamp) ?? [];
      existing.push(filename);
      filenamesByTimestamp.set(timestamp, existing);
    }

    const duplicates = [...filenamesByTimestamp.entries()].filter(
      ([, files]) => files.length > 1,
    );

    expect(
      duplicates,
      `duplicate migration timestamps found:\n${duplicates
        .map(([timestamp, files]) => `  ${timestamp}: ${files.join(", ")}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("names every migration file with a 14-digit timestamp prefix and snake_case description", () => {
    const filenames = loadMigrationFilenames();
    const shapePattern = /^\d{14}_[a-z0-9_]+\.sql$/;

    const malformed = filenames.filter((file) => !shapePattern.test(file));

    expect(
      malformed,
      `malformed migration filenames found: ${malformed.join(", ")}`,
    ).toEqual([]);
  });

  it("seeds local authenticated users and starter areas for Phase 4A smoke tests", () => {
    const seedSql = loadSeedSql();

    expect(seedSql).toContain("user_a@example.test");
    expect(seedSql).toContain("user_b@example.test");
    expect(seedSql).toContain("insert into public.areas");
    for (const token of [
      "Main Job",
      "main-job",
      "#2563eb",
      "briefcase",
      "Personal",
      "personal",
      "#16a34a",
      "home",
      "Volunteer Work",
      "volunteer-work",
      "#9333ea",
      "heart",
      "Side Project",
      "side-project",
      "#f97316",
      "rocket",
    ]) {
      expect(seedSql).toContain(token);
    }
  });
});
