-- #737 — Final UX Loop C1, Target Card 1 (session truth).
--
-- HUMAN REVIEW REQUIRED: this adds a transition function and a column, in the
-- class AGENTS.md names (transition functions, schema changes).
--
-- WHAT PROBLEM THIS SOLVES
-- ------------------------
-- `start_execution_session` (20260630180000) inserts an `execution_sessions`
-- row the MOMENT a focus session starts, and because `outcome` is `not null`
-- with a six-value CHECK and none of them mean "no verdict yet", it had to
-- pick one. It picked `'partial'`.
--
-- The consequence is audit finding P0#1
-- (`docs/design/ux-audit-2026-07-26-fable.md`): a user who starts a session
-- and does not finish it has a `partial` on their record that they never
-- chose. Worse, `sessionStatusFromOutcome`
-- (`apps/web/src/lib/data/workflowPersistedNormalization.ts`) reads
-- `outcome:'partial' + actual_minutes:null` back as status `"running"`, so an
-- abandoned start is ALSO a phantom running session forever, holding a WIP
-- slot and skewing every review and health count built on this table.
--
-- Target Card 1 states the rule this migration implements: "a focus session
-- ALWAYS produces exactly one truthful record: user-chosen outcome only,
-- never a silent 'partial', never nothing."
--
-- THE MODEL
-- ---------
-- Nothing is written when a session STARTS. A running session has no outcome,
-- so it is device state (`apps/web/src/lib/execute/runningSession.ts`), not a
-- row. The row is created ONCE, when the user picks an outcome in the end
-- sheet, and it carries exactly that outcome.
--
-- `apply_execution_session_outcome` and `apply_execution_session_defer` are
-- left in place and unchanged: they still serve any session that already has
-- a row (rows written before this migration, and the legacy cockpit's
-- start-then-mark path). This function is the create-with-outcome sibling
-- they had no equivalent for, not a replacement.
--
-- WHY THE DEFER FLAG LIVES HERE INSTEAD OF A SECOND FUNCTION
-- ----------------------------------------------------------
-- #613 made cap-DEFER atomic on purpose: the session outcome and the task
-- deferral commit together or not at all, because the prior two-call split
-- could commit the session while the deferral failed. Creating the session
-- here and deferring the task in a separate call would reintroduce exactly
-- that split. `p_defer_task` keeps both inside one transaction, mirroring
-- `apply_execution_session_defer`'s guarantee for the create path.
--
-- IDEMPOTENCY
-- -----------
-- The client journals the outcome to IndexedDB before any network call
-- (#737-A slice 2's pending-writes journal) and replays it until the account
-- confirms. A replay can therefore run more than once for the same logical
-- write — two tabs, a reconnect racing a mount, a response lost after the row
-- landed. `client_write_id` makes the second attempt a no-op that returns the
-- row the first attempt created.
--
-- WHY A PLAIN UNIQUE INDEX AND NOT A PARTIAL ONE
-- -----------------------------------------------
-- Same rule, same reason, as `20260726120000_add_win_review_client_write_id.sql`
-- and `20260726130000_fix_capture_client_capture_id_index.sql`: a partial
-- unique index cannot serve as an ON CONFLICT arbiter unless the statement
-- proves the predicate, and `on conflict (user_id, client_write_id)` below
-- carries no such proof. NULLs are DISTINCT by default, so every row written
-- before this slice — and every row written by `start_execution_session` —
-- keeps a NULL key and is free to repeat. `NULLS NOT DISTINCT` is
-- deliberately NOT used: it would collide every pre-existing session.
--
-- Additive and nullable throughout: no existing column is altered or renamed,
-- and the `outcome` CHECK is untouched — the device's "no verdict yet" state
-- never reaches this table.
--
-- No new grants: `20260508194709_grant_authenticated_execution_review_access.sql`
-- already grants select/insert/update/delete on `execution_sessions` to
-- `authenticated`, and table-level privileges extend to columns added later.
-- RLS policies are column-agnostic (`auth.uid() = user_id`) and are left
-- untouched. SECURITY INVOKER, matching every other transition function in
-- this schema, so RLS still decides what the caller may touch.

alter table public.execution_sessions
  add column client_write_id text;

create unique index execution_sessions_user_client_write_id_key
  on public.execution_sessions (user_id, client_write_id);

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
  -- this path lands the workflow in the identical state.
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

revoke all on function public.record_execution_session(
  uuid, uuid, text, integer, integer, integer, integer, text, text, text, boolean
) from public;
revoke all on function public.record_execution_session(
  uuid, uuid, text, integer, integer, integer, integer, text, text, text, boolean
) from anon;
grant execute on function public.record_execution_session(
  uuid, uuid, text, integer, integer, integer, integer, text, text, text, boolean
) to authenticated;
