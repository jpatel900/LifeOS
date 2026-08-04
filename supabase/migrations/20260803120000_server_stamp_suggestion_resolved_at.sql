-- Fix 23514: server-stamp suggestion_records.resolved_at on insert, the same
-- way migration 20260704160000 already server-stamps created_at (KNOWN_ISSUES
-- row 14 / issue #341's "client clocks cannot be trusted for row timestamps"
-- invariant).
--
-- Every fire-and-forget write that records an ALREADY-resolved suggestion
-- (recordWipEnforcementEvent, recordRejectedTaskDraft, recordReEntryDeferral,
-- recordPolicyProposalDecision, recordDurationRecalibrationDecision,
-- recordPersonLinkRejection — apps/web/src/lib/data/workflow/metaLearning.ts)
-- stamps `resolved_at` with the BROWSER's clock in the same INSERT payload
-- that carries `created_at`. Migration 20260704160000 forces created_at to
-- the server's now() for anon/authenticated callers, but that override always
-- lands strictly after the browser captured its own `resolved_at` (network
-- round-trip + trigger execution happen after the client timestamp is read).
-- The result: `resolved_at >= created_at` (suggestion_records_resolved_after_
-- created_check, migration 20260506213000) fails on every single-insert
-- already-resolved suggestion — a 400/23514 that the app's calm meta-learning
-- failure handler silently swallows, quietly losing audit rows in production.
--
-- Fix: extend the same server-authority principle to resolved_at. When an
-- INSERT from anon/authenticated carries a non-null resolved_at, force it to
-- the server's now() as well. Postgres's now() is stable for the whole
-- transaction, so this trigger and the existing
-- suggestion_records_set_server_created_at trigger (still firing
-- independently — this migration does not touch it) both write the exact
-- same instant for a single-row insert, making resolved_at = created_at and
-- always satisfying the >= check. A row created already-resolved (status
-- accepted/rejected/ignored/expired at birth) keeps that semantic — this only
-- replaces the untrustworthy browser clock with the trustworthy server clock,
-- exactly like created_at.
--
-- The two-phase write path (insert pending, later `update ... set resolved_at`
-- once a decision is made — apps/web/src/lib/data/workflow/taskMap.ts
-- updateSuggestionRecordStatus) is untouched by this migration. It is not
-- affected by the round-trip-lag asymmetry this migration addresses (the
-- row's created_at is already fixed in the past by the INSERT's own server
-- stamp before that UPDATE is even issued). It is NOT proven safe against a
-- client clock running behind the server (clock skew, as opposed to
-- round-trip lag, could still send a resolved_at earlier than created_at) —
-- that is a different failure mode, out of this fix's scope, and is flagged
-- as a follow-up in the PR rather than fixed here with a BEFORE UPDATE
-- trigger this contract did not ask for.
--
-- No other table carries this same class of bug: override_records has no
-- resolved_at (or any sibling resolved-state timestamp) column, and
-- health_incidents.closed_at is written only via service_role (bypasses the
-- anon/authenticated check entirely, by the same design migration
-- 20260704160000 already documents for provenance timestamps).

create or replace function public.set_server_resolved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and new.resolved_at is not null then
    new.resolved_at = now();
  end if;
  return new;
end;
$$;

create trigger suggestion_records_set_server_resolved_at
before insert on public.suggestion_records
for each row execute function public.set_server_resolved_at();
