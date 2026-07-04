alter table public.suggestion_records
  add column if not exists resolution_reason text,
  add column if not exists decided_by text not null default 'user';

alter table public.override_records
  add column if not exists suggestion_id uuid;

alter table public.suggestion_records
  alter column schema_version set default 'meta-learning-event-v2';

alter table public.override_records
  alter column schema_version set default 'meta-learning-event-v2';

alter table public.suggestion_records
  drop constraint if exists suggestion_records_schema_version_check;

alter table public.override_records
  drop constraint if exists override_records_schema_version_check;

alter table public.suggestion_records
  add constraint suggestion_records_schema_version_check check (schema_version in ('meta-learning-event-v1','meta-learning-event-v2')),
  add constraint suggestion_records_resolution_reason_not_blank check (resolution_reason is null or length(btrim(resolution_reason)) > 0),
  add constraint suggestion_records_decided_by_check check (decided_by in ('user','system'));

alter table public.override_records
  add constraint override_records_schema_version_check check (schema_version in ('meta-learning-event-v1','meta-learning-event-v2')),
  add constraint override_records_suggestion_fk foreign key (suggestion_id, user_id) references public.suggestion_records (id, user_id) on delete set null;
