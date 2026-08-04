import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AreasSettingsPage from "../app/settings/areas/page";
import { CreateAreaForm } from "../app/settings/areas/CreateAreaForm";
import { WorkflowProvider } from "@/lib/WorkflowContext";

/**
 * #742: the signed-out /settings/areas boundary, and (Final UX Loop C2-S0,
 * owner-ratified 2026-07-26) the door policy in front of it.
 *
 * Before #753, a signed-out visitor made `@supabase/ssr`'s `auth.getUser()`
 * reject with its own `AuthSessionMissingError` ("Auth session missing!"),
 * and BOTH catch sites on this screen (`useAreasLoadState.ts`'s load,
 * `CreateAreaForm.tsx`'s create) rendered that raw library string verbatim
 * inside a destructive alert, next to a developer-jargon paragraph ("If
 * Supabase is configured… local stack…"). Evidence:
 * `.github/pr-evidence/692-server-copy/`. #753 built the boundary
 * (`isSignedOutError` classification, never leaking `.message`) but left the
 * door policy — stay viewable vs. redirect — as an open OWNER-GATE. C2-S0
 * resolves it: redirect. The boundary in `useAreasLoadState.ts` is
 * UNCHANGED by that; only page.tsx's reaction to `status: "signed-out"`
 * changed from an in-place alert to `router.replace("/login?next=…")`.
 *
 * The guard this file exists to enforce: NO caught error's own `.message`
 * may reach the DOM on this screen while signed out. If a future change
 * reintroduces `error.message` (or any raw provider/library text) into
 * either surface, the negative assertions below fail.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/areas",
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace }),
}));

// The real @supabase/ssr client rejects `auth.getUser()` with this shape
// (not a null user + null error) when nobody is signed in — see
// `WorkflowContext.test.tsx`'s `isSignedOutError` suite for the same fixture
// used against the lower-level classifier this screen now shares.
const AUTH_SESSION_MISSING_ERROR = {
  name: "AuthSessionMissingError",
  message: "Auth session missing!",
};

function signedOutClient() {
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: AUTH_SESSION_MISSING_ERROR,
  });
  // #742's own two catch sites never call `getSession` — only `getUser`, via
  // `requireSupabaseUser`. This is here so the OTHER settings/areas panels
  // (`OperatorProfilePanel`, `AreaCharterPanel`, `GoogleCalendarConnectionPanel`
  // — all rendered on the same page, all already correctly calm when signed
  // out) see a normal "no session" response instead of crashing on a stub
  // that is missing the method, which would otherwise pollute this test's
  // DOM with unrelated noise.
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  return {
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    from: vi.fn(() => {
      throw new Error(
        "test setup: signedOutClient().from() should never be reached — " +
          "requireSupabaseUser must throw on auth.getUser() first",
      );
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseBrowserClient.mockReturnValue(signedOutClient());
});

afterEach(() => {
  cleanup();
});

function renderAreasPage() {
  return render(
    <WorkflowProvider>
      <AreasSettingsPage />
    </WorkflowProvider>,
  );
}

describe("signed-out /settings/areas boundary + door (#742, Final UX Loop C2-S0)", () => {
  it("redirects to the sign-in door on initial load, signed out", async () => {
    renderAreasPage();

    // The door: `router.replace` (never `push` — Back must not return to a
    // screen that immediately redirects again), carrying `?next=` back here.
    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith(
        "/login?next=%2Fsettings%2Fareas",
      );
    });
    expect(mocks.routerReplace).toHaveBeenCalledTimes(1);

    // C2-S0 removed the in-place calm state #753 shipped — this screen no
    // longer renders its own "Sign in" door once it decides to redirect.
    expect(screen.queryByText("Sign in to see your areas.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();

    // The transitional frame is truthful about what's happening, and reads
    // as an ordinary status (role="status"), never an alarm.
    const redirectingRegion = screen
      .getByText("Redirecting to sign in")
      .closest("[role]");
    expect(redirectingRegion?.getAttribute("role")).toBe("status");

    // The raw-text guard survives the redirect change: still nothing from
    // the caught library error reaches this screen at any point.
    expect(screen.queryByText(/Auth session missing/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Auth session missing/i);
    expect(screen.queryByText(/local stack is running/i)).toBeNull();
    expect(screen.queryByText(/env vars/i)).toBeNull();

    // No destructive "Areas could not load" alert either — signed-out and
    // genuine-failure are still different states, not one shared alert.
    expect(screen.queryByText("Areas could not load")).toBeNull();
  });

  it("never renders the raw provider string when creating an area while signed out (session expires mid-use)", async () => {
    // This models the OTHER way a signed-out create can happen after C2-S0:
    // the visitor was signed in when the page loaded (no redirect fired) and
    // their session lapsed before they submitted the form — CreateAreaForm's
    // own catch site (#753) is the last line of defense for that, independent
    // of the page-level redirect gate. Rendered standalone (not the full
    // page) precisely because the page-level gate would otherwise navigate
    // this scenario away before it could be exercised.
    render(
      <WorkflowProvider>
        <CreateAreaForm currentAreas={[]} replaceReadyAreas={vi.fn()} />
      </WorkflowProvider>,
    );

    fireEvent.change(screen.getByLabelText("Area name"), {
      target: { value: "Side Project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create area" }));

    await waitFor(() => {
      expect(screen.getByText("Sign in to create areas.")).toBeDefined();
    });

    expect(screen.queryByText(/Auth session missing/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Auth session missing/i);
    expect(screen.queryByText("Area could not be created")).toBeNull();
  });

  it("shows a calm, plain-language message for a genuine (non-signed-out) load failure", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "TestNetworkError", message: "fetch failed: ECONNRESET" },
    });

    renderAreasPage();

    await waitFor(() => {
      expect(screen.getByText("Areas could not load")).toBeDefined();
    });

    // A real failure still gets an alarm-styled alert...
    const errorAlert = screen
      .getByText("Areas could not load")
      .closest('[role="alert"]');
    expect(errorAlert).not.toBeNull();

    // ...but never the raw caught message. `persistedLoadFailureMessage`
    // (shared with `WorkflowContext`'s identical "saved data would not load"
    // state) renders instead.
    expect(screen.queryByText(/ECONNRESET/i)).toBeNull();
    expect(screen.getByText(/local workflow remains usable/i)).toBeDefined();
  });
});
