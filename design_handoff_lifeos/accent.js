// LifeOS accent derivation — the single source of truth for per-area color.
// Each area stores ONE base hex. Every accent variant is derived so any
// custom area color stays legible in both themes. Mirror this exactly.

export function mix(a, b, t) {
  const hx = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const A = hx(a), B = hx(b);
  return '#' + A.map((x, i) => {
    const v = Math.round(x + (B[i] - x) * t);
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

// WCAG relative luminance (sRGB -> linear).
export function lum(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    let x = parseInt(h.slice(i, i + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// acc = active area base hex. sf2 = current theme's raised-surface token.
export function deriveAccent(acc, { dark, sf2 }) {
  return {
    acc,
    acc2:   mix(acc, dark ? '#ffffff' : '#000000', 0.16),
    accSf:  mix(acc, sf2, dark ? 0.80 : 0.86),
    accRng: mix(acc, sf2, dark ? 0.50 : 0.66),
    onAcc:  lum(acc) > 0.55 ? '#1a1a14' : '#ffffff',
  };
}

// Overview card tint (color-by-area cards on the All-areas board).
export function cardBg(areaColor, { dark, sf2 }) {
  return mix(areaColor, sf2, dark ? 0.83 : 0.88);
}

// Default palette assigned to newly-created areas (cycles by index).
export const ACCENT_PALETTE = [
  '#6b78e8', '#3f8fd6', '#3fae8f', '#5aa84a',
  '#d9a23f', '#d9624a', '#c44d80', '#b066d9',
];
