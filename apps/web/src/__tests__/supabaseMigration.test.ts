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

describe("Supabase local database scaffold", () => {
  it("includes local config and seed documentation", () => {
    expect(existsSync(resolve(supabaseDir, "config.toml"))).toBe(true);
    expect(existsSync(resolve(supabaseDir, "seed.sql"))).toBe(true);
  });

  it("creates every Phase 3 public table with RLS and own-row policies", () => {
    const sql = loadInitialMigration();

    for (const table of scopedTables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
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
    ]) {
      expect(sql).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated`,
      );
    }
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
