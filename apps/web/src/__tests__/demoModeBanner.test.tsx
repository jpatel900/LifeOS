import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

import { DemoModeBanner } from "@/app/components/DemoModeBanner";
import { isSupabaseConfigured } from "@/lib/supabase/config";

describe("DemoModeBanner (FR-029 loud non-persistence)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
