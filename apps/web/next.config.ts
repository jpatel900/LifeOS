import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lifeos/schemas", "@lifeos/types"],
  // #687 demo-seed round 2: `scripts/run-playwright-e2e.mjs` now runs TWO
  // `next dev` processes from this same `webDir` concurrently (one
  // NEXT_PUBLIC_DEMO_SEED=false, one =true, on different ports) so
  // `demo-seed-pin.seeded.spec.ts` can scan a REAL seeded server instead of
  // a hand-rolled snapshot. Two dev servers writing to the same `.next/`
  // build cache at once risks file-lock/webpack-cache collisions — this
  // gives the seeded server its own `distDir` so the two never touch the
  // same files. Unset (every other invocation — `pnpm dev`, the vitest
  // suite, a plain `next build`) keeps the default `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // C2-S6 (#687): `next dev`'s own floating dev-tools indicator
  // (`<nextjs-portal>`) sits at a fixed screen position and can overlap
  // BottomNavigator's bottom-docked controls at mobile widths, silently
  // swallowing the click Playwright's `force: true` still physically
  // dispatches at that pixel (force skips Playwright's own actionability
  // checks, not the browser's real hit-testing — whatever element the OS
  // delivers the click to still wins). Caught red-first by
  // `nav-truth.spec.ts`'s mobile matrix pin: a real click on
  // `side-rail-open-health` landed on the portal instead and never opened
  // the sheet. The indicator carries no functional dev behavior (it is a
  // build-activity/route badge), only exists in `next dev`, and is
  // disabled in every production build regardless of this setting.
  devIndicators: false,
};

export default nextConfig;
