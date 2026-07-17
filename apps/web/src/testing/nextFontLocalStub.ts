/**
 * D-13 (issue #483): a vitest stand-in for `next/font/local`.
 *
 * `next/font/local` is a BUILD-TIME construct: the Next SWC plugin rewrites the
 * `localFont({...})` call site, emits the `@font-face` rules, and hands back the
 * generated class names. Nothing performs that rewrite under vitest, so the real
 * module's default export is not callable there — importing `app/layout.tsx`
 * (which `src/__tests__/routeSmoke.test.tsx` does, to smoke the RootLayout)
 * throws `TypeError: default is not a function`.
 *
 * Wired in via `resolve.alias` in vitest.config.ts rather than a per-file
 * `vi.mock`, so any future test that pulls in the layout keeps working without
 * having to know the font pipeline exists.
 *
 * This returns the loader's real SHAPE — `.variable` and `.className` are class
 * names (not custom-property names), which is what layout.tsx consumes. It does
 * NOT attempt to make Inter render in jsdom: jsdom has no font stack and cannot
 * evidence a typeface. That the face actually loads and applies is proven in a
 * real browser (width-delta + pixel-hash), which is the only place it can be.
 */
export default function localFont(
  options: { variable?: string; weight?: string; style?: string } = {},
): { className: string; variable: string; style: { fontFamily: string } } {
  return {
    className: "__stub_className_nextFontLocal",
    variable: "__stub_variable_nextFontLocal",
    style: { fontFamily: options.variable ?? "stub-font" },
  };
}
