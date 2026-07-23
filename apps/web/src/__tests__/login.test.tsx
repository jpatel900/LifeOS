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

  // #581: the dev credential prefill stays behind the NODE_ENV production
  // guard — under vitest (non-production) the fields keep the local test
  // account, which the submit tests below rely on.
  it("prefills the local dev credentials outside production", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toHaveValue("user_a@example.test");
    expect(screen.getByLabelText("Password")).toHaveValue("password123");
  });

  // #692 plain language: the no-accounts case is stated in the person's
  // terms, with no vendor/config vocabulary.
  it("shows the config error when the browser client is unavailable", async () => {
    mocks.createSupabaseBrowserClient.mockReturnValue(null);

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Accounts aren't set up here yet, so there's nothing to sign in to. Your notes are still saved on this device.",
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  // #592: successful auth routes to Today (`/`), not Settings — Today owns
  // the first-use decision via the deterministic zero-state predicate
  // (lib/onboarding/onboarding.ts), which routing straight to Settings
  // used to bypass entirely.
  it("submits credentials and routes to Today when sign-in succeeds", async () => {
    render(<LoginPage />);
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
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/");
    });
    expect(mocks.push).not.toHaveBeenCalledWith(next);
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
