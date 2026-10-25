import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(__dirname, "../../../../supabase/migrations");

function placementDefinitions() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .flatMap((file) => {
      const sql = readFileSync(resolve(migrationsDir, file), "utf8")
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
      return [
        ...sql.matchAll(
          /create or replace function public\.place_time_block\([\s\S]*?\$\$;/g,
        ),
      ].map(([definition]) => ({ file, definition }));
    });
}

describe("place_time_block replay ordering", () => {
  it("rechecks the user's replay key after locking the task and before writing", () => {
    const latest = placementDefinitions().at(-1);
    expect(latest, "a place_time_block definition exists").toBeDefined();
    const sql = latest!.definition;
    const lock = sql.indexOf(
      "select * into v_task from public.tasks where id = p_task_id for update;",
    );
    expect(lock, latest!.file).toBeGreaterThan(-1);
    const proposalBranch = sql.indexOf("if p_proposal_id is not null then");
    expect(proposalBranch).toBeGreaterThan(lock);
    const afterLock = sql.slice(lock, proposalBranch);
    expect(afterLock).not.toMatch(/\b(?:insert into|update public\.)/);
    // An early lookup alone lets two callers both miss before either writes.
    // This source guard runs without Postgres. The real overlap is exercised
    // by phase4aRls.local.placeTimeBlockReplay.test.ts in the database lane.
    expect(afterLock, latest!.file).toContain(
      "select * into v_existing from public.time_block_proposals where user_id = auth.uid() and client_write_id = p_client_write_id;",
    );
    expect(afterLock).toContain(
      "select * into v_block from public.calendar_blocks where proposal_id = v_existing.id;",
    );
    expect(afterLock).toContain(
      "return jsonb_build_object( 'proposal', to_jsonb(v_existing), 'block', to_jsonb(v_block), 'task', null, 'deduplicated', true );",
    );
  });

  it("keeps the original signature, invoker security, and early replay response", () => {
    const definitions = placementDefinitions();
    const original = definitions[0].definition;
    const latest = definitions.at(-1)!.definition;
    const header = (sql: string) => sql.slice(0, sql.indexOf("as $$"));
    expect(header(latest)).toBe(header(original));
    expect(header(latest)).toContain("security invoker");
    expect(header(latest)).toContain("set search_path = public, pg_temp");
    const beforeTaskLock = (sql: string) =>
      sql.slice(0, sql.indexOf("select * into v_task"));
    expect(beforeTaskLock(latest)).toBe(beforeTaskLock(original));
  });
});
