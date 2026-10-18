-- #1089 / #1091 follow-up: a focus session that ends "Stuck" or is put off
-- on a block that is on Google Calendar.
--
-- HUMAN REVIEW REQUIRED: this replaces two transition functions that touch
-- calendar-linked state (AGENTS.md human-review list).
--
-- WHAT THE BLOCK SHOULD BE AFTER "STUCK" — AND WHY IT STAYS `scheduled`
-- --------------------------------------------------------------------
-- `record_execution_session` (20260726150000) moves the task to `blocked` on a
-- "Stuck" outcome and leaves its block alone. For a block WITHOUT a Google
-- event that is harmless: the Review choices (put off, carry forward, drop)
-- cancel it through `apply_task_review_transition`.
--
-- For a block WITH a Google event, the block is the only thing in LifeOS that
-- points at that event, and it was decided to keep it that way:
--
--   * Marking it `missed` or `cancelled` here would close the block while the
--     event is still on the person's Google Calendar. Every guard that keeps
--     the event from being orphaned reads only OPEN blocks:
--     `apply_task_review_transition` refuses to change the task only while a
--     `scheduled`/`running` Google-backed block exists, the Review sheet only
--     offers "Cancel Google event" for an open one, and
--     `record_google_calendar_placement` (20261017120000) only blocks a second
--     Google event while the first block is `scheduled`. Closing the block
--     would therefore let the task be put off, and later get a second Google
--     event, while the first event silently stays on the calendar.
--   * Changing the event itself needs explicit approval (AGENTS.md calendar
--     red line), so a session outcome can never cancel it.
--
-- So "Stuck" keeps the Google-backed block `scheduled` and linked. The task
-- is `blocked`, Review lists it with "Cancel Google event" as the way out, and
-- after that approved cancel the ordinary Review choices work. This migration
-- writes that decision down; it does not change the "Stuck" transition.
--
-- WHAT THIS MIGRATION DOES CHANGE: PUTTING IT OFF FROM THE SESSION
-- ---------------------------------------------------------------
-- The cap-DEFER path ("put off" at the end of a focus session) moved the task
-- to `backlog` with no Google check, in both the create path
-- (`record_execution_session(..., p_defer_task => true)`) and the legacy
-- row-update path (`apply_execution_session_defer`, 20260714120000). For a
-- Google-backed block that is exactly the orphaning above: the task leaves
-- the plan while its block and Google event stay. Both functions now refuse
-- it with the same message `apply_task_review_transition` raises, so the
-- client's existing `isGoogleBackedRefusal` recognises it. The refusal comes
-- before any write, so nothing is half-saved; the client records the session
-- as "Stuck" instead (see the execution-session journal handler).
--
-- Signatures, grants, SECURITY INVOKER and search_path are unchanged; RLS
-- still decides which rows the caller can see. No table or policy changes.

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

  -- Putting the task off would leave its Google event behind (see header).
  -- Refused before anything is written.
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

  -- Block and task transitions are the same ones
  -- `apply_execution_session_outcome` applies, so a session recorded through
  -- this path lands the workflow in the identical state. A "Stuck"
  -- ('blocked') outcome deliberately leaves the block as it is: a
  -- Google-backed block stays `scheduled` and linked (see header).
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

  if p_defer_task then
    -- #613's atomic cap-DEFER, preserved for the create path: the task moves
    -- to backlog in the SAME transaction as the session it came from.
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

  -- Same refusal as `record_execution_session` above.
  if exists (
    select 1
    from public.calendar_blocks
    where task_id = v_task.id
      and status in ('scheduled', 'running')
      and google_event_id is not null
  ) then
    raise exception 'Google-backed blocks require calendar approval before changing this task.';
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
