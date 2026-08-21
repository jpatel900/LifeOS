// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

// #292 brief view instrumentation: TodayMoments.tsx unconditionally calls
// createBriefViewRecorder() at module scope, so every split file mocks
// @/lib/reEntry/briefView the same way the original single file did — this
// isolates these tests from Supabase client/network concerns. Only
// TodayMoments.briefView.test.tsx needs the hoisted-spy form below to assert
// on recordIfNeeded directly.
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

import { WorkflowProvider } from "@/lib/WorkflowContext";

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";

import { TodayMoments } from "./TodayMoments";

import {
  FIXED_NOW,
  pressCaptureShortcut,
  RE_ENTRY_ABSENCE_DAYS,
  ReEntrySeedBridge,
  renderToday,
  TaskSeedBridge,
} from "@/__tests__/helpers/todayMomentsHarness";

/**
 * Moments pass P6 — packet: deep-link fallback shims. Additive coverage for
 * the `deepLink` prop: applies once on mount, does not re-apply on
 * re-render, and defers until the re-entry ritual completes when the ritual
 * is active. Reuses the re-entry seeding pattern from the FR-028 describe
 * block above (real WorkflowContext journey, `now` derived from seeded
 * activity, never hardcoded).
 */
describe("TodayMoments — P6 deep-link shims", () => {
  let restoreFetch: (() => void) | null = null;

  beforeEach(() => {
    restoreFetch = stubParseCaptureFetch();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("opens the capture overlay once when deepLink = { overlay: 'capture' }", () => {
    renderToday({ initialMoment: "start", deepLink: { overlay: "capture" } });

    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
  });

  it("opens the triage sheet once when deepLink = { sheet: 'triage' }", () => {
    renderToday({ initialMoment: "start", deepLink: { sheet: "triage" } });

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Triage",
    );
  });

  it("switches to the flow moment once when deepLink = { moment: 'flow' }", () => {
    renderToday({ initialMoment: "start", deepLink: { moment: "flow" } });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  // C2-S8 (#687 finding 3, root cause): `resolvedInitialMoment` used to read
  // `window.location` for its URL tier — which does not exist during SSR, so
  // the server always fell through to the clock heuristic regardless of the
  // URL, while the client honored it, a structural mismatch React reported
  // as a hydration failure. `deepLink.moment` (the SAME
  // `deepLinkTargetFromParams(searchParams)` value page.tsx computes
  // SERVER-side, identically available at hydration) is now consulted
  // FIRST. jsdom always has `window`, so this cannot reproduce the SSR/CSR
  // split itself — that was proven directly against a running dev server
  // (a curl of `/?moment=flow` returning `data-testid="close-moment"`
  // before the fix, `flow-moment` after) — but this pins that `deepLink`
  // wins even against a CONFLICTING URL, the precedence order the fix
  // depends on.
  it("resolves the initial moment from deepLink.moment even when window.location names a different one", () => {
    window.history.replaceState(null, "", "/?moment=close");

    renderToday({ deepLink: { moment: "flow" } });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("does not re-apply the deep link on re-render (user can close the overlay and it stays closed)", () => {
    const { rerender } = renderToday({
      initialMoment: "start",
      deepLink: { overlay: "capture" },
    });

    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();

    rerender(
      <WorkflowProvider>
        <TaskSeedBridge />
        <TodayMoments
          now={FIXED_NOW}
          initialMoment="start"
          deepLink={{ overlay: "capture" }}
        />
      </WorkflowProvider>,
    );

    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
  });

  it("defers the deep link until the re-entry ritual completes, then applies it", async () => {
    let lastActivityAt: string | null = null;
    const { rerender } = render(
      <WorkflowProvider>
        <ReEntrySeedBridge
          onState={(value) => {
            lastActivityAt = value;
          }}
        />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("re-entry-seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("re-entry-seed-draft-count")).toHaveTextContent(
        "1",
      );
    });
    fireEvent.click(screen.getByTestId("re-entry-seed-accept"));

    await waitFor(() => {
      expect(lastActivityAt).not.toBeNull();
    });

    const now = new Date(
      new Date(lastActivityAt as unknown as string).getTime() +
        RE_ENTRY_ABSENCE_DAYS * 24 * 60 * 60 * 1000,
    );

    // rerender the SAME provider instance (not a fresh render) so the
    // already-seeded in-memory state is present on TodayMoments' very first
    // commit — a fresh WorkflowProvider would re-hydrate from sessionStorage
    // via an async effect, and since child effects (TodayMoments') fire
    // before parent effects (the Provider's hydrate effect) on initial
    // mount, that would create a transient window where the ritual looks
    // ineligible purely because state hasn't hydrated yet — a test-harness
    // race, not the ritual-defer behavior under test.
    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} deepLink={{ overlay: "capture" }} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    // Ritual owns the screen — the deep link has not applied yet. The
    // capture overlay renders outside the ritual/moment conditional, so this
    // genuinely proves deferral rather than being masked by the ritual's
    // own conditional rendering (a moment target would pass trivially here).
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("re-entry-ritual-start-day"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    // Ritual completed — the deferred deep link now applies.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
  });

  // SP-3 numeric steadiness: the toast slot is always mounted (fixed
  // positioning, out of normal flow) so a toast appearing/disappearing never
  // reflows the document. This is a structural class assertion, not a pixel
  // measurement — jsdom does not apply Tailwind's stylesheet, so asserting
  // computed `position` would be meaningless; the `fixed` class itself is
  // the durable contract. The container node is asserted `fixed` both before
  // and after a real toast mounts inside it, proving the same out-of-flow
  // node hosts the content rather than a fresh in-flow element appearing.
  it("toast slot is fixed-positioned so mounting a toast never reflows the page", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    const toast = screen.getByTestId("today-moments-toast");
    expect(toast).toHaveClass("fixed");
    expect(toast.textContent).toBe("");

    await pressCaptureShortcut();
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    await waitFor(
      () => {
        const toastAfter = screen.getByTestId("today-moments-toast");
        expect(toastAfter).toHaveClass("fixed");
        expect(
          within(toastAfter).getByText(/Captured — it's in your triage pile/),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    restoreFetch();
  });

  // SP-4: the toast message pill uses motion tokens (not a literal ms
  // value) and falls back to no motion for prefers-reduced-motion users.
  it("toast message pill uses motion tokens with a reduced-motion fallback", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    const toastMessage = await waitFor(
      () =>
        within(screen.getByTestId("today-moments-toast")).getByText(
          /Captured — it's in your triage pile/,
        ),
      { timeout: 5000 },
    );
    expect(toastMessage).toHaveClass("motion-reduce:transition-none");
    expect(toastMessage).toHaveClass("motion-reduce:duration-0");
    expect(toastMessage.style.transitionDuration).toBe("var(--motion-base)");
    expect(toastMessage.style.transitionTimingFunction).toBe(
      "var(--motion-ease)",
    );

    restoreFetch();
  });
});
