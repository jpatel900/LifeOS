import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

import { DemoModeBanner } from "@/app/components/DemoModeBanner";
import { isSupabaseConfigured } from "@/lib/supabase/config";

describe("DemoModeBanner (FR-029 loud non-persistence)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMock.pathname = "/";
  });

  it("is unmissable when the app runs on the demo fallback", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    render(<DemoModeBanner />);

    const banner = screen.getByRole("alert");
    // RE-ANCHORED by #737 C1 S5, not deleted. This asserted
    // "Demo mode — nothing here is saved.", which #737-A falsified: demo mode
    // journals to IndexedDB exactly like a signed-out session, because
    // `enqueuePendingWrite` runs before any Supabase client check. The banner
    // now names the risk that IS real here — no account to send anything to.
    expect(banner).toHaveTextContent(
      "Demo mode — there is no account to save to here.",
    );
  });

  /**
   * THE GUARD, not a restatement of the test above.
   *
   * These three claims are the ones #737-A falsified while nobody edited this
   * component. Pinning their ABSENCE is what stops a future "restore the loud
   * warning" from quietly reintroducing a lie — the failure mode that let the
   * original text survive four slices of durability work.
   */
  it("never claims work is unsaved, tab-scoped, or lost on reload", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    render(<DemoModeBanner />);

    const text = screen.getByRole("alert").textContent ?? "";
    // 1. Wins, reviews, rollups, sessions, plans and accepted drafts are all
    //    journalled to IndexedDB in demo mode.
    expect(text).not.toMatch(/nothing here is saved/i);
    // 2. IndexedDB is origin-scoped; a second tab reads those writes back.
    expect(text).not.toMatch(/only in this tab/i);
    // 3. The reducer state is mirrored to sessionStorage; #750 probe-verified
    //    that a same-tab reload survives.
    expect(text).not.toMatch(/vanish on reload/i);
  });

  it("renders nothing when Supabase is configured", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);

    const { container } = render(<DemoModeBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * #934 Option C — nothing links to /login in demo mode today (the state
   * the live deploy actually runs in). RED on unmodified main: no link
   * exists anywhere in this component's output.
   */
  it("exposes a link to /login in demo mode, in its own reserved trailing column", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    navigationMock.pathname = "/";

    render(<DemoModeBanner />);

    const link = screen.getByRole("link", { name: /sign in/i });
    // #974: carries `?next=<path>`, same contract as `AuthAffordance.tsx`'s
    // configured door — `/` collapses to the root path, same as that
    // component's own `nextParam` fallback.
    expect(link).toHaveAttribute("href", "/login?next=%2F");

    // Direct-measurement finding (see the component's own doc comment): a
    // dedicated second ROW measurably pushes settings/areas below the fold
    // at both pinned viewports, because that surface has ~0px of headroom
    // against the hit-target-overlap-pin's fold cutoff. The link must
    // instead be `absolute` (contributing zero extra height to the
    // document flow) inside a column the sentence's own `pr-*` padding
    // reserves, never a sibling row. Pinning the `absolute` class is what
    // stops a future edit from quietly reintroducing the reverted,
    // pin-breaking second-row shape.
    expect(link.className).toMatch(/\babsolute\b/);
    // #974: `whitespace-nowrap` is the copy-length guard — without it, a
    // future longer "Sign in" label could wrap onto a second line inside the
    // reserved column with no test catching it (jsdom computes no layout, so
    // the actual pixel-width proof lives in
    // `demo-mode-banner-signin-link.spec.ts`, a real-browser e2e test; this
    // pins the class that makes that proof meaningful).
    expect(link.className).toMatch(/\bwhitespace-nowrap\b/);
  });

  /**
   * #974: matches `AuthAffordance.tsx`'s configured-door contract — a person
   * who signs in returns to the page they were reading, not always to `/`.
   */
  it("carries the current path as ?next= when not already on /login", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    navigationMock.pathname = "/settings/areas";

    render(<DemoModeBanner />);

    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login?next=%2Fsettings%2Fareas");
  });

  it("does not double-encode /login as its own ?next= target", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    navigationMock.pathname = "/login";

    render(<DemoModeBanner />);

    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login?next=%2F");
  });

  it("renders no link to /login when Supabase is configured", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);

    render(<DemoModeBanner />);

    expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull();
  });
});
