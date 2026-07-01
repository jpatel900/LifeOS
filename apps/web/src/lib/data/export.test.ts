import { describe, expect, it, vi } from "vitest";
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
