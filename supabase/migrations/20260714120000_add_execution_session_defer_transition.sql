-- Atomic cap-DEFER transition (#613, prerequisite noted by #587's collision
-- resolution / DEPENDENCY-INTEGRATED comment on that issue).
--
-- Today the end-session policy's DEFER path makes two separate client
-- writes: `apply_execution_session_outcome` (session outcome=blocked,
-- cap_outcome=deferred) followed by a fire-and-forget task status update to
-- 'backlog'. If the second write fails after the first commits, the session
-- reports "closed" while the task never moved — a split, half-true state
-- (interim behavior tracked as defer_unconfirmed/defer_failed on #587).
--
-- This function folds both writes into one transaction, following the exact
-- precedent of `accept_time_block_proposal` / `apply_execution_session_outcome`
-- (see 20260612120000_add_workflow_transition_functions.sql and
-- 20260705130000_add_execution_session_cap_outcome.sql): SECURITY INVOKER so
-- the function runs as the calling authenticated user and every statement
-- stays subject to the existing RLS policies on execution_sessions and
-- tasks — no policy is added, changed, or bypassed here, and cross-user rows
-- are simply invisible to `for update`, which raises 'was not found' exactly
-- like the precedent RPCs (see the phase4aRls cross-user coverage mirrored
-- below).
--
-- New function name (not an overload of apply_execution_session_outcome) per
-- the standing "prefer a new name over an overload trap" rule — this is a
-- distinct, narrower transition (defer-only) rather than a general outcome
-- setter, so it does not replace or overload the existing function's
-- signature and needs no `drop function if exists`.
create or replace function public.apply_execution_session_defer(
  p_session_id uuid,
  p_task_id uuid,
  p_actual_minutes integer,
  p_paused_minutes integer,
  p_distraction_minutes integer,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.execution_sessions;
  v_task public.tasks;
begin
  select * into v_session
  from public.execution_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Execution session was not found.';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Deferred task was not found.';
  end if;

  if v_session.task_id is distinct from v_task.id then
    raise exception 'Execution session does not belong to this task.';
  end if;

  update public.execution_sessions
  set
    outcome = 'blocked',
    cap_outcome = 'deferred',
    actual_minutes = p_actual_minutes,
    paused_minutes = p_paused_minutes,
    distraction_minutes = p_distraction_minutes,
    productivity_rating = 1,
    notes = p_notes
  where id = p_session_id
  returning * into v_session;

  update public.tasks
  set status = 'backlog'
  where id = p_task_id
  returning * into v_task;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'task', to_jsonb(v_task)
  );
end;
$$;

revoke all on function public.apply_execution_session_defer(uuid, uuid, integer, integer, integer, text) from public;
revoke all on function public.apply_execution_session_defer(uuid, uuid, integer, integer, integer, text) from anon;
grant execute on function public.apply_execution_session_defer(uuid, uuid, integer, integer, integer, text) to authenticated;
