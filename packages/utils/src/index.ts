export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
