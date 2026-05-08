import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const runLocalRlsTests = process.env.RUN_SUPABASE_RLS_TESTS === "1";
const describeLocalRls = runLocalRlsTests ? describe : describe.skip;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
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
    throw new Error(`Could not clean up capture '${rawText}': ${error.message}`);
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

  it("denies unauthenticated anon reads for areas and capture_items", async () => {
    const anonClient = createLocalClient();

    const { data: areas, error: areasError } = await anonClient
      .from("areas")
      .select("id");
    const { data: captures, error: capturesError } = await anonClient
      .from("capture_items")
      .select("id");

    expectDenied(areas, areasError);
    expectDenied(captures, capturesError);
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
      expect(visibleToA).toEqual([{ user_id: userA.id, raw_text: userARawText }]);
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
});

function expectDenied(data: unknown[] | null, error: { code?: string } | null) {
  if (error) {
    expect(error.code).toBe("42501");
    return;
  }

  expect(data).toEqual([]);
}
