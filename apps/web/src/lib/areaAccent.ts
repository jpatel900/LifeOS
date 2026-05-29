import type { CSSProperties } from "react";

export const DEFAULT_AREA_ACCENT = "#64748b";

export function buildAreaAccentStyle(color?: string | null): CSSProperties {
  return {
    "--area-accent": color ?? DEFAULT_AREA_ACCENT,
  } as CSSProperties;
}

export function resolveSelectedArea<T extends { id: string }>(
  areas: readonly T[],
  selectedAreaId: string | null | undefined,
): T | null {
  return areas.find((area) => area.id === selectedAreaId) ?? areas[0] ?? null;
}

export function resolveAreaById<T extends { id: string }>(
  areas: readonly T[],
  areaId: string | null | undefined,
): T | null {
  if (!areaId) {
    return null;
  }

  return areas.find((area) => area.id === areaId) ?? null;
}
