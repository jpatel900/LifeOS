-- #743: capture and persist the sanitized reason a Google Calendar OAuth
-- connect/refresh attempt failed, so the owner can see WHY instead of a
-- generic "connecting failed" message. Never holds tokens, the client
-- secret, or the authorization code -- only Google's own error code,
-- Google's own human-readable description, the HTTP status, and a
-- timestamp. Written by the callback route and by the shared
-- access-token-refresh helper; cleared on a successful connect/refresh.
alter table public.google_calendar_connections
add column last_error_json jsonb;

-- Same narrow, additive column-grant pattern as the rest of this table's
-- authenticated-role exposure (see 20260509231500_harden_google_calendar_security.sql):
-- the authenticated role gets read-only access to this one column so the
-- settings panel can show it; all writes still go through service_role only.
grant select (last_error_json) on table public.google_calendar_connections to authenticated;
