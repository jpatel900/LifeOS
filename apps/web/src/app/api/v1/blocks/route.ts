import { NextResponse } from "next/server";
import { z } from "zod";
import { listExecutionReviewItems } from "@/lib/data/workflow";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

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

const WindowSchema = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })
  .refine((window) => Date.parse(window.start) < Date.parse(window.end), {
    message: "start must be before end.",
  });

/**
 * ADR 0006: versioned read contract for headless clients (#642). Returns the
 * caller's calendar blocks overlapping [start, end) plus the tasks those
 * blocks link to, through the same data-layer read the web execution surface
 * uses (`listExecutionReviewItems`) on a user-scoped client.
 *
 * The window is REQUIRED and caller-supplied: the server never derives
 * "today" from its own clock or invents day/timezone semantics — day
 * authority stays client-side, exactly where the web app holds it. The range
 * narrowing below is transport-level filtering of an already-authorized read,
 * not a business rule.
 */
export async function GET(request: Request) {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sign in before listing blocks." },
      { status: 401 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const parsedWindow = WindowSchema.safeParse({
    start: searchParams.get("start"),
    end: searchParams.get("end"),
  });

  if (!parsedWindow.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "start and end are required ISO 8601 datetimes (with offset), start < end.",
      },
      { status: 400 },
    );
  }

  const windowStart = Date.parse(parsedWindow.data.start);
  const windowEnd = Date.parse(parsedWindow.data.end);

  try {
    const { client } = await requireSupabaseServerUser(accessToken);
    const { provider, blocks, tasks } = await listExecutionReviewItems(client);

    const windowBlocks = blocks.filter(
      (block) =>
        Date.parse(block.start_at) < windowEnd &&
        Date.parse(block.end_at) > windowStart,
    );
    const linkedTaskIds = new Set(
      windowBlocks
        .map((block) => block.task_id)
        .filter((taskId): taskId is string => taskId !== null),
    );
    const linkedTasks = tasks.filter((task) => linkedTaskIds.has(task.id));

    return NextResponse.json(
      {
        ok: true,
        api_version: "1",
        provider,
        data: {
          window: {
            start: parsedWindow.data.start,
            end: parsedWindow.data.end,
          },
          blocks: windowBlocks,
          tasks: linkedTasks,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Block list failed.";
    const status = /sign in/i.test(message) ? 401 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
