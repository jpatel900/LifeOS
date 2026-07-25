import {
  AreaSchema,
  CreateAreaInputSchema,
  SoftDeleteAreaInputSchema,
  UpdateAreaColorInputSchema,
  type Area,
  type CreateAreaInput,
  type SoftDeleteAreaInput,
  type UpdateAreaColorInput,
} from "@lifeos/schemas";
import { normalizeSupabaseRow } from "../supabaseRowNormalization";
import {
  type AreaColorUpdateResult,
  type AreaCreateResult,
  type AreaListResult,
  type AreaSoftDeleteResult,
  type MinimalSupabaseClient,
  areaColumns,
  getSupabaseMessage,
  mockAreas,
  mockUserId,
  parseAreas,
  requireSupabaseUser,
  uniqueAreaSlug,
} from "./shared";

/**
 * THE FOUR MESSAGES IN THIS FILE ARE READ BY A PERSON (#692 Slice E)
 * =================================================================
 * Slice E traced all 36 of its baselined strings to their terminus. 32 are
 * caught and replaced before display (`markPersistedSaveFailure` /
 * `markPersistedLoadFailure` in `WorkflowContext.tsx`, or the generic
 * `{ ok: false, error: "Something went wrong." }` body every Route Handler
 * returns since #670) or are unreachable. These four are the exception: the
 * `/settings/areas` screen renders `error.message` VERBATIM in a destructive
 * Alert from three separate catch sites —
 *   - `settings/areas/useAreasLoadState.ts` -> `settings/areas/page.tsx`
 *   - `settings/areas/CreateAreaForm.tsx`
 *   - `settings/areas/AreaRegistryCards.tsx` (accent + remove)
 * — and `middleware.ts` deliberately does no route protection, so a
 * signed-out visitor with an account configured reaches that screen and
 * reads whatever these say.
 *
 * "SIGN IN BEFORE" IS A LOAD-BEARING PREFIX. DO NOT REWORD IT.
 * `workflowContext/reducerCore.ts`'s `isSignedOutError` classifies these by
 * `message.toLowerCase().startsWith("sign in before")`. That test is what
 * routes a signed-out session to the calm `signedOutLocalMessage` banner
 * instead of the failure-toned `persistedLoadFailureMessage`. Change the
 * first three words and the banner silently switches to failure language
 * while every test still passes. The tail after the prefix is free — that
 * is the half #692 rewrote.
 *
 * The tails say "your account" because that is already the shipped noun for
 * this thing everywhere else (`saveModeLabel` -> "Saved to account",
 * `SAVED_ON_THIS_DEVICE_SHORT` -> "…not in your account yet"). Do not invent
 * a second name for it here.
 */
export async function listAreas(
  client: MinimalSupabaseClient | null,
  options: { includeInactive?: boolean } = {},
): Promise<AreaListResult> {
  if (!client) {
    return {
      provider: "mock",
      areas: options.includeInactive
        ? mockAreas
        : mockAreas.filter((area) => area.is_active),
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading the areas saved in your account.",
  );

  let data: unknown;
  let error: unknown;

  if (options.includeInactive) {
    const query = client.from("areas") as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };

    ({ data, error } = await query
      .select(areaColumns)
      .order("sort_order", { ascending: true }));
  } else {
    const query = client.from("areas") as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          eq: (
            column: string,
            value: boolean,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };

    ({ data, error } = await query
      .select(areaColumns)
      .order("sort_order", { ascending: true })
      .eq("is_active", true));
  }

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    areas: parseAreas(data),
  };
}

export async function createArea(
  client: MinimalSupabaseClient | null,
  input: CreateAreaInput,
): Promise<AreaCreateResult> {
  const parsedInput = CreateAreaInputSchema.parse(input);

  if (!client) {
    const now = new Date().toISOString();
    const slug = uniqueAreaSlug(
      parsedInput.name,
      mockAreas.map((area) => area.slug),
    );

    return {
      provider: "mock",
      area: AreaSchema.parse({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        name: parsedInput.name,
        slug,
        description: parsedInput.description,
        color: parsedInput.color ?? null,
        icon: null,
        sort_order: mockAreas.length,
        is_active: true,
        created_at: now,
        updated_at: now,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving a new area to your account.",
  );

  const listQuery = client.from("areas") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data: existingData, error: existingError } = await listQuery
    .select(areaColumns)
    .order("sort_order", { ascending: true });

  if (existingError) {
    throw new Error(getSupabaseMessage(existingError));
  }

  const existingAreas = parseAreas(existingData);
  const slug = uniqueAreaSlug(
    parsedInput.name,
    existingAreas.map((area) => area.slug),
  );
  const sortOrder =
    existingAreas.reduce(
      (maxSortOrder, area) => Math.max(maxSortOrder, area.sort_order),
      -1,
    ) + 1;

  const query = client.from("areas") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      user_id: user.id,
      name: parsedInput.name,
      slug,
      description: parsedInput.description,
      color: parsedInput.color ?? null,
      icon: null,
      sort_order: sortOrder,
      is_active: true,
    })
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function softDeleteArea(
  client: MinimalSupabaseClient | null,
  input: SoftDeleteAreaInput,
): Promise<AreaSoftDeleteResult> {
  const parsedInput = SoftDeleteAreaInputSchema.parse(input);

  if (!client) {
    const area = mockAreas.find((item) => item.id === parsedInput.area_id);

    if (!area) {
      throw new Error("Area not found.");
    }

    return {
      provider: "mock",
      area: AreaSchema.parse({
        ...area,
        is_active: false,
        updated_at: new Date().toISOString(),
      }),
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before removing an area from your account.",
  );

  const query = client.from("areas") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      is_active: false,
    })
    .eq("id", parsedInput.area_id)
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function updateAreaColor(
  client: MinimalSupabaseClient | null,
  input: UpdateAreaColorInput,
): Promise<AreaColorUpdateResult> {
  const parsedInput = UpdateAreaColorInputSchema.parse(input);

  if (!client) {
    const area = mockAreas.find((item) => item.id === parsedInput.area_id);

    if (!area) {
      throw new Error("Area not found.");
    }

    const updatedArea = AreaSchema.parse({
      ...area,
      color: parsedInput.color,
      updated_at: new Date().toISOString(),
    });
    const index = mockAreas.findIndex(
      (item) => item.id === parsedInput.area_id,
    );
    mockAreas.splice(index, 1, updatedArea);

    return {
      provider: "mock",
      area: updatedArea,
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before saving an area's accent to your account.",
  );

  const query = client.from("areas") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      color: parsedInput.color,
    })
    .eq("id", parsedInput.area_id)
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}
