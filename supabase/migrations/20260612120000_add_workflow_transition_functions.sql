-- Atomic workflow transition functions.
--
-- These functions exist so multi-table workflow transitions commit or roll
-- back as one transaction instead of running as separate client-driven
-- writes. They are SECURITY INVOKER on purpose: they run as the calling
-- authenticated user, so every statement inside remains subject to the
-- existing RLS policies. No policy is added, changed, or bypassed here.

-- Accept a local time-block proposal and create its calendar block in one
-- transaction. Previously the proposal update and block insert were two
-- separate client calls, so a failure between them stranded an accepted
-- proposal with no block.
create or replace function public.accept_time_block_proposal(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proposal public.time_block_proposals;
  v_block public.calendar_blocks;
begin
  select * into v_proposal
  from public.time_block_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'Planning proposal was not found.';
  end if;

  if v_proposal.status not in ('proposed', 'edited') then
    raise exception 'Only proposed or edited proposals can be accepted.';
  end if;

  update public.time_block_proposals
  set status = 'accepted'
  where id = p_proposal_id
  returning * into v_proposal;

  insert into public.calendar_blocks (
    user_id,
    area_id,
    proposal_id,
    task_id,
    google_event_id,
    start_at,
    end_at,
    status
  )
  values (
    v_proposal.user_id,
    v_proposal.area_id,
    v_proposal.id,
    v_proposal.task_id,
    null,
    v_proposal.proposed_start,
    v_proposal.proposed_end,
    'scheduled'
  )
  returning * into v_block;

  return jsonb_build_object(
    'proposal', to_jsonb(v_proposal),
    'block', to_jsonb(v_block)
  );
end;
$$;

-- Apply an execution-session outcome and its dependent calendar-block and
-- task status transitions in one transaction. The caller supplies the
-- session patch (paused-state derivation stays in app code); the dependent
-- status mapping lives here so it cannot half-apply.
create or replace function public.apply_execution_session_outcome(
  p_session_id uuid,
  p_outcome text,
  p_actual_minutes integer,
  p_paused_minutes integer,
  p_distraction_minutes integer,
  p_productivity_rating integer,
  p_notes text
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
    notes = p_notes
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

revoke all on function public.accept_time_block_proposal(uuid) from public;
revoke all on function public.accept_time_block_proposal(uuid) from anon;
grant execute on function public.accept_time_block_proposal(uuid) to authenticated;

revoke all on function public.apply_execution_session_outcome(uuid, text, integer, integer, integer, integer, text) from public;
revoke all on function public.apply_execution_session_outcome(uuid, text, integer, integer, integer, integer, text) from anon;
grant execute on function public.apply_execution_session_outcome(uuid, text, integer, integer, integer, integer, text) to authenticated;
