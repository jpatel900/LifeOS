-- FR-031 slice 3 (task-map v1): additive persistence columns on public.tasks
-- for the approved progression map. Denormalized jsonb document per
-- DATA_MODEL 4.16 / plan-task-map-contract.md §4.1 decision 5 — caps (<=7
-- required, <=4 optional, <=2 red nodes; depth 1) make a jsonb graph document
-- correct and additive for v1. The normalized `task_edges` table is deferred
-- to v2.
--
-- `progression_map` holds the approved graph document (shape =
-- `TaskMapGraphDraftSchema` in packages/schemas/src/task-map.ts). Any write
-- path must validate with both that schema and `validateGraph`
-- (apps/web/src/lib/taskmap/graph.ts) before persisting — see
-- apps/web/src/lib/taskmap/persistence.ts.
--
-- All four columns are nullable: null for tasks with no approved map.
-- Additive only; inherits the tasks table's existing RLS policies and
-- table-level grants (same pattern as 20260705120000_add_task_is_reversible).

alter table public.tasks
  add column if not exists progression_map jsonb;

alter table public.tasks
  add column if not exists map_status text;

alter table public.tasks
  add column if not exists map_schema_version text;

alter table public.tasks
  add column if not exists map_approved_at timestamptz;

do $$
begin
  alter table public.tasks
    add constraint tasks_map_status_check
    check (map_status is null or map_status in ('draft', 'approved', 'superseded'));
exception
  when duplicate_object then null;
end $$;
