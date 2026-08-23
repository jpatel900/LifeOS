import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewPage from "../app/review/page";
import HealthPage from "../app/health/page";
import { AppShell } from "../app/components/AppShell";

// S4 (#256): waiting-on aging + commitment surfacing. These tests exercise
// the real Supabase sync path (mocking only the data-layer reads, same
// pattern as WorkflowContext.personLinks.test.tsx) so seeded tasks reach
// buildCockpitViewModel exactly the way persisted rows would, without
// hand-annotating WorkflowState or calling buildCockpitViewModel directly
// (see apps/web/src/__tests__/sourceOfTruth.test.ts guard rules).

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockCreateSupabaseBrowserClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/workflow")>(
    "@/lib/data/workflow",
  );

  return {
    ...actual,
    listAreas: mockListAreas,
    listCaptureItems: mockListCaptureItems,
    listPlanningItems: mockListPlanningItems,
    listExecutionReviewItems: mockListExecutionReviewItems,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

const mockPathname = vi.fn(() => "/review");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

// HealthPage/ReviewPage are async Server Components (Next 15 `searchParams`
// is a Promise) — resolve each before handing the element to `render`.
async function renderHealthPage() {
  mockPathname.mockReturnValue("/health");
  const healthPageElement = await HealthPage({
    searchParams: Promise.resolve({}),
  });
  return render(<AppShell>{healthPageElement}</AppShell>);
}

async function renderReviewPage() {
  mockPathname.mockReturnValue("/review");
  const reviewPageElement = await ReviewPage({
    searchParams: Promise.resolve({}),
  });
  return render(<AppShell>{reviewPageElement}</AppShell>);
}

const persistedArea = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Main Job",
  slug: "main-job",
  description: "Persisted area",
  color: "#2563eb",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Slightly under 3 days so wall-clock drift between mock setup and the
// component's internal `new Date()` read can never push this over the
// strict `> 3 day` threshold (that would make "exactly at threshold" flaky).
const JUST_UNDER_THRESHOLD_DAYS = 2.99;

function baseTask(overrides: Record<string, unknown>) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: persistedArea.user_id,
    area_id: persistedArea.id,
    project_id: null,
    source_capture_item_id: null,
    title: "Untitled",
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: "Complete the first useful move and note the outcome.",
    first_tiny_step: null,
    waiting_on_person_id: null,
    waiting_on_since: null,
    is_commitment: false,
    committed_to_person_id: null,
    created_at: daysAgoIso(30),
    updated_at: daysAgoIso(30),
    ...overrides,
  };
}

const SARAH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockNoWorkflowRows() {
  mockListAreas.mockResolvedValue({
    provider: "supabase",
    areas: [persistedArea],
  });
  mockListCaptureItems.mockResolvedValue({
    provider: "supabase",
    captures: [],
  });
  mockListPlanningItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    proposals: [],
    blocks: [],
  });
  mockListExecutionReviewItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  });
}

// C2-S6 (#687): `/review` and `/health` are flag-gated redirect shims now —
// this file exercises the LEGACY cockpit screens directly, which only render
// under the #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false). Without this, the
// live default (flag on) would call `redirect()`, which this file's
// `next/navigation` mock does not define.
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
  mockCreateSupabaseBrowserClient.mockReturnValue({ mocked: true });
  mockNoWorkflowRows();
  process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
});

afterEach(() => {
  if (ORIGINAL_MOMENTS_HOME === undefined) {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  } else {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
  }
});

describe("waiting-on aging + commitment surfacing (S4 / #256)", () => {
  it("shows no aging signals when there is no waiting-on or commitment data", async () => {
    await renderHealthPage();

    await waitFor(() => expect(mockListAreas).toHaveBeenCalled());

    const panel = await screen.findByTestId("health-aging-signals");
    // #692: same signal, plain wording.
    expect(panel.textContent).toContain(
      "Nothing has been waiting on someone else for too long.",
    );
  });

  it("surfaces an aging waiting-on item in the health signal count", async () => {
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        baseTask({
          id: "task-aging-waiting-on",
          title: "Waiting on the vendor quote",
          waiting_on_person_id: SARAH_ID,
          waiting_on_since: daysAgoIso(10),
        }),
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    await renderHealthPage();

    await waitFor(() =>
      expect(mockListExecutionReviewItems).toHaveBeenCalled(),
    );

    const panel = await screen.findByTestId("health-aging-signals");
    await waitFor(() =>
      expect(panel.textContent).toContain("1 waiting on someone else"),
    );
  });

  it("surfaces an aging waiting-on item in the review queue", async () => {
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        baseTask({
          id: "task-aging-waiting-on",
          title: "Waiting on the vendor quote",
          waiting_on_person_id: SARAH_ID,
          waiting_on_since: daysAgoIso(10),
        }),
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    await renderReviewPage();

    await waitFor(() =>
      expect(mockListExecutionReviewItems).toHaveBeenCalled(),
    );

    const section = await screen.findByTestId("review-aging-waiting-on");
    expect(section.textContent).toContain("Waiting on the vendor quote");
  });

  it("does not surface a waiting-on item that has not yet crossed the 3-day threshold", async () => {
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        baseTask({
          id: "task-under-3-days",
          title: "Just under three days waiting",
          waiting_on_person_id: SARAH_ID,
          waiting_on_since: daysAgoIso(JUST_UNDER_THRESHOLD_DAYS),
        }),
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    await renderReviewPage();

    await waitFor(() =>
      expect(mockListExecutionReviewItems).toHaveBeenCalled(),
    );

    // Give the sync effect a tick to settle, then assert the aging section
    // never renders because nothing crossed the strict > 3-day threshold.
    await waitFor(() => {
      expect(screen.queryByTestId("review-aging-waiting-on")).toBeNull();
    });
  });

  it("surfaces an open commitment in the review queue", async () => {
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        baseTask({
          id: "task-open-commitment",
          title: "Send Sarah the deck",
          is_commitment: true,
          committed_to_person_id: SARAH_ID,
          created_at: daysAgoIso(1),
        }),
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    await renderReviewPage();

    await waitFor(() =>
      expect(mockListExecutionReviewItems).toHaveBeenCalled(),
    );

    const section = await screen.findByTestId("review-open-commitments");
    expect(section.textContent).toContain("Send Sarah the deck");
  });
});
