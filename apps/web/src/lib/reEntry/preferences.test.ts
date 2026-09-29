import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readReEntryThreshold,
  saveReEntryThreshold,
  readReturnCheckpoint,
  RE_ENTRY_THRESHOLD_KEY,
} from "./preferences";

describe("device return settings", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it("seeds three days and saves a whole-year boundary", () => {
    expect(readReEntryThreshold()).toBe(3);
    expect(saveReEntryThreshold(365)).toBe(true);
    expect(readReEntryThreshold()).toBe(365);
  });
  it.each(["0", "-1", "3.5", "Infinity", "NaN", "366", "bad", ""])(
    "ignores invalid stored days %s",
    (value) => {
      window.localStorage.setItem(RE_ENTRY_THRESHOLD_KEY, value);
      expect(readReEntryThreshold()).toBe(3);
      expect(saveReEntryThreshold(Number(value))).toBe(false);
    },
  );
  it("blocked storage uses the seed and never claims a save", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readReEntryThreshold()).toBe(3);
    expect(saveReEntryThreshold(5)).toBe(false);
  });
  it("rejects corrupt and structurally invalid unfinished rituals", () => {
    const key = "lifeos.moments.reentry.user-1.unfinished";
    window.localStorage.setItem(key, "not json");
    expect(readReturnCheckpoint("user-1")).toBeNull();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        scope: "user-1",
        summary: {},
        outcomes: [{ ok: true }],
      }),
    );
    expect(readReturnCheckpoint("user-1")).toBeNull();
  });
});
