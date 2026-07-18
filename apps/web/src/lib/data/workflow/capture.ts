import {
  CreateCaptureItemInputSchema,
  type CreateCaptureItemInput,
} from "@lifeos/schemas";
import {
  COMPOST_ELIGIBLE_SOURCE_STATUSES,
  type CompostTransitionIntent,
} from "../../compost/compostPolicy";
import {
  type CaptureCreateResult,
  type CaptureListResult,
  type CompostTransitionResult,
  type MinimalSupabaseClient,
  captureColumns,
  getSupabaseMessage,
  mockUserId,
  parseCapture,
  parseCaptures,
  requireSupabaseUser,
} from "./shared";

export async function createCaptureItem(
  client: MinimalSupabaseClient | null,
  input: CreateCaptureItemInput,
): Promise<CaptureCreateResult> {
  const parsedInput = CreateCaptureItemInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      capture: parseCapture({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        raw_text: parsedInput.raw_text,
        raw_audio_ref: null,
        return_hook: parsedInput.return_hook ?? null,
        client_capture_id: parsedInput.client_capture_id ?? null,
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving captures to Supabase.",
  );

  const query = client.from("capture_items") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      user_id: user.id,
      area_id: parsedInput.area_id,
      raw_text: parsedInput.raw_text,
      return_hook: parsedInput.return_hook ?? null,
      client_capture_id: parsedInput.client_capture_id ?? null,
      capture_mode: "text",
      status: "new",
    })
    .select(captureColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    capture: parseCapture(data),
  };
}

export interface SyncQueuedCaptureInput {
  raw_text: string;
  area_id: string | null;
  return_hook: string | null;
  client_capture_id: string;
}

/**
 * FR-027 (F-G1a): push one offline-queued raw capture to the spine on reconnect.
 * Idempotent by construction — an upsert on the `(user_id, client_capture_id)`
 * unique index with `ignoreDuplicates`, so a replayed sync (the queue drained
 * twice, or a capture that already reached the server before) is a no-op rather
 * than a duplicate row or a thrown unique-violation. Returns mock when Supabase
 * is unconfigured (the queue simply stays local until sign-in).
 */
export async function syncQueuedCapture(
  client: MinimalSupabaseClient | null,
  input: SyncQueuedCaptureInput,
): Promise<{ provider: "mock" | "supabase" }> {
  if (!client) return { provider: "mock" };

  const user = await requireSupabaseUser(
    client,
    "Sign in to sync offline captures.",
  );

  const query = client.from("capture_items") as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => PromiseLike<{ error: unknown }>;
  };

  const { error } = await query.upsert(
    {
      user_id: user.id,
      area_id: input.area_id,
      raw_text: input.raw_text,
      return_hook: input.return_hook,
      client_capture_id: input.client_capture_id,
      capture_mode: "text",
      status: "new",
    },
    { onConflict: "user_id,client_capture_id", ignoreDuplicates: true },
  );

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase" };
}

export async function listCaptureItems(
  client: MinimalSupabaseClient | null,
): Promise<CaptureListResult> {
  if (!client) {
    return { provider: "mock", captures: [] };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading captures from Supabase.",
  );

  const query = client.from("capture_items") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data, error } = await query
    .select(captureColumns)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    captures: parseCaptures(data),
  };
}

/**
 * FR-036 slice 2 (#659): apply `selectCompostTransitionIntents` output (the
 * #616 deterministic eligibility core) as one atomic, guarded write. Only
 * captures that are BOTH named in `intents` AND currently sitting in
 * `COMPOST_ELIGIBLE_SOURCE_STATUSES` are moved to "composted" — the second
 * `.in("status", ...)` below is a DB-level guard against a stale or
 * malformed intent re-touching a row that already moved on (composted,
 * resolved, archived, or anything else). Never deletes, never writes any
 * column other than status, never trusts the intent's status literal into
 * the query. RLS (`capture_items_update_own`) is the ownership boundary;
 * this function does not add its own `.eq("user_id", ...)`, matching the
 * existing convention in this file.
 */
export async function applyCompostTransitions(
  client: MinimalSupabaseClient | null,
  intents: readonly CompostTransitionIntent[],
): Promise<CompostTransitionResult> {
  const captureIds = Array.from(
    new Set(
      intents
        .filter((intent) => intent.status === "composted")
        .map((intent) => intent.captureId),
    ),
  );

  if (!client) {
    return { provider: "mock", captures: [] };
  }

  if (captureIds.length === 0) {
    return { provider: "supabase", captures: [] };
  }

  await requireSupabaseUser(client, "Sign in before composting captures.");

  const query = client.from("capture_items") as {
    update: (row: Record<string, unknown>) => {
      in: (
        column: string,
        values: string[],
      ) => {
        in: (
          column: string,
          values: readonly string[],
        ) => {
          select: (
            columns: string,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({ status: "composted" })
    .in("id", captureIds)
    .in("status", COMPOST_ELIGIBLE_SOURCE_STATUSES)
    .select(captureColumns);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    captures: parseCaptures(data),
  };
}
