import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentsThemeShell } from "./MomentsThemeShell";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

afterEach(() => {
  document.querySelector('[data-testid="demo-mode-banner"]')?.remove();
  vi.unstubAllGlobals();
});

describe("moments viewport below the demo banner", () => {
  it("subtracts the rendered banner height from both viewport floors and follows resizes", () => {
    const banner = document.createElement("div");
    banner.dataset.testid = "demo-mode-banner";
    document.body.append(banner);
    let height = 40;
    vi.spyOn(banner, "getBoundingClientRect").mockImplementation(
      () => ({ height }) as DOMRect,
    );
    let notifyResize: ResizeObserverCallback = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notifyResize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );

    const { unmount } = render(
      <MomentsThemeShell>
        <div>Flow content</div>
      </MomentsThemeShell>,
    );
    const shell = screen.getByTestId("moments-home-shell");
    const content = shell.firstElementChild as HTMLElement;
    expect(observe).toHaveBeenCalledWith(banner);
    for (const element of [shell, content]) {
      expect(element.style.minHeight).toBe("calc(100dvh - 40px)");
    }

    height = 60;
    act(() => notifyResize([], {} as ResizeObserver));
    for (const element of [shell, content]) {
      expect(element.style.minHeight).toBe("calc(100dvh - 60px)");
    }
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("keeps the account viewport floors when no demo banner is rendered", () => {
    const observer = vi.fn();
    vi.stubGlobal("ResizeObserver", observer);
    render(
      <MomentsThemeShell>
        <div>Account content</div>
      </MomentsThemeShell>,
    );
    const shell = screen.getByTestId("moments-home-shell");
    const content = shell.firstElementChild as HTMLElement;
    expect(shell.style.minHeight).toBe("");
    expect(content.style.minHeight).toBe("");
    expect(content).toHaveClass("min-h-dvh");
    expect(observer).not.toHaveBeenCalled();
  });
});
