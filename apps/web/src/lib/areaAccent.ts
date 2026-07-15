import type { CSSProperties } from "react";

export const DEFAULT_AREA_ACCENT = "#64748b";

/**
 * R2-C (#483 round 2): these were four raw Tailwind seed hues
 * (blue-600/green-600/purple-600/orange-500 at ~0.19-0.26 OKLCH chroma) —
 * max-chroma swatches dropped onto a shell whose neutrals sit at ~0.01
 * chroma, which made the area palette read louder than every other accent
 * in the app (the app's own --primary/--ring/--destructive tokens all sit
 * in the 0.11-0.174 chroma band). Retuned to a single shared lightness/
 * chroma budget (OKLCH L≈0.58-0.68, C≈0.10-0.14 — the same band the shell's
 * own accent tokens use), only hue varies, converted back to hex because
 * `color` is a validated 6-digit-hex field end to end
 * (CreateAreaInputSchema / UpdateAreaColorInputSchema in
 * packages/schemas). This changes the *default suggestions* users pick
 * from, not any color a real user has already chosen — a user's own
 * saved `color` value is untouched by this change.
 */
export const AREA_COLOR_PRESETS = [
  { label: "Ocean", value: "#4c80cd" }, // oklch(0.60 0.13 258)
  { label: "Forest", value: "#439458" }, // oklch(0.60 0.12 150)
  { label: "Sunrise", value: "#bd9121" }, // oklch(0.68 0.13 85)
  { label: "Clay", value: "#d87248" }, // oklch(0.66 0.14 42)
  { label: "Violet", value: "#8965ba" }, // oklch(0.58 0.13 302)
  { label: "Teal", value: "#1d9999" }, // oklch(0.62 0.10 195)
] as const;

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
