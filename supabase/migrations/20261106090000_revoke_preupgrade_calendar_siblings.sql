-- The predecessor accepted absence evidence while a legacy worker could still
-- send. Restoring that worker to pending blocks new reservations, but cannot
-- withdraw a sibling reservation already held by another worker.
do $upgrade$
begin
  -- Dispatch locks the existing audit before granting send authority. Order
  -- that decision against this repair, including under migration autocommit.
  lock table public.external_write_events in access exclusive mode;

  update public.external_write_events b
  set result_status = 'failed', error_message = null,
      result_summary_json = '{"provider_event_created":false,"reservation_revoked":true}'::jsonb
  where b.provider = 'google_calendar' and b.operation = 'calendar.events.insert'
    and b.target_type = 'time_block_proposal' and b.result_status = 'pending'
    and b.request_summary_json->>'claim_protocol' = '3'
    and b.request_summary_json->>'claim_dispatch_state' = 'reserved'
    and b.request_summary_json->>'claim_send_outstanding' is distinct from 'true'
    and exists (
      select 1 from public.external_write_events a
      left join public.time_block_proposals p on p.user_id = a.user_id and p.id::text = a.target_id
      where a.user_id = b.user_id and a.provider = b.provider and a.operation = b.operation
        and a.target_type = b.target_type and a.target_id <> b.target_id
        and a.request_summary_json->>'claim_protocol' is distinct from '3'
        and (a.result_status = 'pending' or
          (a.result_status = 'succeeded' and a.request_summary_json->>'claim_send_outstanding' = 'true'))
        -- Use the same task identity as claim_google_calendar_approval. Only
        -- an absent snapshot falls back to the proposal; explicit null stays null.
        and (case when a.request_summary_json ? 'claim_task_id'
             then a.request_summary_json->>'claim_task_id' else p.task_id::text end)
            = b.request_summary_json->>'claim_task_id'
    );
end;
$upgrade$;
