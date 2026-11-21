import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  WorkflowNavigationBoundary,
  useWorkflowNavigationLatch,
} from "./navigationBoundary";

const route = vi.hoisted(() => ({
  pathname: "/settings/areas" as string | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

function Page({ navigate }: { navigate: () => void }) {
  const latch = useWorkflowNavigationLatch("/settings/areas");
  return (
    <button
      onClick={() => {
        if (latch.redirected) return;
        latch.redirected = true;
        navigate();
      }}
    >
      Sign in
    </button>
  );
}

beforeEach(() => {
  route.pathname = "/settings/areas";
});

it("keeps a queued navigation once-only across account and pending remounts", () => {
  const navigate = vi.fn();
  const tree = (account: string | null) => (
    <WorkflowNavigationBoundary>
      {account ? <Page key={account} navigate={navigate} /> : null}
    </WorkflowNavigationBoundary>
  );
  const view = render(tree("unverified"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  view.rerender(tree(null));
  view.rerender(tree("anonymous"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(navigate).toHaveBeenCalledTimes(1);
});

it("rearms when navigation leaves while account content is pending", () => {
  const navigate = vi.fn();
  const tree = (account: string | null) => (
    <WorkflowNavigationBoundary>
      {account ? <Page key={account} navigate={navigate} /> : null}
    </WorkflowNavigationBoundary>
  );
  const view = render(tree("unverified"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  view.rerender(tree(null));
  route.pathname = "/login";
  view.rerender(tree(null));
  route.pathname = "/settings/areas";
  view.rerender(tree("anonymous"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(navigate).toHaveBeenCalledTimes(2);
});
