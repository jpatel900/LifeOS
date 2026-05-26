"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { captureError } from "@/lib/observability";

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
          <h1 style={{ marginBottom: 12 }}>Something failed safely.</h1>
          <p style={{ marginBottom: 20 }}>
            The error was captured through the privacy-safe observability layer.
          </p>
          <Button variant="outline" onClick={() => reset()}>
            Retry
          </Button>
        </main>
      </body>
    </html>
  );
}
