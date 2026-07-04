-- LLM call tracing (issue #288): one metadata-only trace row per AI call.
-- Privacy doctrine: NO raw prompt or response bodies in this table — raw
-- content stays in the existing capture tables. Additive-only.
create table public.ai_call_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  surface text not null,
  prompt_version text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer not null,
  validation_outcome text not null,
  created_at timestamptz not null default now(),
  constraint ai_call_traces_surface_not_blank check (length(btrim(surface)) > 0),
  constraint ai_call_traces_prompt_version_not_blank check (length(btrim(prompt_version)) > 0),
  constraint ai_call_traces_model_not_blank check (length(btrim(model)) > 0),
  constraint ai_call_traces_input_tokens_nonnegative check (input_tokens is null or input_tokens >= 0),
  constraint ai_call_traces_output_tokens_nonnegative check (output_tokens is null or output_tokens >= 0),
  constraint ai_call_traces_latency_ms_nonnegative check (latency_ms >= 0),
  constraint ai_call_traces_validation_outcome_check check (validation_outcome in ('passed', 'schema_failed', 'retried', 'failed'))
);

create index ai_call_traces_user_id_idx on public.ai_call_traces (user_id);
create index ai_call_traces_user_surface_created_at_idx on public.ai_call_traces (user_id, surface, created_at desc);

alter table public.ai_call_traces enable row level security;

create policy ai_call_traces_select_own on public.ai_call_traces for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_call_traces_insert_own on public.ai_call_traces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ai_call_traces_update_own on public.ai_call_traces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_call_traces_delete_own on public.ai_call_traces for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.ai_call_traces to authenticated;
