-- FR-036 slice 2 (issue #659): additive "composted" capture status.
-- Follows the enum-amendment pattern from 20260626120000_add_task_backlog_status.sql
-- (drop-then-recreate the same-named check constraint with the widened list).
-- No rows are backfilled or transitioned here; this migration only widens the
-- allowed value set so a later guarded write (applyCompostTransitions) can set it.
alter table public.capture_items
  drop constraint if exists capture_items_status_check;

alter table public.capture_items
  add constraint capture_items_status_check check (
    status in (
      'new',
      'parsed',
      'triage_required',
      'resolved',
      'archived',
      'composted'
    )
  );
