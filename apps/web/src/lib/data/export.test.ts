import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildUserDataExport, USER_DATA_EXPORT_TABLES } from "./export";

function clientWithRows(rowsByTable: Record<string, unknown[]>) {
  const queried: string[] = [];
  return {
    queried,
    client: {
      from: vi.fn((table: string) => {
        queried.push(table);
        return {
          select: vi.fn(async () => ({
            data: rowsByTable[table] ?? [],
            error: null,
          })),
        };
      }),
    },
  };
}

describe("buildUserDataExport", () => {
  it("exports every user-owned table except google_calendar_connections", async () => {
    const { client, queried } = clientWithRows({
      areas: [{ id: "a1" }],
      tasks: [{ id: "t1" }, { id: "t2" }],
    });

    const result = await buildUserDataExport(client);

    expect(result.format_version).toBe(1);
    expect(typeof result.exported_at).toBe("string");
    expect(Object.keys(result.tables).sort()).toEqual(
      [...USER_DATA_EXPORT_TABLES].sort(),
    );
    expect(result.tables.areas).toEqual([{ id: "a1" }]);
    expect(result.tables.tasks).toHaveLength(2);
    expect(queried).not.toContain("google_calendar_connections");
  });

  it("fails whole-export with a recoverable message when any table read fails", async () => {
    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn(async () =>
          table === "projects"
            ? { data: null, error: { message: "boom" } }
            : { data: [], error: null },
        ),
      })),
    };

    await expect(buildUserDataExport(client)).rejects.toThrow(
      /Data export failed while reading projects/,
    );
  });
});

// W3-16 finding 3: the builder issues ONE `select("*")` per table, while the
// API caps every response at `max_rows` (supabase/config.toml). PostgREST
// truncates silently past that cap, so a large table can look complete while
// rows are missing. This fake models that cap, read from the real config so
// the two cannot drift, and supports `.order()`/`.range()` so a paginating
// fix can pass. It is a fast regression only: the real API cap is checked by
// `phase4aRls.local.exportCap.test.ts` against local Supabase.
describe("buildUserDataExport above the API row cap (W3-16 #3)", () => {
  function configuredMaxRows() {
    const config = readFileSync(
      resolve(__dirname, "../../../../../supabase/config.toml"),
      "utf8",
    );
    const match = config.match(/^\s*max_rows\s*=\s*(\d+)/m);
    if (!match) throw new Error("supabase/config.toml has no [api] max_rows");
    return Number(match[1]);
  }

  function cappedClient(rowsByTable: Record<string, unknown[]>, cap: number) {
    return {
      from: vi.fn((table: string) => {
        const rows = rowsByTable[table] ?? [];
        return {
          select: vi.fn(() => {
            // Awaiting the select itself is the unpaginated read: capped.
            const unpaginated: Promise<{
              data: unknown;
              error: { message?: string } | null;
            }> = Promise.resolve({ data: rows.slice(0, cap), error: null });
            const query = Object.assign(unpaginated, {
              order: vi.fn((): typeof query => query),
              range: vi.fn(async (from: number, to: number) => ({
                data: rows.slice(from, Math.min(to + 1, from + cap)),
                error: null,
              })),
            });
            return query;
          }),
        };
      }),
    };
  }

  it("control: a table at or under the cap exports every row", async () => {
    const cap = configuredMaxRows();
    const tasks = Array.from({ length: cap }, (_, index) => ({
      id: `task-${index}`,
    }));

    const result = await buildUserDataExport(cappedClient({ tasks }, cap));

    expect(result.tables.tasks).toHaveLength(cap);
  });

  // KNOWN BUG (W3-16 #3): expected failure. One unpaginated select returns
  // at most `max_rows` rows, so row cap + 1 is silently cut. Flip to `it`
  // when the builder pages through every table.
  it.fails(
    "exports every row of a table larger than the API cap, exactly once, without mixing tables",
    async () => {
      const cap = configuredMaxRows();
      const tasks = Array.from({ length: cap + 1 }, (_, index) => ({
        id: `task-${index}`,
      }));
      const captureItems = Array.from({ length: cap + 5 }, (_, index) => ({
        id: `capture-${index}`,
      }));

      const result = await buildUserDataExport(
        cappedClient({ tasks, capture_items: captureItems }, cap),
      );

      const taskIds = (result.tables.tasks as Array<{ id: string }>).map(
        (row) => row.id,
      );
      expect(new Set(taskIds).size).toBe(taskIds.length);
      expect(taskIds).toHaveLength(cap + 1);
      expect(taskIds).toContain(`task-${cap}`);
      const captureIds = (
        result.tables.capture_items as Array<{ id: string }>
      ).map((row) => row.id);
      expect(captureIds).toHaveLength(cap + 5);
      expect(captureIds.every((id) => id.startsWith("capture-"))).toBe(true);
    },
  );
});
