"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { captureError } from "@/lib/observability";

/**
 * THE APP-WIDE ERROR SCREEN — IT MAY ONLY SAY WHAT IT CAN PROVE (#723)
 * ====================================================================
 * This screen replaces the root layout, so it is the last thing a person sees
 * when everything else has failed. Two rules govern its words.
 *
 * 1. NO CLAIM THE RUNNING SYSTEM CANNOT HONOUR. Until #723 this paragraph read
 *    "The error was captured through the privacy-safe observability layer." —
 *    which is false whenever no adapter is configured, because
 *    `lib/observability/index.ts` then returns `createNoopAdapter(...)` and the
 *    `captureError` call below goes nowhere. The heading was "Something failed
 *    safely.", and "safely" is a promise about the person's data that nothing
 *    on this code path checks. Both are gone. What is left describes only the
 *    one fact this component actually knows: something threw, and the screen
 *    did not finish. Do not add a sentence about what was saved, recorded, or
 *    sent — this component cannot see any of it.
 * 2. RECOVERY-ORIENTED, per AGENTS.md ("errors shown to the user must be
 *    sanitized, plain-language, and recovery-oriented") and NFR-006's
 *    one-calm-read bar. Retry is primary. The plain link to `/` is the escape
 *    hatch for the case Retry cannot fix — a fault that reproduces on every
 *    render, where Retry alone is a loop with no exit.
 *
 * THE COPY IS DELIBERATELY INLINE, AND SO IS THE STYLING.
 * `lib/statusVocabulary.ts` owns the shared "saved on this device" sentence and
 * every other surface must import from it; this screen must not. It renders
 * when the app is broken, so every import it takes is another way for it to
 * fail. Its state — "a render threw" — is also genuinely different from any
 * state that file describes, and that file's own rule is that a different
 * state gets its own words. Same reasoning for the inline `style` props: this
 * screen bypasses the root layout, so it cannot rely on the stylesheet being
 * there.
 *
 * `error.digest` stays unrendered on purpose. It is developer-layer content,
 * and NFR-006 admits that layer only behind an explicit developer-disclosure
 * affordance, which a one-calm-read error screen has no room for. It is
 * already reported through `captureError`'s `has_digest` below.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureError({
      feature: "app_router_global_error",
      error,
      context: {
        environment: "client",
        error_category: "app_router_global_error",
        route_pattern: "/_global",
        has_digest: Boolean(error.digest),
      },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "var(--background)",
          color: "var(--foreground)",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ marginBottom: 12 }}>Something went wrong.</h1>
          <p style={{ marginBottom: 24, lineHeight: 1.5 }}>
            LifeOS couldn&apos;t finish what it was doing. Retry below. If it
            keeps happening, go to the home screen.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Button variant="outline" onClick={() => reset()}>
              Retry
            </Button>
            {/* A plain anchor, not next/link: a full document load is the
                point. Retry re-renders the same tree that just threw, so the
                escape has to leave that tree entirely. Inline-styled to a
                44px-tall target so it stays tappable without the stylesheet.
                eslint-disable-next-line: this component renders in place of
                the root layout when the App Router itself has crashed, so
                there is no router context here for next/link to attach to —
                the plain anchor is the only option that works on this path. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                padding: "0 12px",
                color: "inherit",
                textDecoration: "underline",
                fontSize: 14,
              }}
            >
              Go to the home screen
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
