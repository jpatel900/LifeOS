const supabaseDateTimePattern =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Supabase/PostgREST returns `timestamptz` with an offset and up to
 * microsecond precision (`2026-09-13T04:10:17.417675-04:00`). Rows are
 * normalized to UTC `Z` form, but the fraction must survive exactly: a
 * `Date` only holds milliseconds, and `updated_at` is used verbatim as an
 * optimistic-concurrency token (`.eq("updated_at", …)`), so truncating it
 * to `.417Z` makes every guarded update match zero rows.
 *
 * So `Date` only converts the whole-second part (offsets are whole minutes,
 * so any day/month/year rollover lands there), and the original fraction
 * digits are appended untouched — never rounded. Trailing zeros past the
 * third digit are dropped: they carry no value (Postgres compares the
 * instant, so `.417600` and `.4176` match the same row) and dropping them
 * gives one spelling per instant. At least three digits are kept, so
 * no-fraction and millisecond inputs normalize exactly as `toISOString()`
 * always did (`.000Z`, `.400Z`).
 */
function normalizeSupabaseDateTime(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const match = supabaseDateTimePattern.exec(value);

  if (!match) {
    return value;
  }

  const [, wholeSeconds, fraction = "", offset] = match;
  const parsed = Date.parse(`${wholeSeconds}${offset}`);

  if (Number.isNaN(parsed)) {
    return value;
  }

  const utcWholeSeconds = new Date(parsed).toISOString().slice(0, 19);
  const digits = fraction.padEnd(3, "0");
  const significant = digits.slice(0, 3) + digits.slice(3).replace(/0+$/, "");

  return `${utcWholeSeconds}.${significant}Z`;
}

export function normalizeSupabaseRow(row: unknown) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return row;
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      normalizeSupabaseDateTime(value),
    ]),
  );
}

export function normalizeSupabaseRows(rows: unknown) {
  if (!Array.isArray(rows)) {
    return rows;
  }

  return rows.map(normalizeSupabaseRow);
}
