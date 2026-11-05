// W3-16 finding 7: the export route maps a mid-request "JWT expired" to a
// 401 sign-in recovery response, but its own tests mock the export builder
// to throw that raw text. The REAL builder (`buildUserDataExport`) replaces
// every table-read error with generic copy, so the route can no longer see
// that the sign-in expired. These tests keep the real builder and fake only
// the user-scoped database client.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_DATA_EXPORT_TABLES } from "@/lib/data/export";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

import { GET } from "./route";

const AUTH_REJECTED_COPY =
  "Your sign-in is missing or has expired. Sign in again, then retry.";

const makeRequest = () =>
  new Request("http://localhost/api/export", {
    headers: { authorization: "Bearer good" },
  });

// The later of two tables fails, so an early table has already been read:
// a partial export must never reach the caller.
const EARLY_TABLE = USER_DATA_EXPORT_TABLES[0];
const FAILING_TABLE = USER_DATA_EXPORT_TABLES[4];

// The builder reads each table in pages (`.order()` then `.range()`), the
// way the real PostgREST client does. This fake answers the same calls.
function pagedSelect(result: {
  data: unknown[] | null;
  error: { message: string; code?: string } | null;
}) {
  let rows = (result.data ?? []) as { id: string }[];
  const query = {
    order: vi.fn((): typeof query => query),
    gt: vi.fn((column: string, value: string): typeof query => {
      expect(column).toBe("id");
      rows = rows.filter((row) => row.id > value);
      return query;
    }),
    or: vi.fn((): typeof query => {
      throw new Error("This fixture has no composite-key rows");
    }),
    range: vi.fn(async (from: number, to: number) =>
      result.error
        ? { data: null, error: result.error }
        : { data: rows.slice(from, to + 1), error: null },
    ),
  };
  return query;
}

function clientFailingAt(error: { message: string; code?: string }) {
  const queried: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      queried.push(table);
      return {
        select: vi.fn(() =>
          pagedSelect(
            table === FAILING_TABLE
              ? { data: null, error }
              : {
                  data:
                    table === EARLY_TABLE
                      ? [{ id: "early-row", note: "synthetic" }]
                      : [],
                  error: null,
                },
          ),
        ),
      };
    }),
  };
  return { client, queried };
}

describe("GET /api/export with the real export builder (W3-16 #7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("control: a complete read exports every table", async () => {
    // No table fails in this control.
    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() =>
          pagedSelect({
            data: table === EARLY_TABLE ? [{ id: "early-row" }] : [],
            error: null,
          }),
        ),
      })),
    };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client,
      user: { id: "user-1" },
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.tables).sort()).toEqual(
      [...USER_DATA_EXPORT_TABLES].sort(),
    );
    expect(body.tables[EARLY_TABLE]).toEqual([{ id: "early-row" }]);
  });

  it("control: a non-auth table failure is a 500 with fixed copy and no partial export", async () => {
    const { client } = clientFailingAt({
      message: "canceling statement due to statement timeout",
      code: "57014",
    });
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client,
      user: { id: "user-1" },
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("statement timeout");
    expect(text).not.toContain("early-row");
  });

  it("a sign-in that expires mid-export reaches the caller as the 401 recovery response", async () => {
    const { client, queried } = clientFailingAt({
      message: "JWT expired",
      code: "PGRST301",
    });
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client,
      user: { id: "user-1" },
    });

    const response = await GET(makeRequest());

    // The early table really was read before the failure.
    expect(queried).toContain(EARLY_TABLE);
    const text = await response.text();
    expect(text).not.toContain("early-row");
    expect(text).not.toContain("PGRST301");
    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
      error: AUTH_REJECTED_COPY,
    });
  });

  it("expires on a later page without returning rows already read from that table", async () => {
    let taskPages = 0;
    const client = {
      from: (table: string) => ({
        select: () => {
          if (table === FAILING_TABLE && ++taskPages === 2) {
            return pagedSelect({
              data: null,
              error: {
                message: "JWT expired: provider detail",
                code: "PGRST301",
              },
            });
          }
          return pagedSelect({
            data:
              table === FAILING_TABLE
                ? [{ id: "task-private-marker" }]
                : table === EARLY_TABLE
                  ? [{ id: "early-private-marker" }]
                  : [],
            error: null,
          });
        },
      }),
    };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client,
      user: { id: "user-1" },
    });

    const response = await GET(makeRequest());
    const text = await response.text();

    expect(taskPages).toBe(2);
    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
      error: AUTH_REJECTED_COPY,
    });
    for (const secret of [
      "task-private-marker",
      "early-private-marker",
      "PGRST301",
      "provider detail",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
