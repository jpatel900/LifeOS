import { describe, expect, it } from "vitest";
import { ACCENT_PALETTE, contrastRatio, deriveAccent } from "./accent";

/**
 * C5 contrast guard (#687): the derived on-accent text colour must meet
 * WCAG AA (4.5:1 for normal text) against the accent it sits on — for the
 * shipped palette AND for any colour an area could ever carry. The old
 * `lum > 0.55` threshold shipped white on mid-tone accents at under 4.5:1;
 * this test is what keeps that from coming back.
 */
describe("deriveAccent onAcc contrast (WCAG AA)", () => {
  const themes = [
    { dark: true, sf2: "#1b1e25" },
    { dark: false, sf2: "#ffffff" },
  ] as const;

  it("clears 4.5:1 for every palette colour in both themes", () => {
    for (const theme of themes) {
      for (const acc of ACCENT_PALETTE) {
        const { onAcc } = deriveAccent(acc, theme);
        const ratio = contrastRatio(onAcc, acc);
        expect(
          ratio,
          `onAcc ${onAcc} on ${acc} (dark=${theme.dark}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("clears 4.5:1 for ANY accent colour (17-step RGB sweep, 4913 colours)", () => {
    const steps: number[] = [];
    for (let v = 0; v <= 255; v += 16) steps.push(Math.min(v, 255));
    if (steps[steps.length - 1] !== 255) steps.push(255);
    let worst = Infinity;
    let worstHex = "";
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const hex = `#${[r, g, b]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")}`;
          const { onAcc } = deriveAccent(hex, { dark: true, sf2: "#1b1e25" });
          const ratio = contrastRatio(onAcc, hex);
          if (ratio < worst) {
            worst = ratio;
            worstHex = hex;
          }
        }
      }
    }
    expect(
      worst,
      `worst accent ${worstHex} = ${worst.toFixed(3)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the ink identical to the static token layer's #03050f", () => {
    // globals.css --primary-foreground (oklch(0.12 0.025 270.2)) and
    // --on-acc are both #03050f; the runtime ink must not drift from them.
    const { onAcc } = deriveAccent("#6d8bff", { dark: true, sf2: "#1b1e25" });
    expect(onAcc).toBe("#03050f");
  });
});
