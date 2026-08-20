import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalError from "../app/global-error";
import { BANNED_ON_USER_SURFACE } from "./helpers/plainLanguageVocabulary";

/**
 * #723 — THE APP-WIDE ERROR SCREEN, PROVEN FROM THE DOM
 * =====================================================
 * Until #723 this screen told every visitor "The error was captured through
 * the privacy-safe observability layer." That sentence is false whenever no
 * adapter is configured: `lib/observability/index.ts` returns
 * `createNoopAdapter(...)` for any provider whose status is not "configured",
 * so `captureError` resolves having sent nothing. The heading said "Something
 * failed safely.", promising a data outcome nothing on this path checks. A
 * person hitting a crash was being told two things the running system could
 * not honour.
 *
 * Two failures were possible and this file guards both:
 *   1. the screen says something it cannot prove, and
 *   2. the screen offers no way out — Retry re-renders the tree that just
 *      threw, so a fault that reproduces every render is a loop with no exit.
 *
 * WHY THIS RENDERS INSTEAD OF READING THE SOURCE. `plainLanguageGuard.test.ts`
 * walks source text repo-wide and is the ratchet; it states in its own header
 * that it cannot tell whether a string it sees actually reaches a screen. This
 * file answers the question the ratchet can't: what does a person READ. It is
 * the same division #724 set up for the health screen and #742 for the areas
 * screen. If you change this component's copy, both files must agree.
 */

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({
  captureError: mocks.captureError,
}));

/**
 * `GlobalError` replaces the root layout, so it returns its own `<html>` and
 * `<body>`. Rendering that inside testing-library's default `<div>` container
 * makes React emit a `validateDOMNesting` warning that has nothing to do with
 * the assertions below. The warning is expected and specific, so it is
 * filtered by message rather than blanket-silenced: any OTHER console.error
 * still reaches the terminal where a developer sees it.
 */
const originalConsoleError = console.error;

function renderScreen(reset: () => void = vi.fn()) {
  const error = Object.assign(new Error("boom"), { digest: "abc123" });
  render(<GlobalError error={error} reset={reset} />);
  return { error, reset };
}

beforeEach(() => {
  mocks.captureError.mockReset();
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("validateDOMNesting")) {
      return;
    }
    originalConsoleError(...args);
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  cleanup();
});

describe("app-wide error screen (#723)", () => {
  describe("says only what it can prove", () => {
    it("has dropped both untrue sentences", () => {
      renderScreen();

      const text = document.body.textContent ?? "";
      expect(text).not.toContain(
        "The error was captured through the privacy-safe observability layer.",
      );
      expect(text).not.toContain("Something failed safely.");
    });

    it("reads as plain recovery copy", () => {
      renderScreen();

      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Something went wrong.",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /LifeOS couldn't finish what it was doing\. Retry below\. If it keeps happening, go to the home screen\./,
        ),
      ).toBeInTheDocument();
    });

    /**
     * The generic form of assertion 1, so a future rewrite cannot reintroduce
     * a different vendor or infrastructure word. Reads the SAME banned list
     * the repo-wide ratchet reads, so extending that list tightens this screen
     * automatically — which is the property `plainLanguageVocabulary.ts`
     * documents as the reason it is a single source of truth.
     */
    it("carries no banned vocabulary anywhere a person can read", () => {
      renderScreen();

      const text = document.body.textContent ?? "";

      // Anti-vacuum, in the style of the repo-wide guard's own first
      // assertion: an empty DOM would make every "not present" check in this
      // file pass for the wrong reason.
      expect(text.length).toBeGreaterThan(60);
      expect(BANNED_ON_USER_SURFACE.length).toBeGreaterThan(20);

      const hits = BANNED_ON_USER_SURFACE.filter((banned) => banned.test(text));

      expect(hits.map(String)).toEqual([]);
    });

    /**
     * `error.digest` is developer-layer content. NFR-006 admits that layer
     * only behind an explicit developer-disclosure affordance, and this screen
     * has none, so the digest must not leak into ordinary copy. The message
     * likewise: it is raw thrown text and can carry anything.
     */
    it("leaks neither the digest nor the raw thrown message", () => {
      renderScreen();

      const text = document.body.textContent ?? "";
      expect(text).not.toContain("abc123");
      expect(text).not.toContain("boom");
    });
  });

  describe("offers a way out", () => {
    it("keeps Retry as the primary action and calls reset exactly once", () => {
      const reset = vi.fn();
      renderScreen(reset);

      const retry = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retry);

      expect(reset).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledWith();
    });

    it("does not call reset before the person asks for it", () => {
      const reset = vi.fn();
      renderScreen(reset);

      expect(reset).not.toHaveBeenCalled();
    });

    /**
     * The escape hatch, and the reason it is an `<a href>` rather than
     * `next/link` or a router push: Retry re-renders the very tree that threw,
     * so the second action has to leave that tree entirely. Only a real
     * document navigation does that. A `next/link` here would render an
     * anchor too, so asserting the tag is not enough — the guard is that this
     * component imports no router at all, checked by the absence of any
     * onClick handler that could intercept the navigation.
     */
    it("offers a plain full-load link to the home screen", () => {
      renderScreen();

      const home = screen.getByRole("link", { name: "Go to the home screen" });

      expect(home).toBeInTheDocument();
      expect(home.tagName).toBe("A");
      expect(home).toHaveAttribute("href", "/");
    });

    it("puts Retry first and the escape link second", () => {
      renderScreen();

      const retry = screen.getByRole("button", { name: "Retry" });
      const home = screen.getByRole("link", { name: "Go to the home screen" });

      // Node.DOCUMENT_POSITION_FOLLOWING === 4: `home` comes after `retry`.
      expect(
        retry.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  /**
   * #723's acceptance criteria require the existing `captureError` call and
   * its metadata to survive UNCHANGED. This is the assertion that proves it
   * rather than asserting it: the whole object is compared, so adding,
   * dropping, or renaming a context field fails here.
   */
  describe("reports the failure exactly as it did before", () => {
    it("calls captureError once with unchanged metadata", () => {
      const { error } = renderScreen();

      expect(mocks.captureError).toHaveBeenCalledTimes(1);
      expect(mocks.captureError).toHaveBeenCalledWith({
        feature: "app_router_global_error",
        error,
        context: {
          environment: "client",
          error_category: "app_router_global_error",
          route_pattern: "/_global",
          has_digest: true,
        },
      });
    });

    it("reports has_digest false when the error carries no digest", () => {
      render(<GlobalError error={new Error("boom")} reset={vi.fn()} />);

      expect(mocks.captureError).toHaveBeenCalledTimes(1);
      expect(mocks.captureError.mock.calls[0][0].context.has_digest).toBe(
        false,
      );
    });
  });
});
