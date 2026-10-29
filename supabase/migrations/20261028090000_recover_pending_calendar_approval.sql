-- Deploy before the route. Keep the legacy claim RPC unchanged: old servers
-- do not use the dispatch fence and must never receive releasable claims.
create function public.reserve_google_calendar_approval(
  p_user_id uuid, p_proposal_id uuid, p_task_id uuid,
  p_start timestamptz, p_end timestamptz, p_connection_id uuid,
  p_connected_at timestamptz, p_calendar_id text, p_request_summary jsonb,
  p_absent_attempt_ids uuid[] default '{}'
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_predecessors jsonb;
begin
  if p_user_id is null then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || p_user_id::text, 0));

  -- A paused worker must win dispatch's CAS before POST. These revocations
  -- roll back if the replacement claim fails any of the existing checks.
  update public.external_write_events e
  set result_status = 'failed', error_message = null,
      result_summary_json = jsonb_build_object(
        'provider_event_created', false, 'reservation_revoked', true)
  where e.user_id = p_user_id and e.provider = 'google_calendar'
    and e.operation = 'calendar.events.insert' and e.target_type = 'time_block_proposal'
    and e.result_status = 'pending'
    and (e.target_id = p_proposal_id::text or
      (p_task_id is not null and e.request_summary_json->>'claim_task_id' = p_task_id::text))
    and e.request_summary_json->>'claim_protocol' = '3'
    and e.request_summary_json->>'claim_dispatch_state' = 'reserved';
  -- No origin match is needed for this proof: revoking the unsent state
  -- prevents its old worker from dispatching even after a reconnect.

  select coalesce(jsonb_agg(e.id order by e.id), '[]'::jsonb) into v_predecessors
  from public.external_write_events e
  where e.user_id = p_user_id and e.provider = 'google_calendar'
    and e.operation = 'calendar.events.insert' and e.target_type = 'time_block_proposal'
    and e.target_id = p_proposal_id::text and e.result_status = 'pending'
    and e.request_summary_json ? 'claim_task_id'
    and (e.request_summary_json->>'claim_task_id') is not distinct from p_task_id::text
    and e.request_summary_json->>'claim_connection_id' = p_connection_id::text
    and (e.request_summary_json->>'claim_connected_at')::timestamptz = p_connected_at
    and e.request_summary_json->>'calendar_id' = p_calendar_id
    and (e.request_summary_json->>'proposed_start')::timestamptz = p_start
    and (e.request_summary_json->>'proposed_end')::timestamptz = p_end;

  return public.claim_google_calendar_approval(
    p_user_id, p_proposal_id, p_task_id, p_start, p_end, p_connection_id,
    p_connected_at, p_calendar_id,
    coalesce(p_request_summary, '{}') || jsonb_build_object(
      'claim_protocol', 3, 'claim_dispatch_state', 'reserved',
      'claim_recovery_attempt_ids', v_predecessors), p_absent_attempt_ids);
end;
$$;

create function public.dispatch_google_calendar_approval(p_user_id uuid, p_audit_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_user_id is null then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || p_user_id::text, 0));
  update public.external_write_events e set request_summary_json =
    e.request_summary_json || jsonb_build_object('claim_dispatch_state', 'dispatched')
  where e.id = p_audit_id and e.user_id = p_user_id
    and e.provider = 'google_calendar' and e.operation = 'calendar.events.insert'
    and e.target_type = 'time_block_proposal' and e.result_status = 'pending'
    and e.request_summary_json->>'claim_protocol' = '3'
    and e.request_summary_json->>'claim_dispatch_state' = 'reserved';
  if not found then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
end;
$$;

-- A generic audit completion from an older server can arrive after recovery.
create function public.preserve_calendar_recovery_result()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.provider = 'google_calendar' and old.operation = 'calendar.events.insert'
     and (old.result_summary_json ? 'recovered_by_audit_id'
       or old.result_summary_json->>'reservation_revoked' = 'true') then
    return old;
  end if;
  return new;
end;
$$;
create trigger preserve_calendar_recovery_result before update on public.external_write_events
for each row execute function public.preserve_calendar_recovery_result();

-- Fence the placement RPC still used by old deployed servers. Its UPDATE
-- fires even for the same event ID, before it can reschedule the task.
create function public.reject_terminal_google_placement()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.status in ('cancelled','completed','missed') and new.google_event_id is not null then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  return new;
end;
$$;
create trigger reject_terminal_google_placement before update of google_event_id on public.calendar_blocks
for each row execute function public.reject_terminal_google_placement();

create function public.finish_google_calendar_approval(
  p_user_id uuid, p_audit_id uuid, p_proposal_id uuid, p_connection_id uuid,
  p_connected_at timestamptz, p_calendar_id text, p_google_event_id text,
  p_start timestamptz, p_end timestamptz, p_etag text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_audit public.external_write_events%rowtype;
  v_proposal public.time_block_proposals%rowtype;
  v_connection public.google_calendar_connections%rowtype;
  v_placement jsonb;
  v_ids uuid[];
begin
  if p_user_id is null or p_google_event_id is distinct from 'lifeos' || replace(p_proposal_id::text, '-', '')
     or p_etag is null or length(trim(p_etag)) = 0 then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || p_user_id::text, 0));
  select * into v_audit from public.external_write_events e
  where e.id = p_audit_id and e.user_id = p_user_id
    and e.provider = 'google_calendar' and e.operation = 'calendar.events.insert'
    and e.target_type = 'time_block_proposal' and e.target_id = p_proposal_id::text
    and e.result_status = 'pending' for update;
  if not found then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  -- Old placement transactions can hold these rows before the advisory lock.
  -- Never wait for their rows while holding that lock.
  begin
    select * into v_connection from public.google_calendar_connections
    where id = p_connection_id and user_id = p_user_id for share nowait;
    if not found or v_connection.status <> 'connected'
       or v_connection.encrypted_refresh_token is null
       or v_connection.first_write_warning_acknowledged_at is null
       or p_connected_at is null or v_connection.connected_at is distinct from p_connected_at
       or v_connection.credential_verified_at is distinct from p_connected_at
       or v_connection.calendar_id is distinct from p_calendar_id then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
    select * into v_proposal from public.time_block_proposals
    where id = p_proposal_id and user_id = p_user_id for update nowait;
    if not found or v_proposal.status not in ('proposed','edited','accepted')
       or v_proposal.proposed_start is distinct from p_start or v_proposal.proposed_end is distinct from p_end
       or not (v_audit.request_summary_json ? 'claim_task_id')
       or (v_audit.request_summary_json->>'claim_task_id') is distinct from v_proposal.task_id::text
       or (v_audit.request_summary_json->>'claim_connection_id') is distinct from p_connection_id::text
       or (v_audit.request_summary_json->>'claim_connected_at')::timestamptz is distinct from p_connected_at
       or (v_audit.request_summary_json->>'calendar_id') is distinct from p_calendar_id
       or (v_audit.request_summary_json->>'proposed_start')::timestamptz is distinct from p_start
       or (v_audit.request_summary_json->>'proposed_end')::timestamptz is distinct from p_end
       or not exists (select 1 from public.areas where id = v_proposal.area_id and user_id = p_user_id) then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
    if v_proposal.task_id is not null then
      perform 1 from public.tasks where id = v_proposal.task_id and user_id = p_user_id
        and status not in ('done','dropped','archived') for update nowait;
      if not found then
        raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
      end if;
    end if;
    perform 1 from public.calendar_blocks where user_id = p_user_id
      and (proposal_id = p_proposal_id or task_id = v_proposal.task_id) order by id for update nowait;
  exception when lock_not_available then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end;
  if exists (select 1 from public.calendar_blocks where user_id = p_user_id
    and ((proposal_id = p_proposal_id and status in ('cancelled','completed','missed'))
      or (task_id = v_proposal.task_id and proposal_id is distinct from p_proposal_id
        and status in ('scheduled','running') and google_event_id is not null))) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  -- Legacy audits can finish only themselves. New attempts use a server-owned
  -- snapshot so this read cannot settle a newer, still-running request.
  v_ids := array[p_audit_id];
  if v_audit.request_summary_json->>'claim_protocol' = '3' then
    select v_ids || coalesce(array_agg(value::uuid), '{}') into v_ids
    from jsonb_array_elements_text(v_audit.request_summary_json->'claim_recovery_attempt_ids');
  end if;
  v_placement := public.record_google_calendar_placement(p_proposal_id, p_google_event_id);
  update public.external_write_events e set result_status = 'succeeded', error_message = null,
    result_summary_json = jsonb_build_object('google_event_id', p_google_event_id,
      'calendar_block_id', v_placement->'block'->>'id', 'provider_event_created', true,
      'recovered_by_audit_id', p_audit_id, 'provider_etag', p_etag)
  where e.id = any(v_ids) and e.user_id = p_user_id and e.result_status = 'pending'
    and e.provider = 'google_calendar' and e.operation = 'calendar.events.insert'
    and e.target_type = 'time_block_proposal' and e.target_id = p_proposal_id::text
    and e.request_summary_json ? 'claim_task_id'
    and (e.request_summary_json->>'claim_task_id') is not distinct from v_proposal.task_id::text
    and e.request_summary_json->>'claim_connection_id' = p_connection_id::text
    and (e.request_summary_json->>'claim_connected_at')::timestamptz = p_connected_at
    and e.request_summary_json->>'calendar_id' = p_calendar_id
    and (e.request_summary_json->>'proposed_start')::timestamptz = p_start
    and (e.request_summary_json->>'proposed_end')::timestamptz = p_end;
  select * into v_audit from public.external_write_events where id = p_audit_id and user_id = p_user_id;
  if v_audit.result_status <> 'succeeded' then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  return v_placement || jsonb_build_object('audit', to_jsonb(v_audit));
end;
$$;

revoke all on function public.reserve_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb,uuid[]) from public, anon, authenticated;
revoke all on function public.dispatch_google_calendar_approval(uuid,uuid) from public, anon, authenticated;
revoke all on function public.finish_google_calendar_approval(uuid,uuid,uuid,uuid,timestamptz,text,text,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke all on function public.preserve_calendar_recovery_result() from public, anon, authenticated;
revoke all on function public.reject_terminal_google_placement() from public, anon, authenticated;
grant execute on function public.reserve_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb,uuid[]) to service_role;
grant execute on function public.dispatch_google_calendar_approval(uuid,uuid) to service_role;
grant execute on function public.finish_google_calendar_approval(uuid,uuid,uuid,uuid,timestamptz,text,text,timestamptz,timestamptz,text) to service_role;
grant update (request_summary_json) on public.external_write_events to service_role;
grant insert, update (google_event_id) on public.calendar_blocks to service_role;
grant update (status) on public.time_block_proposals, public.tasks to service_role;
