alter table public.suggestion_records
  add column if not exists policy_identifier text not null default 'legacy.unspecified',
  add column if not exists schema_version text not null default 'meta-learning-event-v1';

alter table public.override_records
  add column if not exists policy_identifier text not null default 'legacy.unspecified',
  add column if not exists schema_version text not null default 'meta-learning-event-v1';

alter table public.suggestion_records
  add constraint suggestion_records_policy_identifier_not_blank check (length(btrim(policy_identifier)) > 0),
  add constraint suggestion_records_schema_version_check check (schema_version = 'meta-learning-event-v1');

alter table public.override_records
  add constraint override_records_policy_identifier_not_blank check (length(btrim(policy_identifier)) > 0),
  add constraint override_records_schema_version_check check (schema_version = 'meta-learning-event-v1');

create index if not exists suggestion_records_user_policy_idx on public.suggestion_records (user_id, policy_identifier);
create index if not exists override_records_user_policy_idx on public.override_records (user_id, policy_identifier);
