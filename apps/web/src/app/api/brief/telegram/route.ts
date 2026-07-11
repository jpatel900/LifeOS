import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value?.trim()) {
    return null;
  }

  return value.trim();
}

/**
 * FR-046 slice 2 — outbound Telegram daily brief trigger.
 *
 * Gate order is load-bearing:
 * 1. Inert gate FIRST: if either Telegram secret is absent, the feature does
 *    not run, log, or have any side effect (FR-046 "wholly inert" acceptance
 *    criterion) — checked before trigger auth so an unconfigured deployment
 *    never even evaluates CRON_SECRET.
 * 2. Trigger auth: requires `Authorization: Bearer ${CRON_SECRET}`. An unset
 *    CRON_SECRET always 401s — the endpoint is never open by omission.
 *
 * Assembly/derivation/send (owner payload load, WorkflowState rebuild,
 * buildStartVM/buildGreeting/buildDaySynthesis, compose + send) is NOT
 * implemented in this slice. See the issue #515 completion report: there is
 * no established mechanism in this codebase to resolve "the owner" user id
 * from a tokenless cron trigger. Every existing service-role read pairs
 * `requireSupabaseServiceRoleClient()` with a user id obtained from
 * `requireSupabaseServerUser(accessToken)` — i.e. a caller-supplied Supabase
 * access token. A CRON_SECRET-authenticated request has no such token, and
 * inventing a resolver (env-configured owner id, `auth.admin.listUsers()`,
 * etc.) is a new service-role-usage pattern that AGENTS.md reserves for
 * human review. This is flagged as an OWNER-GATE, not built.
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return new Response(null, { status: 204 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedToken = readBearerToken(request);

  if (!cronSecret || !providedToken || providedToken !== cronSecret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  // OWNER-GATE: owner-user resolution for a tokenless trigger is undecided;
  // see the module doc comment above. Fail safe rather than invent a
  // mechanism — never throw past the gates (FR-046 failure-isolation
  // criterion).
  console.error(
    "brief/telegram: owner resolution is not implemented (OWNER-GATE); no brief was sent.",
  );

  return NextResponse.json(
    {
      ok: false,
      error: "Telegram brief owner resolution is not configured.",
    },
    { status: 200 },
  );
}
