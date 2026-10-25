import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildUserDataExport, USER_DATA_EXPORT_TABLES } from "./export";

// A small API-like store: sort and filter the current rows on each request,
// then apply the response cap. Mutations happen before the next request.
function changingClient(
  rowsByTable: Record<string, Record<string, string>[]>,
  beforeRead: (table: string, page: number) => void,
  cap = 2,
) {
  const pages: Record<string, number> = {};
  const requests: { table: string; orders: string[]; from: number }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => {
        const orders: string[] = [];
        const filters: ((row: Record<string, string>) => boolean)[] = [];
        const condition = (expression: string, row: Record<string, string>) => {
          const match = /^(\w+)\.(gt|eq)\.("[^"]*")$/.exec(expression);
          if (!match) throw new Error(`Unsupported fake filter: ${expression}`);
          const [, column, operator, literal] = match;
          const value = JSON.parse(literal) as string;
          return operator === "gt"
            ? row[column] > value
            : row[column] === value;
        };
        const query = {
          order: (column: string, options: { ascending: boolean }) => {
            expect(options.ascending).toBe(true);
            orders.push(column);
            return query;
          },
          gt: (column: string, value: string) => {
            filters.push((row) => row[column] > value);
            return query;
          },
          or: (expression: string) => {
            const [first, and] = expression.split(",and(");
            if (!and?.endsWith(")"))
              throw new Error("Invalid composite filter");
            filters.push(
              (row) =>
                condition(first, row) ||
                and
                  .slice(0, -1)
                  .split(",")
                  .every((part) => condition(part, row)),
            );
            return query;
          },
          range: async (from: number, to: number) => {
            beforeRead(table, (pages[table] = (pages[table] ?? 0) + 1));
            requests.push({ table, orders, from });
            const rows = [...(rowsByTable[table] ?? [])]
              .filter((row) => filters.every((filter) => filter(row)))
              .sort((a, b) => {
                for (const column of orders) {
                  if (a[column] < b[column]) return -1;
                  if (a[column] > b[column]) return 1;
                }
                return 0;
              });
            return {
              data: rows.slice(from, Math.min(to + 1, from + cap)),
              error: null,
            };
          },
        };
        return query;
      },
    }),
  };
  return { client, requests };
}

describe("export while rows change between pages", () => {
  it.each(["delete", "insert"])(
    "%s before the page boundary does not omit or repeat existing rows",
    async (mutation) => {
      const tasks = ["02", "04", "06", "08"].map((id) => ({ id }));
      const { client } = changingClient({ tasks }, (table, page) => {
        if (table !== "tasks" || page !== 2) return;
        if (mutation === "delete") tasks.shift();
        else tasks.unshift({ id: "01" });
      });

      const result = await buildUserDataExport(client);

      expect(result.tables.tasks).toEqual(
        ["02", "04", "06", "08"].map((id) => ({ id })),
      );
    },
  );

  it.each([
    ["brief_views", "viewed_on"],
    ["purpose_gauge_checkins", "checked_on"],
  ] as const)(
    "continues %s through composite key ties",
    async (table, dateKey) => {
      const rows = [
        { user_id: "user-b", [dateKey]: "2026-10-01" },
        { user_id: "user-a", [dateKey]: "2026-10-03" },
        { user_id: "user-a", [dateKey]: "2026-10-01" },
        { user_id: "user-b", [dateKey]: "2026-10-02" },
        { user_id: "user-a", [dateKey]: "2026-10-02" },
      ];
      const expected = [rows[2], rows[4], rows[1], rows[0], rows[3]];
      const { client, requests } = changingClient(
        { [table]: rows },
        (name, page) => {
          if (name === table && page === 2) rows.splice(2, 1);
        },
      );

      const result = await buildUserDataExport(client);

      expect(result.tables[table]).toEqual(expected);
      const tableRequests = requests.filter(
        (request) => request.table === table,
      );
      expect(tableRequests).toHaveLength(4);
      expect(
        tableRequests.every(
          (request) => request.orders.join(",") === `user_id,${dateKey}`,
        ),
      ).toBe(true);
    },
  );

  it("can include new rows ahead of the cursor without claiming a snapshot", async () => {
    const tasks = ["02", "04", "08"].map((id) => ({ id }));
    const { client } = changingClient({ tasks }, (table, page) => {
      if (table === "tasks" && page === 2) tasks.push({ id: "06" });
    });

    expect((await buildUserDataExport(client)).tables.tasks).toEqual(
      ["02", "04", "06", "08"].map((id) => ({ id })),
    );
  });
});

function pagedSelect(
  result: { data: unknown[] | null; error: { message?: string } | null },
  cap = 1000,
) {
  let rows = [...(result.data ?? [])] as Record<string, string>[];
  const query = {
    order: vi.fn((column: string): typeof query => {
      rows.sort((a, b) =>
        a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0,
      );
      return query;
    }),
    gt: vi.fn((column: string, value: string): typeof query => {
      rows = rows.filter((row) => row[column] > value);
      return query;
    }),
    or: vi.fn((): typeof query => {
      throw new Error("Use changingClient for composite-key rows");
    }),
    range: vi.fn(async (from: number, to: number) =>
      result.error
        ? { data: null, error: result.error }
        : { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null },
    ),
  };
  return query;
}

function clientWithRows(rowsByTable: Record<string, unknown[]>) {
  const queried: string[] = [];
  return {
    queried,
    client: {
      from: vi.fn((table: string) => {
        queried.push(table);
        return {
          select: vi.fn(() =>
            pagedSelect({ data: rowsByTable[table] ?? [], error: null }),
          ),
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
        select: vi.fn(() =>
          pagedSelect(
            table === "projects"
              ? { data: null, error: { message: "boom" } }
              : { data: [], error: null },
          ),
        ),
      })),
    };

    await expect(buildUserDataExport(client)).rejects.toThrow(
      /Data export failed while reading projects/,
    );
  });

  it("fails closed if the response cannot supply a cursor", async () => {
    const { client } = clientWithRows({ tasks: [{ note: "private-marker" }] });
    await expect(buildUserDataExport(client)).rejects.toThrow(
      "Data export failed while reading tasks. Nothing was exported; try again.",
    );
  });

  it("fails closed if a response repeats the previous cursor", async () => {
    let taskPages = 0;
    const client = {
      from: (table: string) => ({
        select: () => {
          if (table === "tasks" && ++taskPages > 2) {
            throw new Error("Unexpected third request after a stalled cursor");
          }
          const query = pagedSelect({
            data: table === "tasks" ? [{ id: "task-1" }] : [],
            error: null,
          });
          query.gt.mockImplementation(() => query);
          return query;
        },
      }),
    };

    await expect(buildUserDataExport(client)).rejects.toThrow(
      "Data export failed while reading tasks. Nothing was exported; try again.",
    );
    expect(taskPages).toBe(2);
  });

  // Every page uses the same primary-key order as the continuation cursor.
  it("orders every page by the table's primary key", async () => {
    const orders: Record<string, string[]> = {};
    type RecordingQuery = {
      order: (column: string) => RecordingQuery;
      range: ReturnType<typeof pagedSelect>["range"];
      gt: ReturnType<typeof pagedSelect>["gt"];
      or: ReturnType<typeof pagedSelect>["or"];
    };
    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => {
          const { range, gt, or } = pagedSelect({ data: [], error: null });
          const query: RecordingQuery = {
            order: (column: string) => {
              (orders[table] ??= []).push(column);
              return query;
            },
            range,
            gt,
            or,
          };
          return query;
        }),
      })),
    };

    await buildUserDataExport(client);

    expect(orders.tasks).toEqual(["id"]);
    expect(orders.brief_views).toEqual(["user_id", "viewed_on"]);
    expect(orders.purpose_gauge_checkins).toEqual(["user_id", "checked_on"]);
    for (const table of USER_DATA_EXPORT_TABLES) {
      expect(orders[table]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

// W3-16 finding 3: the builder used to issue ONE `select("*")` per table,
// while the API caps every response at `max_rows` (supabase/config.toml).
// PostgREST truncates silently past that cap, so a large table could look
// complete while rows were missing. This fake models that cap, read from the
// real config so the two cannot drift, and supports `.order()`/`.range()`.
// It is a fast regression only: the real API cap is checked by
// `phase4aRls.local.w316.test.ts` against local Supabase.
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
          select: vi.fn(() =>
            Object.assign(
              Promise.resolve({ data: rows.slice(0, cap), error: null }),
              pagedSelect({ data: rows, error: null }, cap),
            ),
          ),
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

  // W3-16 #3: the builder pages through every table, so row cap + 1 and
  // beyond all come through.
  it("exports every row of a table larger than the API cap, exactly once, without mixing tables", async () => {
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
  });
});
