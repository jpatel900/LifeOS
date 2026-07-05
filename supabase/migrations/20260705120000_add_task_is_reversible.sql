-- FR-024 decision object (C3 / issue #366): additive `is_reversible` boolean on
-- public.tasks.
--
-- Nullable by design — null for non-decision tasks, and true/false only when
-- task_type = 'decision' (the data layer writes
-- `draft.task_type === "decision" ? (draft.is_reversible ?? null) : null`).
-- `task_type` already exists (v1 core tables, 20260506213000) and the decision
-- deadline reuses `due_at`, so no other column is added. Additive only: the new
-- column inherits the tasks table's existing RLS policies and table-level grants
-- (same pattern as the 20260704200000 people/commitments task columns); no
-- backfill, no index (is_reversible is read per task, never a lookup key).

alter table public.tasks
  add column is_reversible boolean;
