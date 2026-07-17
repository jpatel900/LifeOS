import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * ADR 0006 (multi-client doctrine): machine-readable capability discovery for
 * headless clients. Advertises the versioned contract surface so agents can
 * feature-detect instead of assuming. No user data, no auth — everything in
 * this payload is already public knowledge for anyone holding the URL.
 */
const API_V1_CAPABILITIES = [
  "capabilities.read",
  "tasks.list",
  "captures.create",
  "areas.list",
  "blocks.list",
] as const;

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      api_version: "1",
      app: { name: "lifeos", component: "@lifeos/web" },
      capabilities: [...API_V1_CAPABILITIES],
      auth: {
        scheme: "bearer",
        token:
          "supabase user access token; service-role tokens are never accepted",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
