-- Calendar hunt #1 (2026-10-17): an approved Google Calendar event is a
-- PLACEMENT, and must land in the account with the same semantics as
-- `place_time_block` -- in one transaction.
--
-- Before this, `/api/google-calendar/create-event` stored the block and
-- accepted the proposal as two separate writes and never touched the task or
-- the task's other proposals. After the post-approval sync the task read back
-- as `active`, the Google-backed block dropped out of the plan view, "Cancel
-- Google event" became unreachable, and approving a sibling proposal created
-- a SECOND Google event for the same task.
--
-- This function records the account half of an already-approved, already-
-- inserted Google event:
--   * refuses when the task already has a scheduled, Google-backed block
--     from another proposal (a duplicate event for one task);
--   * stores the block for the proposal (new, or the proposal's existing
--     local-only block gains its google_event_id);
--   * accepts the proposal;
--   * supersedes every other still-pending proposal for the task (#580);
--   * sets the task to `scheduled`.
--
-- No new grants: authenticated already has select/insert/update on the three
-- tables, and their RLS policies (`auth.uid() = user_id`) bound every row
-- touched here. SECURITY INVOKER, like `place_time_block`, so RLS applies.

create or replace function public.record_google_calendar_placement(
  p_proposal_id uuid,
  p_google_event_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proposal public.time_block_proposals;
  v_task public.tasks;
  v_block public.calendar_blocks;
  v_other public.calendar_blocks;
begin
  if p_google_event_id is null or length(trim(p_google_event_id)) = 0 then
    raise exception 'A Google Calendar placement needs a google event id.';
  end if;

  select * into v_proposal
  from public.time_block_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'Planning proposal was not found.';
  end if;

  if v_proposal.status not in ('proposed', 'edited', 'accepted') then
    raise exception 'Only proposed, edited, or accepted proposals can be placed on Google Calendar.';
  end if;

  if v_proposal.task_id is not null then
    select * into v_task
    from public.tasks
    where id = v_proposal.task_id
    for update;

    if not found then
      raise exception 'Planning task was not found.';
    end if;

    select * into v_other
    from public.calendar_blocks
    where task_id = v_proposal.task_id
      and proposal_id is distinct from v_proposal.id
      and status = 'scheduled'
      and google_event_id is not null
    limit 1;

    if found then
      raise exception 'This task already has a Google Calendar event. Duplicate event creation is blocked.';
    end if;
  end if;

  select * into v_block
  from public.calendar_blocks
  where proposal_id = v_proposal.id
  for update;

  if found then
    if v_block.google_event_id is not null
       and v_block.google_event_id <> p_google_event_id then
      raise exception 'This proposal already has a Google Calendar event. Duplicate event creation is blocked.';
    end if;

    update public.calendar_blocks
    set google_event_id = p_google_event_id
    where id = v_block.id
    returning * into v_block;
  else
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
      p_google_event_id,
      v_proposal.proposed_start,
      v_proposal.proposed_end,
      'scheduled'
    )
    returning * into v_block;
  end if;

  if v_proposal.status <> 'accepted' then
    update public.time_block_proposals
    set status = 'accepted'
    where id = v_proposal.id
    returning * into v_proposal;
  end if;

  if v_proposal.task_id is not null then
    update public.time_block_proposals
    set status = 'superseded'
    where task_id = v_proposal.task_id
      and id <> v_proposal.id
      and status in ('proposed', 'edited');

    update public.tasks
    set status = 'scheduled'
    where id = v_proposal.task_id
    returning * into v_task;
  end if;

  return jsonb_build_object(
    'proposal', to_jsonb(v_proposal),
    'block', to_jsonb(v_block),
    'task', case when v_proposal.task_id is null then null else to_jsonb(v_task) end
  );
end;
$$;
