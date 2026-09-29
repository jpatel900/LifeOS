import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Task } from "@lifeos/schemas";
import {
  localDayStampFromDueAt,
  localNoonIsoForDay,
  selectBackTodayTasks,
} from "./backToday";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const AREA_A = "22222222-2222-4222-8222-222222222222";
const AREA_B = "33333333-3333-4333-8333-333333333333";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "44444444-4444-4444-8444-444444444444",
    user_id: USER_ID,
    area_id: AREA_A,
    project_id: null,
    source_capture_item_id: null,
    title: "A put-off task",
    description: null,
    status: "backlog",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    is_reversible: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    waiting_on_person_id: null,
    waiting_on_since: null,
    is_commitment: false,
    committed_to_person_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("localNoonIsoForDay / localDayStampFromDueAt round trip", () => {
  it("stores local noon and reads the same local day back", () => {
    const stored = localNoonIsoForDay("2026-09-30");
    expect(localDayStampFromDueAt(stored)).toBe("2026-09-30");
  });

  it("round-trips through both Z and +00:00 offset forms", () => {
    // A `Z` value (what `toISOString()`/`localNoonIsoForDay` produce).
    expect(localDayStampFromDueAt("2026-09-30T16:00:00.000Z")).toBe(
      "2026-09-30",
    );
    // The same instant, spelled with an explicit `+00:00` offset — the form
    // PostgREST can return (see `TaskSchema.due_at`'s `offsetDatetime()`).
    expect(localDayStampFromDueAt("2026-09-30T16:00:00.000+00:00")).toBe(
      localDayStampFromDueAt("2026-09-30T16:00:00.000Z"),
    );
  });

  it("returns null for a null due_at and for an unparsable string", () => {
    expect(localDayStampFromDueAt(null)).toBeNull();
    expect(localDayStampFromDueAt("not-a-date")).toBeNull();
  });

  it("rejects a day that does not exist on the calendar", () => {
    expect(() => localNoonIsoForDay("2026-02-30")).toThrow(RangeError);
  });

  it("rejects a malformed day string", () => {
    expect(() => localNoonIsoForDay("2026/09/30")).toThrow(RangeError);
  });
});

describe("selectBackTodayTasks", () => {
  it("includes a backlog task whose return day is today", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const t = task({ due_at: localNoonIsoForDay("2026-09-30") });
    expect(selectBackTodayTasks([t], null, now)).toEqual([t]);
  });

  it("includes a backlog task whose return day is in the past", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const t = task({ due_at: localNoonIsoForDay("2026-09-20") });
    expect(selectBackTodayTasks([t], null, now)).toEqual([t]);
  });

  it("excludes a backlog task whose return day is tomorrow", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const t = task({ due_at: localNoonIsoForDay("2026-10-01") });
    expect(selectBackTodayTasks([t], null, now)).toEqual([]);
  });

  it("is correct for `now` just before local midnight (still yesterday's day)", () => {
    // 2026-09-29 23:59:59.999 local — the return day is still "tomorrow"
    // from this instant's point of view.
    const now = new Date(2026, 8, 29, 23, 59, 59, 999);
    const t = task({ due_at: localNoonIsoForDay("2026-09-30") });
    expect(selectBackTodayTasks([t], null, now)).toEqual([]);
  });

  it("is correct for `now` just after local midnight (the day has arrived)", () => {
    // 2026-09-30 00:00:00.001 local.
    const now = new Date(2026, 8, 30, 0, 0, 0, 1);
    const t = task({ due_at: localNoonIsoForDay("2026-09-30") });
    expect(selectBackTodayTasks([t], null, now)).toEqual([t]);
  });

  describe("DST-change days (local noon storage survives the shift)", () => {
    // These assertions need a host time zone that actually observes DST —
    // pinned to America/Toronto (the owner's zone) so they hold on any CI
    // runner, not only a developer machine that happens to be in one.
    // Reassigning `process.env.TZ` changes what `Date`'s local-time methods
    // read on Node (confirmed empirically on this host/Node build); if a
    // future runtime stops honoring a reassigned `TZ`, these tests would
    // start passing vacuously (no zone ever crosses the jump) rather than
    // failing loudly — that risk is accepted here for CI portability.
    const originalTz = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = "America/Toronto";
    });

    afterEach(() => {
      // Assigning `undefined` would store the string "undefined".
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it("spring-forward, 2026-03-08 (clocks jump 2:00am -> 3:00am EDT)", () => {
      const dueDay = "2026-03-08";
      const t = task({ due_at: localNoonIsoForDay(dueDay) });
      // Local noon survives the day's own 1-hour gap: read back as the
      // exact same local day the person picked.
      expect(localDayStampFromDueAt(t.due_at)).toBe(dueDay);

      // The day before: not arrived yet.
      const dayBefore = new Date(2026, 2, 7, 23, 59, 59, 999);
      expect(selectBackTodayTasks([t], null, dayBefore)).toEqual([]);

      // The transition day itself, just after local midnight (still
      // standard time, before the 2am jump) — arrived.
      const justAfterMidnight = new Date(2026, 2, 8, 0, 0, 0, 1);
      expect(selectBackTodayTasks([t], null, justAfterMidnight)).toEqual([t]);

      // The transition day, just after the 2am jump (now daylight time) —
      // still arrived, same local day.
      const justAfterTheJump = new Date(2026, 2, 8, 3, 0, 0);
      expect(selectBackTodayTasks([t], null, justAfterTheJump)).toEqual([t]);
    });

    it("fall-back, 2026-11-01 (clocks repeat 1:00am-2:00am EST, the extra hour)", () => {
      const dueDay = "2026-11-01";
      const t = task({ due_at: localNoonIsoForDay(dueDay) });
      expect(localDayStampFromDueAt(t.due_at)).toBe(dueDay);

      const dayBefore = new Date(2026, 9, 31, 23, 59, 59, 999);
      expect(selectBackTodayTasks([t], null, dayBefore)).toEqual([]);

      const justAfterMidnight = new Date(2026, 10, 1, 0, 0, 0, 1);
      expect(selectBackTodayTasks([t], null, justAfterMidnight)).toEqual([t]);

      // Well past the repeated hour, same local day — still arrived.
      const laterThatDay = new Date(2026, 10, 1, 12, 0, 0);
      expect(selectBackTodayTasks([t], null, laterThatDay)).toEqual([t]);
    });
  });

  it("never includes a non-backlog task, whatever its due_at", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const due = localNoonIsoForDay("2026-09-20");
    const statuses: Task["status"][] = [
      "draft",
      "active",
      "scheduled",
      "blocked",
      "done",
      "dropped",
      "archived",
    ];
    for (const status of statuses) {
      const t = task({ status, due_at: due });
      expect(selectBackTodayTasks([t], null, now)).toEqual([]);
    }
  });

  it("never includes a backlog task with no due_at", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const t = task({ due_at: null });
    expect(selectBackTodayTasks([t], null, now)).toEqual([]);
  });

  it("scopes strictly to the given area — never appears in another area's view", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const due = localNoonIsoForDay("2026-09-20");
    const inAreaA = task({ id: "a", area_id: AREA_A, due_at: due });
    const inAreaB = task({ id: "b", area_id: AREA_B, due_at: due });

    expect(selectBackTodayTasks([inAreaA, inAreaB], AREA_A, now)).toEqual([
      inAreaA,
    ]);
    expect(selectBackTodayTasks([inAreaA, inAreaB], AREA_B, now)).toEqual([
      inAreaB,
    ]);
  });

  it("includes every area when areaId is null or undefined (All areas)", () => {
    const now = new Date(2026, 8, 30, 9, 0, 0);
    const due = localNoonIsoForDay("2026-09-20");
    const inAreaA = task({ id: "a", area_id: AREA_A, due_at: due });
    const inAreaB = task({ id: "b", area_id: AREA_B, due_at: due });

    expect(selectBackTodayTasks([inAreaA, inAreaB], null, now)).toEqual([
      inAreaA,
      inAreaB,
    ]);
    expect(selectBackTodayTasks([inAreaA, inAreaB], undefined, now)).toEqual([
      inAreaA,
      inAreaB,
    ]);
  });
});
