-- FR-027 (F-G1a) capture ubiquity: the offline raw-capture queue tags each
-- queued capture with a client-generated id so a reconnect-triggered sync is
-- idempotent (a replayed insert dedupes instead of creating a duplicate row).
-- Additive, nullable; the partial unique index dedupes only real ids per user
-- (existing NULL rows never conflict). DATA_MODEL §4.14.
alter table public.capture_items
  add column client_capture_id text;

create unique index capture_items_user_client_capture_id_key
  on public.capture_items (user_id, client_capture_id)
  where client_capture_id is not null;
