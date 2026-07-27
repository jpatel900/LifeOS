-- #737 — Final UX Loop C1, Target Card 1, slice S3 (plans + triage drafts).
--
-- HUMAN REVIEW REQUIRED: this adds a transition function and two columns, in
-- the class AGENTS.md names (transition functions, schema changes).
--
-- WHAT PROBLEM THIS SOLVES
-- ------------------------
-- The #737-A slice 1 inventory (PR #750) found four write families whose only
-- home is the reducer's per-tab `sessionStorage` mirror:
--
--   row 9  accepted / rejected / edited time-block proposal
--   row 10 plan (task planned at hour)
--   row 6  draft edit / split / merge / reject
--   row 7  project-draft accept / reject
--
-- Rows 9 and 10 are the same user-visible thing -- a block on the day -- and
-- row 6's edits become permanent the moment the draft is ACCEPTED. Slice S3
-- makes those two device-durable by journalling them to IndexedDB before any
-- network call and replaying the journal to the account. A replay can run more
-- than once for the same logical write (two tabs, a reconnect racing a mount,
-- a response lost after the row landed), so both need a server-side
-- idempotency key or every replay would create a duplicate row.
--
-- WHY PLACEMENT NEEDS A NEW FUNCTION RATHER THAN THE EXISTING ONE
-- ---------------------------------------------------------------
-- `accept_time_block_proposal` (20260630180000) cannot be replayed. It raises
-- 'Only proposed or edited proposals can be accepted.' on the second call, so
-- a journalled placement whose response was lost would throw forever, and the
-- journal treats a throw as "keep it queued". The entry would retry on every
-- mount and every reconnect for the rest of the account's life. That function
-- is left in place and unchanged -- it still serves the legacy cockpit path
-- that accepts a proposal the server already holds.
--
-- `place_time_block` is the replayable sibling. It is deliberately ONE
-- transaction covering what the client used to do in two round trips
-- (`createTimeBlockProposal` then `accept_time_block_proposal`), which also
-- ends the half-landed state where a proposal row existed but no block did.
--
-- WHY IT TAKES AN OPTIONAL p_proposal_id
-- ---------------------------------------
-- The two placement paths differ in whether a server proposal already exists.
-- `planTaskAtHour` mints a fresh local proposal, so there is none. But
-- `acceptLocalProposal` accepts a proposal the account may ALREADY hold
-- (`persistedProposalIdByLocalIdRef`), and a function that always inserted
-- would leave two proposal rows for one logical block. So the function
-- branches, and either way it stamps `client_write_id` onto whichever
-- proposal row it ends with -- the replay short-circuit then finds it no
-- matter which path created it. Shipping the column with one placement path
-- un-stamped would leave exactly one silent duplicate-producing route.
--
-- WHY A PLAIN UNIQUE INDEX AND NOT A PARTIAL ONE
-- -----------------------------------------------
-- Same rule, same reason, as `20260726120000_add_win_review_client_write_id.sql`,
-- `20260726130000_fix_capture_client_capture_id_index.sql`, and
-- `20260726150000_add_execution_session_record_transition.sql`: `ON CONFLICT
-- (a, b)` infers its arbiter index from the column list and will only consider
-- a PARTIAL index when the statement itself proves the predicate. PostgREST /
-- supabase-js `onConflict` sends column names and nothing else, so it can
-- never satisfy that proof and Postgres refuses the statement outright with
-- 42P10. NULLs are DISTINCT by default, so every row written before this slice
-- -- and every row written by a path that does not journal -- keeps a NULL key
-- and is free to repeat. `NULLS NOT DISTINCT` is deliberately NOT used: it
-- would collide every pre-existing task and proposal.
--
-- Additive and nullable throughout: no existing column is altered or renamed,
-- and no CHECK constraint is touched.
--
-- No new grants: `20260506214500_enable_v1_rls_policies.sql` and the later
-- grant migrations already give `authenticated` select/insert/update/delete on
-- `tasks`, `time_block_proposals`, and `calendar_blocks`, and table-level
-- privileges extend to columns added later. RLS policies are column-agnostic
-- (`auth.uid() = user_id`) and are left untouched. SECURITY INVOKER, matching
-- every other transition function in this schema, so RLS still decides what
-- the caller may touch.

alter table public.tasks
  add column client_write_id text;

create unique index tasks_user_client_write_id_key
  on public.tasks (user_id, client_write_id);

alter table public.time_block_proposals
  add column client_write_id text;

create unique index time_block_proposals_user_client_write_id_key
  on public.time_block_proposals (user_id, client_write_id);

create or replace function public.place_time_block(
  p_task_id uuid,
  p_proposal_id uuid,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_rationale text,
  p_client_write_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_proposal public.time_block_proposals;
  v_existing public.time_block_proposals;
  v_block public.calendar_blocks;
begin
  if p_client_write_id is null or length(trim(p_client_write_id)) = 0 then
    raise exception 'A placed time block needs a client write id.';
  end if;

  -- Replay short-circuit. Checked BEFORE any write so a second attempt does no
  -- work at all, and returns what the first attempt actually created rather
  -- than a fresh row.
  select * into v_existing
  from public.time_block_proposals
  where user_id = auth.uid()
    and client_write_id = p_client_write_id;

  if found then
    select * into v_block
    from public.calendar_blocks
    where proposal_id = v_existing.id;

    return jsonb_build_object(
      'proposal', to_jsonb(v_existing),
      'block', to_jsonb(v_block),
      'task', null,
      'deduplicated', true
    );
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Planning task was not found.';
  end if;

  if p_proposal_id is not null then
    select * into v_proposal
    from public.time_block_proposals
    where id = p_proposal_id
    for update;

    if not found then
      raise exception 'Planning proposal was not found.';
    end if;

    if v_proposal.task_id is distinct from v_task.id then
      raise exception 'Selected proposal does not belong to this task.';
    end if;

    -- TERMINAL SUCCESS, NOT A FAILURE. An already-accepted proposal that
    -- carries a block is a placement that landed -- by an earlier replay whose
    -- response was lost, or by the legacy accept path. Raising here (which is
    -- what `accept_time_block_proposal` does) would wedge the journal entry
    -- into retrying forever against work that is already done, so this reports
    -- it as a dedupe instead. Only an accepted proposal with NO block is a
    -- genuine inconsistency worth refusing.
    if v_proposal.status = 'accepted' then
      select * into v_block
      from public.calendar_blocks
      where proposal_id = v_proposal.id;

      if found then
        return jsonb_build_object(
          'proposal', to_jsonb(v_proposal),
          'block', to_jsonb(v_block),
          'task', null,
          'deduplicated', true
        );
      end if;
    end if;

    if v_proposal.status not in ('proposed', 'edited') then
      raise exception 'Only proposed or edited proposals can be placed.';
    end if;

    -- The journalled start/end are what the USER saw when they placed it, so
    -- they win over whatever the row happens to hold.
    update public.time_block_proposals
    set status = 'accepted',
        proposed_start = p_proposed_start,
        proposed_end = p_proposed_end,
        client_write_id = p_client_write_id
    where id = p_proposal_id
    returning * into v_proposal;
  else
    insert into public.time_block_proposals (
      user_id,
      area_id,
      task_id,
      proposed_start,
      proposed_end,
      rationale_json,
      conflict_flag,
      conflict_details_json,
      status,
      client_write_id
    )
    values (
      v_task.user_id,
      v_task.area_id,
      v_task.id,
      p_proposed_start,
      p_proposed_end,
      jsonb_build_object('note', p_rationale),
      false,
      null,
      'accepted',
      p_client_write_id
    )
    returning * into v_proposal;
  end if;

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

  -- #580 (one planning model -- placement wins): every still-pending proposal
  -- for this task becomes `superseded` so a later `syncPersistedWorkflowRows`
  -- cannot resurrect a pending proposal for a task that just received a block.
  -- Inside the transaction here, where the client used to do it as a separate
  -- best-effort call after the accept RPC.
  update public.time_block_proposals
  set status = 'superseded'
  where task_id = v_task.id
    and id <> v_proposal.id
    and status in ('proposed', 'edited');

  update public.tasks
  set status = 'scheduled'
  where id = v_task.id
  returning * into v_task;

  return jsonb_build_object(
    'proposal', to_jsonb(v_proposal),
    'block', to_jsonb(v_block),
    'task', to_jsonb(v_task),
    'deduplicated', false
  );
end;
$$;
