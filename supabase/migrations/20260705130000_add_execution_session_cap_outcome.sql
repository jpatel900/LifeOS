alter table public.execution_sessions
  add column if not exists cap_outcome text;

do $$
begin
  alter table public.execution_sessions
    add constraint execution_sessions_cap_outcome_check
    check (cap_outcome is null or cap_outcome in ('cut_scope', 'deferred'));
exception
  when duplicate_object then null;
end $$;

-- Drop the prior 7-arg overload (pre-cap_outcome). `create or replace` with a
-- new arity creates a SECOND overload rather than replacing it, and because the
-- new p_cap_outcome arg is defaulted, a 7-arg call becomes ambiguous ("could
-- not choose the best candidate function"). Removing the old signature leaves
-- exactly one function; 7-arg callers resolve to it with p_cap_outcome => null.
drop function if exists public.apply_execution_session_outcome(
  uuid, text, integer, integer, integer, integer, text
);

create or replace function public.apply_execution_session_outcome(
  p_session_id uuid,
  p_outcome text,
  p_actual_minutes integer,
  p_paused_minutes integer,
  p_distraction_minutes integer,
  p_productivity_rating integer,
  p_notes text,
  p_cap_outcome text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.execution_sessions;
  v_block public.calendar_blocks;
  v_task public.tasks;
begin
  select * into v_session
  from public.execution_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Execution session was not found.';
  end if;

  update public.execution_sessions
  set
    outcome = p_outcome,
    actual_minutes = p_actual_minutes,
    paused_minutes = p_paused_minutes,
    distraction_minutes = p_distraction_minutes,
    productivity_rating = p_productivity_rating,
    notes = p_notes,
    cap_outcome = p_cap_outcome
  where id = p_session_id
  returning * into v_session;

  if v_session.calendar_block_id is not null
    and v_session.outcome in ('completed', 'skipped') then
    update public.calendar_blocks
    set status = case
      when v_session.outcome = 'completed' then 'completed'
      else 'missed'
    end
    where id = v_session.calendar_block_id
    returning * into v_block;
  end if;

  if v_session.task_id is not null
    and v_session.outcome in ('completed', 'blocked') then
    update public.tasks
    set status = case
      when v_session.outcome = 'completed' then 'done'
      else 'blocked'
    end
    where id = v_session.task_id
    returning * into v_task;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'block', to_jsonb(v_block),
    'task', to_jsonb(v_task)
  );
end;
$$;

revoke all on function public.apply_execution_session_outcome(uuid, text, integer, integer, integer, integer, text, text) from public;
revoke all on function public.apply_execution_session_outcome(uuid, text, integer, integer, integer, integer, text, text) from anon;
grant execute on function public.apply_execution_session_outcome(uuid, text, integer, integer, integer, integer, text, text) to authenticated;
