-- Bind a provider absence read to immutable finished attempts and their origin.
-- Replacing the argument name intentionally rejects callers using the old,
-- proposal-wide voucher. Deploy this additive migration before the route.
-- Old callbacks could combine tokens from different accounts. Existing
-- generations remain unverified until a callback receives a fresh pair.
alter table public.google_calendar_connections
  add column if not exists credential_verified_at timestamptz;
-- Token metadata remains service-only, like the encrypted token columns.
revoke select (credential_verified_at), insert (credential_verified_at),
  update (credential_verified_at) on public.google_calendar_connections from anon, authenticated;
drop function public.claim_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb,uuid[]);

create function public.claim_google_calendar_approval(
  p_user_id uuid,
  p_proposal_id uuid,
  p_task_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_connection_id uuid,
  p_connected_at timestamptz,
  p_calendar_id text,
  p_request_summary jsonb,
  p_absent_attempt_ids uuid[] default '{}'
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
  v_block record;
  v_scope text;
  v_same_connection boolean;
  v_blockers jsonb := '[]';
  v_absent_proposals text[] := '{}';
  v_locked_blocks uuid[] := '{}';
begin
  if p_user_id is null then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
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
     or v_connection.credential_verified_at is distinct from p_connected_at
     or v_connection.calendar_id is distinct from p_calendar_id then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  -- Placement locks proposal -> task -> blocks. Never wait for its block
  -- while holding the approval advisory lock: the identity trigger also uses
  -- that lock. NOWAIT fails closed, and the transaction releases all locks.
  begin
    for v_block in select b.id from public.calendar_blocks b
      where b.user_id = p_user_id and b.google_event_id is not null
        and (b.proposal_id = p_proposal_id
          or (b.task_id = p_task_id and b.status in ('scheduled','running')))
      order by b.id for update nowait
    loop
      v_locked_blocks := array_append(v_locked_blocks, v_block.id);
    end loop;
  exception when lock_not_available then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end;
  if exists (select 1 from public.calendar_blocks b
    where b.user_id = p_user_id and b.proposal_id = p_proposal_id
      and b.google_event_id is not null) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  for v_prior in
    select e.*, p.task_id as legacy_task_id
    from public.external_write_events e
    left join public.time_block_proposals p
      on p.id::text = e.target_id and p.user_id = e.user_id
    where e.user_id = p_user_id and e.provider = 'google_calendar'
      and e.operation = 'calendar.events.insert' and e.target_type = 'time_block_proposal'
    order by e.id
  loop
    if v_prior.result_status = 'failed'
       and v_prior.result_summary_json->>'provider_event_created' = 'false' then
      continue;
    end if;
    v_scope := case when v_prior.request_summary_json ? 'claim_task_id'
      then v_prior.request_summary_json->>'claim_task_id'
      else v_prior.legacy_task_id::text end;
    if v_prior.target_id is distinct from p_proposal_id::text
       and (p_task_id is null or v_scope is distinct from p_task_id::text) then
      continue;
    end if;

    -- No provider subject is stored. Only an exact connection generation
    -- proves the origin; legacy metadata or a reconnect cannot prove absence.
    v_same_connection :=
      v_prior.request_summary_json->>'calendar_id' = p_calendar_id
      and v_prior.request_summary_json->>'claim_connection_id' = p_connection_id::text
      and (v_prior.request_summary_json->>'claim_connected_at')::timestamptz = p_connected_at;

    if v_prior.target_id = p_proposal_id::text then
      if v_scope is distinct from p_task_id::text
         or v_same_connection is distinct from true
         or (v_prior.request_summary_json->>'proposed_start')::timestamptz is distinct from p_start
         or (v_prior.request_summary_json->>'proposed_end')::timestamptz is distinct from p_end then
        raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
      end if;
      -- Retrying the identical proposal uses its deterministic provider ID.
      continue;
    end if;

    -- No deletion, terminal block or absence voucher releases an in-flight
    -- insert. A delete can finish before the insert creates its event.
    if v_prior.result_status = 'pending' then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
    if exists (select 1 from public.calendar_blocks b
      where b.user_id = p_user_id
        and b.google_event_id = 'lifeos' || replace(v_prior.target_id, '-', '')
        and b.status in ('completed','missed')) then
      continue;
    end if;
    if v_same_connection is distinct from true then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;

    if v_prior.id = any(coalesce(p_absent_attempt_ids, '{}')) then
      v_absent_proposals := array_append(v_absent_proposals, v_prior.target_id);
    else
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'auditId', v_prior.id, 'proposalId', v_prior.target_id,
        'connectionId', p_connection_id, 'connectedAt', p_connected_at,
        'calendarId', p_calendar_id
      ));
    end if;
  end loop;

  -- Every open block must have an origin-proven attempt for this exact event.
  -- Unknown/legacy identities stay reserved. Do not clear unrelated blocks.
  for v_block in select * from public.calendar_blocks b
    where b.user_id = p_user_id and b.task_id = p_task_id
      and b.google_event_id is not null and b.status in ('scheduled','running')
  loop
    if not (v_block.id = any(v_locked_blocks)) then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
    if not exists (select 1 from public.external_write_events e
      where e.user_id = p_user_id and e.provider = 'google_calendar'
        and e.operation = 'calendar.events.insert' and e.target_type = 'time_block_proposal'
        and e.target_id = v_block.proposal_id::text
        and e.request_summary_json->>'claim_task_id' = p_task_id::text
        and e.request_summary_json->>'claim_connection_id' = p_connection_id::text
        and (e.request_summary_json->>'claim_connected_at')::timestamptz = p_connected_at
        and e.request_summary_json->>'calendar_id' = p_calendar_id
        and e.result_status <> 'pending'
        and v_block.google_event_id = 'lifeos' || replace(e.target_id, '-', '')
        and not (e.result_status = 'failed'
          and coalesce(e.result_summary_json->>'provider_event_created','') = 'false')
    ) then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
  end loop;

  if jsonb_array_length(v_blockers) > 0 then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict',
      detail = 'checkable-v2:' || v_blockers::text;
  end if;

  -- Same transaction as the replacement audit: any later error rolls back
  -- these retirements. Keep provider IDs for audit and same-proposal guards.
  update public.calendar_blocks b set status = 'cancelled'
    where b.user_id = p_user_id and b.task_id = p_task_id
      and b.id = any(v_locked_blocks)
      and b.status in ('scheduled','running')
      and b.proposal_id::text = any(v_absent_proposals)
      and b.google_event_id = 'lifeos' || replace(b.proposal_id::text, '-', '');
  if exists (select 1 from public.calendar_blocks b
    where b.user_id = p_user_id and b.task_id = p_task_id
      and b.google_event_id is not null and b.status in ('scheduled','running')) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
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
grant update (status) on public.calendar_blocks to service_role;
