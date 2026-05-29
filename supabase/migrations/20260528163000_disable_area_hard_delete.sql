revoke delete on table public.areas from authenticated;

drop policy if exists areas_delete_own on public.areas;
