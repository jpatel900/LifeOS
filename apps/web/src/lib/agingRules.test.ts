import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGING_THRESHOLDS,
  findAgingWaitingOnItems,
  findOpenCommitments,
  findStaleCommitments,
  summarizeAging,
  type AgingRuleTask,
} from "./agingRules";

const NOW = new Date("2026-07-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function makeTask(overrides: Partial<AgingRuleTask> = {}): AgingRuleTask {
  return {
    id: "task-1",
    area_id: "area-main",
    title: "Untitled task",
    status: "active",
    created_at: isoDaysBefore(NOW, 10),
    waiting_on_person_id: null,
    waiting_on_since: null,
    is_commitment: false,
    committed_to_person_id: null,
    ...overrides,
  };
}

describe("findAgingWaitingOnItems", () => {
  it("does not flag a waiting-on item exactly at the 3-day default threshold", () => {
    const task = makeTask({
      id: "exactly-3-days",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 3),
    });

    const result = findAgingWaitingOnItems([task], { now: NOW });

    expect(result).toHaveLength(0);
  });

  it("flags a waiting-on item just over the 3-day default threshold", () => {
    const task = makeTask({
      id: "just-over-3-days",
      waiting_on_person_id: "person-1",
      waiting_on_since: new Date(
        NOW.getTime() - 3 * DAY_MS - 60 * 1000,
      ).toISOString(),
    });

    const result = findAgingWaitingOnItems([task], { now: NOW });

    expect(result).toHaveLength(1);
    expect(result[0].task.id).toBe("just-over-3-days");
    expect(result[0].thresholdDays).toBe(
      DEFAULT_AGING_THRESHOLDS.waitingOnDays,
    );
  });

  it("does not flag a waiting-on item under the threshold", () => {
    const task = makeTask({
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 1),
    });

    expect(findAgingWaitingOnItems([task], { now: NOW })).toHaveLength(0);
  });

  it("applies a per-area override instead of the global default", () => {
    const laxAreaTask = makeTask({
      id: "lax-area",
      area_id: "area-lax",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 5),
    });
    const strictAreaTask = makeTask({
      id: "strict-area",
      area_id: "area-strict",
      waiting_on_person_id: "person-2",
      waiting_on_since: isoDaysBefore(NOW, 2),
    });

    const result = findAgingWaitingOnItems([laxAreaTask, strictAreaTask], {
      now: NOW,
      areaOverrides: {
        "area-lax": { waitingOnDays: 7 },
        "area-strict": { waitingOnDays: 1 },
      },
    });

    expect(result.map((item) => item.task.id)).toEqual(["strict-area"]);
    expect(result[0].thresholdDays).toBe(1);
  });

  it("skips tasks with a person but no waiting_on_since (S3 sets both together)", () => {
    const task = makeTask({
      waiting_on_person_id: "person-1",
      waiting_on_since: null,
    });

    expect(findAgingWaitingOnItems([task], { now: NOW })).toHaveLength(0);
  });

  it("skips tasks with waiting_on_since but no person id", () => {
    const task = makeTask({
      waiting_on_person_id: null,
      waiting_on_since: isoDaysBefore(NOW, 10),
    });

    expect(findAgingWaitingOnItems([task], { now: NOW })).toHaveLength(0);
  });

  it("excludes closed tasks even when aged past threshold", () => {
    const done = makeTask({
      status: "done",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 30),
    });
    const dropped = makeTask({
      id: "task-2",
      status: "dropped",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 30),
    });
    const archived = makeTask({
      id: "task-3",
      status: "archived",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 30),
    });

    expect(
      findAgingWaitingOnItems([done, dropped, archived], { now: NOW }),
    ).toHaveLength(0);
  });

  it("returns an empty array for an empty task list", () => {
    expect(findAgingWaitingOnItems([], { now: NOW })).toEqual([]);
  });

  it("handles a table with all-null person/waiting columns without crashing", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];

    expect(() => findAgingWaitingOnItems(tasks, { now: NOW })).not.toThrow();
    expect(findAgingWaitingOnItems(tasks, { now: NOW })).toEqual([]);
  });

  it("sorts aging items oldest-first", () => {
    const newer = makeTask({
      id: "newer",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 4),
    });
    const older = makeTask({
      id: "older",
      waiting_on_person_id: "person-2",
      waiting_on_since: isoDaysBefore(NOW, 20),
    });

    const result = findAgingWaitingOnItems([newer, older], { now: NOW });

    expect(result.map((item) => item.task.id)).toEqual(["older", "newer"]);
  });
});

describe("findOpenCommitments / findStaleCommitments", () => {
  it("returns open commitments sorted oldest-created-first", () => {
    const newer = makeTask({
      id: "newer-commitment",
      is_commitment: true,
      created_at: isoDaysBefore(NOW, 1),
    });
    const older = makeTask({
      id: "older-commitment",
      is_commitment: true,
      created_at: isoDaysBefore(NOW, 9),
    });
    const notCommitment = makeTask({
      id: "not-a-commitment",
      is_commitment: false,
    });

    const result = findOpenCommitments([newer, older, notCommitment]);

    expect(result.map((task) => task.id)).toEqual([
      "older-commitment",
      "newer-commitment",
    ]);
  });

  it("excludes closed commitments from open commitments", () => {
    const doneCommitment = makeTask({
      is_commitment: true,
      status: "done",
    });

    expect(findOpenCommitments([doneCommitment])).toEqual([]);
  });

  it("does not flag a commitment exactly at the 3-day default threshold", () => {
    const task = makeTask({
      is_commitment: true,
      created_at: isoDaysBefore(NOW, 3),
    });

    expect(findStaleCommitments([task], { now: NOW })).toHaveLength(0);
  });

  it("flags a commitment just over the 3-day default threshold", () => {
    const task = makeTask({
      id: "stale-commitment",
      is_commitment: true,
      created_at: new Date(
        NOW.getTime() - 3 * DAY_MS - 60 * 1000,
      ).toISOString(),
    });

    const result = findStaleCommitments([task], { now: NOW });

    expect(result).toHaveLength(1);
    expect(result[0].task.id).toBe("stale-commitment");
    expect(result[0].committedSince).toBe(task.created_at);
  });

  it("applies a per-area commitment override", () => {
    const task = makeTask({
      area_id: "area-strict",
      is_commitment: true,
      created_at: isoDaysBefore(NOW, 2),
    });

    const result = findStaleCommitments([task], {
      now: NOW,
      areaOverrides: { "area-strict": { commitmentDays: 1 } },
    });

    expect(result).toHaveLength(1);
    expect(result[0].thresholdDays).toBe(1);
  });

  it("does not require a committed_to_person_id (commitment may have no linked person)", () => {
    const task = makeTask({
      is_commitment: true,
      committed_to_person_id: null,
      created_at: isoDaysBefore(NOW, 10),
    });

    const result = findStaleCommitments([task], { now: NOW });

    expect(result).toHaveLength(1);
    expect(result[0].committedToPersonId).toBeNull();
  });

  it("handles an empty task list without crashing", () => {
    expect(findStaleCommitments([], { now: NOW })).toEqual([]);
    expect(findOpenCommitments([])).toEqual([]);
  });
});

describe("summarizeAging", () => {
  it("returns zero counts for an empty or all-null-column task list", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];

    expect(summarizeAging([], { now: NOW })).toEqual({
      agingWaitingOnCount: 0,
      staleCommitmentCount: 0,
    });
    expect(summarizeAging(tasks, { now: NOW })).toEqual({
      agingWaitingOnCount: 0,
      staleCommitmentCount: 0,
    });
  });

  it("counts both aging waiting-ons and stale commitments independently", () => {
    const agingWaitingOn = makeTask({
      id: "aging-waiting-on",
      waiting_on_person_id: "person-1",
      waiting_on_since: isoDaysBefore(NOW, 10),
    });
    const staleCommitment = makeTask({
      id: "stale-commitment",
      is_commitment: true,
      created_at: isoDaysBefore(NOW, 10),
    });
    const freshCommitment = makeTask({
      id: "fresh-commitment",
      is_commitment: true,
      created_at: isoDaysBefore(NOW, 1),
    });

    const result = summarizeAging(
      [agingWaitingOn, staleCommitment, freshCommitment],
      { now: NOW },
    );

    expect(result).toEqual({
      agingWaitingOnCount: 1,
      staleCommitmentCount: 1,
    });
  });
});
