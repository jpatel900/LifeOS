import {
  CreateCaptureItemInputSchema,
  type CreateCaptureItemInput,
} from "@lifeos/schemas";
import {
  COMPOST_ELIGIBLE_SOURCE_STATUSES,
  type CompostTransitionIntent,
} from "../../compost/compostPolicy";
import { RESOLVABLE_CAPTURE_SOURCE_STATUSES } from "../../workflow/captureStatus";
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

export interface SyncJournaledCaptureInput {
  client_capture_id: string;
  area_id: string | null;
  raw_text: string;
  return_hook: string | null;
}

export interface SyncJournaledCaptureResult {
  provider: "mock" | "supabase";
  /** The account row's id, so the caller can alias the local capture to it. */
  captureId: string | null;
}

/**
 * #960 defect 3: push one journalled raw capture to the account.
 *
 * Unlike `syncQueuedCapture` (the offline-queue twin, which never stages its
 * capture into local `captureItems` and so has nothing to reconcile — see
 * `captureParse.ts`'s `enqueueOfflineCapture`), a capture reaching THIS path
 * already lives in local state. Its local row must be retired once the
 * account twin lands (`mergePersistedRows`), which needs the account id back
 * — so this deliberately DOES `.select().single()`, and deliberately does
 * NOT send `status`: an upsert that re-asserted `status: "new"` on every retry
 * could resurrect a capture the user had already triaged past `new` in the
 * gap between the account taking the row and this device's journal entry
 * being cleared. Omitting the column from the upsert body means Postgrest's
 * `ON CONFLICT DO UPDATE` never touches it — only a genuine INSERT sees the
 * table's own `default 'new'`.
 *
 * Idempotent on the same `(user_id, client_capture_id)` index `syncQueuedCapture`
 * already relies on (`capture_items_user_client_capture_id_key`) — a replay
 * that already reached the server returns the existing row rather than
 * throwing a unique violation.
 */
export async function syncJournaledCapture(
  client: MinimalSupabaseClient | null,
  input: SyncJournaledCaptureInput,
): Promise<SyncJournaledCaptureResult> {
  const clientCaptureId = input.client_capture_id?.trim();
  if (!clientCaptureId) {
    throw new Error("A journalled capture needs a client capture id.");
  }

  if (!client) return { provider: "mock", captureId: null };

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving captures to Supabase.",
  );

  const query = client.from("capture_items") as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .upsert(
      {
        user_id: user.id,
        area_id: input.area_id,
        raw_text: input.raw_text,
        return_hook: input.return_hook,
        client_capture_id: clientCaptureId,
        capture_mode: "text",
      },
      { onConflict: "user_id,client_capture_id" },
    )
    .select(captureColumns)
    .single();

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase", captureId: parseCapture(data).id };
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
 * Final UX Loop C1, Target Card 1 (audit P0#3): advance the captures a just-
 * accepted draft came from to "resolved", so the account agrees with the
 * decision the user already made.
 *
 * Before this, `persistAcceptedTaskDraft` wrote the task (carrying
 * `source_capture_item_id`) and nothing else — `capture_items.status` stayed
 * `"new"` forever, so every fresh session rehydrated the thought as
 * `Captured, not sorted yet` beside the accepted task built from it.
 *
 * Shaped exactly like `applyCompostTransitions` below: one guarded update, no
 * column but `status`, no `.eq("user_id", ...)` (RLS `capture_items_update_own`
 * is the ownership boundary, matching this file's convention), and a
 * DB-level `.in("status", ...)` guard so a late or replayed accept can never
 * drag an already-resolved, archived or composted row backwards.
 *
 * **Throws on error, deliberately.** Status truth is not degradable: unlike the
 * person-link writes in the accept path (documented as NS-INV-4 best-effort),
 * a silently dropped status write is precisely the bug this fixes. The caller
 * lets it propagate to `markPersistedSaveFailure`, which is how the house
 * surfaces a save that did not land.
 *
 * Returns the rows it actually moved — an empty array is a legitimate no-op
 * (nothing to move, or already moved), not a failure.
 */
export async function resolveCaptureItems(
  client: MinimalSupabaseClient | null,
  captureIds: readonly (string | null | undefined)[],
): Promise<CompostTransitionResult> {
  if (!client) {
    return { provider: "mock", captures: [] };
  }

  const ids = Array.from(
    new Set(
      captureIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  );

  if (ids.length === 0) {
    return { provider: "supabase", captures: [] };
  }

  await requireSupabaseUser(
    client,
    "Sign in before saving your triage decision.",
  );

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
    .update({ status: "resolved" })
    .in("id", ids)
    .in("status", RESOLVABLE_CAPTURE_SOURCE_STATUSES)
    .select(captureColumns);

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
