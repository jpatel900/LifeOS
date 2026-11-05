-- Deploy before the route. Keep the legacy claim RPC unchanged: old servers
-- do not use the dispatch fence and must never receive releasable claims.
-- Legacy refresh persists the original generation with an upsert. Once a
-- disconnect or newer OAuth callback wins, that refresh cannot reconnect it.
create function public.reject_stale_calendar_refresh() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.status = 'connected' and (
    (old.status <> 'connected' and (new.connected_at is null
        or new.connected_at is not distinct from old.connected_at
        or new.credential_verified_at is distinct from new.connected_at
        or new.credential_verified_at is not distinct from old.credential_verified_at))
    or (old.connected_at is not null and new.connected_at < old.connected_at)
  ) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  return new;
end;
$$;
create trigger reject_stale_calendar_refresh before update on public.google_calendar_connections
for each row execute function public.reject_stale_calendar_refresh();
revoke all on function public.reject_stale_calendar_refresh() from public, anon, authenticated;

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
    and e.request_summary_json->>'claim_dispatch_state' = 'reserved'
    -- Identical reads may both finish an event that already exists. Fence
    -- competing senders at dispatch; revoke other identities at reserve.
    and not (e.target_id = p_proposal_id::text
      and (e.request_summary_json->>'claim_task_id') is not distinct from p_task_id::text
      and (e.request_summary_json->>'claim_connection_id') is not distinct from p_connection_id::text
      and (e.request_summary_json->>'claim_connected_at')::timestamptz is not distinct from p_connected_at
      and (e.request_summary_json->>'calendar_id') is not distinct from p_calendar_id
      and (e.request_summary_json->>'proposed_start')::timestamptz is not distinct from p_start
      and (e.request_summary_json->>'proposed_end')::timestamptz is not distinct from p_end);
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

-- Dispatch and completion use the same current authority and target checks.
-- Take the per-owner lock first in the caller. Fail closed if a legacy writer
-- already holds a row lock in a different order.
create function public.lock_calendar_recovery_target(
  p_audit public.external_write_events, p_dispatch boolean
) returns public.time_block_proposals language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_claim jsonb := p_audit.request_summary_json;
  v_proposal public.time_block_proposals%rowtype;
  v_connection public.google_calendar_connections%rowtype;
begin
  select * into v_connection from public.google_calendar_connections
  where id = (v_claim->>'claim_connection_id')::uuid and user_id = p_audit.user_id
  for share nowait;
  if not found or v_connection.status <> 'connected'
     or nullif(trim(v_connection.encrypted_refresh_token), '') is null
     or v_connection.first_write_warning_acknowledged_at is null
     or v_connection.connected_at is null
     or v_connection.connected_at is distinct from (v_claim->>'claim_connected_at')::timestamptz
     or v_connection.credential_verified_at is distinct from v_connection.connected_at
     or v_connection.calendar_id is distinct from v_claim->>'calendar_id'
     or jsonb_typeof(v_connection.granted_scopes_json) is distinct from 'array'
     or not (v_connection.granted_scopes_json ?| array[
       'https://www.googleapis.com/auth/calendar.events.owned',
       'https://www.googleapis.com/auth/calendar.events',
       'https://www.googleapis.com/auth/calendar']) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  select * into v_proposal from public.time_block_proposals
  where id = p_audit.target_id::uuid and user_id = p_audit.user_id for update nowait;
  if not found or v_proposal.status not in ('proposed','edited','accepted')
     or not (v_claim ? 'claim_task_id')
     or v_proposal.task_id::text is distinct from v_claim->>'claim_task_id'
     or v_proposal.proposed_start is distinct from (v_claim->>'proposed_start')::timestamptz
     or v_proposal.proposed_end is distinct from (v_claim->>'proposed_end')::timestamptz
     or not exists (select 1 from public.areas where id = v_proposal.area_id and user_id = p_audit.user_id) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  if v_proposal.task_id is not null then
    perform 1 from public.tasks where id = v_proposal.task_id and user_id = p_audit.user_id
      and area_id = v_proposal.area_id and status not in ('done','dropped','archived') for update nowait;
    if not found then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
  end if;
  perform 1 from public.calendar_blocks where user_id = p_audit.user_id
    and (proposal_id = v_proposal.id or task_id = v_proposal.task_id) order by id for update nowait;
  if exists (select 1 from public.calendar_blocks b where b.user_id = p_audit.user_id and (
    (b.proposal_id = v_proposal.id and (b.status not in ('scheduled','running')
      or b.area_id is distinct from v_proposal.area_id
      or b.task_id is distinct from v_proposal.task_id
      or b.start_at is distinct from v_proposal.proposed_start
      or b.end_at is distinct from v_proposal.proposed_end
      or (p_dispatch and b.google_event_id is not null)))
    or (b.task_id = v_proposal.task_id and b.proposal_id is distinct from v_proposal.id
      and b.status in ('scheduled','running') and b.google_event_id is not null))) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  return v_proposal;
exception when lock_not_available then
  raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
end;
$$;

create function public.dispatch_google_calendar_approval(p_user_id uuid, p_audit_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_audit public.external_write_events%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || p_user_id::text, 0));
  select * into v_audit from public.external_write_events e
  where e.id = p_audit_id and e.user_id = p_user_id
    and e.provider = 'google_calendar' and e.operation = 'calendar.events.insert'
    and e.target_type = 'time_block_proposal' and e.result_status = 'pending'
    and e.request_summary_json->>'claim_protocol' = '3'
    and e.request_summary_json->>'claim_dispatch_state' = 'reserved' for update;
  if not found then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  perform public.lock_calendar_recovery_target(v_audit, true);
  update public.external_write_events e set result_status = 'failed', error_message = null,
    result_summary_json = jsonb_build_object('provider_event_created',false,'reservation_revoked',true)
  where e.user_id = p_user_id and e.id <> p_audit_id and e.provider = v_audit.provider
    and e.operation = v_audit.operation and e.target_type = v_audit.target_type and e.target_id = v_audit.target_id
    and e.result_status = 'pending' and e.request_summary_json->>'claim_protocol' = '3'
    and e.request_summary_json->>'claim_dispatch_state' = 'reserved';
  update public.external_write_events set request_summary_json =
    request_summary_json || jsonb_build_object('claim_dispatch_state', 'dispatched', 'claim_send_outstanding', true)
  where id = v_audit.id;
end;
$$;

-- Record that this worker received a definitive POST response. This does not
-- settle the audit or vouch for the subsequent event read or placement.
create function public.ack_google_calendar_dispatch(p_user_id uuid, p_audit_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('calendar-approval:' || p_user_id::text, 0));
  update public.external_write_events set request_summary_json = request_summary_json - 'claim_send_outstanding'
  where id = p_audit_id and user_id = p_user_id and provider = 'google_calendar'
    and operation = 'calendar.events.insert' and target_type = 'time_block_proposal'
    and request_summary_json->>'claim_protocol' = '3'
    and request_summary_json->>'claim_dispatch_state' = 'dispatched';
  if not found then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
end;
$$;
revoke all on function public.ack_google_calendar_dispatch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ack_google_calendar_dispatch(uuid,uuid) to service_role;

-- A generic audit completion from an older server can arrive after recovery.
create function public.preserve_calendar_recovery_result()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.provider = 'google_calendar' and old.operation = 'calendar.events.insert'
     and old.target_type = 'time_block_proposal' then
    if old.result_summary_json ? 'recovered_by_audit_id'
       or old.result_summary_json->>'reservation_revoked' = 'true' then
      -- Keep evidence immutable while allowing unrelated FK actions on area_id.
      new.result_status := old.result_status;
      new.result_summary_json := old.result_summary_json;
      new.error_message := old.error_message;
    elsif old.result_status = 'pending' and old.request_summary_json->>'claim_protocol' = '3'
       and new.result_summary_json->>'reconciled' = 'true' then
      -- Legacy status polling treats a missing or cancelled GET as definitive.
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
  end if;
  return new;
end;
$$;
create trigger preserve_calendar_recovery_result before update on public.external_write_events
for each row execute function public.preserve_calendar_recovery_result();

-- An old approval route has no dispatch callback. Refuse its claim when a
-- pending v3 attempt owns the proposal, before it can initiate a provider POST.
create function public.fence_legacy_calendar_claim() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.provider = 'google_calendar' and new.operation = 'calendar.events.insert'
     and new.target_type = 'time_block_proposal' and new.result_status = 'pending'
     then
    if exists (select 1 from public.external_write_events e
      where e.user_id = new.user_id and e.provider = new.provider and e.operation = new.operation
        and e.target_type = new.target_type and (
          (new.request_summary_json->>'claim_protocol' is distinct from '3'
            and e.target_id = new.target_id and e.result_status = 'pending'
            and e.request_summary_json->>'claim_protocol' = '3')
          or (e.target_id <> new.target_id and e.result_status = 'succeeded'
            and e.request_summary_json->>'claim_task_id' = new.request_summary_json->>'claim_task_id'
            and e.request_summary_json->>'claim_send_outstanding' = 'true'))) then
      raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
    end if;
  end if;
  return new;
end;
$$;
create trigger fence_legacy_calendar_claim before insert on public.external_write_events
for each row execute function public.fence_legacy_calendar_claim();

-- Old status polling saves any noncancelled provider event via the user's
-- placement RPC. Only the service completion path verifies the event proof.
create function public.reject_terminal_google_placement()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.google_event_id is null then return new; end if;
  if (tg_op = 'UPDATE' and old.status in ('cancelled','completed','missed'))
     or exists (select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id
       and t.status in ('done','dropped','archived')) then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  if current_user = 'authenticated' and exists (select 1 from public.external_write_events e
    where e.user_id = new.user_id and e.provider = 'google_calendar'
      and e.operation = 'calendar.events.insert' and e.target_type = 'time_block_proposal'
      and e.target_id = new.proposal_id::text and e.result_status in ('pending','succeeded')
      and e.request_summary_json->>'claim_protocol' = '3') then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  return new;
end;
$$;
create trigger reject_terminal_google_placement before insert or update of google_event_id on public.calendar_blocks
for each row execute function public.reject_terminal_google_placement();

create function public.finish_google_calendar_approval(
  p_user_id uuid, p_audit_id uuid, p_proposal_id uuid, p_connection_id uuid,
  p_connected_at timestamptz, p_calendar_id text, p_google_event_id text,
  p_start timestamptz, p_end timestamptz, p_etag text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_audit public.external_write_events%rowtype;
  v_proposal public.time_block_proposals%rowtype;
  v_block public.calendar_blocks%rowtype;
  v_task public.tasks%rowtype;
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
    for update;
  if not found then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;

  if v_audit.request_summary_json->>'claim_connection_id' is distinct from p_connection_id::text
     or (v_audit.request_summary_json->>'claim_connected_at')::timestamptz is distinct from p_connected_at
     or v_audit.request_summary_json->>'calendar_id' is distinct from p_calendar_id
     or (v_audit.request_summary_json->>'proposed_start')::timestamptz is distinct from p_start
     or (v_audit.request_summary_json->>'proposed_end')::timestamptz is distinct from p_end then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  if v_audit.result_status = 'succeeded' and v_audit.result_summary_json ? 'recovered_by_audit_id'
     and v_audit.result_summary_json->>'google_event_id' = p_google_event_id then
    -- A newer caller atomically finished this audit. Return its durable block
    -- and current task without replaying placement over subsequent user edits.
    select * into v_block from public.calendar_blocks where user_id = p_user_id
      and id = (v_audit.result_summary_json->>'calendar_block_id')::uuid and proposal_id = p_proposal_id
      and google_event_id = p_google_event_id and start_at = p_start and end_at = p_end
      and task_id::text is not distinct from v_audit.request_summary_json->>'claim_task_id';
    if not found then raise exception using errcode = 'PCA01', message = 'Calendar approval conflict'; end if;
    select * into strict v_proposal from public.time_block_proposals where id = p_proposal_id and user_id = p_user_id;
    select * into v_task from public.tasks where id = v_block.task_id and user_id = p_user_id;
    return jsonb_build_object('block', to_jsonb(v_block), 'proposal', to_jsonb(v_proposal),
      'task', case when v_task.id is null then null else to_jsonb(v_task) end, 'audit', to_jsonb(v_audit));
  end if;
  if v_audit.result_status <> 'pending' then
    raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
  end if;
  v_proposal := public.lock_calendar_recovery_target(v_audit, false);

  -- Legacy audits can finish only themselves. New attempts use a server-owned
  -- snapshot so this read cannot settle a newer, still-running request.
  v_ids := array[p_audit_id];
  if v_audit.request_summary_json->>'claim_protocol' = '3' then
    select v_ids || coalesce(array_agg(value::uuid), '{}') into v_ids
    from jsonb_array_elements_text(v_audit.request_summary_json->'claim_recovery_attempt_ids');
  end if;
  v_placement := public.record_google_calendar_placement(p_proposal_id, p_google_event_id);
  update public.external_write_events e set result_status = 'succeeded', error_message = null,
    request_summary_json = case
      when e.request_summary_json->>'claim_protocol' is distinct from '3' then
        e.request_summary_json || jsonb_build_object('claim_send_outstanding', true)
      else e.request_summary_json end,
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

revoke all on function public.lock_calendar_recovery_target(public.external_write_events,boolean) from public, anon, authenticated;
grant execute on function public.lock_calendar_recovery_target(public.external_write_events,boolean) to service_role;
revoke all on function public.fence_legacy_calendar_claim() from public, anon, authenticated;
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
