import type { CSSProperties } from "react";

export const ACCENT_PALETTE = [
  "#6b78e8",
  "#3f8fd6",
  "#3fae8f",
  "#5aa84a",
  "#d9a23f",
  "#d9624a",
  "#c44d80",
  "#b066d9",
] as const;

export function mix(a: string, b: string, t: number) {
  const hx = (value: string) => {
    const normalized = value.replace("#", "");
    const hex =
      normalized.length === 3
        ? normalized
            .split("")
            .map((character) => character + character)
            .join("")
        : normalized;
    return [0, 2, 4].map((index) =>
      Number.parseInt(hex.slice(index, index + 2), 16),
    );
  };
  const A = hx(a);
  const B = hx(b);
  return `#${A.map((value, index) => {
    const mixed = Math.round(value + (B[index] - value) * t);
    return `0${mixed.toString(16)}`.slice(-2);
  }).join("")}`;
}

export function lum(hex: string) {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((index) => {
    const value = Number.parseInt(h.slice(index, index + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * C5 contrast fix (#687): the on-accent text colour is the WCAG
 * max-contrast pick between near-black navy ink and white, not a naive
 * luminance threshold. The old `lum(acc) > 0.55 ? "#1a1a14" : "#ffffff"`
 * put white on every mid-tone accent (e.g. white on the palette's #c44d80
 * measured 4.45:1, under the 4.5:1 AA floor for normal text). With ink
 * this dark (#03050f — the same value as the static --primary-foreground /
 * --on-acc tokens in globals.css; keep all three in sync) the crossover
 * point sits at ~4.53:1, so the winning side clears AA for every possible
 * accent colour. Guarded by accent.contrast.test.ts.
 */
const ON_ACC_INK = "#03050f";

export function contrastRatio(a: string, b: string) {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function deriveAccent(
  acc: string,
  { dark, sf2 }: { dark: boolean; sf2: string },
) {
  return {
    acc,
    acc2: mix(acc, dark ? "#ffffff" : "#000000", 0.16),
    accSf: mix(acc, sf2, dark ? 0.8 : 0.86),
    accRng: mix(acc, sf2, dark ? 0.5 : 0.66),
    onAcc:
      contrastRatio(ON_ACC_INK, acc) >= contrastRatio("#ffffff", acc)
        ? ON_ACC_INK
        : "#ffffff",
  };
}

export function cardBg(
  areaColor: string,
  { dark, sf2 }: { dark: boolean; sf2: string },
) {
  return mix(areaColor, sf2, dark ? 0.83 : 0.88);
}

export function buildCockpitAccentStyle(
  color: string | null | undefined,
  dark: boolean,
): CSSProperties {
  const sf2 = dark ? "#1b1e25" : "#ffffff";
  const accent = deriveAccent(color ?? ACCENT_PALETTE[0], { dark, sf2 });
  return {
    "--acc": accent.acc,
    "--acc2": accent.acc2,
    "--acc-sf": accent.accSf,
    "--acc-rng": accent.accRng,
    "--on-acc": accent.onAcc,
  } as CSSProperties;
}
