alter table public.calendar_blocks
add constraint calendar_blocks_proposal_id_key unique (proposal_id);

revoke select, insert, update, delete on table public.google_calendar_connections from authenticated;
grant select (
  id,
  user_id,
  provider,
  calendar_id,
  granted_scopes_json,
  status,
  first_write_warning_acknowledged_at,
  connected_at,
  disconnected_at,
  created_at,
  updated_at
) on table public.google_calendar_connections to authenticated;
grant select, insert, update, delete on table public.google_calendar_connections to service_role;

revoke insert, update, delete on table public.external_write_events from authenticated;
grant select on table public.external_write_events to authenticated;
grant select, insert, update, delete on table public.external_write_events to service_role;
