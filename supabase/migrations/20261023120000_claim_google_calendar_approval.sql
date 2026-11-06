-- The provider call occurs outside PostgreSQL. A transaction lock alone cannot
-- protect it: commit a durable winner in the existing server-owned audit first.
-- Every retry has its own audit, but only the original proposal/event ID wins.
-- Neither a failed audit nor elapsed time releases a possibly completed write.
create or replace function public.claim_google_calendar_approval(
  p_user_id uuid,
  p_proposal_id uuid,
  p_task_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_connection_id uuid,
  p_connected_at timestamptz,
  p_calendar_id text,
  p_request_summary jsonb,
  -- Sibling proposals whose events the route just confirmed are gone from
  -- Google (404 or cancelled). Only finished attempts can be released.
  p_absent_proposal_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_proposal public.time_block_proposals%rowtype;
  v_connection public.google_calendar_connections%rowtype;
  v_audit public.external_write_events%rowtype;
  v_prior record;
  v_scope text;
  v_same_connection boolean;
  v_blockers text[] := '{}';
begin
  if p_user_id is null then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  -- Serialize only short database work, never the HTTP call. This same key is
  -- used by the proposal identity trigger below. Do not lock a sibling proposal
  -- here: placement locks winner -> task -> siblings, which would deadlock.
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || p_user_id::text, 0));

  select * into v_proposal from public.time_block_proposals
    where id = p_proposal_id and user_id = p_user_id;
  if not found or v_proposal.task_id is distinct from p_task_id
     or v_proposal.proposed_start is distinct from p_start
     or v_proposal.proposed_end is distinct from p_end
     or v_proposal.status not in ('proposed','edited','accepted') then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  if not exists (select 1 from public.areas where id = v_proposal.area_id and user_id = p_user_id)
     or (p_task_id is not null and not exists (
       select 1 from public.tasks where id = p_task_id and user_id = p_user_id
     )) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  select * into v_connection from public.google_calendar_connections
    where id = p_connection_id and user_id = p_user_id;
  if not found or v_connection.status <> 'connected'
     or v_connection.encrypted_refresh_token is null
     or v_connection.first_write_warning_acknowledged_at is null
     or p_connected_at is null
     or v_connection.connected_at is distinct from p_connected_at
     or v_connection.calendar_id is distinct from p_calendar_id then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  if exists (
    select 1 from public.calendar_blocks b
    where b.user_id = p_user_id and b.google_event_id is not null
      and (b.proposal_id = p_proposal_id
        -- Same rule as the route precheck: only an OPEN Google-backed block
        -- reserves its task. A completed or missed one does not.
        or (b.task_id = p_task_id and b.status in ('scheduled', 'running')))
  ) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  for v_prior in
    select e.*, p.task_id as legacy_task_id, p.id as existing_proposal_id
    from public.external_write_events e
    left join public.time_block_proposals p
      on p.id::text = e.target_id and p.user_id = e.user_id
    where e.user_id = p_user_id and e.provider = 'google_calendar'
      and e.operation = 'calendar.events.insert' and e.target_type = 'time_block_proposal'
  loop
    -- A definitive Google refusal (recorded by the route) proves no event
    -- exists, so that attempt reserves nothing.
    if v_prior.result_status = 'failed'
       and v_prior.result_summary_json->>'provider_event_created' = 'false' then
      continue;
    end if;
    -- Explicit JSON null is a taskless scope, not missing legacy metadata.
    -- New claims survive proposal deletion/reassignment. A legacy attempt
    -- whose proposal was deleted has no recoverable task, so it reserves no
    -- other proposal (it used to block every task-bound approval).
    v_scope := case when v_prior.request_summary_json ? 'claim_task_id'
      then v_prior.request_summary_json->>'claim_task_id'
      else v_prior.legacy_task_id::text end;
    if v_prior.target_id is distinct from p_proposal_id::text
       and (p_task_id is null or v_scope is distinct from p_task_id::text) then
      continue;
    end if;

    v_same_connection := v_prior.request_summary_json->>'calendar_id' = p_calendar_id
      and case when v_prior.request_summary_json ? 'claim_connection_id' then
        v_prior.request_summary_json->>'claim_connection_id' = p_connection_id::text
        and (v_prior.request_summary_json->>'claim_connected_at')::timestamptz = p_connected_at
      else
        -- A legacy attempt predating the current OAuth generation cannot be
        -- assumed to belong to this account, even if both use "primary".
        p_connected_at <= v_prior.created_at
      end;

    if v_same_connection and exists (
      select 1 from public.calendar_blocks b
      join public.external_write_events d on d.user_id = b.user_id
        and d.target_type = 'calendar_block' and d.target_id = b.id::text
      where b.user_id = p_user_id and b.status = 'cancelled'
        and b.google_event_id = 'lifeos' || replace(v_prior.target_id, '-', '')
        and d.provider = 'google_calendar' and d.operation = 'calendar.events.delete'
        and d.result_status = 'succeeded' and d.created_at > v_prior.created_at
        and d.request_summary_json->>'google_event_id' = b.google_event_id
        and d.request_summary_json->>'calendar_id' = p_calendar_id
    ) then
      -- A cancelled event ID is terminal. A fresh sibling may win, but the
      -- old proposal must never reuse its cancelled provider ID.
      if v_prior.target_id = p_proposal_id::text then
        raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
      end if;
      continue;
    end if;

    -- The prior event already ran its course (completed or missed block).
    -- It no longer competes with a new time for the same task.
    if v_prior.target_id is distinct from p_proposal_id::text and exists (
      select 1 from public.calendar_blocks b
      where b.user_id = p_user_id
        and b.google_event_id = 'lifeos' || replace(v_prior.target_id, '-', '')
        and b.status in ('completed', 'missed')
    ) then
      continue;
    end if;

    -- A sibling's finished attempt can be checked against Google. The route
    -- reads that sibling's deterministic event id on the current calendar and
    -- vouches for it here only when Google says it is gone or cancelled. A
    -- pending attempt may still be in flight, so it is never checkable.
    if v_prior.target_id is distinct from p_proposal_id::text
       and v_prior.result_status <> 'pending' then
      if v_prior.target_id = any(coalesce(p_absent_proposal_ids, '{}')::text[]) then
        continue;
      end if;
      v_blockers := array_append(v_blockers, v_prior.target_id);
      continue;
    end if;

    if v_prior.target_id is distinct from p_proposal_id::text
       or v_scope is distinct from p_task_id::text
       or v_same_connection is distinct from true
       or (v_prior.request_summary_json->>'proposed_start')::timestamptz is distinct from p_start
       or (v_prior.request_summary_json->>'proposed_end')::timestamptz is distinct from p_end then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
  end loop;

  if coalesce(array_length(v_blockers, 1), 0) > 0 then
    -- Machine-readable for the route: the sibling proposal ids to check.
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict',
      detail = 'checkable:' || array_to_string(v_blockers, ',');
  end if;

  insert into public.external_write_events (
    user_id, area_id, provider, operation, target_type, target_id,
    request_summary_json, result_summary_json, result_status, error_message, created_at
  ) values (
    p_user_id, v_proposal.area_id, 'google_calendar', 'calendar.events.insert',
    'time_block_proposal', p_proposal_id::text,
    coalesce(p_request_summary, '{}'::jsonb) || jsonb_build_object(
      'claim_task_id', p_task_id, 'claim_connection_id', p_connection_id,
      'claim_connected_at', p_connected_at, 'calendar_id', p_calendar_id,
      'proposal_id', p_proposal_id, 'proposed_start', p_start, 'proposed_end', p_end
    ), '{}', 'pending', null, clock_timestamp()
  ) returning * into v_audit;
  return to_jsonb(v_audit);
end;
$$;

revoke all on function public.claim_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.claim_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb,uuid[]) to service_role;
-- The claim runs as service_role (SECURITY INVOKER). This project grants
-- service_role table access explicitly, per table (see
-- 20260509231500_harden_google_calendar_security.sql). A service-key client
-- in the real-schema CI run hit "permission denied for table
-- time_block_proposals". Grant the read-only minimum the claim needs, so it
-- never depends on platform default privileges. Idempotent if already held.
grant select on table public.time_block_proposals, public.areas, public.tasks,
  public.calendar_blocks to service_role;

-- Freeze an approved provider identity while HTTP is in flight and afterward.
-- A changed time needs a fresh proposal after confirmed cancellation. Status
-- changes still work. Cascading task deletion may detach a proposal, but its
-- immutable audit remains and prevents retrying it under a different scope.
create or replace function public.guard_google_calendar_approval_identity()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if (new.id,new.user_id,new.task_id,new.proposed_start,new.proposed_end)
     is not distinct from (old.id,old.user_id,old.task_id,old.proposed_start,old.proposed_end) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || old.user_id::text, 0));
  if new.task_id is null and old.task_id is not null
     and (new.id,new.user_id,new.proposed_start,new.proposed_end)
       is not distinct from (old.id,old.user_id,old.proposed_start,old.proposed_end)
     and not exists (select 1 from public.tasks where id = old.task_id and user_id = old.user_id) then
    return new;
  end if;
  if exists (
    select 1 from public.external_write_events
    where user_id = old.user_id and target_id = old.id::text
      and provider = 'google_calendar' and operation = 'calendar.events.insert'
      and target_type = 'time_block_proposal'
      -- A proven-not-created attempt left nothing on Google to keep in sync.
      and not (result_status = 'failed'
        and coalesce(result_summary_json->>'provider_event_created', '') = 'false')
  ) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval identity cannot change';
  end if;
  return new;
end;
$$;

create trigger time_block_proposals_guard_google_approval_identity
before update of id, user_id, task_id, proposed_start, proposed_end on public.time_block_proposals
for each row execute function public.guard_google_calendar_approval_identity();
