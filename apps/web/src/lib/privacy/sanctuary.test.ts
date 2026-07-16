import { describe, expect, it, vi } from "vitest";
import {
  excludeSanctuary,
  isSanctuaryExcluded,
  type SanctuaryContext,
} from "./sanctuary";

describe("isSanctuaryExcluded", () => {
  it("includes legacy and explicitly unmarked contexts", () => {
    expect(isSanctuaryExcluded({})).toBe(false);
    expect(isSanctuaryExcluded({ item: false, area: false, day: false })).toBe(
      false,
    );
  });

  it.each([
    { item: true },
    { area: true },
    { day: true },
    { item: false, area: true, day: false },
  ] satisfies SanctuaryContext[])("excludes any true marker: %o", (context) => {
    expect(isSanctuaryExcluded(context)).toBe(true);
  });

  it.each([
    null,
    undefined,
    true,
    1,
    "context",
    Symbol("context"),
    () => ({}),
    [],
    new Date(0),
    new Map(),
    new (class Context {})(),
  ])("fails closed for a non-record context: %o", (context) => {
    expect(isSanctuaryExcluded(context)).toBe(true);
  });

  it.each([{ item: "true" }, { area: 0 }, { day: null }, { item: undefined }])(
    "fails closed for a malformed own marker: %o",
    (context) => {
      expect(isSanctuaryExcluded(context)).toBe(true);
    },
  );

  it("ignores extra properties and never reads absent markers", () => {
    const get = vi.fn(() => true);
    const context = new Proxy({ unrelated: "ignored" }, { get });

    expect(isSanctuaryExcluded({ unrelated: true })).toBe(false);
    expect(isSanctuaryExcluded(context)).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("accepts a null-prototype record", () => {
    const context = Object.assign(Object.create(null), {
      day: false,
    }) as SanctuaryContext;

    expect(isSanctuaryExcluded(context)).toBe(false);
  });

  it("fails closed for an accessor marker without executing it", () => {
    const getter = vi.fn(() => false);
    const context = Object.defineProperty({}, "item", {
      enumerable: true,
      get: getter,
    });

    expect(isSanctuaryExcluded(context)).toBe(true);
    expect(getter).not.toHaveBeenCalled();
  });

  it("fails closed when a proxy blocks record inspection", () => {
    const context = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("inspection blocked");
        },
      },
    );

    expect(isSanctuaryExcluded(context)).toBe(true);
  });

  it("fails closed when a proxy blocks marker inspection", () => {
    const context = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("descriptor blocked");
        },
      },
    );

    expect(isSanctuaryExcluded(context)).toBe(true);
  });
});

describe("excludeSanctuary", () => {
  it("preserves order and identity while excluding marked items", () => {
    const first = Object.freeze({ id: "first", context: Object.freeze({}) });
    const excluded = Object.freeze({
      id: "excluded",
      context: Object.freeze({ area: true }),
    });
    const last = Object.freeze({
      id: "last",
      context: Object.freeze({ day: false }),
    });
    const items = Object.freeze([first, excluded, last] as const);

    const result = excludeSanctuary(items, (item) => item.context);
    const repeated = excludeSanctuary(items, (item) => item.context);

    expect(result).toEqual([first, last]);
    expect(repeated).toEqual(result);
    expect(repeated).not.toBe(result);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(last);
    expect(items).toEqual([first, excluded, last]);
  });

  it("calls contextFor exactly once per item", () => {
    const items = [{ id: "one" }, { id: "two" }, { id: "three" }];
    const contextFor = vi.fn((_item: (typeof items)[number]) => ({}));

    expect(excludeSanctuary(items, contextFor)).toEqual(items);
    expect(contextFor).toHaveBeenCalledTimes(3);
    expect(contextFor.mock.calls.map(([item]) => item)).toEqual(items);
  });

  it("excludes only an item whose context lookup throws and continues", () => {
    const items = [{ id: "one" }, { id: "broken" }, { id: "three" }];

    const result = excludeSanctuary(items, (item) => {
      if (item.id === "broken") throw new Error("lookup failed");
      return {};
    });

    expect(result).toEqual([items[0], items[2]]);
  });

  it("fails closed per item for malformed contexts", () => {
    const items = [
      { id: "valid", context: { item: false } },
      { id: "invalid", context: { item: "false" } },
      { id: "private", context: { day: true } },
    ];

    expect(excludeSanctuary(items, (item) => item.context)).toEqual([items[0]]);
  });
});
