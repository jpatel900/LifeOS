import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.configured,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
  }),
}));
import { AuthAffordance } from "./AuthAffordance";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
type UserResult = { data: { user: { email: string } | null }; error: null };
const signedIn: UserResult = {
  data: { user: { email: "synthetic@example.test" } },
  error: null,
};
let listener: (
  event: string,
  session: { user: { email: string } } | null,
) => void;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.getUser.mockResolvedValue(signedIn);
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.onAuthStateChange.mockImplementation((next) => {
    listener = next;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
afterEach(cleanup);
describe("shared auth presence preserves newer events", () => {
  it("does not let an old initial user read restore sign-in after SIGNED_OUT", async () => {
    const read = deferred<UserResult>();
    mocks.getUser.mockReturnValueOnce(read.promise);
    render(<AuthAffordance />);
    act(() => listener("SIGNED_OUT", null));
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    await act(async () => {
      read.resolve(signedIn);
      await read.promise;
    });
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
  });
  it("does not let an old initial rejection overwrite a newer SIGNED_IN event", async () => {
    const read = deferred<UserResult>();
    mocks.getUser.mockReturnValueOnce(read.promise);
    render(<AuthAffordance />);
    act(() => listener("SIGNED_IN", { user: signedIn.data.user! }));
    await act(async () => {
      read.reject(new Error("synthetic read failure"));
      await read.promise.catch(() => {});
    });
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });
  it("keeps immediate sign-out feedback and unsubscribes on unmount", async () => {
    const view = render(<AuthAffordance />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login?next=%2Ftoday");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
