-- W7-2: acknowledge concurrent placement replays after the task lock.
--
-- HUMAN REVIEW REQUIRED: replaces a transactional transition function.
-- Two calls with the same task and client write id can both miss the early
-- replay lookup. After waiting for the first call to commit, the second must
-- check again before inserting a proposal, or it fails on the unique key.
-- The post-lock statement gets a fresh READ COMMITTED snapshot.
--
-- Keep the early replay path: saved placements still replay successfully when
-- the caller's task/proposal arguments no longer resolve. Signature, invoker
-- security, search_path, existing grants, RLS and all other behavior stay as
-- in 20260727130000. No table, index or policy changes.
-- Database execution and concurrency proof belong to CI's database lane.

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

  -- A concurrent call may have committed this key while we waited for the
  -- task lock. Re-read before either proposal path makes a write.
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
