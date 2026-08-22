import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Query keys that collide with property names Next.js's own `searchParams`
 * promise does not treat as safe (Part of #687).
 *
 * Every page in this app does `await searchParams` (see `app/page.tsx`).
 * Next's `makeUntrackedExoticSearchParams` /
 * `makeDynamicallyTrackedExoticSearchParamsWithDevWarnings`
 * (`next/dist/server/request/search-params.js`, next@15.5.21) define every
 * raw query key as an accessor property directly on that promise unless the
 * key is in `wellKnownProperties`
 * (`next/dist/shared/lib/utils/reflect-utils.js:43-68` — lists `then`,
 * `catch`, `finally`, `status`, etc., but not `constructor`). A request for
 * `/?constructor=1` shadows `Promise.prototype.constructor` on that one
 * promise instance with the string `"1"`; the next `.then()`/`await` on it
 * makes V8's SpeciesConstructor read `promise.constructor`, get a non-object
 * back, and throw `TypeError: The .constructor property is not an object` —
 * a hard 500, thrown inside the framework, before any app code (including
 * this repo's own param handling) ever runs. Confirmed upstream: an isolated
 * `node -e` that shadows `.constructor` on a plain resolved Promise and calls
 * `.then()` throws the identical error at the identical
 * `at Promise.then (<anonymous>)` frame, with zero Next.js involved.
 *
 * `__proto__` and `prototype` don't currently crash anything (`__proto__`
 * never becomes a normal own-enumerable key via `Object.keys` in the first
 * place; shadowing `.prototype` is inert because nothing in the Promise
 * lifecycle reads it), but both are stripped defensively — they're the same
 * "reserved identifier missing from Next's own allowlist" hazard class, and
 * nothing guarantees a future Next.js version won't read one of them too.
 *
 * This is the earliest point in the request lifecycle available to this
 * app: middleware runs before Next constructs the page's `searchParams`
 * promise, so stripping here (rather than per-page) defends every current
 * and future route in one place. See the evidence comment on PR #923 for
 * the full stack traces (dev and production tiers) and the enumerated
 * key-by-key probe this list is drawn from.
 */
const DANGEROUS_SEARCH_PARAM_KEYS = ["constructor", "__proto__", "prototype"];

function hasDangerousSearchParamKey(searchParams: URLSearchParams): boolean {
  return DANGEROUS_SEARCH_PARAM_KEYS.some((key) => searchParams.has(key));
}

/**
 * Session-refresh middleware (FR-029 session longevity), plus a crafted-URL
 * guard (Part of #687).
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
 *   signed-out states truthfully (UX-INV-6); this middleware never redirects
 *   for auth/session reasons. It does redirect (see below) when the request
 *   URL itself is hazardous — that's a boundary-defence concern, not route
 *   protection, and doesn't touch auth state.
 * - No tokens are logged or forwarded anywhere (SECURITY_PRIVACY §3); the
 *   only effect on session requests is refreshed auth cookies on the
 *   response.
 */
export async function middleware(request: NextRequest) {
  // Crafted-URL defence first, before any Supabase work: a request carrying
  // one of the dangerous keys above would 500 inside Next's own searchParams
  // construction on every page that does `await searchParams`, before this
  // app's own logic (including the session refresh below) would even run.
  //
  // Redirect (not rewrite) to the same URL with just those keys removed.
  // The query string is already attacker junk with no legitimate meaning to
  // preserve, and this repo's own URL-truth contract (`nav-truth.spec.ts`)
  // requires the address bar and the served state to agree — a rewrite
  // would leave `?constructor=1` sitting in the bar while quietly serving a
  // different, sanitized response, which is exactly the address-bar/state
  // mismatch that contract exists to forbid. A redirect makes the visible
  // URL and the served page agree. 307 preserves the request method, though
  // every route this can reach is GET-only today.
  if (hasDangerousSearchParamKey(request.nextUrl.searchParams)) {
    const cleanUrl = request.nextUrl.clone();
    for (const key of DANGEROUS_SEARCH_PARAM_KEYS) {
      cleanUrl.searchParams.delete(key);
    }
    return NextResponse.redirect(cleanUrl, 307);
  }

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
