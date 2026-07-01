const supabaseDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function normalizeSupabaseDateTime(value: unknown) {
  if (typeof value !== "string" || !supabaseDateTimePattern.test(value)) {
    return value;
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString();
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
