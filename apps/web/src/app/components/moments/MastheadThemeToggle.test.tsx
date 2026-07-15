import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MastheadThemeToggle } from "./MastheadThemeToggle";

const { useThemeMock, setThemeMock } = vi.hoisted(() => ({
  useThemeMock: vi.fn(),
  setThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: useThemeMock,
}));

describe("MastheadThemeToggle", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a real 'D' kbd hint and toggles dark -> light on click", async () => {
    useThemeMock.mockReturnValue({ theme: "dark", setTheme: setThemeMock });

    render(<MastheadThemeToggle />);

    const button = await screen.findByTestId("masthead-theme-toggle");
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveTextContent("D");
    expect(button).toHaveAttribute("aria-label", "Switch to light theme");

    fireEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("toggles light -> dark on click", async () => {
    useThemeMock.mockReturnValue({ theme: "light", setTheme: setThemeMock });

    render(<MastheadThemeToggle />);

    const button = await screen.findByTestId("masthead-theme-toggle");
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAttribute("aria-label", "Switch to dark theme");

    fireEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("defaults to the dark-icon state when next-themes hasn't resolved a theme yet", async () => {
    useThemeMock.mockReturnValue({ theme: undefined, setTheme: setThemeMock });

    render(<MastheadThemeToggle />);

    // Note: the `disabled={!mounted}` guard (same mounted-guard idiom as
    // the existing `@/components/theme-toggle.tsx`/MomentsThemeShell.tsx)
    // exists to avoid a hydration mismatch during the render before the
    // mount effect fires — React Testing Library's `render()` flushes
    // effects synchronously via `act()`, so that pre-mount instant isn't
    // independently observable here (neither is it for the existing
    // `theme-toggle.tsx`, which has no test of its own). What's
    // steady-state-observable and asserted here: with no resolved theme
    // yet, the toggle still defaults to the dark-icon state truthfully
    // rather than guessing light.
    const button = await screen.findByTestId("masthead-theme-toggle");
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-label", "Switch to light theme");
  });

  it("the global 'D' key toggles the theme once mounted", async () => {
    useThemeMock.mockReturnValue({ theme: "dark", setTheme: setThemeMock });

    render(<MastheadThemeToggle />);
    const button = await screen.findByTestId("masthead-theme-toggle");
    await waitFor(() => expect(button).not.toBeDisabled());

    fireEvent.keyDown(window, { key: "d" });

    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("does not toggle on 'D' when shortcutEnabled is false (an overlay is open)", async () => {
    useThemeMock.mockReturnValue({ theme: "dark", setTheme: setThemeMock });

    render(<MastheadThemeToggle shortcutEnabled={false} />);
    const button = await screen.findByTestId("masthead-theme-toggle");
    await waitFor(() => expect(button).not.toBeDisabled());

    fireEvent.keyDown(window, { key: "d" });

    expect(setThemeMock).not.toHaveBeenCalled();
  });

  it("does not toggle on 'D' while a button elsewhere has focus (typing-target guard)", async () => {
    useThemeMock.mockReturnValue({ theme: "dark", setTheme: setThemeMock });

    render(
      <div>
        <MastheadThemeToggle />
        <button type="button" data-testid="other-button">
          Other
        </button>
      </div>,
    );
    const button = await screen.findByTestId("masthead-theme-toggle");
    await waitFor(() => expect(button).not.toBeDisabled());

    const other = screen.getByTestId("other-button");
    other.focus();
    fireEvent.keyDown(other, { key: "d" });

    expect(setThemeMock).not.toHaveBeenCalled();
  });
});
