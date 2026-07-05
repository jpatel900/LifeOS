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
    expect(banner).toHaveTextContent("Demo mode — nothing here is saved.");
  });

  it("renders nothing when Supabase is configured", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);

    const { container } = render(<DemoModeBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
