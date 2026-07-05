import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Session-refresh middleware (FR-029 session longevity).
 *
 * The browser client (lib/supabase/browser.ts) stores the session in cookies
 * via @supabase/ssr. This middleware refreshes an expired access token on the
 * way into ANY page request — so a user returning after weeks gets a fresh
 * token server-side on the first navigation, instead of being bounced to
 * /login while still holding a perfectly refreshable session.
 *
 * Contract:
 * - Demo mode unchanged: when Supabase is not configured this is a pure
 *   pass-through (no client construction, no cookie writes).
 * - No route protection here — surfaces already handle their own
 *   signed-out states truthfully (UX-INV-6); this middleware only keeps a
 *   real session alive, it never redirects.
 * - No tokens are logged or forwarded anywhere (SECURITY_PRIVACY §3); the
 *   only effect is refreshed auth cookies on the response.
 */
export async function middleware(request: NextRequest) {
  const config = getSupabaseConfig();

  if (!config) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) forces a server-side token refresh when the
  // access token is expired; the refreshed cookies land on the response via
  // setAll above. A signed-out visitor is a no-op.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on app pages only. API routes authenticate per-request with bearer
  // tokens (lib/supabase/server.ts) and never read session cookies, and
  // static assets need no session — excluding them keeps the middleware off
  // the hot paths it cannot help.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|js|css|map)$).*)",
  ],
};
