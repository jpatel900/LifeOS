#!/usr/bin/env node
/**
 * Colour-contrast audit for the LifeOS token layer (Final UX Loop C5).
 *
 * Computes WCAG 2.1 contrast ratios for the token PAIRS the app actually
 * paints, from the raw values in apps/web/src/app/globals.css. Handles both
 * colour syntaxes the file uses: `#rrggbb` and `oklch(L C H)`.
 *
 * Not a linter and not wired into CI — this is the measuring instrument the
 * contrast lane used to produce the before/after table in its PR, kept in the
 * repo so the next lane can re-run the same arithmetic instead of eyeballing
 * a swatch. `node scripts/agent/contrast-audit.mjs` prints the table.
 */

// ---------------------------------------------------------------------------
// Colour conversion
// ---------------------------------------------------------------------------

/** oklch -> linear sRGB, Björn Ottosson's OKLab formulas (same source the
 *  globals.css D-7a comment cites for the hex -> oklch port). */
function oklchToLinearSrgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearToSrgb8(c) {
  const v =
    c <= 0.0031308
      ? 12.92 * c
      : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function srgb8ToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Accepts "#rrggbb", "#rgb", or "oklch(L C H)" (L may be a percentage). */
export function parseColor(input) {
  const s = String(input).trim();

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  const m = s.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (!m) throw new Error(`Unsupported colour syntax: ${input}`);
  const L = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  return oklchToLinearSrgb(L, parseFloat(m[2]), parseFloat(m[3])).map(
    linearToSrgb8,
  );
}

export function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** WCAG 2.x relative luminance. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map(srgb8ToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, rounded to 2dp the way the spec's examples do. */
export function contrast(fg, bg) {
  const a = luminance(parseColor(fg));
  const b = luminance(parseColor(bg));
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(ratio * 100) / 100;
}

// ---------------------------------------------------------------------------
// The pairs the app actually paints
// ---------------------------------------------------------------------------

// Thresholds: 4.5 normal text, 3.0 large text (>=18.66px bold / >=24px) and
// non-text UI components / graphical objects (WCAG 1.4.11).
const NORMAL = 4.5;
const LARGE = 3.0;

export const PAIRS = [
  // --- shadcn axis: --primary / --primary-foreground -----------------------
  {
    group: "shadcn --primary",
    name: "primary-foreground on primary (light)",
    fgToken: "--primary-foreground",
    bgToken: "--primary",
    need: NORMAL,
    note: "Button default variant label, moment-switcher active tab, capture pill",
  },
  {
    group: "shadcn --primary",
    name: "primary-foreground on primary (dark)",
    fgToken: "--primary-foreground",
    bgToken: "--primary",
    theme: "dark",
    need: NORMAL,
    note: "same pairing; --primary is theme-independent",
  },
  // --- shadcn axis: --destructive -----------------------------------------
  {
    group: "shadcn --destructive",
    name: "destructive-foreground on destructive (light)",
    fgToken: "--destructive-foreground",
    bgToken: "--destructive",
    need: NORMAL,
    note: "Destructive button label",
  },
  {
    group: "shadcn --destructive",
    name: "destructive-foreground on destructive (dark)",
    fgToken: "--destructive-foreground",
    bgToken: "--destructive",
    theme: "dark",
    need: NORMAL,
  },
  // --- cockpit axis: --acc / --on-acc --------------------------------------
  {
    group: "cockpit --acc",
    name: "on-acc on acc (cockpit dark base)",
    fgToken: "--on-acc",
    bgToken: "--acc",
    axis: "cockpit",
    need: NORMAL,
    note: "Primary cockpit button chrome",
  },
  {
    group: "cockpit --acc",
    name: "on-acc on acc (cockpit light)",
    fgToken: "--on-acc",
    bgToken: "--acc",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
    note: "--acc/--on-acc cascade from the dark base; same pairing",
  },
  // --- cockpit axis: --blu-fg as TEXT on surfaces --------------------------
  {
    group: "cockpit --blu-fg",
    name: "blu-fg on sf (cockpit dark)",
    fgToken: "--blu-fg",
    bgToken: "--sf",
    axis: "cockpit",
    need: NORMAL,
  },
  {
    group: "cockpit --blu-fg",
    name: "blu-fg on blu-sf (cockpit dark)",
    fgToken: "--blu-fg",
    bgToken: "--blu-sf",
    axis: "cockpit",
    need: NORMAL,
    note: "Blue state chip: text on its own state background",
  },
  {
    group: "cockpit --blu-fg",
    name: "blu-fg on sf (cockpit light)",
    fgToken: "--blu-fg",
    bgToken: "--sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit --blu-fg",
    name: "blu-fg on blu-sf (cockpit light)",
    fgToken: "--blu-fg",
    bgToken: "--blu-sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
    note: "Blue state chip in light theme",
  },
  // --- cockpit axis: muted / faint text -----------------------------------
  {
    group: "cockpit text",
    name: "mut on sf (cockpit dark)",
    fgToken: "--mut",
    bgToken: "--sf",
    axis: "cockpit",
    need: NORMAL,
  },
  {
    group: "cockpit text",
    name: "fnt on sf3 (cockpit dark, worst surface)",
    fgToken: "--fnt",
    bgToken: "--sf3",
    axis: "cockpit",
    need: NORMAL,
    note: "#574 pinned this at 4.52:1",
  },
  {
    group: "cockpit text",
    name: "mut on sf (cockpit light)",
    fgToken: "--mut",
    bgToken: "--sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit text",
    name: "fnt on sf3 (cockpit light, worst surface)",
    fgToken: "--fnt",
    bgToken: "--sf3",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
    note: "#574 pinned this at 4.50:1",
  },
  // --- cockpit axis: state colours as text --------------------------------
  {
    group: "cockpit state",
    name: "amb-fg on amb-sf (dark)",
    fgToken: "--amb-fg",
    bgToken: "--amb-sf",
    axis: "cockpit",
    need: NORMAL,
  },
  {
    group: "cockpit state",
    name: "grn-fg on grn-sf (dark)",
    fgToken: "--grn-fg",
    bgToken: "--grn-sf",
    axis: "cockpit",
    need: NORMAL,
  },
  {
    group: "cockpit state",
    name: "amb-fg on amb-sf (light)",
    fgToken: "--amb-fg",
    bgToken: "--amb-sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit state",
    name: "grn-fg on grn-sf (light)",
    fgToken: "--grn-fg",
    bgToken: "--grn-sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  // --- non-text: borders, rings, tracks (WCAG 1.4.11, 3:1) ----------------
  {
    group: "non-text",
    name: "ring on background (light)",
    fgToken: "--ring",
    bgToken: "--background",
    need: LARGE,
    note: "Focus indicator vs page — WCAG 1.4.11",
  },
  {
    group: "non-text",
    name: "ring on background (dark)",
    fgToken: "--ring",
    bgToken: "--background",
    theme: "dark",
    need: LARGE,
  },
  {
    group: "non-text",
    name: "ring on card (light)",
    fgToken: "--ring",
    bgToken: "--card",
    need: LARGE,
  },
  {
    group: "non-text",
    name: "ring on card (dark)",
    fgToken: "--ring",
    bgToken: "--card",
    theme: "dark",
    need: LARGE,
  },
  {
    group: "non-text",
    name: "primary on background (light)",
    fgToken: "--primary",
    bgToken: "--background",
    need: LARGE,
    note: "Filled control vs page — ADVISORY: 1.4.11 does not require a filled button's fill to contrast with the page when its (AA-passing) label identifies the control; tracked here so the number stays visible",
  },
  {
    group: "non-text",
    name: "primary on card (light)",
    fgToken: "--primary",
    bgToken: "--card",
    need: LARGE,
  },
  {
    group: "non-text",
    name: "primary on background (dark)",
    fgToken: "--primary",
    bgToken: "--background",
    theme: "dark",
    need: LARGE,
  },
  {
    group: "non-text",
    name: "primary on card (dark)",
    fgToken: "--primary",
    bgToken: "--card",
    theme: "dark",
    need: LARGE,
  },
  // --- warning banner -----------------------------------------------------
  {
    group: "warning",
    name: "warning-foreground on warning (both themes)",
    fgToken: "--warning-foreground",
    bgToken: "--warning",
    need: NORMAL,
    note: "DemoModeBanner",
  },
  // --- muted-foreground text ----------------------------------------------
  {
    group: "shadcn text",
    name: "muted-foreground on background (light)",
    fgToken: "--muted-foreground",
    bgToken: "--background",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "muted-foreground on card (light)",
    fgToken: "--muted-foreground",
    bgToken: "--card",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "muted-foreground on muted (light)",
    fgToken: "--muted-foreground",
    bgToken: "--muted",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "muted-foreground on background (dark)",
    fgToken: "--muted-foreground",
    bgToken: "--background",
    theme: "dark",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "muted-foreground on card (dark)",
    fgToken: "--muted-foreground",
    bgToken: "--card",
    theme: "dark",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "muted-foreground on muted (dark)",
    fgToken: "--muted-foreground",
    bgToken: "--muted",
    theme: "dark",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "foreground on background (light)",
    fgToken: "--foreground",
    bgToken: "--background",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "foreground on background (dark)",
    fgToken: "--foreground",
    bgToken: "--background",
    theme: "dark",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "accent-foreground on accent (light)",
    fgToken: "--accent-foreground",
    bgToken: "--accent",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "accent-foreground on accent (dark)",
    fgToken: "--accent-foreground",
    bgToken: "--accent",
    theme: "dark",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "secondary-foreground on secondary (light)",
    fgToken: "--secondary-foreground",
    bgToken: "--secondary",
    need: NORMAL,
  },
  {
    group: "shadcn text",
    name: "secondary-foreground on secondary (dark)",
    fgToken: "--secondary-foreground",
    bgToken: "--secondary",
    theme: "dark",
    need: NORMAL,
  },
  // --- C5 additions (#687): pairs found while fixing the above -------------
  {
    group: "cockpit --on-warn",
    name: "on-warn on amb-fg (cockpit dark)",
    fgToken: "--on-warn",
    bgToken: "--amb-fg",
    axis: "cockpit",
    need: NORMAL,
    note: "DriftRecoveryCard reclaim button label on the amber fill",
  },
  {
    group: "cockpit --on-warn",
    name: "on-warn on amb-fg (cockpit light)",
    fgToken: "--on-warn",
    bgToken: "--amb-fg",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit --acc2",
    name: "acc2 on acc-sf (cockpit dark)",
    fgToken: "--acc2",
    bgToken: "--acc-sf",
    axis: "cockpit",
    need: NORMAL,
    note: "PlanView/TriageView accent chip text",
  },
  {
    group: "cockpit --acc2",
    name: "acc2 on acc-sf (cockpit light)",
    fgToken: "--acc2",
    bgToken: "--acc-sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit --acc2",
    name: "acc2 on sf (cockpit dark)",
    fgToken: "--acc2",
    bgToken: "--sf",
    axis: "cockpit",
    need: NORMAL,
    note: "TriageView mono captions",
  },
  {
    group: "cockpit --acc2",
    name: "acc2 on sf (cockpit light)",
    fgToken: "--acc2",
    bgToken: "--sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit state text",
    name: "amb-fg on sf (cockpit light)",
    fgToken: "--amb-fg",
    bgToken: "--sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
    note: "--state-watch text on cards",
  },
  {
    group: "cockpit state text",
    name: "amb-fg on sf3 (cockpit light, worst surface)",
    fgToken: "--amb-fg",
    bgToken: "--sf3",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit state text",
    name: "grn-fg on sf (cockpit light)",
    fgToken: "--grn-fg",
    bgToken: "--sf",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit state text",
    name: "grn-fg on sf3 (cockpit light, worst surface)",
    fgToken: "--grn-fg",
    bgToken: "--sf3",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit state text",
    name: "blu-fg on sf3 (cockpit light, worst surface)",
    fgToken: "--blu-fg",
    bgToken: "--sf3",
    axis: "cockpit",
    theme: "light",
    need: NORMAL,
  },
  {
    group: "cockpit state text",
    name: "blu-fg on sf3 (cockpit dark, worst surface)",
    fgToken: "--blu-fg",
    bgToken: "--sf3",
    axis: "cockpit",
    need: NORMAL,
  },
  {
    group: "destructive as text",
    name: "destructive on background (light)",
    fgToken: "--destructive",
    bgToken: "--background",
    need: NORMAL,
    note: "badge/inline error text uses text-destructive in light",
  },
  {
    group: "destructive as text",
    name: "destructive on card (light)",
    fgToken: "--destructive",
    bgToken: "--card",
    need: NORMAL,
  },
  {
    group: "destructive as text",
    name: "destructive on background (dark)",
    fgToken: "--destructive",
    bgToken: "--background",
    theme: "dark",
    need: NORMAL,
    note: "--state-risk text on dark surfaces",
  },
  {
    group: "destructive as text",
    name: "destructive on card (dark)",
    fgToken: "--destructive",
    bgToken: "--card",
    theme: "dark",
    need: NORMAL,
  },
];

/**
 * Alpha-composited variants the components actually paint (Tailwind's
 * `/NN` opacity modifiers). Computed by sRGB alpha blending — the same
 * arithmetic the browser uses to composite the text over its backdrop.
 */
export const ALPHA_PAIRS = [
  {
    name: "primary-foreground/80 on primary (CommandPalette secondary line)",
    fgToken: "--primary-foreground",
    alpha: 0.8,
    bgToken: "--primary",
    need: NORMAL,
  },
  {
    name: "primary-foreground/90 on primary (kbd chip on-accent variant)",
    fgToken: "--primary-foreground",
    alpha: 0.9,
    bgToken: "--primary",
    need: NORMAL,
  },
];

export function blendOver(fgRgb, alpha, bgRgb) {
  return fgRgb.map((v, i) => Math.round(alpha * v + (1 - alpha) * bgRgb[i]));
}

// ---------------------------------------------------------------------------
// Token table, read straight out of globals.css
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(
  here,
  "..",
  "..",
  "apps",
  "web",
  "src",
  "app",
  "globals.css",
);

/** Pulls `--token: value;` declarations out of one top-level block. */
function readBlock(css, selector) {
  const start = css.indexOf(selector + " {");
  if (start === -1) throw new Error(`Block not found: ${selector}`);
  let depth = 0;
  let i = css.indexOf("{", start);
  const bodyStart = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = css.slice(bodyStart, i);
  const out = {};
  // Matches `--name: <value>;` where <value> may span lines (the file's
  // prettier formatting breaks long oklch() calls across three lines).
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(body))) {
    const value = m[2]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .trim();
    out[m[1]] = value;
  }
  return out;
}

export function loadTokens(cssText) {
  const css = cssText ?? readFileSync(CSS_PATH, "utf8");
  // `:root` appears twice (font block, then the colour block). Merge both.
  const rootBlocks = [];
  let idx = 0;
  while ((idx = css.indexOf(":root {", idx)) !== -1) {
    rootBlocks.push(readBlock(css.slice(idx), ":root"));
    idx += 7;
  }
  const root = Object.assign({}, ...rootBlocks);
  const dark = { ...root, ...readBlock(css, ".dark") };
  const cockpitDark = readBlock(css, ".lifeos-cockpit");
  const cockpitLight = {
    ...cockpitDark,
    ...readBlock(css, '.lifeos-cockpit[data-theme="light"]'),
  };
  return { root, dark, cockpitDark, cockpitLight };
}

function resolve(tokens, name, seen = new Set()) {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`Unknown token ${name}`);
  const varMatch = raw.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (varMatch) {
    if (seen.has(name)) throw new Error(`Cycle at ${name}`);
    seen.add(name);
    return resolve(tokens, varMatch[1], seen);
  }
  return raw;
}

export function auditPairs(sets = loadTokens()) {
  return PAIRS.map((pair) => {
    const table =
      pair.axis === "cockpit"
        ? pair.theme === "light"
          ? sets.cockpitLight
          : sets.cockpitDark
        : pair.theme === "dark"
          ? sets.dark
          : sets.root;
    const fg = resolve(table, pair.fgToken);
    const bg = resolve(table, pair.bgToken);
    const ratio = contrast(fg, bg);
    return {
      ...pair,
      fg,
      fgHex: toHex(parseColor(fg)),
      bg,
      bgHex: toHex(parseColor(bg)),
      ratio,
      pass: ratio >= pair.need,
    };
  });
}

export function auditAlphaPairs(sets = loadTokens()) {
  return ALPHA_PAIRS.map((pair) => {
    const table = pair.theme === "dark" ? sets.dark : sets.root;
    const fg = parseColor(resolve(table, pair.fgToken));
    const bg = parseColor(resolve(table, pair.bgToken));
    const blended = blendOver(fg, pair.alpha, bg);
    const ratio = contrast(toHex(blended), toHex(bg));
    return {
      ...pair,
      fgHex: toHex(blended),
      bgHex: toHex(bg),
      ratio,
      pass: ratio >= pair.need,
    };
  });
}

if (process.argv[1] && process.argv[1].endsWith("contrast-audit.mjs")) {
  const rows = [...auditPairs(), ...auditAlphaPairs()];
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad("PAIR", 48) +
      pad("FG", 10) +
      pad("BG", 10) +
      pad("RATIO", 8) +
      pad("NEED", 6) +
      "RESULT",
  );
  console.log("-".repeat(90));
  for (const r of rows) {
    console.log(
      pad(r.name, 48) +
        pad(r.fgHex, 10) +
        pad(r.bgHex, 10) +
        pad(r.ratio.toFixed(2), 8) +
        pad(r.need.toFixed(1), 6) +
        (r.pass ? "PASS" : "FAIL"),
    );
  }
  const fails = rows.filter((r) => !r.pass);
  console.log("-".repeat(90));
  console.log(`${rows.length} pairs measured, ${fails.length} FAIL`);
  for (const f of fails) {
    console.log(
      `  FAIL  ${f.name}: ${f.fgHex} on ${f.bgHex} = ${f.ratio.toFixed(2)}:1 (need ${f.need}:1)`,
    );
  }
}
