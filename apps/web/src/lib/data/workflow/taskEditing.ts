import { TaskSchema, type Task } from "@lifeos/schemas";
import {
  getSupabaseMessage,
  parseTask,
  requireSupabaseUser,
  taskColumns,
  type MinimalSupabaseClient,
} from "./shared";

/**
 * Reuses the existing `TaskSchema` columns rather than adding a new schema
 * file, so `title`'s `min(1)` and `area_id`'s `uuid()` shape are enforced
 * here too, not just trusted from the caller. `description` stays exactly
 * `TaskSchema`'s own `string | null`.
 */
const TaskEditAccountPatchSchema = TaskSchema.pick({
  title: true,
  description: true,
  area_id: true,
});

export type TaskEditAccountPatch = {
  title: string;
  description: string | null;
  area_id: string;
};

export type TaskEditAccountResult =
  | { provider: "supabase"; status: "updated"; task: Task; userId: string }
  | { provider: "supabase"; status: "conflict" };

/**
 * Issue #984 — the account-row half of the accepted-backlog editor.
 *
 * No RPC, no migration: `tasks` already grants the owning user UPDATE on
 * every column this touches (title/description/area_id), so this is a plain
 * guarded `.update()`. The guard IS the concurrency, status, AND ownership
 * contract — `.eq("status", "backlog")`, `.eq("updated_at",
 * expectedUpdatedAt)`, and `.eq("user_id", user.id)` all have to still hold
 * or the update matches zero rows. RLS already scopes every row to its
 * owner; this repeats that same boundary in the query itself so a stale
 * client-side auth state can never even ATTEMPT to touch another user's row
 * by id alone. `.maybeSingle()` turns the "zero rows" case into `data: null,
 * error: null` rather than a PostgREST "no rows" error, so a stale edit, a
 * task that moved off backlog, or an ownership mismatch all come back as an
 * ordinary `"conflict"` result instead of a thrown error the caller would
 * have to pattern-match out of a message string.
 *
 * `userId` on the `"updated"` result is the id `requireSupabaseUser` proved
 * performed THIS write — callers that later re-check "is this still the
 * same session" must compare identity against this value, not just ask
 * "is anyone signed in".
 */
export async function editBacklogTaskAccountRow(
  client: MinimalSupabaseClient | null,
  taskId: string,
  patch: TaskEditAccountPatch,
  expectedUpdatedAt: string,
): Promise<TaskEditAccountResult> {
  if (!client) {
    throw new Error("Demo backlog task edits use local workflow state.");
  }

  const parsedPatch = TaskEditAccountPatchSchema.parse(patch);

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving task edits.",
  );

  const query = client.from("tasks") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (
            column: string,
            value: string,
          ) => {
            eq: (
              column: string,
              value: string,
            ) => {
              select: (columns: string) => {
                maybeSingle: () => Promise<{
                  data: unknown;
                  error: unknown;
                }>;
              };
            };
          };
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      title: parsedPatch.title,
      description: parsedPatch.description,
      area_id: parsedPatch.area_id,
    })
    .eq("id", taskId)
    .eq("user_id", user.id)
    .eq("status", "backlog")
    .eq("updated_at", expectedUpdatedAt)
    .select(taskColumns)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  if (!data) {
    return { provider: "supabase", status: "conflict" };
  }

  return {
    provider: "supabase",
    status: "updated",
    task: parseTask(data),
    userId: user.id,
  };
}
