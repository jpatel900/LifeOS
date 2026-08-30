import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AreasSettingsPage from "../app/settings/areas/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";

/**
 * Part of #960 defect 3: `useAreasLoadState.ts`'s `loadAreas` effect runs
 * exactly once on mount (deps: one `[]`-stable callback — see that file's own
 * comment at the bottom of the hook). If that one call fails signed-out-
 * shaped, the hook latches `status: "signed-out"` forever — it never
 * re-checks. `page.tsx`'s redirect effect used to trust that single
 * classification and call `router.replace("/login?next=…")` behind
 * `hasRedirectedRef` — once ever, never re-armed.
 *
 * A visitor whose session resolves a MOMENT after that first call (a token
 * still being read from storage, a sign-in redirect still completing) got
 * ejected anyway, mid-restore, with their work sitting in the device
 * journal. This suite pins the fix: the redirect must wait for a positive
 * confirmation that no session exists (the auth client's own
 * `onAuthStateChange` transition — the same primitive `AuthAffordance.tsx`
 * already uses) before it fires, while a genuinely signed-out visitor is
 * still sent to `/login` exactly once.
 *
 * Independent review caught that a first version of this suite only pinned
 * "never redirects" and missed that the rescued visitor was left stranded on
 * a permanent "Redirecting to sign in" screen — `useAreasLoadState`'s status
 * never un-latches from "signed-out" on its own, so cancelling the redirect
 * without recovering renders that screen forever, with no areas and no
 * retry. The fix triggers `window.location.reload()` once a session is
 * confirmed after the fact; jsdom cannot actually navigate, so the
 * behavioral proxy here is asserting that reload call actually happens —
 * the one thing that ends the stuck frame in a real browser.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/areas",
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace }),
}));

// The real @supabase/ssr client rejects `auth.getUser()` with this shape when
// nobody is signed in yet (session still resolving from storage) — same
// fixture `areasSignedOutBoundary.test.tsx` uses.
const AUTH_SESSION_MISSING_ERROR = {
  name: "AuthSessionMissingError",
  message: "Auth session missing!",
};

let authStateCallback:
  | ((event: string, session: { user: { email: string } } | null) => void)
  | undefined;

function buildClient() {
  authStateCallback = undefined;
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: AUTH_SESSION_MISSING_ERROR,
  });
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.onAuthStateChange.mockImplementation((callback) => {
    authStateCallback = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  return {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: vi.fn(() => {
      throw new Error(
        "test setup: this client's .from() should never be reached in this suite",
      );
    }),
  };
}

// jsdom's real `window.location` has a non-configurable `reload` (spyOn
// throws "Cannot redefine property"), so the whole `location` object is
// replaced with a stub for this suite instead — the same pattern this
// repo's other navigation tests use when they need to observe `reload`.
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseBrowserClient.mockReturnValue(buildClient());
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload: mocks.reload },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

function renderAreasPage() {
  return render(
    <WorkflowProvider>
      <AreasSettingsPage />
    </WorkflowProvider>,
  );
}

describe("a late-resolving session does not eject /settings/areas (Part of #960)", () => {
  it("never redirects once the session arrives after the first signed-out-shaped load", async () => {
    renderAreasPage();

    // The one-shot loadAreas effect's first (and only) call rejects
    // signed-out-shaped, latching the hook's status. (`getUser` is also
    // called independently by `WorkflowContext`'s own persisted-areas load,
    // so this only asserts it happened at least once, not an exact count.)
    await waitFor(() => {
      expect(mocks.getUser).toHaveBeenCalled();
    });

    // The redirect effect must be listening for the auth transition before it
    // decides anything — give it a tick to subscribe.
    await waitFor(() => {
      expect(mocks.onAuthStateChange).toHaveBeenCalled();
    });

    // The session resolves a moment later — the auth client's own transition
    // event, the same shape AuthAffordance.tsx already reacts to.
    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: { email: "jay@example.com" } });
      await Promise.resolve();
    });

    // It must never have redirected — neither before the session arrived nor
    // after.
    expect(mocks.routerReplace).not.toHaveBeenCalled();

    // Behavioral pin (finding 2/4 from independent review): cancelling the
    // redirect is not enough on its own — `useAreasLoadState`'s status is
    // still latched to "signed-out" and nothing else in this component ever
    // re-checks it. Without a recovery step the visitor would be stuck
    // looking at "Redirecting to sign in" forever. Asserting the reload call
    // is the proxy for "the stuck frame actually ends" since jsdom cannot
    // perform a real navigation.
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("still redirects a genuinely signed-out visitor exactly once", async () => {
    renderAreasPage();

    await waitFor(() => {
      expect(mocks.onAuthStateChange).toHaveBeenCalled();
    });

    // The auth client confirms: no session, ever.
    await act(async () => {
      authStateCallback?.("INITIAL_SESSION", null);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith(
        "/login?next=%2Fsettings%2Fareas",
      );
    });
    expect(mocks.routerReplace).toHaveBeenCalledTimes(1);

    // A later, unrelated re-fire of the same negative transition must not
    // call replace a second time (hasRedirectedRef's once-ever invariant).
    await act(async () => {
      authStateCallback?.("INITIAL_SESSION", null);
      await Promise.resolve();
    });
    expect(mocks.routerReplace).toHaveBeenCalledTimes(1);

    expect(screen.queryByText("Redirecting to sign in")).not.toBeNull();

    // A genuine signed-out visitor is navigated away, not reloaded in place.
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
