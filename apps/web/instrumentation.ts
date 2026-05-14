import { captureError } from "./src/lib/observability";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./langfuse.server.config");
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

  void captureError({
    feature: "request_error",
    error,
    context: {
      method: request.method,
      path: url.pathname,
      route_path: context.routePath,
      route_type: context.routeType,
      router_kind: context.routerKind,
    },
  });
}
