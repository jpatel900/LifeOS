-- W3-16 #5: two concurrent replays of one execution-session key.
--
-- HUMAN REVIEW REQUIRED: replaces a transition function (AGENTS.md
-- human-review list).
--
-- `record_execution_session` checks for an existing row with the same
-- (user, client_write_id) BEFORE it locks the task row. Two replays of the
-- same journalled session (two tabs, or a retry racing the first attempt)
-- can both pass that check. The first inserts and commits. The second,
-- which was waiting on the task lock, then inserts too and fails on the
-- `execution_sessions_user_client_write_id_key` unique index: the caller
-- sees a database error instead of the clean "already recorded" answer.
-- Proven on a real local database by `phase4aRls.local.w316.test.ts`.
--
-- Fix: the same replay check runs a second time right after the task row
-- lock. The early check stays as the cheap path for ordinary retries.
-- Nothing else changes: the body below is 20261018140000's, signature,
-- defaults, SECURITY INVOKER and search_path included (`create or replace`
-- keeps the existing grants). No table, index or policy changes.

create or replace function public.record_execution_session(
  p_task_id uuid,
  p_calendar_block_id uuid,
  p_outcome text,
  p_actual_minutes integer,
  p_paused_minutes integer,
  p_distraction_minutes integer,
  p_productivity_rating integer,
  p_notes text,
  p_cap_outcome text,
  p_client_write_id text,
  p_defer_task boolean default false
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
  v_existing public.execution_sessions;
  v_planned_minutes integer;
begin
  if p_client_write_id is null or length(trim(p_client_write_id)) = 0 then
    raise exception 'A recorded session needs a client write id.';
  end if;

  -- Replay short-circuit. Checked BEFORE any write so a second attempt does
  -- no work at all, and returns what the first attempt actually created
  -- rather than a fresh row.
  select * into v_existing
  from public.execution_sessions
  where user_id = auth.uid()
    and client_write_id = p_client_write_id;

  if found then
    return jsonb_build_object(
      'session', to_jsonb(v_existing),
      'block', null,
      'task', null,
      'deduplicated', true
    );
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Execution task was not found.';
  end if;

  -- W3-16 #5: the replay check again, now that this call holds the task row
  -- lock. Two replays of one key can both pass the first check before
  -- either has written. The second then waits on this lock, and once the
  -- first commits, this statement (a fresh READ COMMITTED snapshot) sees its
  -- row, so the second caller is acknowledged with the first one's session
  -- instead of hitting the (user_id, client_write_id) unique index.
  select * into v_existing
  from public.execution_sessions
  where user_id = auth.uid()
    and client_write_id = p_client_write_id;

  if found then
    return jsonb_build_object(
      'session', to_jsonb(v_existing),
      'block', null,
      'task', null,
      'deduplicated', true
    );
  end if;

  -- Putting the task off would leave its Google event behind
  -- (20261018120000). Refused before anything is written.
  if p_defer_task and exists (
    select 1
    from public.calendar_blocks
    where task_id = v_task.id
      and status in ('scheduled', 'running')
      and google_event_id is not null
  ) then
    raise exception 'Google-backed blocks require calendar approval before changing this task.';
  end if;

  if p_calendar_block_id is not null then
    select * into v_block
    from public.calendar_blocks
    where id = p_calendar_block_id
    for update;

    if not found then
      raise exception 'Execution calendar block was not found.';
    end if;

    -- Same ownership check `start_execution_session` makes: a session may not
    -- be filed against a block belonging to another task or area.
    if v_block.task_id is distinct from v_task.id
      or v_block.area_id is distinct from v_task.area_id then
      raise exception 'Selected calendar block does not belong to this task.';
    end if;

    v_planned_minutes :=
      greatest(0, round(extract(epoch from (v_block.end_at - v_block.start_at)) / 60.0))::integer;
  else
    -- The blockless case (audit P0#2): a session started from the Start
    -- moment on a task with no block is a real session, and its planned
    -- minutes come from the task's own estimate.
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
    cap_outcome,
    notes,
    client_write_id
  )
  values (
    v_task.user_id,
    v_task.area_id,
    v_task.id,
    p_calendar_block_id,
    v_planned_minutes,
    p_actual_minutes,
    coalesce(p_paused_minutes, 0),
    coalesce(p_distraction_minutes, 0),
    p_productivity_rating,
    null,
    p_outcome,
    p_cap_outcome,
    p_notes,
    p_client_write_id
  )
  returning * into v_session;

  -- Block transition (see header, gap 1). "Stuck" ('blocked') still leaves
  -- the block as it is.
  if v_session.calendar_block_id is not null
    and v_session.outcome in ('completed', 'skipped', 'partial') then
    update public.calendar_blocks
    set status = case
      when v_session.outcome = 'completed' then 'completed'
      when google_event_id is not null
        and status in ('scheduled', 'running') then 'scheduled'
      when google_event_id is not null then status
      else 'missed'
    end
    where id = v_session.calendar_block_id
    returning * into v_block;
  end if;

  if p_defer_task then
    -- #613's atomic cap-DEFER, preserved for the create path: the task moves
    -- to backlog in the SAME transaction as the session it came from, and
    -- (gap 2) its open ordinary blocks are cancelled in that same
    -- transaction, as the device's `deferTask` does.
    update public.calendar_blocks
    set status = 'cancelled'
    where task_id = v_session.task_id
      and status in ('scheduled', 'running')
      and google_event_id is null;

    if v_session.calendar_block_id is not null then
      select * into v_block
      from public.calendar_blocks
      where id = v_session.calendar_block_id;
    end if;

    update public.tasks
    set status = 'backlog'
    where id = v_session.task_id
    returning * into v_task;
  elsif v_session.task_id is not null
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
    'task', to_jsonb(v_task),
    'deduplicated', false
  );
end;
$$;
