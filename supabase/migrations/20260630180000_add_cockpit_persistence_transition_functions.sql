-- Cockpit persistence transition functions.
--
-- Keep UI workflow parity transitions atomic while preserving the existing
-- RLS boundary. These are SECURITY INVOKER functions: the caller remains the
-- authenticated user and existing table policies still decide visibility.

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
  v_task public.tasks;
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

  if v_proposal.task_id is not null then
    update public.tasks
    set status = 'scheduled'
    where id = v_proposal.task_id
    returning * into v_task;
  end if;

  return jsonb_build_object(
    'proposal', to_jsonb(v_proposal),
    'block', to_jsonb(v_block),
    'task', to_jsonb(v_task)
  );
end;
$$;

create or replace function public.start_execution_session(
  p_task_id uuid,
  p_calendar_block_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_block public.calendar_blocks;
  v_session public.execution_sessions;
  v_planned_minutes integer;
begin
  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Execution task was not found.';
  end if;

  if p_calendar_block_id is not null then
    select * into v_block
    from public.calendar_blocks
    where id = p_calendar_block_id
    for update;

    if not found then
      raise exception 'Execution calendar block was not found.';
    end if;

    if v_block.task_id is distinct from v_task.id
      or v_block.area_id is distinct from v_task.area_id then
      raise exception 'Selected calendar block does not belong to this task.';
    end if;

    if v_block.status not in ('scheduled', 'running') then
      raise exception 'Only scheduled or running blocks can start a session.';
    end if;

    v_planned_minutes :=
      greatest(0, round(extract(epoch from (v_block.end_at - v_block.start_at)) / 60.0))::integer;
  else
    v_planned_minutes := coalesce(
      v_task.estimated_minutes_high,
      v_task.estimated_minutes_low
    );
  end if;

  insert into public.execution_sessions (
    user_id,
    area_id,
    task_id,
    calendar_block_id,
    planned_minutes,
    actual_minutes,
    paused_minutes,
    distraction_minutes,
    productivity_rating,
    energy_rating,
    outcome,
    notes
  )
  values (
    v_task.user_id,
    v_task.area_id,
    v_task.id,
    p_calendar_block_id,
    v_planned_minutes,
    null,
    0,
    0,
    null,
    null,
    'partial',
    null
  )
  returning * into v_session;

  if p_calendar_block_id is not null then
    update public.calendar_blocks
    set status = 'running'
    where id = p_calendar_block_id
    returning * into v_block;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'block', to_jsonb(v_block)
  );
end;
$$;

create or replace function public.unplan_calendar_block(
  p_block_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_block public.calendar_blocks;
  v_task public.tasks;
begin
  select * into v_block
  from public.calendar_blocks
  where id = p_block_id
  for update;

  if not found then
    raise exception 'Calendar block was not found.';
  end if;

  if v_block.status <> 'scheduled' then
    raise exception 'Only scheduled blocks can be unplanned.';
  end if;

  if v_block.google_event_id is not null then
    raise exception 'Google-backed blocks require calendar approval before unplanning.';
  end if;

  update public.calendar_blocks
  set status = 'cancelled'
  where id = p_block_id
  returning * into v_block;

  if v_block.task_id is not null then
    update public.tasks
    set status = 'active'
    where id = v_block.task_id
    returning * into v_task;
  end if;

  return jsonb_build_object(
    'block', to_jsonb(v_block),
    'task', to_jsonb(v_task)
  );
end;
$$;

create or replace function public.apply_task_review_transition(
  p_task_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_blocks jsonb := '[]'::jsonb;
begin
  if p_target_status not in ('active', 'backlog', 'dropped') then
    raise exception 'Review task target status is not supported.';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Review task was not found.';
  end if;

  if exists (
    select 1
    from public.calendar_blocks
    where task_id = p_task_id
      and status in ('scheduled', 'running')
      and google_event_id is not null
  ) then
    raise exception 'Google-backed blocks require calendar approval before changing this task.';
  end if;

  with cancelled_blocks as (
    update public.calendar_blocks
    set status = 'cancelled'
    where task_id = p_task_id
      and status in ('scheduled', 'running')
      and google_event_id is null
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(cancelled_blocks)), '[]'::jsonb)
  into v_blocks
  from cancelled_blocks;

  update public.tasks
  set status = p_target_status
  where id = p_task_id
  returning * into v_task;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'blocks', v_blocks
  );
end;
$$;

revoke all on function public.accept_time_block_proposal(uuid) from public;
revoke all on function public.accept_time_block_proposal(uuid) from anon;
grant execute on function public.accept_time_block_proposal(uuid) to authenticated;

revoke all on function public.start_execution_session(uuid, uuid) from public;
revoke all on function public.start_execution_session(uuid, uuid) from anon;
grant execute on function public.start_execution_session(uuid, uuid) to authenticated;

revoke all on function public.unplan_calendar_block(uuid) from public;
revoke all on function public.unplan_calendar_block(uuid) from anon;
grant execute on function public.unplan_calendar_block(uuid) to authenticated;

revoke all on function public.apply_task_review_transition(uuid, text) from public;
revoke all on function public.apply_task_review_transition(uuid, text) from anon;
grant execute on function public.apply_task_review_transition(uuid, text) to authenticated;
