import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  findOrCreatePerson,
  resolveCaptureItems,
  syncQueuedCapture,
  type MinimalSupabaseClient,
} from "@/lib/data/workflow";

const runLocalRlsTests = process.env.RUN_SUPABASE_RLS_TESTS === "1";
// QA doctrine #269: deliberate local RLS opt-in gate; default runs skip until RUN_SUPABASE_RLS_TESTS=1 provides local Supabase proof.
const describeLocalRls = runLocalRlsTests ? describe : describe.skip;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:15431";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const userA = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user_a@example.test",
  password: "password123",
  areaId: "00000000-0000-4000-8000-000000000101",
};

const userB = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "user_b@example.test",
  password: "password123",
  areaId: "00000000-0000-4000-8000-000000000201",
};

function requireAnonKey() {
  if (!supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required when RUN_SUPABASE_RLS_TESTS=1. Run `supabase status -o env` and export the local anon key.",
    );
  }

  return supabaseAnonKey;
}

function createLocalClient() {
  return createClient(supabaseUrl, requireAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `lifeos-rls-${Math.random().toString(16).slice(2)}`,
    },
  });
}

async function signIn(email: string, password: string) {
  const client = createLocalClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`Could not sign in ${email}: ${error.message}`);
  }

  return client;
}

async function deleteCaptureByText(client: SupabaseClient, rawText: string) {
  const { error } = await client
    .from("capture_items")
    .delete()
    .eq("raw_text", rawText);

  if (error) {
    throw new Error(
      `Could not clean up capture '${rawText}': ${error.message}`,
    );
  }
}

async function deleteTaskByTitle(client: SupabaseClient, title: string) {
  const { error } = await client.from("tasks").delete().eq("title", title);

  if (error) {
    throw new Error(`Could not clean up task '${title}': ${error.message}`);
  }
}

async function deleteProjectByTitle(client: SupabaseClient, title: string) {
  const { error } = await client.from("projects").delete().eq("title", title);

  if (error) {
    throw new Error(`Could not clean up project '${title}': ${error.message}`);
  }
}

async function deleteProposalByTaskId(client: SupabaseClient, taskId: string) {
  const { error } = await client
    .from("time_block_proposals")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    throw new Error(
      `Could not clean up proposal for task '${taskId}': ${error.message}`,
    );
  }
}

async function deleteBlockByTaskId(client: SupabaseClient, taskId: string) {
  const { error } = await client
    .from("calendar_blocks")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    throw new Error(
      `Could not clean up block for task '${taskId}': ${error.message}`,
    );
  }
}

async function deleteSessionByTaskId(client: SupabaseClient, taskId: string) {
  const { error } = await client
    .from("execution_sessions")
    .delete()
    .eq("task_id", taskId);

  if (error) {
    throw new Error(
      `Could not clean up session for task '${taskId}': ${error.message}`,
    );
  }
}

async function deleteReviewByMarker(client: SupabaseClient, marker: string) {
  const { error } = await client
    .from("review_entries")
    .delete()
    .contains("summary_json", { marker });

  if (error) {
    throw new Error(`Could not clean up review '${marker}': ${error.message}`);
  }
}

async function deleteHealthByMarker(client: SupabaseClient, marker: string) {
  const { error } = await client
    .from("health_checks")
    .delete()
    .contains("details_json", { marker });

  if (error) {
    throw new Error(
      `Could not clean up health check '${marker}': ${error.message}`,
    );
  }
}

async function deleteGoogleConnection(client: SupabaseClient) {
  const { error } = await client
    .from("google_calendar_connections")
    .delete()
    .eq("provider", "google_calendar");

  if (error) {
    throw new Error(
      `Could not clean up Google Calendar connection: ${error.message}`,
    );
  }
}

async function deleteExternalWriteByMarker(
  client: SupabaseClient,
  marker: string,
) {
  const { error } = await client
    .from("external_write_events")
    .delete()
    .contains("request_summary_json", { marker });

  if (error) {
    throw new Error(
      `Could not clean up external write event '${marker}': ${error.message}`,
    );
  }
}

async function deleteAiCallTraceBySurface(
  client: SupabaseClient,
  surface: string,
) {
  const { error } = await client
    .from("ai_call_traces")
    .delete()
    .eq("surface", surface);

  if (error) {
    throw new Error(
      `Could not clean up ai_call_trace '${surface}': ${error.message}`,
    );
  }
}

async function deletePersonByDisplayName(
  client: SupabaseClient,
  displayName: string,
) {
  const { error } = await client
    .from("people")
    .delete()
    .eq("display_name", displayName);

  if (error) {
    throw new Error(
      `Could not clean up person '${displayName}': ${error.message}`,
    );
  }
}

async function deleteOperatorProfile(client: SupabaseClient, userId: string) {
  const { error } = await client
    .from("operator_profiles")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Could not clean up operator profile for '${userId}': ${error.message}`,
    );
  }
}

async function deleteRollupByPeriod(
  client: SupabaseClient,
  periodStart: string,
) {
  const { error } = await client
    .from("rollup_summaries")
    .delete()
    .eq("period_start", periodStart);

  if (error) {
    throw new Error(
      `Could not clean up rollup for '${periodStart}': ${error.message}`,
    );
  }
}

async function deleteWinByTitle(client: SupabaseClient, title: string) {
  const { error } = await client
    .from("win_records")
    .delete()
    .eq("title", title);

  if (error) {
    throw new Error(`Could not clean up win '${title}': ${error.message}`);
  }
}

async function deleteRollupByStart(
  client: SupabaseClient,
  periodStart: string,
) {
  const { error } = await client
    .from("rollup_summaries")
    .delete()
    .eq("period_start", periodStart);

  if (error) {
    throw new Error(
      `Could not clean up rollup '${periodStart}': ${error.message}`,
    );
  }
}

async function deleteDurationProfileByTaskType(
  client: SupabaseClient,
  taskType: string,
) {
  const { error } = await client
    .from("duration_profiles")
    .delete()
    .eq("task_type", taskType);

  if (error) {
    throw new Error(
      `Could not clean up duration profile '${taskType}': ${error.message}`,
    );
  }
}

describeLocalRls("Phase 4A local Supabase RLS", () => {
  it("lets user A read own areas but not user B areas", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { data, error } = await userAClient
      .from("areas")
      .select("id,user_id,name,slug")
      .order("sort_order", { ascending: true });

    expect(error).toBeNull();
    expect(data?.some((area) => area.user_id === userA.id)).toBe(true);
    expect(data?.some((area) => area.id === userB.areaId)).toBe(false);
    expect(data?.every((area) => area.user_id === userA.id)).toBe(true);
  });

  it("denies authenticated hard deletes for areas", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { data, error } = await userAClient
      .from("areas")
      .delete()
      .eq("id", userA.areaId);

    expectDenied(data, error);
  });

  it("denies unauthenticated anon reads for areas and capture_items", async () => {
    const anonClient = createLocalClient();

    const { data: areas, error: areasError } = await anonClient
      .from("areas")
      .select("id");
    const { data: captures, error: capturesError } = await anonClient
      .from("capture_items")
      .select("id");
    const { data: connections, error: connectionsError } = await anonClient
      .from("google_calendar_connections")
      .select("id");
    const { data: externalWrites, error: externalWritesError } =
      await anonClient.from("external_write_events").select("id");

    expectDenied(areas, areasError);
    expectDenied(captures, capturesError);
    expectDenied(connections, connectionsError);
    expectDenied(externalWrites, externalWritesError);
  });

  it("lets user A access own capture_items but not user B capture_items", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userARawText = `rls-user-a-${suffix}`;
    const userBRawText = `rls-user-b-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("capture_items")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          raw_text: userARawText,
          capture_mode: "text",
          status: "new",
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("capture_items")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          raw_text: userBRawText,
          capture_mode: "text",
          status: "new",
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("capture_items")
        .select("user_id,raw_text")
        .in("raw_text", [userARawText, userBRawText])
        .order("raw_text", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, raw_text: userARawText },
      ]);
    } finally {
      await deleteCaptureByText(userAClient, userARawText);
      await deleteCaptureByText(userBClient, userBRawText);
    }
  });

  it("prevents user A from inserting capture_items for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const rawText = `rls-cross-user-insert-${Date.now()}`;

    const { error } = await userAClient.from("capture_items").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      raw_text: rawText,
      capture_mode: "text",
      status: "new",
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  // #759: the database half of "replay the offline queue, never duplicate".
  // The unit tests assert the client sends the right upsert options; only
  // this suite proves the index actually exists and dedupes — the partial
  // index shipped in 20260706150000 could not (Postgres 42P10 on every
  // upsert, silently swallowed by `syncOfflineQueue`). This calls the real
  // `syncQueuedCapture` client function (not a hand-typed upsert) so the
  // test cannot drift from what `WorkflowContext.tsx`'s sync loop sends.
  it("dedupes a replayed offline-queue capture sync on client_capture_id instead of creating a second row", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rawText = `rls-capture-replay-${suffix}`;
    const clientCaptureId = `queue-capture-${suffix}`;
    const client = userAClient as unknown as MinimalSupabaseClient;

    try {
      const first = await syncQueuedCapture(client, {
        raw_text: rawText,
        area_id: userA.areaId,
        return_hook: null,
        client_capture_id: clientCaptureId,
      });
      expect(first.provider).toBe("supabase");

      // The exact same queued item replayed — a reconnect racing a mount,
      // or a sync that already reached the server before the client saw
      // the response.
      const second = await syncQueuedCapture(client, {
        raw_text: rawText,
        area_id: userA.areaId,
        return_hook: null,
        client_capture_id: clientCaptureId,
      });
      expect(second.provider).toBe("supabase");

      const { data, error } = await userAClient
        .from("capture_items")
        .select("raw_text")
        .eq("raw_text", rawText);
      expect(error).toBeNull();
      expect(data).toEqual([{ raw_text: rawText }]);
    } finally {
      await deleteCaptureByText(userAClient, rawText);
    }
  });

  it("leaves capture rows with no client_capture_id free to repeat (partial index removed)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const rawText = `rls-capture-null-id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      // Two NULL client_capture_id rows must not collide — every capture
      // saved through the direct save path (not the offline queue) is one
      // of these, so an index that counted NULLs as equal would break the
      // migration on real data. Guaranteed by Postgres treating NULLs as
      // DISTINCT in a unique index by default, NOT by a partial predicate:
      // the predicate was removed because `ON CONFLICT` cannot infer a
      // partial index (42P10). This test is what proves the guarantee
      // survived that change.
      for (const attempt of [1, 2]) {
        const { error } = await userAClient.from("capture_items").insert({
          user_id: userA.id,
          area_id: userA.areaId,
          raw_text: rawText,
          capture_mode: "text",
          status: "new",
        });
        expect(error, `insert ${attempt} should be allowed`).toBeNull();
      }

      const { data, error: selectError } = await userAClient
        .from("capture_items")
        .select("raw_text")
        .eq("raw_text", rawText);
      expect(selectError).toBeNull();
      expect(data).toHaveLength(2);
    } finally {
      await deleteCaptureByText(userAClient, rawText);
    }
  });

  // Final UX Loop C1, Target Card 1 (audit P0#3): the ACCOUNT half of
  // "sorted/accepted work never resurrects as unsorted". The unit tiers prove
  // the accept path CALLS `resolveCaptureItems` and that no surface lists a
  // decided thought; only this suite proves the update is actually permitted
  // and lands — the #758 grants class and the #759 42P10 class were both
  // writes that looked wired and silently did nothing. Calls the real client
  // function, not a hand-typed update, so it cannot drift from what
  // `persistAcceptedTaskDraft` sends.
  it("advances an accepted capture from new to resolved, and never drags a decided row back", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newText = `rls-capture-resolve-new-${suffix}`;
    const compostedText = `rls-capture-resolve-composted-${suffix}`;
    const client = userAClient as unknown as MinimalSupabaseClient;

    try {
      const { data: inserted, error: insertError } = await userAClient
        .from("capture_items")
        .insert([
          {
            user_id: userA.id,
            area_id: userA.areaId,
            raw_text: newText,
            capture_mode: "text",
            status: "new",
          },
          {
            user_id: userA.id,
            area_id: userA.areaId,
            raw_text: compostedText,
            capture_mode: "text",
            status: "composted",
          },
        ])
        .select("id,raw_text,status");
      expect(insertError).toBeNull();

      const idByText = new Map(
        (inserted ?? []).map(
          (row: { id: string; raw_text: string }) =>
            [row.raw_text, row.id] as const,
        ),
      );

      const result = await resolveCaptureItems(client, [
        idByText.get(newText) ?? null,
        idByText.get(compostedText) ?? null,
      ]);

      expect(result.provider).toBe("supabase");
      // Only the undecided row moved. The composted one is out of the guarded
      // source-status set, so a late or replayed accept cannot resurrect it.
      expect(result.captures.map((capture) => capture.raw_text)).toEqual([
        newText,
      ]);

      const { data: after, error: selectError } = await userAClient
        .from("capture_items")
        .select("raw_text,status")
        .in("raw_text", [newText, compostedText])
        .order("raw_text", { ascending: true });
      expect(selectError).toBeNull();
      expect(after).toEqual([
        { raw_text: compostedText, status: "composted" },
        { raw_text: newText, status: "resolved" },
      ]);

      // Replaying the same accept is a no-op, not an error and not a second
      // transition — the row is already resolved.
      const replay = await resolveCaptureItems(client, [
        idByText.get(newText) ?? null,
      ]);
      expect(replay.captures).toEqual([]);
    } finally {
      await deleteCaptureByText(userAClient, newText);
      await deleteCaptureByText(userAClient, compostedText);
    }
  });

  it("cannot resolve another user's capture", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const rawText = `rls-capture-resolve-cross-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const { data: inserted, error: insertError } = await userBClient
        .from("capture_items")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          raw_text: rawText,
          capture_mode: "text",
          status: "new",
        })
        .select("id")
        .single();
      expect(insertError).toBeNull();

      // `capture_items_update_own` is the ownership boundary — the function
      // deliberately adds no `.eq("user_id", ...)` of its own, matching the
      // convention in lib/data/workflow/capture.ts. RLS must make the update
      // touch nothing rather than silently succeed.
      const result = await resolveCaptureItems(
        userAClient as unknown as MinimalSupabaseClient,
        [(inserted as { id: string }).id],
      );
      expect(result.captures).toEqual([]);

      const { data: after } = await userBClient
        .from("capture_items")
        .select("status")
        .eq("raw_text", rawText)
        .single();
      expect(after).toEqual({ status: "new" });
    } finally {
      await deleteCaptureByText(userBClient, rawText);
    }
  });

  it("lets user A access own win_records but not user B win_records", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATitle = `rls-win-a-${suffix}`;
    const userBTitle = `rls-win-b-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("win_records")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATitle,
          occurred_at: "2026-05-08",
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("win_records")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTitle,
          occurred_at: "2026-05-08",
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("win_records")
        .select("user_id,title")
        .in("title", [userATitle, userBTitle])
        .order("title", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([{ user_id: userA.id, title: userATitle }]);
    } finally {
      await deleteWinByTitle(userAClient, userATitle);
      await deleteWinByTitle(userBClient, userBTitle);
    }
  });

  it("prevents user A from inserting win_records for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const title = `rls-cross-user-win-${Date.now()}`;

    const { error } = await userAClient.from("win_records").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      title,
      occurred_at: "2026-05-08",
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  // #737-A slice 2 — the database half of "replay twice, never duplicate".
  // The unit tests assert the client sends the right upsert options; only this
  // suite proves the index actually exists and dedupes.
  it("dedupes a replayed win on client_write_id instead of creating a second row", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const title = `rls-win-replay-${suffix}`;
    const clientWriteId = `journal-win-${suffix}`;

    try {
      const row = {
        user_id: userA.id,
        area_id: userA.areaId,
        title,
        occurred_at: "2026-05-08",
        client_write_id: clientWriteId,
      };

      const { error: firstError } = await userAClient
        .from("win_records")
        .upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(firstError).toBeNull();

      // The exact same journal entry replayed — a second mount, a reconnect
      // racing the first drain, or a response lost after the row landed.
      const { error: secondError } = await userAClient
        .from("win_records")
        .upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(secondError).toBeNull();

      const { data, error: selectError } = await userAClient
        .from("win_records")
        .select("title")
        .eq("title", title);
      expect(selectError).toBeNull();
      expect(data).toEqual([{ title }]);
    } finally {
      await deleteWinByTitle(userAClient, title);
    }
  });

  it("still lets user B use the same client_write_id (the index is per user)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATitle = `rls-win-shared-id-a-${suffix}`;
    const userBTitle = `rls-win-shared-id-b-${suffix}`;
    // Journal ids are per device, so two accounts on one device can genuinely
    // collide. The index is scoped to (user_id, client_write_id) so they do
    // not block each other.
    const clientWriteId = `journal-win-shared-${suffix}`;

    try {
      const { error: aError } = await userAClient.from("win_records").insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: userATitle,
        occurred_at: "2026-05-08",
        client_write_id: clientWriteId,
      });
      expect(aError).toBeNull();

      const { error: bError } = await userBClient.from("win_records").insert({
        user_id: userB.id,
        area_id: userB.areaId,
        title: userBTitle,
        occurred_at: "2026-05-08",
        client_write_id: clientWriteId,
      });
      expect(bError).toBeNull();
    } finally {
      await deleteWinByTitle(userAClient, userATitle);
      await deleteWinByTitle(userBClient, userBTitle);
    }
  });

  it("dedupes a replayed review entry on client_write_id", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const marker = `rls-review-replay-${suffix}`;
    const clientWriteId = `journal-review-${suffix}`;

    try {
      const row = {
        user_id: userA.id,
        area_id: userA.areaId,
        review_type: "daily",
        period_start: "2026-05-08",
        period_end: "2026-05-08",
        summary_json: { marker },
        client_write_id: clientWriteId,
      };

      const { error: firstError } = await userAClient
        .from("review_entries")
        .upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(firstError).toBeNull();

      const { error: secondError } = await userAClient
        .from("review_entries")
        .upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(secondError).toBeNull();

      const { data, error: selectError } = await userAClient
        .from("review_entries")
        .select("summary_json")
        .contains("summary_json", { marker });
      expect(selectError).toBeNull();
      expect(data).toHaveLength(1);
    } finally {
      await deleteReviewByMarker(userAClient, marker);
    }
  });

  // #737 C1 S5 — the database half of "replay a rollup twice, never
  // duplicate". The unit tests assert the client sends the right upsert
  // options; only this suite proves migration 20260727140000's index actually
  // exists and dedupes.
  //
  // It also proves the index is PLAIN rather than partial. A partial index
  // would make PostgREST's `onConflict` (which sends column names and nothing
  // else) fail with 42P10 on the very first upsert below — the production bug
  // #759 hit on captures, and the reason the house rule exists.
  it("dedupes a replayed rollup on client_write_id instead of creating a second row", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // A per-run period, so concurrent runs cannot collide on the ORIGINAL
    // uniqueness (`rollup_summaries_period_key`) and make this test look like
    // a client_write_id failure.
    const periodStart = `2027-01-${String((Date.now() % 28) + 1).padStart(2, "0")}`;
    const clientWriteId = `journal-rollup-${suffix}`;

    try {
      const row = {
        user_id: userA.id,
        area_id: userA.areaId,
        period_type: "week",
        period_start: periodStart,
        period_end: periodStart,
        summary: { headline: `rls-rollup-${suffix}`, counts: {} },
        client_write_id: clientWriteId,
      };

      const { error: firstError } = await userAClient
        .from("rollup_summaries")
        .upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(firstError).toBeNull();

      // The same journal entry replayed: a second mount, a reconnect racing
      // the first drain, or a response lost after the row landed.
      const { error: secondError } = await userAClient
        .from("rollup_summaries")
        .upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(secondError).toBeNull();

      const { data, error: selectError } = await userAClient
        .from("rollup_summaries")
        .select("period_start")
        .eq("period_start", periodStart);
      expect(selectError).toBeNull();
      expect(data).toEqual([{ period_start: periodStart }]);
    } finally {
      await deleteRollupByPeriod(userAClient, periodStart);
    }
  });

  // The OTHER constraint, deliberately left as the arbiter of nothing.
  //
  // `rollup_summaries_period_key` (one rollup per area per period, from the
  // table's original migration) still RAISES on a second, genuinely different
  // approval of the same period rather than silently overwriting it. The
  // client reads that constraint NAME (`isRollupPeriodConflict`) and treats it
  // as a terminal success — the account already holds this rollup — instead of
  // re-queuing the journal entry forever against a row that will never move.
  // If this ever stopped raising, that predicate would be dead code and a
  // re-approval would quietly replace the user's earlier rollup.
  it("still refuses a second rollup for the same area and period", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const periodStart = `2027-02-${String((Date.now() % 28) + 1).padStart(2, "0")}`;

    try {
      const base = {
        user_id: userA.id,
        area_id: userA.areaId,
        period_type: "week",
        period_start: periodStart,
        period_end: periodStart,
        summary: { headline: `rls-rollup-dup-${suffix}`, counts: {} },
      };

      const { error: firstError } = await userAClient
        .from("rollup_summaries")
        .insert({ ...base, client_write_id: `journal-rollup-a-${suffix}` });
      expect(firstError).toBeNull();

      const { error: secondError } = await userAClient
        .from("rollup_summaries")
        .upsert(
          { ...base, client_write_id: `journal-rollup-b-${suffix}` },
          { onConflict: "user_id,client_write_id", ignoreDuplicates: true },
        );
      // The name is the assertion: the client branches on it, so a rename here
      // would silently turn a terminal success into an infinite retry.
      expect(secondError?.message).toContain("rollup_summaries_period_key");
    } finally {
      await deleteRollupByPeriod(userAClient, periodStart);
    }
  });

  // Final UX Loop C1, Target Cards 1+7 — the database half of "one close per
  // day". The Playwright spec proves the UI stops offering the action and the
  // journal holds one review; only this suite proves the ACCOUNT refuses a
  // second row, which is what protects the paths the UI cannot see (a second
  // tab, a replay racing a mount, a future caller).
  //
  // The audit found five rows for the single date 2026-07-26. Each of those
  // presses carried its OWN client_write_id, so 20260726120000's key —
  // correct for its own job, deduping a REPLAY — could not see them as
  // duplicates at all. This is the constraint that can.
  it("refuses a second daily close for the same user and date", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const firstMarker = `rls-daily-close-first-${suffix}`;
    const secondMarker = `rls-daily-close-second-${suffix}`;
    const weeklyMarker = `rls-daily-close-weekly-${suffix}`;
    const otherUserMarker = `rls-daily-close-userb-${suffix}`;
    // A date of this suite's own, so the assertion is about the constraint and
    // not about whichever sibling test ran before it.
    const day = "2026-07-27";

    try {
      const dailyRow = (marker: string, clientWriteId: string) => ({
        user_id: userA.id,
        area_id: userA.areaId,
        review_type: "daily",
        period_start: day,
        period_end: day,
        summary_json: { marker },
        client_write_id: clientWriteId,
      });

      // The genuine close.
      const { error: firstError } = await userAClient
        .from("review_entries")
        .upsert(dailyRow(firstMarker, `journal-close-a-${suffix}`), {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(firstError).toBeNull();

      // Replaying the SAME journal entry stays a silent no-op: the new partial
      // index must not disturb 20260726120000's arbiter.
      const { error: replayError } = await userAClient
        .from("review_entries")
        .upsert(dailyRow(firstMarker, `journal-close-a-${suffix}`), {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(replayError).toBeNull();

      // A genuinely SECOND close — a different client_write_id, exactly what
      // every extra press produced — is refused by the database.
      const { error: secondError } = await userAClient
        .from("review_entries")
        .upsert(dailyRow(secondMarker, `journal-close-b-${suffix}`), {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
      expect(secondError?.message ?? "").toMatch(
        /duplicate key value|review_entries_user_daily_close_key/i,
      );

      // A WEEKLY review may share the date. The index is partial for this
      // reason: a week's rollup starts on the day it starts on.
      const { error: weeklyError } = await userAClient
        .from("review_entries")
        .upsert(
          {
            user_id: userA.id,
            area_id: userA.areaId,
            review_type: "weekly",
            period_start: day,
            period_end: "2026-08-02",
            summary_json: { marker: weeklyMarker },
            client_write_id: `journal-close-weekly-${suffix}`,
          },
          { onConflict: "user_id,client_write_id", ignoreDuplicates: true },
        );
      expect(weeklyError).toBeNull();

      // Another account closing the same day is untouched — the key is scoped
      // to the user, like every other key in this schema.
      const { error: otherUserError } = await userBClient
        .from("review_entries")
        .upsert(
          {
            user_id: userB.id,
            area_id: userB.areaId,
            review_type: "daily",
            period_start: day,
            period_end: day,
            summary_json: { marker: otherUserMarker },
            client_write_id: `journal-close-userb-${suffix}`,
          },
          { onConflict: "user_id,client_write_id", ignoreDuplicates: true },
        );
      expect(otherUserError).toBeNull();

      // Exactly one daily close on the account, and it is the FIRST one — the
      // moment the user actually finished their day, not a later re-press.
      const { data, error: selectError } = await userAClient
        .from("review_entries")
        .select("summary_json")
        .eq("review_type", "daily")
        .eq("period_start", day);
      expect(selectError).toBeNull();
      expect(data).toEqual([{ summary_json: { marker: firstMarker } }]);
    } finally {
      await deleteReviewByMarker(userAClient, firstMarker);
      await deleteReviewByMarker(userAClient, secondMarker);
      await deleteReviewByMarker(userAClient, weeklyMarker);
      await deleteReviewByMarker(userBClient, otherUserMarker);
    }
  });

  // #737 C1 card 1 — the database half of "exactly one truthful record".
  // The Playwright proofs show the journal holds exactly one outcome; only
  // this suite proves the account ends up with exactly one ROW, carrying the
  // outcome the user chose, however many times the journal replays.
  it("records a chosen session outcome once, and a replay adds no second row", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clientWriteId = `journal-session-${suffix}`;
    const notes = `rls-session-replay-${suffix}`;

    const { data: task, error: taskError } = await userAClient
      .from("tasks")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: `rls-session-task-${suffix}`,
        status: "active",
        estimated_minutes_high: 45,
      })
      .select("id")
      .single();
    expect(taskError).toBeNull();

    try {
      const args = {
        p_task_id: task!.id,
        // Blockless — audit P0#2's case, which the old start path refused.
        p_calendar_block_id: null,
        p_outcome: "partial",
        p_actual_minutes: 18,
        p_paused_minutes: 0,
        p_distraction_minutes: 0,
        p_productivity_rating: 1,
        p_notes: notes,
        p_cap_outcome: null,
        p_client_write_id: clientWriteId,
        p_defer_task: false,
      };

      const { data: first, error: firstError } = await userAClient.rpc(
        "record_execution_session",
        args,
      );
      expect(firstError).toBeNull();
      expect(first?.deduplicated).toBe(false);
      expect(first?.session?.outcome).toBe("partial");
      expect(first?.session?.actual_minutes).toBe(18);
      // Blockless sessions still get planned minutes, from the task estimate.
      expect(first?.session?.planned_minutes).toBe(45);

      // The same journal entry replayed: a second tab, a reconnect racing the
      // first drain, or a response lost after the row landed.
      const { data: second, error: secondError } = await userAClient.rpc(
        "record_execution_session",
        args,
      );
      expect(secondError).toBeNull();
      expect(second?.deduplicated).toBe(true);
      expect(second?.session?.id).toBe(first?.session?.id);

      const { data: rows, error: selectError } = await userAClient
        .from("execution_sessions")
        .select("id,outcome")
        .eq("notes", notes);
      expect(selectError).toBeNull();
      expect(rows).toHaveLength(1);
      expect(rows?.[0]?.outcome).toBe("partial");
    } finally {
      await userAClient.from("execution_sessions").delete().eq("notes", notes);
      await userAClient.from("tasks").delete().eq("id", task!.id);
    }
  });

  it("refuses to record an outcome the user never could have chosen", async () => {
    // The CHECK is deliberately untouched by #737 C1: the device's
    // "no verdict yet" state must never reach this table.
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { data: task } = await userAClient
      .from("tasks")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: `rls-session-badoutcome-${suffix}`,
        status: "active",
      })
      .select("id")
      .single();

    try {
      const { error } = await userAClient.rpc("record_execution_session", {
        p_task_id: task!.id,
        p_calendar_block_id: null,
        p_outcome: "in_progress",
        p_actual_minutes: 0,
        p_paused_minutes: 0,
        p_distraction_minutes: 0,
        p_productivity_rating: null,
        p_notes: null,
        p_cap_outcome: null,
        p_client_write_id: `journal-session-bad-${suffix}`,
        p_defer_task: false,
      });

      expect(error?.message).toMatch(/outcome/i);
    } finally {
      await userAClient.from("tasks").delete().eq("id", task!.id);
    }
  });

  it("lets user B replay the same session write id (the index is per user)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // Journal ids are minted per DEVICE, so two accounts used on one device
    // can legitimately produce the same one and must not block each other.
    const clientWriteId = `journal-session-shared-${suffix}`;

    const seeds: { client: typeof userAClient; taskId: string }[] = [];
    try {
      for (const [client, user] of [
        [userAClient, userA],
        [userBClient, userB],
      ] as const) {
        const { data: task } = await client
          .from("tasks")
          .insert({
            user_id: user.id,
            area_id: user.areaId,
            title: `rls-session-shared-${suffix}`,
            status: "active",
          })
          .select("id")
          .single();
        seeds.push({ client, taskId: task!.id });

        const { error } = await client.rpc("record_execution_session", {
          p_task_id: task!.id,
          p_calendar_block_id: null,
          p_outcome: "completed",
          p_actual_minutes: 30,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_productivity_rating: 4,
          p_notes: `rls-session-shared-${suffix}`,
          p_cap_outcome: null,
          p_client_write_id: clientWriteId,
          p_defer_task: false,
        });
        expect(error).toBeNull();
      }
    } finally {
      for (const seed of seeds) {
        await seed.client
          .from("execution_sessions")
          .delete()
          .eq("notes", `rls-session-shared-${suffix}`);
        await seed.client.from("tasks").delete().eq("id", seed.taskId);
      }
    }
  });

  it("leaves rows with no client_write_id free to repeat (partial index)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const title = `rls-win-null-id-${suffix}`;

    try {
      // Two NULL client_write_id rows must not collide — every pre-#737 win
      // is one of these, so an index that counted NULLs as equal would break
      // the migration on real data. This is guaranteed by Postgres treating
      // NULLs as DISTINCT in a unique index by default, NOT by a partial
      // predicate: the predicate was removed because `ON CONFLICT` cannot
      // infer a partial index (42P10). This test is what proves the guarantee
      // survived that change.
      for (const attempt of [1, 2]) {
        const { error } = await userAClient.from("win_records").insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title,
          occurred_at: "2026-05-08",
        });
        expect(error, `insert ${attempt} should be allowed`).toBeNull();
      }

      const { data, error: selectError } = await userAClient
        .from("win_records")
        .select("title")
        .eq("title", title);
      expect(selectError).toBeNull();
      expect(data).toHaveLength(2);
    } finally {
      await deleteWinByTitle(userAClient, title);
    }
  });

  // #737 C1 slice S3 — the database half of "replay twice, never duplicate"
  // for the two write families S3 makes durable. The Playwright proofs show
  // the journal holds exactly one entry; only this suite proves the account
  // ends up with exactly one BLOCK and one TASK however many times it replays.
  it("places a time block once, and a replay adds no second block", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clientWriteId = `journal-plan-${suffix}`;
    const taskTitle = `rls-plan-task-${suffix}`;

    const { data: task, error: taskError } = await userAClient
      .from("tasks")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: taskTitle,
        status: "active",
      })
      .select("id")
      .single();
    expect(taskError).toBeNull();

    try {
      const args = {
        p_task_id: task!.id,
        // The `planTaskAtHour` shape: no proposal exists yet, so the function
        // mints one.
        p_proposal_id: null,
        p_proposed_start: "2026-05-08T14:00:00.000Z",
        p_proposed_end: "2026-05-08T15:00:00.000Z",
        p_rationale: "rls placement",
        p_client_write_id: clientWriteId,
      };

      const { data: first, error: firstError } = await userAClient.rpc(
        "place_time_block",
        args,
      );
      expect(firstError).toBeNull();
      expect(first?.deduplicated).toBe(false);
      expect(first?.proposal?.status).toBe("accepted");
      expect(first?.block?.status).toBe("scheduled");
      // The placement is what makes the task scheduled — all in one
      // transaction, where the client used to make three separate calls.
      expect(first?.task?.status).toBe("scheduled");

      // The same journal entry replayed.
      const { data: second, error: secondError } = await userAClient.rpc(
        "place_time_block",
        args,
      );
      expect(secondError).toBeNull();
      expect(second?.deduplicated).toBe(true);
      expect(second?.block?.id).toBe(first?.block?.id);

      const { data: blocks, error: blockError } = await userAClient
        .from("calendar_blocks")
        .select("id")
        .eq("task_id", task!.id);
      expect(blockError).toBeNull();
      expect(blocks).toHaveLength(1);

      const { data: proposals, error: proposalError } = await userAClient
        .from("time_block_proposals")
        .select("id")
        .eq("task_id", task!.id);
      expect(proposalError).toBeNull();
      expect(proposals).toHaveLength(1);
    } finally {
      await userAClient
        .from("calendar_blocks")
        .delete()
        .eq("task_id", task!.id);
      await userAClient
        .from("time_block_proposals")
        .delete()
        .eq("task_id", task!.id);
      await userAClient.from("tasks").delete().eq("id", task!.id);
    }
  });

  it("places an EXISTING proposal without minting a second proposal row", async () => {
    // The `acceptLocalProposal` shape. Without the optional p_proposal_id the
    // function would insert a second proposal and leave the original pending,
    // so this is the test that discriminates the two placement paths.
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-plan-existing-${suffix}`;

    const { data: task } = await userAClient
      .from("tasks")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: taskTitle,
        status: "active",
      })
      .select("id")
      .single();

    const { data: proposal } = await userAClient
      .from("time_block_proposals")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        task_id: task!.id,
        proposed_start: "2026-05-08T16:00:00.000Z",
        proposed_end: "2026-05-08T17:00:00.000Z",
        status: "proposed",
      })
      .select("id")
      .single();

    try {
      const args = {
        p_task_id: task!.id,
        p_proposal_id: proposal!.id,
        p_proposed_start: "2026-05-08T16:00:00.000Z",
        p_proposed_end: "2026-05-08T17:00:00.000Z",
        p_rationale: "rls existing placement",
        p_client_write_id: `journal-plan-existing-${suffix}`,
      };

      const { data: first, error: firstError } = await userAClient.rpc(
        "place_time_block",
        args,
      );
      expect(firstError).toBeNull();
      expect(first?.proposal?.id).toBe(proposal!.id);
      expect(first?.deduplicated).toBe(false);

      const { data: second, error: secondError } = await userAClient.rpc(
        "place_time_block",
        args,
      );
      expect(secondError).toBeNull();
      expect(second?.deduplicated).toBe(true);

      const { data: proposals } = await userAClient
        .from("time_block_proposals")
        .select("id")
        .eq("task_id", task!.id);
      expect(proposals).toHaveLength(1);

      const { data: blocks } = await userAClient
        .from("calendar_blocks")
        .select("id")
        .eq("task_id", task!.id);
      expect(blocks).toHaveLength(1);
    } finally {
      await userAClient
        .from("calendar_blocks")
        .delete()
        .eq("task_id", task!.id);
      await userAClient
        .from("time_block_proposals")
        .delete()
        .eq("task_id", task!.id);
      await userAClient.from("tasks").delete().eq("id", task!.id);
    }
  });

  it("supersedes sibling pending proposals when a block is placed (#580)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { data: task } = await userAClient
      .from("tasks")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: `rls-plan-supersede-${suffix}`,
        status: "active",
      })
      .select("id")
      .single();

    const { data: sibling } = await userAClient
      .from("time_block_proposals")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        task_id: task!.id,
        proposed_start: "2026-05-08T09:00:00.000Z",
        proposed_end: "2026-05-08T10:00:00.000Z",
        status: "proposed",
      })
      .select("id")
      .single();

    try {
      const { error } = await userAClient.rpc("place_time_block", {
        p_task_id: task!.id,
        p_proposal_id: null,
        p_proposed_start: "2026-05-08T11:00:00.000Z",
        p_proposed_end: "2026-05-08T12:00:00.000Z",
        p_rationale: "rls supersede",
        p_client_write_id: `journal-plan-supersede-${suffix}`,
      });
      expect(error).toBeNull();

      // Retained, never deleted — so a later sync cannot resurrect it as an
      // active proposal for a task that already has its block.
      const { data: after } = await userAClient
        .from("time_block_proposals")
        .select("status")
        .eq("id", sibling!.id)
        .single();
      expect(after?.status).toBe("superseded");
    } finally {
      await userAClient
        .from("calendar_blocks")
        .delete()
        .eq("task_id", task!.id);
      await userAClient
        .from("time_block_proposals")
        .delete()
        .eq("task_id", task!.id);
      await userAClient.from("tasks").delete().eq("id", task!.id);
    }
  });

  it("dedupes a replayed triage accept on tasks.client_write_id", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const title = `rls-accept-replay-${suffix}`;
    const clientWriteId = `journal-accept-${suffix}`;

    try {
      const row = {
        user_id: userA.id,
        area_id: userA.areaId,
        title,
        status: "active",
        client_write_id: clientWriteId,
      };

      for (const attempt of [1, 2]) {
        const { error } = await userAClient.from("tasks").upsert(row, {
          onConflict: "user_id,client_write_id",
          ignoreDuplicates: true,
        });
        expect(error, `accept replay ${attempt} must not error`).toBeNull();
      }

      const { data, error: selectError } = await userAClient
        .from("tasks")
        .select("title")
        .eq("client_write_id", clientWriteId);
      expect(selectError).toBeNull();
      expect(data).toEqual([{ title }]);
    } finally {
      await userAClient
        .from("tasks")
        .delete()
        .eq("client_write_id", clientWriteId);
    }
  });

  it("still lets user B use the same task client_write_id (the index is per user)", async () => {
    // Journal ids are minted per DEVICE, so two accounts used on one device
    // can legitimately produce the same one and must not block each other.
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clientWriteId = `journal-accept-shared-${suffix}`;

    try {
      for (const [client, user] of [
        [userAClient, userA],
        [userBClient, userB],
      ] as const) {
        const { error } = await client.from("tasks").insert({
          user_id: user.id,
          area_id: user.areaId,
          title: `rls-accept-shared-${suffix}`,
          status: "active",
          client_write_id: clientWriteId,
        });
        expect(error).toBeNull();
      }
    } finally {
      for (const client of [userAClient, userBClient]) {
        await client
          .from("tasks")
          .delete()
          .eq("client_write_id", clientWriteId);
      }
    }
  });

  it("leaves tasks and proposals with no client_write_id free to repeat", async () => {
    // Every task and proposal written before S3 carries NULL here, and so does
    // every one written by a path that does not journal. Guaranteed by
    // Postgres treating NULLs as DISTINCT in a unique index by default -- NOT
    // by a partial predicate, which `ON CONFLICT` cannot infer (42P10). This
    // test is what proves the guarantee survived choosing a plain index.
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const title = `rls-null-write-id-${suffix}`;
    const taskIds: string[] = [];

    try {
      for (const attempt of [1, 2]) {
        const { data, error } = await userAClient
          .from("tasks")
          .insert({
            user_id: userA.id,
            area_id: userA.areaId,
            title,
            status: "active",
          })
          .select("id")
          .single();
        expect(error, `task insert ${attempt} should be allowed`).toBeNull();
        taskIds.push(data!.id);
      }

      for (const [attempt, taskId] of taskIds.entries()) {
        const { error } = await userAClient
          .from("time_block_proposals")
          .insert({
            user_id: userA.id,
            area_id: userA.areaId,
            task_id: taskId,
            proposed_start: "2026-05-08T13:00:00.000Z",
            proposed_end: "2026-05-08T14:00:00.000Z",
            status: "proposed",
          });
        expect(
          error,
          `proposal insert ${attempt + 1} should be allowed`,
        ).toBeNull();
      }
    } finally {
      for (const taskId of taskIds) {
        await userAClient
          .from("time_block_proposals")
          .delete()
          .eq("task_id", taskId);
        await userAClient.from("tasks").delete().eq("id", taskId);
      }
    }
  });

  it("refuses a placement with no client write id", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { data: task } = await userAClient
      .from("tasks")
      .insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: `rls-plan-nokey-${suffix}`,
        status: "active",
      })
      .select("id")
      .single();

    try {
      const { error } = await userAClient.rpc("place_time_block", {
        p_task_id: task!.id,
        p_proposal_id: null,
        p_proposed_start: "2026-05-08T14:00:00.000Z",
        p_proposed_end: "2026-05-08T15:00:00.000Z",
        p_rationale: null,
        p_client_write_id: "   ",
      });
      expect(error?.message).toMatch(/client write id/i);
    } finally {
      await userAClient.from("tasks").delete().eq("id", task!.id);
    }
  });

  it("lets user A access own rollup_summaries but not user B rollups", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const periodStart = "2026-05-04";
    const summaryA = {
      highlights: ["A win"],
      misses: [],
      counts: { wins: 1 },
    };
    const summaryB = {
      highlights: ["B win"],
      misses: [],
      counts: { wins: 1 },
    };

    try {
      const { error: insertAError } = await userAClient
        .from("rollup_summaries")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          period_type: "week",
          period_start: periodStart,
          period_end: "2026-05-10",
          summary: summaryA,
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("rollup_summaries")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          period_type: "week",
          period_start: periodStart,
          period_end: "2026-05-10",
          summary: summaryB,
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("rollup_summaries")
        .select("user_id,summary")
        .eq("period_start", periodStart);

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([{ user_id: userA.id, summary: summaryA }]);
    } finally {
      await deleteRollupByStart(userAClient, periodStart);
      await deleteRollupByStart(userBClient, periodStart);
    }
  });

  it("lets user A access own duration_profiles but not user B profiles", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const taskType = `rls-duration-${Date.now()}`;

    try {
      const { error: insertAError } = await userAClient
        .from("duration_profiles")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_type: taskType,
          estimate_stats_json: { multiplier: 1.2, sample_count: 3 },
          sample_count: 3,
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("duration_profiles")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          task_type: taskType,
          estimate_stats_json: { multiplier: 0.8, sample_count: 2 },
          sample_count: 2,
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("duration_profiles")
        .select("user_id,estimate_stats_json")
        .eq("task_type", taskType);

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        {
          user_id: userA.id,
          estimate_stats_json: { multiplier: 1.2, sample_count: 3 },
        },
      ]);

      const { data: updateFromB, error: updateBError } = await userBClient
        .from("duration_profiles")
        .update({ sample_count: 4 })
        .eq("user_id", userA.id)
        .eq("task_type", taskType)
        .select("user_id,sample_count");

      expect(updateBError).toBeNull();
      expect(updateFromB).toEqual([]);
    } finally {
      await deleteDurationProfileByTaskType(userAClient, taskType);
      await deleteDurationProfileByTaskType(userBClient, taskType);
    }
  });

  it("prevents user A from inserting rollup_summaries for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error } = await userAClient.from("rollup_summaries").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      period_type: "week",
      period_start: "2026-06-01",
      period_end: "2026-06-07",
      summary: { highlights: [], misses: [], counts: {} },
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("lets user A access own tasks and projects but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATaskTitle = `rls-user-a-task-${suffix}`;
    const userBTaskTitle = `rls-user-b-task-${suffix}`;
    const userAProjectTitle = `rls-user-a-project-${suffix}`;
    const userBProjectTitle = `rls-user-b-project-${suffix}`;

    try {
      const { error: insertATaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
        });
      expect(insertATaskError).toBeNull();

      const { error: insertBTaskError } = await userBClient
        .from("tasks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTaskTitle,
          status: "active",
        });
      expect(insertBTaskError).toBeNull();

      const { error: insertAProjectError } = await userAClient
        .from("projects")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userAProjectTitle,
          status: "active",
        });
      expect(insertAProjectError).toBeNull();

      const { error: insertBProjectError } = await userBClient
        .from("projects")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBProjectTitle,
          status: "active",
        });
      expect(insertBProjectError).toBeNull();

      const { data: visibleTasksToA, error: selectTasksAError } =
        await userAClient
          .from("tasks")
          .select("user_id,title")
          .in("title", [userATaskTitle, userBTaskTitle])
          .order("title", { ascending: true });
      expect(selectTasksAError).toBeNull();
      expect(visibleTasksToA).toEqual([
        { user_id: userA.id, title: userATaskTitle },
      ]);

      const { data: visibleProjectsToA, error: selectProjectsAError } =
        await userAClient
          .from("projects")
          .select("user_id,title")
          .in("title", [userAProjectTitle, userBProjectTitle])
          .order("title", { ascending: true });
      expect(selectProjectsAError).toBeNull();
      expect(visibleProjectsToA).toEqual([
        { user_id: userA.id, title: userAProjectTitle },
      ]);
    } finally {
      await deleteTaskByTitle(userAClient, userATaskTitle);
      await deleteTaskByTitle(userBClient, userBTaskTitle);
      await deleteProjectByTitle(userAClient, userAProjectTitle);
      await deleteProjectByTitle(userBClient, userBProjectTitle);
    }
  });

  it("prevents user A from inserting tasks and projects for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error: taskError } = await userAClient.from("tasks").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      title: `rls-cross-user-task-${suffix}`,
      status: "active",
    });

    const { error: projectError } = await userAClient.from("projects").insert({
      user_id: userB.id,
      area_id: userB.areaId,
      title: `rls-cross-user-project-${suffix}`,
      status: "active",
    });

    expect(taskError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
    expect(projectError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
  });

  it("lets user A access own proposals and blocks but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATaskTitle = `rls-user-a-planning-task-${suffix}`;
    const userBTaskTitle = `rls-user-b-planning-task-${suffix}`;
    let userATaskId = "";
    let userBTaskId = "";

    try {
      const { data: insertedATask, error: insertATaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertATaskError).toBeNull();
      userATaskId = insertedATask!.id;

      const { data: insertedBTask, error: insertBTaskError } = await userBClient
        .from("tasks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertBTaskError).toBeNull();
      userBTaskId = insertedBTask!.id;

      const { data: proposalA, error: insertProposalAError } = await userAClient
        .from("time_block_proposals")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: userATaskId,
          proposed_start: "2026-05-08T16:00:00.000Z",
          proposed_end: "2026-05-08T17:00:00.000Z",
          rationale_json: { note: "RLS user A" },
          conflict_flag: false,
          status: "proposed",
        })
        .select("id")
        .single();
      expect(insertProposalAError).toBeNull();

      const { data: proposalB, error: insertProposalBError } = await userBClient
        .from("time_block_proposals")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          task_id: userBTaskId,
          proposed_start: "2026-05-08T18:00:00.000Z",
          proposed_end: "2026-05-08T19:00:00.000Z",
          rationale_json: { note: "RLS user B" },
          conflict_flag: false,
          status: "proposed",
        })
        .select("id")
        .single();
      expect(insertProposalBError).toBeNull();

      const { error: insertBlockAError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          proposal_id: proposalA!.id,
          task_id: userATaskId,
          start_at: "2026-05-08T16:00:00.000Z",
          end_at: "2026-05-08T17:00:00.000Z",
          status: "scheduled",
        });
      expect(insertBlockAError).toBeNull();

      const { error: insertBlockBError } = await userBClient
        .from("calendar_blocks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          proposal_id: proposalB!.id,
          task_id: userBTaskId,
          start_at: "2026-05-08T18:00:00.000Z",
          end_at: "2026-05-08T19:00:00.000Z",
          status: "scheduled",
        });
      expect(insertBlockBError).toBeNull();

      const { data: visibleProposalsToA, error: selectProposalAError } =
        await userAClient
          .from("time_block_proposals")
          .select("user_id,task_id")
          .in("task_id", [userATaskId, userBTaskId])
          .order("task_id", { ascending: true });
      expect(selectProposalAError).toBeNull();
      expect(visibleProposalsToA).toEqual([
        { user_id: userA.id, task_id: userATaskId },
      ]);

      const { data: visibleBlocksToA, error: selectBlockAError } =
        await userAClient
          .from("calendar_blocks")
          .select("user_id,task_id")
          .in("task_id", [userATaskId, userBTaskId])
          .order("task_id", { ascending: true });
      expect(selectBlockAError).toBeNull();
      expect(visibleBlocksToA).toEqual([
        { user_id: userA.id, task_id: userATaskId },
      ]);
    } finally {
      if (userATaskId) {
        await deleteBlockByTaskId(userAClient, userATaskId);
        await deleteProposalByTaskId(userAClient, userATaskId);
      }
      if (userBTaskId) {
        await deleteBlockByTaskId(userBClient, userBTaskId);
        await deleteProposalByTaskId(userBClient, userBTaskId);
      }
      await deleteTaskByTitle(userAClient, userATaskTitle);
      await deleteTaskByTitle(userBClient, userBTaskTitle);
    }
  });

  it("prevents user A from inserting or updating user B planning rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error: insertProposalError } = await userAClient
      .from("time_block_proposals")
      .insert({
        user_id: userB.id,
        area_id: userB.areaId,
        task_id: null,
        proposed_start: "2026-05-08T16:00:00.000Z",
        proposed_end: "2026-05-08T17:00:00.000Z",
        rationale_json: { note: "cross-user" },
        conflict_flag: false,
        status: "proposed",
      });

    const { error: insertBlockError } = await userAClient
      .from("calendar_blocks")
      .insert({
        user_id: userB.id,
        area_id: userB.areaId,
        task_id: null,
        start_at: "2026-05-08T16:00:00.000Z",
        end_at: "2026-05-08T17:00:00.000Z",
        status: "scheduled",
      });

    expect(insertProposalError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
    expect(insertBlockError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
  });

  it("accepts proposals atomically via rpc and hides cross-user proposals", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-accept-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: proposal, error: proposalError } = await userAClient
        .from("time_block_proposals")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          proposed_start: "2026-06-12T16:00:00.000Z",
          proposed_end: "2026-06-12T17:00:00.000Z",
          rationale_json: { note: "RLS rpc accept" },
          conflict_flag: false,
          status: "proposed",
        })
        .select("id")
        .single();
      expect(proposalError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "accept_time_block_proposal",
        { p_proposal_id: proposal!.id },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: accepted, error: acceptError } = await userAClient.rpc(
        "accept_time_block_proposal",
        { p_proposal_id: proposal!.id },
      );
      expect(acceptError).toBeNull();
      expect(accepted.proposal.status).toBe("accepted");
      expect(accepted.block.proposal_id).toBe(proposal!.id);
      expect(accepted.block.user_id).toBe(userA.id);
      expect(accepted.block.status).toBe("scheduled");
      expect(accepted.task.status).toBe("scheduled");

      const { error: repeatError } = await userAClient.rpc(
        "accept_time_block_proposal",
        { p_proposal_id: proposal!.id },
      );
      expect(repeatError?.message).toMatch(
        /only proposed or edited proposals/i,
      );
    } finally {
      if (taskId) {
        await deleteBlockByTaskId(userAClient, taskId);
        await deleteProposalByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("applies execution outcomes atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-outcome-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: session, error: sessionError } = await userAClient
        .from("execution_sessions")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          outcome: "partial",
        })
        .select("id")
        .single();
      expect(sessionError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "apply_execution_session_outcome",
        {
          p_session_id: session!.id,
          p_outcome: "completed",
          p_actual_minutes: 30,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_productivity_rating: 4,
          p_notes: "cross-user attempt",
        },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: applied, error: applyError } = await userAClient.rpc(
        "apply_execution_session_outcome",
        {
          p_session_id: session!.id,
          p_outcome: "completed",
          p_actual_minutes: 30,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_productivity_rating: 4,
          p_notes: "RLS rpc outcome",
        },
      );
      expect(applyError).toBeNull();
      expect(applied.session.outcome).toBe("completed");
      expect(applied.session.actual_minutes).toBe(30);
      expect(applied.task.status).toBe("done");
      expect(applied.block).toBeNull();
    } finally {
      if (taskId) {
        await deleteSessionByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  // #613: the atomic cap-DEFER transition — session outcome AND task
  // deferral committed as one transaction. Mirrors the
  // apply_execution_session_outcome coverage above exactly (same cross-user
  // denial shape via "for update" + RLS row invisibility), plus the same-user
  // success path proving BOTH rows land together.
  it("defers a task and its execution session atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-defer-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: session, error: sessionError } = await userAClient
        .from("execution_sessions")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          outcome: "partial",
        })
        .select("id")
        .single();
      expect(sessionError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "apply_execution_session_defer",
        {
          p_session_id: session!.id,
          p_task_id: taskId,
          p_actual_minutes: 25,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_notes: "cross-user attempt",
        },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      // Cross-user denial must not have left a partial write on either row.
      const { data: untouchedTask } = await userAClient
        .from("tasks")
        .select("status")
        .eq("id", taskId)
        .single();
      expect(untouchedTask?.status).toBe("active");

      const { data: deferred, error: deferError } = await userAClient.rpc(
        "apply_execution_session_defer",
        {
          p_session_id: session!.id,
          p_task_id: taskId,
          p_actual_minutes: 25,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_notes: "dod_cap.v1 deferred: RLS rpc defer",
        },
      );
      expect(deferError).toBeNull();
      expect(deferred.session.outcome).toBe("blocked");
      expect(deferred.session.cap_outcome).toBe("deferred");
      expect(deferred.session.actual_minutes).toBe(25);
      expect(deferred.task.status).toBe("backlog");

      const { data: persistedTask } = await userAClient
        .from("tasks")
        .select("status")
        .eq("id", taskId)
        .single();
      expect(persistedTask?.status).toBe("backlog");
    } finally {
      if (taskId) {
        await deleteSessionByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("starts execution sessions atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-start-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: block, error: blockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          start_at: "2026-06-12T18:00:00.000Z",
          end_at: "2026-06-12T18:45:00.000Z",
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(blockError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "start_execution_session",
        { p_task_id: taskId, p_calendar_block_id: block!.id },
      );
      expect(crossUserError?.message).toMatch(/task was not found/i);

      const { data: started, error: startError } = await userAClient.rpc(
        "start_execution_session",
        { p_task_id: taskId, p_calendar_block_id: block!.id },
      );
      expect(startError).toBeNull();
      expect(started.session.outcome).toBe("partial");
      expect(started.session.planned_minutes).toBe(45);
      expect(started.block.status).toBe("running");
    } finally {
      if (taskId) {
        await deleteSessionByTaskId(userAClient, taskId);
        await deleteBlockByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("unplans local blocks atomically via rpc with cross-user denial", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-unplan-task-${suffix}`;
    let taskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { data: block, error: blockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          start_at: "2026-06-12T19:00:00.000Z",
          end_at: "2026-06-12T20:00:00.000Z",
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(blockError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "unplan_calendar_block",
        { p_block_id: block!.id },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: unplanned, error: unplanError } = await userAClient.rpc(
        "unplan_calendar_block",
        { p_block_id: block!.id },
      );
      expect(unplanError).toBeNull();
      expect(unplanned.block.status).toBe("cancelled");
      expect(unplanned.task.status).toBe("active");
    } finally {
      if (taskId) {
        await deleteBlockByTaskId(userAClient, taskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
    }
  });

  it("applies review task transitions atomically and refuses Google-backed blocks", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const taskTitle = `rls-rpc-review-task-${suffix}`;
    const googleTaskTitle = `rls-rpc-review-google-task-${suffix}`;
    let taskId = "";
    let googleTaskId = "";

    try {
      const { data: task, error: taskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: taskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      taskId = task!.id;

      const { error: blockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: taskId,
          start_at: "2026-06-12T21:00:00.000Z",
          end_at: "2026-06-12T22:00:00.000Z",
          status: "scheduled",
        });
      expect(blockError).toBeNull();

      const { error: crossUserError } = await userBClient.rpc(
        "apply_task_review_transition",
        { p_task_id: taskId, p_target_status: "backlog" },
      );
      expect(crossUserError?.message).toMatch(/was not found/i);

      const { data: transitioned, error: transitionError } =
        await userAClient.rpc("apply_task_review_transition", {
          p_task_id: taskId,
          p_target_status: "backlog",
        });
      expect(transitionError).toBeNull();
      expect(transitioned.task.status).toBe("backlog");
      expect(transitioned.blocks).toHaveLength(1);
      expect(transitioned.blocks[0].status).toBe("cancelled");

      const { data: googleTask, error: googleTaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: googleTaskTitle,
          status: "scheduled",
        })
        .select("id")
        .single();
      expect(googleTaskError).toBeNull();
      googleTaskId = googleTask!.id;

      const { error: googleBlockError } = await userAClient
        .from("calendar_blocks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: googleTaskId,
          google_event_id: `evt-${suffix}`,
          start_at: "2026-06-13T21:00:00.000Z",
          end_at: "2026-06-13T22:00:00.000Z",
          status: "scheduled",
        });
      expect(googleBlockError).toBeNull();

      const { error: googleGuardError } = await userAClient.rpc(
        "apply_task_review_transition",
        { p_task_id: googleTaskId, p_target_status: "dropped" },
      );
      expect(googleGuardError?.message).toMatch(
        /google-backed blocks require calendar approval/i,
      );
    } finally {
      if (taskId) {
        await deleteBlockByTaskId(userAClient, taskId);
      }
      if (googleTaskId) {
        await deleteBlockByTaskId(userAClient, googleTaskId);
      }
      await deleteTaskByTitle(userAClient, taskTitle);
      await deleteTaskByTitle(userAClient, googleTaskTitle);
    }
  });

  it("lets user A access own execution sessions and review entries but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userATaskTitle = `rls-user-a-execution-task-${suffix}`;
    const userBTaskTitle = `rls-user-b-execution-task-${suffix}`;
    const userAReviewMarker = `rls-user-a-review-${suffix}`;
    const userBReviewMarker = `rls-user-b-review-${suffix}`;
    let userATaskId = "";
    let userBTaskId = "";
    let userABlockId = "";
    let userBBlockId = "";

    try {
      const { data: insertedATask, error: insertATaskError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertATaskError).toBeNull();
      userATaskId = insertedATask!.id;

      const { data: insertedBTask, error: insertBTaskError } = await userBClient
        .from("tasks")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          title: userBTaskTitle,
          status: "active",
        })
        .select("id")
        .single();
      expect(insertBTaskError).toBeNull();
      userBTaskId = insertedBTask!.id;

      const { data: insertedABlock, error: insertBlockAError } =
        await userAClient
          .from("calendar_blocks")
          .insert({
            user_id: userA.id,
            area_id: userA.areaId,
            task_id: userATaskId,
            start_at: "2026-05-08T16:00:00.000Z",
            end_at: "2026-05-08T17:00:00.000Z",
            status: "scheduled",
          })
          .select("id")
          .single();
      expect(insertBlockAError).toBeNull();
      userABlockId = insertedABlock!.id;

      const { data: insertedBBlock, error: insertBlockBError } =
        await userBClient
          .from("calendar_blocks")
          .insert({
            user_id: userB.id,
            area_id: userB.areaId,
            task_id: userBTaskId,
            start_at: "2026-05-08T18:00:00.000Z",
            end_at: "2026-05-08T19:00:00.000Z",
            status: "scheduled",
          })
          .select("id")
          .single();
      expect(insertBlockBError).toBeNull();
      userBBlockId = insertedBBlock!.id;

      const { error: insertSessionAError } = await userAClient
        .from("execution_sessions")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          task_id: userATaskId,
          calendar_block_id: userABlockId,
          planned_minutes: 60,
          paused_minutes: 0,
          distraction_minutes: 0,
          outcome: "partial",
        });
      expect(insertSessionAError).toBeNull();

      const { error: insertSessionBError } = await userBClient
        .from("execution_sessions")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          task_id: userBTaskId,
          calendar_block_id: userBBlockId,
          planned_minutes: 60,
          paused_minutes: 0,
          distraction_minutes: 0,
          outcome: "partial",
        });
      expect(insertSessionBError).toBeNull();

      const { error: insertReviewAError } = await userAClient
        .from("review_entries")
        .insert({
          user_id: userA.id,
          area_id: null,
          review_type: "daily",
          period_start: "2026-05-08",
          period_end: "2026-05-08",
          summary_json: { marker: userAReviewMarker },
        });
      expect(insertReviewAError).toBeNull();

      const { error: insertReviewBError } = await userBClient
        .from("review_entries")
        .insert({
          user_id: userB.id,
          area_id: null,
          review_type: "daily",
          period_start: "2026-05-08",
          period_end: "2026-05-08",
          summary_json: { marker: userBReviewMarker },
        });
      expect(insertReviewBError).toBeNull();

      const { data: visibleSessionsToA, error: selectSessionAError } =
        await userAClient
          .from("execution_sessions")
          .select("user_id,task_id")
          .in("task_id", [userATaskId, userBTaskId])
          .order("task_id", { ascending: true });
      expect(selectSessionAError).toBeNull();
      expect(visibleSessionsToA).toEqual([
        { user_id: userA.id, task_id: userATaskId },
      ]);

      const { data: visibleReviewsToA, error: selectReviewAError } =
        await userAClient
          .from("review_entries")
          .select("user_id,summary_json")
          .contains("summary_json", { marker: userAReviewMarker });
      expect(selectReviewAError).toBeNull();
      expect(visibleReviewsToA).toEqual([
        { user_id: userA.id, summary_json: { marker: userAReviewMarker } },
      ]);
    } finally {
      if (userATaskId) {
        await deleteSessionByTaskId(userAClient, userATaskId);
        await deleteBlockByTaskId(userAClient, userATaskId);
      }
      if (userBTaskId) {
        await deleteSessionByTaskId(userBClient, userBTaskId);
        await deleteBlockByTaskId(userBClient, userBTaskId);
      }
      await deleteReviewByMarker(userAClient, userAReviewMarker);
      await deleteReviewByMarker(userBClient, userBReviewMarker);
      await deleteTaskByTitle(userAClient, userATaskTitle);
      await deleteTaskByTitle(userBClient, userBTaskTitle);
    }
  });

  it("prevents user A from inserting execution and review rows for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const { error: insertSessionError } = await userAClient
      .from("execution_sessions")
      .insert({
        user_id: userB.id,
        area_id: userB.areaId,
        task_id: null,
        calendar_block_id: null,
        planned_minutes: 60,
        paused_minutes: 0,
        distraction_minutes: 0,
        outcome: "partial",
      });

    const { error: insertReviewError } = await userAClient
      .from("review_entries")
      .insert({
        user_id: userB.id,
        area_id: null,
        review_type: "daily",
        period_start: "2026-05-08",
        period_end: "2026-05-08",
        summary_json: { marker: "cross-user" },
      });

    expect(insertSessionError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
    expect(insertReviewError?.message).toMatch(
      /row-level security|violates row-level/i,
    );
  });

  it("lets user A access own health checks but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userAMarker = `rls-user-a-health-${suffix}`;
    const userBMarker = `rls-user-b-health-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("health_checks")
        .insert({
          user_id: userA.id,
          area_id: null,
          subsystem: "Phase 4E RLS user A",
          status: "healthy",
          score: 100,
          details_json: { marker: userAMarker },
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("health_checks")
        .insert({
          user_id: userB.id,
          area_id: null,
          subsystem: "Phase 4E RLS user B",
          status: "watch",
          score: 50,
          details_json: { marker: userBMarker },
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("health_checks")
        .select("user_id,details_json")
        .in("subsystem", ["Phase 4E RLS user A", "Phase 4E RLS user B"])
        .order("subsystem", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, details_json: { marker: userAMarker } },
      ]);
    } finally {
      await deleteHealthByMarker(userAClient, userAMarker);
      await deleteHealthByMarker(userBClient, userBMarker);
    }
  });

  it("prevents user A from inserting health checks for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error } = await userAClient.from("health_checks").insert({
      user_id: userB.id,
      area_id: null,
      subsystem: "Phase 4E cross-user health",
      status: "critical",
      score: 0,
      details_json: { marker: "cross-user" },
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("prevents authenticated clients from reading Google token ciphertext columns", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error: safeMetadataError } = await userAClient
      .from("google_calendar_connections")
      .select("user_id,provider,status,calendar_id")
      .eq("provider", "google_calendar");
    expect(safeMetadataError).toBeNull();

    const { error: tokenColumnError } = await userAClient
      .from("google_calendar_connections")
      .select("encrypted_access_token,encrypted_refresh_token")
      .eq("provider", "google_calendar");
    expect(tokenColumnError?.message).toMatch(/permission denied/i);
  });

  it("prevents authenticated clients from inserting Google Calendar token and audit rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error: connectionError } = await userAClient
      .from("google_calendar_connections")
      .insert({
        user_id: userA.id,
        provider: "google_calendar",
        calendar_id: "primary",
        encrypted_access_token: "encrypted-user-a-access-token",
        encrypted_refresh_token: "encrypted-user-a-refresh-token",
        granted_scopes_json: [],
        status: "metadata_only",
        token_expires_at: "2026-05-09T01:00:00.000Z",
        token_type: "Bearer",
      });

    const { error: auditError } = await userAClient
      .from("external_write_events")
      .insert({
        user_id: userA.id,
        area_id: null,
        provider: "google_calendar",
        operation: "events.insert",
        target_type: "calendar_block",
        target_id: null,
        request_summary_json: { marker: "cross-user" },
        result_summary_json: {},
        result_status: "failed",
        error_message: "cross-user",
      });

    expect(connectionError?.message).toMatch(/permission denied/i);
    expect(auditError?.message).toMatch(/permission denied/i);
  });

  it("lets user A access own ai_call_traces but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userASurface = `rls-trace-a-${suffix}`;
    const userBSurface = `rls-trace-b-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("ai_call_traces")
        .insert({
          user_id: userA.id,
          surface: userASurface,
          prompt_version: "parse_capture.v1",
          model: "standard-model",
          input_tokens: 12,
          output_tokens: 18,
          latency_ms: 42,
          validation_outcome: "passed",
        });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("ai_call_traces")
        .insert({
          user_id: userB.id,
          surface: userBSurface,
          prompt_version: "parse_capture.v1",
          model: "standard-model",
          input_tokens: null,
          output_tokens: null,
          latency_ms: 100,
          validation_outcome: "schema_failed",
        });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("ai_call_traces")
        .select("user_id,surface,validation_outcome")
        .in("surface", [userASurface, userBSurface])
        .order("surface", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        {
          user_id: userA.id,
          surface: userASurface,
          validation_outcome: "passed",
        },
      ]);
    } finally {
      await deleteAiCallTraceBySurface(userAClient, userASurface);
      await deleteAiCallTraceBySurface(userBClient, userBSurface);
    }
  });

  it("prevents user A from inserting ai_call_traces for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await userAClient.from("ai_call_traces").insert({
      user_id: userB.id,
      surface: `rls-cross-user-trace-${suffix}`,
      prompt_version: "parse_capture.v1",
      model: "standard-model",
      latency_ms: 10,
      validation_outcome: "passed",
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("lets user A access own people but not user B rows", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userAName = `rls-person-a-${suffix}`;
    const userBName = `rls-person-b-${suffix}`;

    try {
      const { error: insertAError } = await userAClient.from("people").insert({
        user_id: userA.id,
        display_name: userAName,
        normalized_name: userAName.toLowerCase(),
      });
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient.from("people").insert({
        user_id: userB.id,
        display_name: userBName,
        normalized_name: userBName.toLowerCase(),
      });
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("people")
        .select("user_id,display_name")
        .in("display_name", [userAName, userBName])
        .order("display_name", { ascending: true });

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, display_name: userAName },
      ]);
    } finally {
      await deletePersonByDisplayName(userAClient, userAName);
      await deletePersonByDisplayName(userBClient, userBName);
    }
  });

  it("prevents user A from inserting people for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = `rls-cross-user-person-${suffix}`;

    const { error } = await userAClient.from("people").insert({
      user_id: userB.id,
      display_name: name,
      normalized_name: name.toLowerCase(),
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("blocks tasks referencing another user's person via the composite FK", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userBPersonName = `rls-fk-person-b-${suffix}`;
    const userATaskTitle = `rls-fk-task-a-${suffix}`;
    let userBPersonId = "";

    try {
      const { data: personB, error: insertPersonBError } = await userBClient
        .from("people")
        .insert({
          user_id: userB.id,
          display_name: userBPersonName,
          normalized_name: userBPersonName.toLowerCase(),
        })
        .select("id")
        .single();
      expect(insertPersonBError).toBeNull();
      userBPersonId = personB!.id;

      // User A cannot attach user B's person to their own task: the composite
      // (person_id, user_id) FK has no matching (id, user_id) row for user A.
      const { error: waitingOnError } = await userAClient.from("tasks").insert({
        user_id: userA.id,
        area_id: userA.areaId,
        title: userATaskTitle,
        status: "active",
        waiting_on_person_id: userBPersonId,
      });
      expect(waitingOnError?.message).toMatch(
        /violates foreign key constraint|tasks_waiting_on_person_fk/i,
      );

      const { error: committedToError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: userATaskTitle,
          status: "active",
          is_commitment: true,
          committed_to_person_id: userBPersonId,
        });
      expect(committedToError?.message).toMatch(
        /violates foreign key constraint|tasks_committed_to_person_fk/i,
      );
    } finally {
      await deleteTaskByTitle(userAClient, userATaskTitle);
      if (userBPersonId) {
        await deletePersonByDisplayName(userBClient, userBPersonName);
      }
    }
  });

  it("lets user A own a task committed to their own person and defaults is_commitment", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const personName = `rls-person-own-${suffix}`;
    const commitmentTitle = `rls-commitment-task-${suffix}`;
    const plainTitle = `rls-plain-task-${suffix}`;
    let personId = "";

    try {
      const { data: person, error: personError } = await userAClient
        .from("people")
        .insert({
          user_id: userA.id,
          display_name: personName,
          normalized_name: personName.toLowerCase(),
        })
        .select("id")
        .single();
      expect(personError).toBeNull();
      personId = person!.id;

      const { data: commitment, error: commitmentError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: commitmentTitle,
          status: "active",
          is_commitment: true,
          committed_to_person_id: personId,
          due_at: "2026-07-10T12:00:00.000Z",
        })
        .select("is_commitment,committed_to_person_id")
        .single();
      expect(commitmentError).toBeNull();
      expect(commitment!.is_commitment).toBe(true);
      expect(commitment!.committed_to_person_id).toBe(personId);

      const { data: plain, error: plainError } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: plainTitle,
          status: "active",
        })
        .select("is_commitment,waiting_on_person_id,committed_to_person_id")
        .single();
      expect(plainError).toBeNull();
      expect(plain!.is_commitment).toBe(false);
      expect(plain!.waiting_on_person_id).toBeNull();
      expect(plain!.committed_to_person_id).toBeNull();
    } finally {
      await deleteTaskByTitle(userAClient, commitmentTitle);
      await deleteTaskByTitle(userAClient, plainTitle);
      if (personId) {
        await deletePersonByDisplayName(userAClient, personName);
      }
    }
  });

  it("find-or-creates a person idempotently on the live table (accept path, FR-017)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // Distinct display casings, one normalized key — the accept path must reuse.
    const displayName = `RLS FindOrCreate ${suffix}`;
    const normalizedName = displayName.toLowerCase();
    const client = userAClient as unknown as MinimalSupabaseClient;

    try {
      const first = await findOrCreatePerson(client, {
        display_name: displayName,
        normalized_name: normalizedName,
      });
      expect(first.provider).toBe("supabase");
      expect(first.person?.id).toBeTruthy();

      // A second accept for the same normalized name must reuse the row, not
      // insert a duplicate — the re-check-at-accept-time idempotency contract.
      const second = await findOrCreatePerson(client, {
        display_name: `${displayName} (again)`,
        normalized_name: normalizedName,
      });
      expect(second.person?.id).toBe(first.person?.id);

      const { data: rows, error } = await userAClient
        .from("people")
        .select("id")
        .eq("normalized_name", normalizedName);
      expect(error).toBeNull();
      expect(rows).toHaveLength(1);

      // The returned id is a real, owned people row that a task can link to.
      const taskTitle = `rls-foc-task-${suffix}`;
      try {
        const { data: task, error: taskError } = await userAClient
          .from("tasks")
          .insert({
            user_id: userA.id,
            area_id: userA.areaId,
            title: taskTitle,
            status: "active",
            waiting_on_person_id: first.person!.id,
            waiting_on_since: new Date().toISOString(),
          })
          .select("waiting_on_person_id")
          .single();
        expect(taskError).toBeNull();
        expect(task!.waiting_on_person_id).toBe(first.person!.id);
      } finally {
        await deleteTaskByTitle(userAClient, taskTitle);
      }
    } finally {
      await deletePersonByDisplayName(userAClient, displayName);
      await deletePersonByDisplayName(userAClient, `${displayName} (again)`);
    }
  });

  it("forces server created_at on authenticated capture inserts and keeps it immutable", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const rawText = `rls-server-ts-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bogusTimestamp = "2020-01-01T00:00:00.000Z";

    try {
      const { data: inserted, error: insertError } = await userAClient
        .from("capture_items")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          raw_text: rawText,
          capture_mode: "text",
          status: "new",
          created_at: bogusTimestamp,
        })
        .select("id,created_at")
        .single();

      expect(insertError).toBeNull();
      const insertedRow = inserted as { id: string; created_at: string };
      expect(insertedRow.created_at).not.toBe(bogusTimestamp);
      expect(
        Math.abs(Date.parse(insertedRow.created_at) - Date.now()),
      ).toBeLessThan(5 * 60 * 1000);

      const { data: updated, error: updateError } = await userAClient
        .from("capture_items")
        .update({ created_at: bogusTimestamp })
        .eq("id", insertedRow.id)
        .select("created_at")
        .single();

      expect(updateError).toBeNull();
      const updatedRow = updated as { created_at: string };
      expect(Date.parse(updatedRow.created_at)).toBe(
        Date.parse(insertedRow.created_at),
      );
    } finally {
      await deleteCaptureByText(userAClient, rawText);
    }
  });

  it("forces server created_at and updated_at on authenticated task inserts", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const title = `rls-server-ts-task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bogusTimestamp = "2020-01-01T00:00:00.000Z";

    try {
      const { data, error } = await userAClient
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title,
          status: "active",
          created_at: bogusTimestamp,
          updated_at: bogusTimestamp,
        })
        .select("created_at,updated_at")
        .single();

      expect(error).toBeNull();
      const row = data as { created_at: string; updated_at: string };
      expect(row.created_at).not.toBe(bogusTimestamp);
      expect(row.updated_at).not.toBe(bogusTimestamp);
      expect(Math.abs(Date.parse(row.created_at) - Date.now())).toBeLessThan(
        5 * 60 * 1000,
      );
      expect(Math.abs(Date.parse(row.updated_at) - Date.now())).toBeLessThan(
        5 * 60 * 1000,
      );
    } finally {
      await deleteTaskByTitle(userAClient, title);
    }
  });

  it("forces server checked_at on authenticated health check inserts", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const subsystem = `rls-server-ts-health-${Date.now()}`;
    const bogusTimestamp = "2020-01-01T00:00:00.000Z";

    try {
      const { data, error } = await userAClient
        .from("health_checks")
        .insert({
          user_id: userA.id,
          area_id: null,
          subsystem,
          status: "healthy",
          score: 100,
          details_json: {},
          checked_at: bogusTimestamp,
        })
        .select("checked_at")
        .single();

      expect(error).toBeNull();
      const row = data as { checked_at: string };
      expect(row.checked_at).not.toBe(bogusTimestamp);
      expect(Math.abs(Date.parse(row.checked_at) - Date.now())).toBeLessThan(
        5 * 60 * 1000,
      );
    } finally {
      await userAClient
        .from("health_checks")
        .delete()
        .eq("subsystem", subsystem);
    }
  });

  // Stage 1 slice S2 (issue #254): operator_profiles owner isolation + areas
  // charter column update.
  it("lets user A read own operator profile but not user B's", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userAText = `rls-operator-a-${suffix}`;
    const userBText = `rls-operator-b-${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("operator_profiles")
        .upsert(
          {
            user_id: userA.id,
            profile_text: userAText,
            compensation_rules: [
              { trait: "starting friction", rule: "require a first move" },
            ],
          },
          { onConflict: "user_id" },
        );
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("operator_profiles")
        .upsert(
          { user_id: userB.id, profile_text: userBText },
          { onConflict: "user_id" },
        );
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("operator_profiles")
        .select("user_id,profile_text");

      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, profile_text: userAText },
      ]);
    } finally {
      await deleteOperatorProfile(userAClient, userA.id);
      await deleteOperatorProfile(userBClient, userB.id);
    }
  });

  it("prevents user A from inserting an operator profile for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);

    const { error } = await userAClient.from("operator_profiles").insert({
      user_id: userB.id,
      profile_text: `rls-cross-user-operator-${Date.now()}`,
    });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("lets user A set an area charter and denies cross-user charter writes", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const charter = `rls-charter-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const { data, error } = await userAClient
        .from("areas")
        .update({
          charter_text: charter,
          charter_updated_at: new Date().toISOString(),
        })
        .eq("id", userA.areaId)
        .select("id,charter_text")
        .single();

      expect(error).toBeNull();
      expect(data).toEqual({ id: userA.areaId, charter_text: charter });

      // User B cannot see or modify user A's charter (RLS on areas).
      const { data: userBUpdate, error: userBError } = await userBClient
        .from("areas")
        .update({ charter_text: "hijack" })
        .eq("id", userA.areaId)
        .select("id");

      expect(userBError).toBeNull();
      expect(userBUpdate).toEqual([]);
    } finally {
      await userAClient
        .from("areas")
        .update({ charter_text: null, charter_updated_at: null })
        .eq("id", userA.areaId);
    }
  });

  // #292 Stage-2 entry gate instrumentation: brief_views. Append-only by
  // design (no update/delete policy, see 20260718120000_add_brief_views.sql)
  // so these tests use a unique per-run viewed_on date instead of the usual
  // insert/cleanup-by-marker pattern — there is no delete policy to clean up
  // with, and the (user_id, viewed_on) primary key means a fixed date would
  // collide across repeated local runs.
  it("lets user A read own brief_views but not user B's", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const viewedOn = randomFutureDateStamp();

    const { error: insertAError } = await userAClient
      .from("brief_views")
      .insert({ user_id: userA.id, viewed_on: viewedOn });
    expect(insertAError).toBeNull();

    const { error: insertBError } = await userBClient
      .from("brief_views")
      .insert({ user_id: userB.id, viewed_on: viewedOn });
    expect(insertBError).toBeNull();

    const { data: visibleToA, error: selectAError } = await userAClient
      .from("brief_views")
      .select("user_id,viewed_on")
      .eq("viewed_on", viewedOn);

    expect(selectAError).toBeNull();
    expect(visibleToA).toEqual([{ user_id: userA.id, viewed_on: viewedOn }]);
  });

  it("prevents user A from inserting brief_views for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const viewedOn = randomFutureDateStamp();

    const { error } = await userAClient
      .from("brief_views")
      .insert({ user_id: userB.id, viewed_on: viewedOn });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("re-inserting the same (user, day) brief_view is a harmless conflict, not a leak", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const viewedOn = randomFutureDateStamp();

    const { error: firstError } = await userAClient
      .from("brief_views")
      .insert({ user_id: userA.id, viewed_on: viewedOn });
    expect(firstError).toBeNull();

    const { error: secondError } = await userAClient
      .from("brief_views")
      .upsert(
        { user_id: userA.id, viewed_on: viewedOn },
        { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
      );
    expect(secondError).toBeNull();

    const { data, error: selectError } = await userAClient
      .from("brief_views")
      .select("user_id,viewed_on")
      .eq("viewed_on", viewedOn);
    expect(selectError).toBeNull();
    expect(data).toEqual([{ user_id: userA.id, viewed_on: viewedOn }]);
  });

  it("denies update and delete on brief_views for both owner and cross-user", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const viewedOn = randomFutureDateStamp();

    const { error: insertError } = await userAClient
      .from("brief_views")
      .insert({ user_id: userA.id, viewed_on: viewedOn });
    expect(insertError).toBeNull();

    // No update policy exists at all: PostgREST reports this as a schema
    // cache / permission failure rather than an RLS row-filter (there is no
    // updatable resource to filter), so this asserts denial broadly instead
    // of the row-level-security message pattern used elsewhere in this file.
    const { data: updateData, error: updateError } = await userAClient
      .from("brief_views")
      .update({ viewed_on: viewedOn })
      .eq("viewed_on", viewedOn)
      .select("viewed_on");
    expect(updateData == null || updateData.length === 0).toBe(true);
    if (updateError) {
      expect(updateError.message).toMatch(
        /permission denied|row-level security|violates row-level/i,
      );
    }

    const { data: deleteData, error: deleteError } = await userAClient
      .from("brief_views")
      .delete()
      .eq("viewed_on", viewedOn)
      .select("viewed_on");
    expect(deleteData == null || deleteData.length === 0).toBe(true);
    if (deleteError) {
      expect(deleteError.message).toMatch(
        /permission denied|row-level security|violates row-level/i,
      );
    }
  });

  // FR-047 slice 2 / FR-033 (#686): purpose_gauge_checkins. Same append-only
  // own-row shape as brief_views (no update/delete policy), with a `response`
  // payload, so these use a unique per-run checked_on and additionally prove
  // the payload can't be revised by a re-tap and created_at can't be forged.
  it("lets user A read own purpose_gauge_checkins but not user B's", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const checkedOn = randomFutureDateStamp();

    const { error: insertAError } = await userAClient
      .from("purpose_gauge_checkins")
      .insert({
        user_id: userA.id,
        checked_on: checkedOn,
        response: "lighter",
      });
    expect(insertAError).toBeNull();

    const { error: insertBError } = await userBClient
      .from("purpose_gauge_checkins")
      .insert({
        user_id: userB.id,
        checked_on: checkedOn,
        response: "heavier",
      });
    expect(insertBError).toBeNull();

    const { data: visibleToA, error: selectAError } = await userAClient
      .from("purpose_gauge_checkins")
      .select("user_id,checked_on,response")
      .eq("checked_on", checkedOn);

    expect(selectAError).toBeNull();
    expect(visibleToA).toEqual([
      { user_id: userA.id, checked_on: checkedOn, response: "lighter" },
    ]);
  });

  it("prevents user A from inserting purpose_gauge_checkins for user B", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const checkedOn = randomFutureDateStamp();

    const { error } = await userAClient
      .from("purpose_gauge_checkins")
      .insert({ user_id: userB.id, checked_on: checkedOn, response: "even" });

    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("rejects a response outside the three FR-033 values", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const checkedOn = randomFutureDateStamp();

    const { error } = await userAClient
      .from("purpose_gauge_checkins")
      .insert({ user_id: userA.id, checked_on: checkedOn, response: "great" });

    expect(error?.message).toMatch(/check constraint|violates check/i);
  });

  it("re-tapping the same day is a no-op that never revises the first response", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const checkedOn = randomFutureDateStamp();

    const { error: firstError } = await userAClient
      .from("purpose_gauge_checkins")
      .insert({
        user_id: userA.id,
        checked_on: checkedOn,
        response: "lighter",
      });
    expect(firstError).toBeNull();

    // A second tap with a DIFFERENT response upserts with ignoreDuplicates:
    // the (user_id, checked_on) PK collision means the row is left untouched.
    const { error: secondError } = await userAClient
      .from("purpose_gauge_checkins")
      .upsert(
        { user_id: userA.id, checked_on: checkedOn, response: "heavier" },
        { onConflict: "user_id,checked_on", ignoreDuplicates: true },
      );
    expect(secondError).toBeNull();

    const { data, error: selectError } = await userAClient
      .from("purpose_gauge_checkins")
      .select("response")
      .eq("checked_on", checkedOn);
    expect(selectError).toBeNull();
    expect(data).toEqual([{ response: "lighter" }]);
  });

  it("overwrites a client-forged created_at with the server clock", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const checkedOn = randomFutureDateStamp();

    const { error: insertError } = await userAClient
      .from("purpose_gauge_checkins")
      .insert({
        user_id: userA.id,
        checked_on: checkedOn,
        response: "even",
        created_at: "2000-01-01T00:00:00.000Z",
      });
    expect(insertError).toBeNull();

    const { data, error: selectError } = await userAClient
      .from("purpose_gauge_checkins")
      .select("created_at")
      .eq("checked_on", checkedOn)
      .single();
    expect(selectError).toBeNull();
    // The BEFORE INSERT trigger forced created_at = now(), so the forged
    // year-2000 value never landed.
    expect(new Date(data!.created_at).getUTCFullYear()).toBeGreaterThanOrEqual(
      2026,
    );
  });

  it("denies update and delete on purpose_gauge_checkins for the owner", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const checkedOn = randomFutureDateStamp();

    const { error: insertError } = await userAClient
      .from("purpose_gauge_checkins")
      .insert({
        user_id: userA.id,
        checked_on: checkedOn,
        response: "lighter",
      });
    expect(insertError).toBeNull();

    // No update policy exists at all, so PostgREST reports a permission /
    // schema failure or an empty affected set — assert denial broadly.
    const { data: updateData, error: updateError } = await userAClient
      .from("purpose_gauge_checkins")
      .update({ response: "heavier" })
      .eq("checked_on", checkedOn)
      .select("response");
    expect(updateData == null || updateData.length === 0).toBe(true);
    if (updateError) {
      expect(updateError.message).toMatch(
        /permission denied|row-level security|violates row-level/i,
      );
    }

    const { data: deleteData, error: deleteError } = await userAClient
      .from("purpose_gauge_checkins")
      .delete()
      .eq("checked_on", checkedOn)
      .select("checked_on");
    expect(deleteData == null || deleteData.length === 0).toBe(true);
    if (deleteError) {
      expect(deleteError.message).toMatch(
        /permission denied|row-level security|violates row-level/i,
      );
    }
  });

  /**
   * #758 — the tests whose absence let the meta-learning audit trail fail in
   * production for the whole life of these tables.
   *
   * They must run as a REAL user JWT (`role: authenticated`). The postgres role
   * owns the tables and `service_role` carries BYPASSRLS plus its own grants,
   * so both of those pass while a signed-in browser gets 42501. That is exactly
   * why this stayed invisible.
   *
   * Each block asserts on the ERROR SHAPE, not just the code, because Postgres
   * returns 42501 for two different failures:
   *   * missing GRANT  -> "permission denied for table <name>"  (the #758 bug)
   *   * policy denial  -> "new row violates row-level security policy for ..."
   * A test that accepted either would go green on a future policy regression.
   */
  it("lets user A record and read own suggestion_records but not user B rows (#758)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userAPolicy = `rls.suggestion.a.${suffix}`;
    const userBPolicy = `rls.suggestion.b.${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("suggestion_records")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          policy_identifier: userAPolicy,
          suggestion_type: "triage_suggestion",
          subject_type: "task_draft",
          suggestion_json: { title: "audit trail" },
          status: "pending",
        });
      expectNoGrantGap(insertAError);
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("suggestion_records")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          policy_identifier: userBPolicy,
          suggestion_type: "triage_suggestion",
          subject_type: "task_draft",
          suggestion_json: { title: "audit trail" },
          status: "pending",
        });
      expectNoGrantGap(insertBError);
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("suggestion_records")
        .select("user_id,policy_identifier,status")
        .in("policy_identifier", [userAPolicy, userBPolicy]);

      expectNoGrantGap(selectAError);
      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        {
          user_id: userA.id,
          policy_identifier: userAPolicy,
          status: "pending",
        },
      ]);

      // The owner can resolve their own pending suggestion — the update path
      // the learning loop uses when a proposal is later accepted or declined.
      const { data: updated, error: updateError } = await userAClient
        .from("suggestion_records")
        .update({ status: "accepted", decided_by: "user" })
        .eq("policy_identifier", userAPolicy)
        .select("status");
      expectNoGrantGap(updateError);
      expect(updateError).toBeNull();
      expect(updated).toEqual([{ status: "accepted" }]);
    } finally {
      await deleteSuggestionRecordsByPolicy(userAClient, userAPolicy);
      await deleteSuggestionRecordsByPolicy(userBClient, userBPolicy);
    }
  });

  it("prevents user A from inserting suggestion_records for user B (#758)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await userAClient.from("suggestion_records").insert({
      user_id: userB.id,
      area_id: null,
      policy_identifier: `rls.suggestion.cross.${suffix}`,
      suggestion_type: "triage_suggestion",
      subject_type: "task_draft",
      suggestion_json: {},
      status: "pending",
    });

    // Denied by the POLICY, not by a missing grant.
    expectNoGrantGap(error);
    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("lets user A record and read own override_records but not user B rows (#758)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userAPolicy = `rls.override.a.${suffix}`;
    const userBPolicy = `rls.override.b.${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("override_records")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          policy_identifier: userAPolicy,
          subject_type: "person_mention",
          subject_id: userA.id,
          override_type: "rejected",
          old_value_json: { proposed_link: true },
          new_value_json: { proposed_link: false },
        });
      expectNoGrantGap(insertAError);
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("override_records")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          policy_identifier: userBPolicy,
          subject_type: "person_mention",
          subject_id: userB.id,
          override_type: "rejected",
          old_value_json: { proposed_link: true },
          new_value_json: { proposed_link: false },
        });
      expectNoGrantGap(insertBError);
      expect(insertBError).toBeNull();

      // This is the read `listOverrideRecords` makes for the S9 override-
      // pattern scan; it 42501'd for every signed-in user before #758.
      const { data: visibleToA, error: selectAError } = await userAClient
        .from("override_records")
        .select("user_id,policy_identifier,override_type")
        .in("policy_identifier", [userAPolicy, userBPolicy]);

      expectNoGrantGap(selectAError);
      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        {
          user_id: userA.id,
          policy_identifier: userAPolicy,
          override_type: "rejected",
        },
      ]);
    } finally {
      await deleteOverrideRecordsByPolicy(userAClient, userAPolicy);
      await deleteOverrideRecordsByPolicy(userBClient, userBPolicy);
    }
  });

  it("prevents user A from inserting override_records for user B (#758)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await userAClient.from("override_records").insert({
      user_id: userB.id,
      area_id: null,
      policy_identifier: `rls.override.cross.${suffix}`,
      subject_type: "person_mention",
      subject_id: userA.id,
      override_type: "rejected",
      old_value_json: {},
      new_value_json: {},
    });

    expectNoGrantGap(error);
    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });

  it("lets user A record and read own health_incidents but not user B rows (#758)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const userBClient = await signIn(userB.email, userB.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userACode = `rls.incident.a.${suffix}`;
    const userBCode = `rls.incident.b.${suffix}`;

    try {
      const { error: insertAError } = await userAClient
        .from("health_incidents")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          subsystem: "calendar_connector",
          severity: "warning",
          status: "open",
          incident_code: userACode,
        });
      expectNoGrantGap(insertAError);
      expect(insertAError).toBeNull();

      const { error: insertBError } = await userBClient
        .from("health_incidents")
        .insert({
          user_id: userB.id,
          area_id: userB.areaId,
          subsystem: "calendar_connector",
          severity: "warning",
          status: "open",
          incident_code: userBCode,
        });
      expectNoGrantGap(insertBError);
      expect(insertBError).toBeNull();

      const { data: visibleToA, error: selectAError } = await userAClient
        .from("health_incidents")
        .select("user_id,incident_code,status")
        .in("incident_code", [userACode, userBCode]);

      expectNoGrantGap(selectAError);
      expect(selectAError).toBeNull();
      expect(visibleToA).toEqual([
        { user_id: userA.id, incident_code: userACode, status: "open" },
      ]);
    } finally {
      await deleteHealthIncidentsByCode(userAClient, userACode);
      await deleteHealthIncidentsByCode(userBClient, userBCode);
    }
  });

  it("prevents user A from inserting health_incidents for user B (#758)", async () => {
    const userAClient = await signIn(userA.email, userA.password);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await userAClient.from("health_incidents").insert({
      user_id: userB.id,
      area_id: null,
      subsystem: "calendar_connector",
      severity: "warning",
      status: "open",
      incident_code: `rls.incident.cross.${suffix}`,
    });

    expectNoGrantGap(error);
    expect(error?.message).toMatch(/row-level security|violates row-level/i);
  });
});

/**
 * #758 regression assertion. `permission denied for table` is the GRANT branch
 * of 42501 — the door being shut before any policy runs. It must never be the
 * answer an authenticated user gets on a table the app expects them to use, and
 * naming the shape here keeps a policy regression from masquerading as this bug
 * (or vice versa).
 */
function expectNoGrantGap(error: { message?: string } | null) {
  if (!error?.message) return;
  expect(
    error.message,
    `authenticated hit the missing-grant branch of 42501: ${error.message}`,
  ).not.toMatch(/permission denied for table/i);
}

async function deleteSuggestionRecordsByPolicy(
  client: SupabaseClient,
  policyIdentifier: string,
) {
  const { error } = await client
    .from("suggestion_records")
    .delete()
    .eq("policy_identifier", policyIdentifier);

  if (error) {
    throw new Error(
      `Could not clean up suggestion_records '${policyIdentifier}': ${error.message}`,
    );
  }
}

async function deleteOverrideRecordsByPolicy(
  client: SupabaseClient,
  policyIdentifier: string,
) {
  const { error } = await client
    .from("override_records")
    .delete()
    .eq("policy_identifier", policyIdentifier);

  if (error) {
    throw new Error(
      `Could not clean up override_records '${policyIdentifier}': ${error.message}`,
    );
  }
}

async function deleteHealthIncidentsByCode(
  client: SupabaseClient,
  incidentCode: string,
) {
  const { error } = await client
    .from("health_incidents")
    .delete()
    .eq("incident_code", incidentCode);

  if (error) {
    throw new Error(
      `Could not clean up health_incidents '${incidentCode}': ${error.message}`,
    );
  }
}

function randomFutureDateStamp(): string {
  // Far enough in the future to never collide with real usage data, random
  // enough per test run to never collide with a previous local RLS run.
  const base = Date.UTC(2080, 0, 1);
  const offsetDays = Math.floor(Math.random() * 3650);
  const stamp = new Date(base + offsetDays * 24 * 60 * 60 * 1000);
  return stamp.toISOString().slice(0, 10);
}

function expectDenied(data: unknown[] | null, error: { code?: string } | null) {
  if (error) {
    expect(["42501", "PGRST301"]).toContain(error.code);
    return;
  }

  expect(data).toEqual([]);
}
