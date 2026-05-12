import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export function onRequestError(
  error: unknown,
  request: Request,
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
  },
) {
  const url = new URL(request.url);

  Sentry.captureRequestError(
    error,
    {
      path: url.pathname,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
    },
    context,
  );
}
