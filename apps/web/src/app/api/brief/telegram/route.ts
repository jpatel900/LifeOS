import { NextResponse } from "next/server";
import { requireSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadOwnerWorkflowState } from "@/lib/data/workflowServerLoad";
import { buildStartVM } from "@/app/components/moments/momentsViewModel";
import { formatClock } from "@/app/components/moments/formatTime";
import {
  composeTelegramBrief,
  sendTelegramBrief,
  type TelegramBriefInput,
} from "@/lib/brief/telegram";

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

function alwaysOkFalse(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 200 });
}

/**
 * FR-046 slice 2 — outbound Telegram daily brief trigger.
 *
 * Vercel Cron Jobs always invoke via GET and automatically send
 * `Authorization: Bearer ${CRON_SECRET}` when the `CRON_SECRET` project env
 * var exists (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs) —
 * there is no way to configure Vercel to POST a cron invocation. The prior
 * slice built this as `POST`; that was never reachable by the actual
 * `vercel.json` cron trigger, so this slice moves the handler to `GET`.
 *
 * Gate order is load-bearing:
 * 1. Inert gate FIRST: if TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, or
 *    OWNER_USER_ID is absent, the feature does not run, log, or have any
 *    side effect (FR-046 "wholly inert" acceptance criterion) — checked
 *    before trigger auth so an unconfigured deployment never even evaluates
 *    CRON_SECRET. OWNER_USER_ID joins the trio per the owner's #515 decision:
 *    the route resolves "the owner" via this env var (read at request time,
 *    passed explicitly to service-role-scoped readers) rather than inventing
 *    a session-derived resolution path a tokenless cron trigger cannot have.
 * 2. Trigger auth: requires `Authorization: Bearer ${CRON_SECRET}`. An unset
 *    CRON_SECRET always 401s — the endpoint is never open by omission.
 * 3. Assembly/derivation/send: load the owner's persisted rows
 *    (service-role, explicitly scoped to OWNER_USER_ID — see
 *    `workflowServerLoad.ts`), rebuild the pure `WorkflowState`, run the
 *    existing pure view-model builders, compose the brief text, and send it.
 *    Every failure past the gates is caught and reported as `200
 *    {ok:false}` — this endpoint must never throw past the gates, and must
 *    never leak the bot token into logs or responses.
 */
export async function GET(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const ownerUserId = process.env.OWNER_USER_ID;

  if (!botToken || !chatId || !ownerUserId) {
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

  try {
    const client = requireSupabaseServiceRoleClient();
    const state = await loadOwnerWorkflowState(client, ownerUserId);
    const now = new Date();
    const vm = buildStartVM(state, { now });

    const briefInput: TelegramBriefInput = {
      greeting: vm.greeting,
      daySynthesis: vm.daySynthesis,
      firstMoveTitle: vm.firstMove?.title ?? null,
      todayBlocks: vm.blocks.map((block) => ({
        title: block.title,
        startLabel: formatClock(block.startAt),
      })),
      waitingOn: vm.waitingOn.map((entry) => ({
        title: entry.title,
        daysWaiting: entry.daysWaiting,
      })),
    };

    const text = composeTelegramBrief(briefInput);
    const result = await sendTelegramBrief(text, { botToken, chatId });

    if (!result.ok) {
      console.error("brief/telegram: send failed.", { error: result.error });
      return alwaysOkFalse(result.error ?? "Telegram send failed.");
    }

    return NextResponse.json({ ok: true, error: null }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("brief/telegram: brief assembly failed.", {
      error: message,
    });
    return alwaysOkFalse("Telegram brief could not be assembled.");
  }
}
