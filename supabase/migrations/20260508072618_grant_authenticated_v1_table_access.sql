grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.areas to authenticated;
grant select, insert, update, delete on table public.capture_items to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
