import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AreasSettingsPage from "../app/settings/areas/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";

/**
 * #742: the signed-out /settings/areas boundary.
 *
 * Before this fix, a signed-out visitor made `@supabase/ssr`'s
 * `auth.getUser()` reject with its own `AuthSessionMissingError` ("Auth
 * session missing!"), and BOTH catch sites on this screen
 * (`useAreasLoadState.ts`'s load, `CreateAreaForm.tsx`'s create) rendered
 * that raw library string verbatim inside a destructive alert, next to a
 * developer-jargon paragraph ("If Supabase is configured… local stack…").
 * Evidence: `.github/pr-evidence/692-server-copy/`.
 *
 * The guard this file exists to enforce: NO caught error's own `.message`
 * may reach the DOM on this screen while signed out. If a future change
 * reintroduces `error.message` (or any raw provider/library text) into
 * either alert, the negative assertions below fail.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/areas",
  useRouter: () => ({ push: vi.fn() }),
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

describe("signed-out /settings/areas boundary (#742)", () => {
  it("never renders the raw provider string, signed out on initial load", async () => {
    renderAreasPage();

    await waitFor(() => {
      expect(screen.getByText("Sign in to see your areas.")).toBeDefined();
    });

    // The guard: the exact library string, anywhere in the rendered DOM.
    expect(screen.queryByText(/Auth session missing/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Auth session missing/i);

    // The developer-jargon paragraph #742 deleted must not come back either.
    expect(screen.queryByText(/local stack is running/i)).toBeNull();
    expect(screen.queryByText(/env vars/i)).toBeNull();

    // The calm state reads as an ordinary status, not an alarm: `role="status"`
    // (matching `OperatorProfilePanel`/`AreaCharterPanel`'s signed-out
    // treatment on this same page), never `role="alert"`.
    const signedOutRegion = screen
      .getByText("Sign in to see your areas.")
      .closest("[role]");
    expect(signedOutRegion?.getAttribute("role")).toBe("status");

    // The door back in (#688's pattern), pointed at this page.
    const signInLink = screen.getByRole("link", { name: "Sign in" });
    expect(signInLink.getAttribute("href")).toBe(
      "/login?next=%2Fsettings%2Fareas",
    );

    // No destructive "Areas could not load" alert alongside it — signed-out
    // and genuine-failure are different states now, not one shared alert.
    expect(screen.queryByText("Areas could not load")).toBeNull();
  });

  it("never renders the raw provider string when creating an area while signed out", async () => {
    renderAreasPage();

    // Let the (signed-out) initial load settle first.
    await waitFor(() => {
      expect(screen.getByText("Sign in to see your areas.")).toBeDefined();
    });

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
