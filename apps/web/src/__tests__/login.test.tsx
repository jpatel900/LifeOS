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
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseBrowserClient.mockReturnValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
      },
    });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });

  it("shows the config error when the browser client is unavailable", async () => {
    mocks.createSupabaseBrowserClient.mockReturnValue(null);

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Supabase is not configured. Add local Supabase env vars to use login, or continue in mock mode.",
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("submits credentials and routes to areas when sign-in succeeds", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "user_a@example.test",
        password: "password123",
      });
    });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/settings/areas");
    });
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
