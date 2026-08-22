import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../app/login/page";

const mocks = vi.hoisted(() => {
  const push = vi.fn();
  const signInWithPassword = vi.fn();

  return {
    push,
    signInWithPassword,
    createSupabaseBrowserClient: vi.fn(),
    // #688: query string the login page sees; tests override it to exercise
    // the ?next= return path.
    search: "",
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
  // #688: the login form reads ?next= to return the person to the page they
  // came from. Default here is "no next param" -> routes to Today.
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

// #687 finding 4: the page no longer prefills anything (see login/page.tsx),
// so every test that submits real credentials fills them itself first —
// mirroring what `tests/e2e/helpers/signedInAccount.ts`'s `signIn()` already
// does against the real browser.
function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = "";
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
      },
    });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });

  // #581 login-copy cleanup: no more "Local Supabase Login" / "test saved
  // account flows" framing — the page reads as the product's sign-in.
  it("presents calm product copy, not test-harness framing", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Local Supabase Login")).toBeNull();
    expect(screen.queryByText(/test saved account flows/i)).toBeNull();
  });

  // #687 finding 4 (C2-S7, trust-critical): the old #581 prefill only hid
  // behind NODE_ENV, which stayed development for `pnpm dev` — the actual
  // way this shipped page gets looked at, since there is no separate
  // production deployment for a single-user app yet. A fresh browser
  // context must never show someone else's credentials already filled in,
  // in ANY environment this test process can express.
  it("never prefills credentials — both fields start empty", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  // #692 plain language: the no-accounts case is stated in the person's
  // terms, with no vendor/config vocabulary.
  it("shows the config error when the browser client is unavailable", async () => {
    mocks.createSupabaseBrowserClient.mockReturnValue(null);

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      // Re-anchored by #737 C1 S5: "saved on this device" claimed a device
      // store that a demo-mode capture never reaches (it is staged in the
      // reducer and mirrored to per-tab sessionStorage). "stay in this
      // browser" is what is true of everything here.
      "Accounts aren't set up here yet, so there's nothing to sign in to. Your notes stay in this browser.",
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  // #592: successful auth routes to Today (`/`), not Settings — Today owns
  // the first-use decision via the deterministic zero-state predicate
  // (lib/onboarding/onboarding.ts), which routing straight to Settings
  // used to bypass entirely.
  it("submits credentials and routes to Today when sign-in succeeds", async () => {
    render(<LoginPage />);
    fillCredentials("user_a@example.test", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "user_a@example.test",
        password: "password123",
      });
    });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/");
    });
  });

  // #688: the sign-in door returns you to the page you came from.
  it("returns to the originating page when ?next= is a same-app path", async () => {
    mocks.search = "next=%2Fhealth";
    render(<LoginPage />);
    fillCredentials("user_a@example.test", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/health");
    });
  });

  // Open-redirect guard: a crafted ?next= must never bounce a freshly
  // signed-in session off-site.
  it.each([
    ["//evil.example.com", "protocol-relative URL"],
    ["https://evil.example.com", "absolute URL"],
    ["javascript:alert(1)", "script URL"],
  ])("ignores an off-site ?next= (%s)", async (next) => {
    mocks.search = `next=${encodeURIComponent(next)}`;
    render(<LoginPage />);
    fillCredentials("user_a@example.test", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/");
    });
    expect(mocks.push).not.toHaveBeenCalledWith(next);
  });

  // #687 round-11 fresh-eyes judge (defect 7): `/login` was a dead end — no
  // links, no skip link, no header — so browser Back or hand-editing the URL
  // was the only way out. Matches `not-found.tsx`'s own escape hatch (a
  // single "Go to Today" link home), at the structural minimum the judge
  // asked for: a way back, not a redesign.
  it("offers a way back into the app, matching the 404 page's 'Go to Today' escape hatch (#687 round-11 defect 7)", () => {
    render(<LoginPage />);

    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the provider error when sign-in fails", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid login credentials",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
