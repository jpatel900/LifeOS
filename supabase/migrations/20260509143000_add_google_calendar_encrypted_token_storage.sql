alter table public.google_calendar_connections
add column encrypted_access_token text,
add column encrypted_refresh_token text,
add column token_expires_at timestamptz,
add column token_type text,
add constraint google_calendar_connections_encrypted_access_token_not_blank check (
  encrypted_access_token is null or length(btrim(encrypted_access_token)) > 0
),
add constraint google_calendar_connections_encrypted_refresh_token_not_blank check (
  encrypted_refresh_token is null or length(btrim(encrypted_refresh_token)) > 0
),
add constraint google_calendar_connections_token_type_not_blank check (
  token_type is null or length(btrim(token_type)) > 0
);

update public.google_calendar_connections
set
  status = 'metadata_only',
  connected_at = null
where status = 'connected'
  and encrypted_refresh_token is null;
