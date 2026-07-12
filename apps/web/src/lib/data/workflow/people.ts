import {
  CreatePersonInputSchema,
  OperatorProfileSchema,
  PersonSchema,
  type CreatePersonInput,
  type OperatorProfile,
  type Person,
} from "@lifeos/schemas";
import {
  normalizeSupabaseRow,
  normalizeSupabaseRows,
} from "../supabaseRowNormalization";
import {
  type DataProvider,
  type MinimalSupabaseClient,
  getSupabaseMessage,
  requireSupabaseUser,
} from "./shared";
import {
  PERSON_LINK_POLICY_ID,
  recordSuggestionFireAndForget,
  uuidPattern,
} from "./metaLearning";

const peopleColumns =
  "id,user_id,display_name,normalized_name,notes,created_at,updated_at,archived_at";

/**
 * S3 (#255): live read of the user's people so a proposed person mention can
 * resolve against an existing person (normalized_name matching) instead of
 * always proposing a new person. Returns an empty list in mock mode. Excludes
 * archived people from matching is left to the resolver; this returns all rows
 * so the caller can decide.
 */
export async function listPeople(
  client: MinimalSupabaseClient | null,
): Promise<Person[]> {
  if (!client) {
    return [];
  }

  await requireSupabaseUser(client, "Sign in before loading people.");

  const query = client.from("people") as {
    select: (columns: string) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data, error } = await query.select(peopleColumns);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return PersonSchema.array().parse(normalizeSupabaseRows(data));
}

export interface PersonFindOrCreateResult {
  provider: DataProvider;
  person: Person | null;
}

/**
 * S3 (#255): user-approved person creation (FR-017), idempotent per
 * normalized_name. Called from the triage accept path only, after the user
 * approved a proposed person link (NS-INV-4). Re-checks for an existing person
 * at accept time (another accept may have created them), inserting only when no
 * match exists. Returns null in mock mode — the local demo path has no people
 * store, so a person link there degrades to no-link.
 *
 * Matching is exact on the normalized key, mirroring the pure resolver. There is
 * no unique index on (user_id, normalized_name), so this is select-then-insert:
 * a concurrent duplicate is narrowed, not fully closed — acceptable under the
 * single-user model and the "re-check at accept time" contract.
 */
export async function findOrCreatePerson(
  client: MinimalSupabaseClient | null,
  input: CreatePersonInput,
): Promise<PersonFindOrCreateResult> {
  const parsedInput = CreatePersonInputSchema.parse(input);

  if (!client) {
    return { provider: "mock", person: null };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating people.",
  );

  const selectQuery = client.from("people") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data: existing, error: existingError } = await selectQuery
    .select(peopleColumns)
    .eq("user_id", user.id)
    .eq("normalized_name", parsedInput.normalized_name)
    .maybeSingle();

  if (existingError) {
    throw new Error(getSupabaseMessage(existingError));
  }

  if (existing) {
    return {
      provider: "supabase",
      person: PersonSchema.parse(normalizeSupabaseRow(existing)),
    };
  }

  const insertQuery = client.from("people") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await insertQuery
    .insert({
      user_id: user.id,
      display_name: parsedInput.display_name,
      normalized_name: parsedInput.normalized_name,
    })
    .select(peopleColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    person: PersonSchema.parse(normalizeSupabaseRow(data)),
  };
}

export interface PersonLinkAcceptanceInput {
  area_id: string | null;
  draft_id: string;
  name: string;
  role: "waiting_on" | "committed_to" | "mention";
  matched_person_id?: string | null;
}

/**
 * S3 (#255): record that the user ACCEPTED a proposed person link. Mirrors
 * `recordPersonLinkRejection` — inserts a terminal-status (`accepted`) suggestion
 * row that resolves the dangling pending person-link proposal, fire-and-forget so
 * a learning-write failure never affects the accept flow (NS-INV-3). A true
 * override row is not written here: an accepted proposal is the default action,
 * not an override.
 */
export function recordPersonLinkAcceptance(
  client: MinimalSupabaseClient | null,
  input: PersonLinkAcceptanceInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: PERSON_LINK_POLICY_ID,
    suggestion_type: "parse_result",
    subject_type: "person_mention",
    subject_id: uuidPattern.test(input.draft_id) ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      name: input.name,
      role: input.role,
      status: "accepted",
      linked_person_id: input.matched_person_id ?? null,
    },
    status: "accepted",
    resolved_at: new Date().toISOString(),
  });
}

const operatorProfileColumns =
  "id,user_id,profile_text,compensation_rules,created_at,updated_at";

/**
 * S3 (#255): live read of the single operator profile so the parse request can
 * carry it through the NS-INV-1 context-assembly module. Returns null when no
 * profile row exists (the empty-profile parity case). Never throws for a
 * missing profile — a personalization read must not break parsing.
 */
export async function getOperatorProfile(
  client: MinimalSupabaseClient | null,
): Promise<OperatorProfile | null> {
  if (!client) {
    return null;
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading the operator profile.",
  );

  const query = client.from("operator_profiles") as {
    select: (columns: string) => {
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data, error } = await query
    .select(operatorProfileColumns)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  if (!data) {
    return null;
  }

  return OperatorProfileSchema.parse(normalizeSupabaseRow(data));
}
