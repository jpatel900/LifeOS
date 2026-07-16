export interface SanctuaryContext {
  readonly item?: boolean;
  readonly area?: boolean;
  readonly day?: boolean;
}

const SANCTUARY_MARKERS = ["item", "area", "day"] as const;

export function isSanctuaryExcluded(context: unknown): boolean {
  if (typeof context !== "object" || context === null) return true;

  try {
    const prototype = Object.getPrototypeOf(context);
    if (prototype !== Object.prototype && prototype !== null) return true;

    for (const marker of SANCTUARY_MARKERS) {
      const descriptor = Object.getOwnPropertyDescriptor(context, marker);
      if (descriptor === undefined) continue;
      if (!("value" in descriptor) || typeof descriptor.value !== "boolean") {
        return true;
      }
      if (descriptor.value) return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function excludeSanctuary<T>(
  items: readonly T[],
  contextFor: (item: T) => unknown,
): T[] {
  const included: T[] = [];

  for (const item of items) {
    try {
      const context = contextFor(item);
      if (!isSanctuaryExcluded(context)) included.push(item);
    } catch {
      // A failed lookup excludes only the affected item.
    }
  }

  return included;
}
