-- A legacy worker may POST after a poller observes an absent event. Only the
-- sender can report a definitive rejection; a negative GET cannot release B.
-- A direct legacy claim reads before it inserts. Serialize its reads as well
-- as poller writes with the correction. One DO statement keeps the lock and
-- both changes atomic, including when a migration runner uses autocommit.
do $upgrade$
begin
  lock table public.external_write_events in access exclusive mode;

  create or replace function public.preserve_calendar_recovery_result()
  returns trigger language plpgsql security invoker set search_path = public, pg_temp as $guard$
  begin
    if old.provider = 'google_calendar' and old.operation = 'calendar.events.insert'
       and old.target_type = 'time_block_proposal' then
      if old.result_summary_json ? 'recovered_by_audit_id'
         or old.result_summary_json->>'reservation_revoked' = 'true' then
        new.result_status := old.result_status;
        new.result_summary_json := old.result_summary_json;
        new.error_message := old.error_message;
      elsif old.result_status = 'pending' and new.result_summary_json->>'reconciled' = 'true'
         and (old.request_summary_json->>'claim_protocol' = '3'
           or (new.result_status = 'failed' and new.result_summary_json->>'provider_event_created' is null)) then
        raise exception using errcode = 'PCA01', message = 'Calendar approval conflict';
      end if;
    end if;
    return new;
  end;
  $guard$;

  -- Restore the exact legacy absence signature to the existing pending path.
  -- Keep the poller's observation for audit. A later confirmed result or a
  -- same-proposal recovery can finish the row through the normal write path.
  update public.external_write_events
  set result_status = 'pending', error_message = null
  where provider = 'google_calendar' and operation = 'calendar.events.insert'
    and target_type = 'time_block_proposal' and result_status = 'failed'
    and request_summary_json->>'claim_protocol' is distinct from '3'
    and result_summary_json @> '{"reconciled":true,"google_event_id_stored":false,"provider_event_id_present":false}'
    and result_summary_json->>'provider_event_created' is null
    and not (result_summary_json ? 'recovered_by_audit_id')
    and result_summary_json->>'reservation_revoked' is distinct from 'true';
end;
$upgrade$;
