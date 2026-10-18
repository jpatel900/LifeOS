-- #1096: what a focus-session outcome does to its calendar block.
-- Follow-up to #1094 (20261018120000). Owner decision 2026-10-18: design A.
--
-- HUMAN REVIEW REQUIRED: this replaces three transition functions that touch
-- calendar-linked state (AGENTS.md human-review list).
--
-- GAP 1 — SKIPPED, MISSED AND PARTIAL ON A GOOGLE-BACKED BLOCK (DESIGN A)
-- ----------------------------------------------------------------------
-- 20261018120000 decided that "Stuck" keeps a block that is on Google
-- Calendar `scheduled` and linked, because every guard that keeps a Google
-- event from being orphaned reads only OPEN (`scheduled`/`running`) blocks:
-- `apply_task_review_transition` refuses put off, carry forward and drop,
-- Review offers "Cancel Google event", and `record_google_calendar_placement`
-- refuses a second event, all only while such a block is open.
--
-- Skipped (the device's "missed" is recorded as `skipped`) and partial used to
-- mark the block `missed` with no Google check. That closed the only LifeOS
-- row pointing at the event, so the task could then be put off and given a
-- second Google event while the first stayed on the calendar. Design A applies
-- the "Stuck" rule to these outcomes too:
--
--   * Google-backed block that is still open: it stays (or goes back to)
--     `scheduled`, with its `google_event_id`. The task is not changed.
--     Review lists it with "Cancel Google event" as the way out; after that
--     approved cancel the ordinary Review choices work again. The cost: a
--     block whose time has passed still reads as scheduled until then.
--   * Google-backed block that is already closed (for example cancelled
--     through Google approval): left exactly as it is.
--   * Ordinary block (no Google event): `missed`, as before.
--
-- `partial` now closes the block the same way `skipped` does. Before, the
-- device marked it `missed` while the account left it alone, so the two
-- disagreed after the next sync. `completed` is unchanged.
--
-- The device reducer (`markCurrentSession`, apps/web/src/lib/workflow/
-- execution.ts) applies the identical rule, so device and account land in
-- the same state.
--
-- GAP 2 — PUTTING A TASK OFF FROM A SESSION CANCELS ITS ORDINARY BLOCKS
-- ---------------------------------------------------------------------
-- On the device, a session put-off cancels the task's open blocks
-- (`deferTask`). On the account, both put-off paths only moved the task to
-- `backlog`, so its block stayed `scheduled` and came back on the next sync.
-- Both `record_execution_session(..., p_defer_task => true)` and
-- `apply_execution_session_defer` now cancel the task's open ordinary blocks
-- in the same transaction as the move to `backlog`, the same update
-- `apply_task_review_transition` makes. Google-backed open blocks never reach
-- this point: the put-off is refused for them first (20261018120000,
-- unchanged).
--
-- Not changed: the Google event itself (it only changes through an approved
-- Review step), the "Stuck" transition, the replay short-circuit, and the
-- ownership checks.
--
-- Signatures, defaults, grants, SECURITY INVOKER and search_path are
-- unchanged (`create or replace` keeps the existing grants); RLS still
-- decides which rows the caller can see. No table or policy changes.

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

  -- Gap 2 (see header): the task's open ordinary blocks are cancelled in the
  -- same transaction as its move to backlog.
  update public.calendar_blocks
  set status = 'cancelled'
  where task_id = p_task_id
    and status in ('scheduled', 'running')
    and google_event_id is null;

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

  -- Same block transition as `record_execution_session` (see header, gap 1).
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
