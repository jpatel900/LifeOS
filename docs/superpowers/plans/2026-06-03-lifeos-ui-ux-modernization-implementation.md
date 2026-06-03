# LifeOS UI/UX Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the LifeOS web UI so it feels materially more premium, low-friction, and visually rewarding while preserving all existing truthfulness, read-only, and approval-gated behavior boundaries.

**Architecture:** Keep the current route structure and workflow semantics, but introduce a stronger shared visual system, calmer shell, tighter disclosure model, and more opinionated page hierarchy. Concentrate the strongest redesign energy on `Home` and `Execute`, then apply a lighter but still meaningful modernization pass across the remaining primary screens and reconcile docs/tests afterward.

**Tech Stack:** Next.js 15 App Router, React client components, Tailwind v4 via `globals.css`, shadcn-style UI primitives, Vitest, Playwright, pnpm workspaces

---

## Context to read before implementation

- Design spec: `docs/superpowers/specs/2026-06-03-lifeos-ui-ux-modernization-design.md`
- Guardrails: `AGENTS.md`
- Current shipped UX status: `docs/PROJECT_STATE.md`
- Current UX authority: `docs/UX_FLOWS.md`
- Current static truthfulness guard: `apps/web/src/__tests__/sourceOfTruth.test.ts`

## File structure and responsibilities

### Shared visual system and shell

- Modify: `apps/web/src/app/globals.css`
  - Add the new shell, flagship-card, support-panel, disclosure, motion, and page-rhythm classes.
- Modify: `apps/web/src/app/components/AppShell.tsx`
  - Recompose the app shell so nav, current-area context, quick capture, and shell hierarchy feel calmer and more premium.
- Modify: `apps/web/src/app/components/DiagnosticsDisclosure.tsx`
  - Standardize the disclosure pattern around `System details`.
- Create: `apps/web/src/app/components/WorkflowPageHeader.tsx`
  - Shared page-level hero/header component for consistent screen framing.

### Flagship routes

- Modify: `apps/web/src/app/page.tsx`
  - Home stays read-only but becomes the strongest orientation surface.
- Modify: `apps/web/src/app/execute/page.tsx`
  - Execute becomes the most focused and visually alive screen.

### Baseline modernization routes

- Modify: `apps/web/src/app/capture/page.tsx`
- Modify: `apps/web/src/app/triage/page.tsx`
- Modify: `apps/web/src/app/calendar/page.tsx`
- Modify: `apps/web/src/app/review/page.tsx`
- Modify: `apps/web/src/app/health/page.tsx`
- Modify: `apps/web/src/app/settings/areas/page.tsx`
  - Bring each screen onto the new hierarchy, disclosure, and interaction model without changing product scope.

### Validation and docs

- Modify: `apps/web/src/__tests__/page.test.tsx`
- Modify: `apps/web/src/__tests__/capture.test.tsx`
- Modify: `apps/web/src/__tests__/executeFocusPolish.test.tsx`
- Modify: `apps/web/src/__tests__/healthPage.test.tsx`
- Modify: `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- Modify: `apps/web/src/__tests__/routeSmoke.test.tsx`
- Modify: `apps/web/src/__tests__/sourceOfTruth.test.ts`
- Modify: `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
- Modify: `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- Modify: `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- Modify: `docs/UX_FLOWS.md`
- Modify: `docs/PROJECT_STATE.md`

## Task 1: Build the shared visual system and shell hierarchy

**Files:**
- Create: `apps/web/src/app/components/WorkflowPageHeader.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/components/AppShell.tsx`
- Modify: `apps/web/src/app/components/DiagnosticsDisclosure.tsx`
- Test: `apps/web/src/__tests__/sourceOfTruth.test.ts`
- Test: `apps/web/src/__tests__/routeSmoke.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a new source-of-truth assertion that preserves human truth inline but consolidates implementation-heavy wording behind `System details`.

```ts
it("keeps human truth inline and standardizes system details disclosures", () => {
  const shell = normalizeWhitespace(
    readRepoFile("apps/web/src/app/components/AppShell.tsx"),
  );
  const diagnostics = normalizeWhitespace(
    readRepoFile("apps/web/src/app/components/DiagnosticsDisclosure.tsx"),
  );

  expect(shell).toContain("Saved on this device only");
  expect(shell).toContain("Current area");
  expect(diagnostics).toContain("System details");
  expect(diagnostics).not.toContain("Developer details");
});
```

Add a route smoke assertion that the shared shell still renders while the visible framing changes.

```ts
it("renders the app shell around workflow routes", async () => {
  render(<HomePage />);
  expect(screen.getByTestId("app-shell-root")).toBeInTheDocument();
  expect(screen.getByText(/Current area/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/routeSmoke.test.tsx`

Expected: FAIL because `WorkflowPageHeader.tsx` does not exist yet and `DiagnosticsDisclosure.tsx` does not yet use the new `System details` framing.

- [ ] **Step 3: Write the minimal implementation**

Create the shared header component and introduce the new shell hierarchy classes.

```tsx
// apps/web/src/app/components/WorkflowPageHeader.tsx
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkflowPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  spotlight?: ReactNode;
  className?: string;
};

export function WorkflowPageHeader({
  eyebrow,
  title,
  description,
  actions,
  spotlight,
  className,
}: WorkflowPageHeaderProps) {
  return (
    <section className={cn("workflow-page-header", className)}>
      <div className="workflow-page-copy">
        {eyebrow ? <p className="workflow-page-eyebrow">{eyebrow}</p> : null}
        <h1 className="workflow-page-title">{title}</h1>
        <p className="workflow-page-description">{description}</p>
      </div>
      {actions ? <div className="workflow-page-actions">{actions}</div> : null}
      {spotlight ? <div className="workflow-page-spotlight">{spotlight}</div> : null}
    </section>
  );
}
```

Update the disclosure component and shell copy to standardize on `System details`.

```tsx
// apps/web/src/app/components/DiagnosticsDisclosure.tsx
<details className="workflow-system-details">
  <summary>System details</summary>
  <div className="workflow-system-details__body">{children}</div>
</details>
```

```tsx
// apps/web/src/app/components/AppShell.tsx
<Badge variant="outline" className="rounded-full">
  Saved on this device only
</Badge>
<DiagnosticsDisclosure>
  <p>Quick capture saves on this device and sends notes to Triage.</p>
  <p>Technical area id: <strong>{selectedAreaId ?? "none"}</strong></p>
</DiagnosticsDisclosure>
```

Add the new classes in `globals.css`.

```css
.workflow-page-header { display:grid; gap:1rem; }
.workflow-page-title { font-size:clamp(2.25rem,4vw,3.75rem); line-height:0.95; }
.workflow-page-spotlight { border-radius:1.5rem; }
.workflow-system-details { border:1px solid var(--border); border-radius:1rem; }
.workflow-system-details__body { padding:0.875rem 1rem 1rem; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/routeSmoke.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/components/AppShell.tsx apps/web/src/app/components/DiagnosticsDisclosure.tsx apps/web/src/app/components/WorkflowPageHeader.tsx apps/web/src/__tests__/sourceOfTruth.test.ts apps/web/src/__tests__/routeSmoke.test.tsx
git commit -m "feat: add shared UI modernization shell system"
```

## Task 2: Redesign Home as the read-only flagship cockpit

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/components/EmptyState.tsx`
- Modify: `apps/web/src/__tests__/page.test.tsx`
- Modify: `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
- Modify: `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- Modify: `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a page-level assertion that Home has one dominant next-action surface and quieter secondary sections.

```ts
it("keeps Home read-only and visually centered on one next move", () => {
  render(<HomePage />);
  expect(screen.getByTestId("home-next-action-card")).toBeInTheDocument();
  expect(screen.getByText(/Today/i)).toBeInTheDocument();
  expect(screen.getByText(/Current area/i)).toBeInTheDocument();
});
```

Add a browser assertion that the hero/next-action surface remains the first meaningful stop.

```ts
await expect(page.getByTestId("home-next-action-card")).toBeVisible();
await expect(page.getByRole("heading", { name: /Today/i })).toBeVisible();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx src/__tests__/workflowAreaAccent.test.tsx`

Expected: FAIL because the stronger flagship hero and the `home-next-action-card` target do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Recompose Home around a shared header plus one dominant next-action block, then demote secondary cards.

```tsx
// apps/web/src/app/page.tsx
<WorkflowPageHeader
  eyebrow="Today"
  title={cockpit.headline}
  description={cockpit.summary}
  spotlight={
    <Card data-testid="home-next-action-card" className="workflow-flagship-card">
      <CardHeader>
        <CardTitle>{cockpit.next.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{cockpit.next.description}</p>
        <Button asChild>
          <Link href={cockpit.next.href}>{cockpit.next.label}</Link>
        </Button>
      </CardContent>
    </Card>
  }
/>
```

Keep Home read-only by limiting actions to links and quick local capture only.

```tsx
expect(home).not.toMatch(/acceptTimeBlockProposal|createGoogleCalendarEventFromProposal|markExecutionSession/);
```

Update `EmptyState.tsx` so empty states support the calmer premium visual system.

```tsx
<div className="workflow-empty-state">
  <h3>{title}</h3>
  <p>{description}</p>
  {action}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx src/__tests__/workflowAreaAccent.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/components/EmptyState.tsx apps/web/src/__tests__/page.test.tsx apps/web/src/__tests__/workflowAreaAccent.test.tsx apps/web/tests/e2e/p0-ux-regression.spec.ts apps/web/tests/e2e/workflow-hierarchy.spec.ts
git commit -m "feat: redesign Home as flagship read-only cockpit"
```

## Task 3: Redesign Execute as the flagship focus surface

**Files:**
- Modify: `apps/web/src/app/execute/page.tsx`
- Modify: `apps/web/src/__tests__/executeFocusPolish.test.tsx`
- Modify: `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- Modify: `apps/web/src/__tests__/sourceOfTruth.test.ts`
- Modify: `apps/web/tests/e2e/p0-ux-regression.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a route test that expects a stronger mission-first hierarchy and stable valid controls.

```ts
it("keeps Execute centered on one mission with stable valid controls", async () => {
  render(<ExecutePage />);
  expect(screen.getByTestId("execute-focus-hero")).toBeInTheDocument();
  expect(screen.getByText(/Ready to focus|Focus in progress|Session complete/i)).toBeInTheDocument();
});
```

Add a persistence truthfulness assertion that stop semantics remain explicit.

```ts
expect(normalizeWhitespace(readRepoFile("apps/web/src/app/execute/page.tsx"))).toContain(
  "Stop on this device",
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/executeFocusPolish.test.tsx src/__tests__/phase4aPersistence.test.tsx -t "Execute"`

Expected: FAIL because the `execute-focus-hero` hierarchy does not yet exist.

- [ ] **Step 3: Write the minimal implementation**

Turn the current session-state block into the visual center of the screen and move recovery/support content below it.

```tsx
// apps/web/src/app/execute/page.tsx
<WorkflowPageHeader
  eyebrow="Execute"
  title={focusStateTitle(uiState, usesPersistedExecution)}
  description={focusStateDescription(uiState, usesPersistedExecution)}
  spotlight={
    <Card data-testid="execute-focus-hero" className="workflow-flagship-card focus-state-card">
      <CardHeader>
        <CardTitle>{currentTask?.title ?? "Choose a task to focus on"}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{currentTask?.first_tiny_step ?? "Start with the smallest visible move."}</p>
        <div className="workflow-primary-actions">{primaryButtons}</div>
      </CardContent>
    </Card>
  }
/>
```

Keep persisted/device truth inline and visible.

```tsx
<p className="text-sm text-muted-foreground">
  {usesPersistedExecution
    ? "Saved to account. End with the outcome that matches what happened."
    : "Saved on this device only. Stop stays device-only here."}
</p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/executeFocusPolish.test.tsx src/__tests__/phase4aPersistence.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/execute/page.tsx apps/web/src/__tests__/executeFocusPolish.test.tsx apps/web/src/__tests__/phase4aPersistence.test.tsx apps/web/src/__tests__/sourceOfTruth.test.ts apps/web/tests/e2e/p0-ux-regression.spec.ts
git commit -m "feat: redesign Execute as flagship focus surface"
```

## Task 4: Modernize Capture, Triage, and Planning without changing scope

**Files:**
- Modify: `apps/web/src/app/capture/page.tsx`
- Modify: `apps/web/src/app/triage/page.tsx`
- Modify: `apps/web/src/app/calendar/page.tsx`
- Modify: `apps/web/src/__tests__/capture.test.tsx`
- Modify: `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- Modify: `apps/web/src/__tests__/sourceOfTruth.test.ts`
- Modify: `apps/web/tests/e2e/interaction-feedback.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a capture test that keeps the writing surface visually primary while preserving save-mode truth.

```ts
it("keeps capture writing-first while preserving save truth", () => {
  render(<CapturePage />);
  expect(screen.getByRole("textbox")).toBeInTheDocument();
  expect(screen.getByText(/Save mode:/i)).toBeInTheDocument();
  expect(screen.getByTestId("capture-primary-card")).toBeInTheDocument();
});
```

Add a triage/planning persistence assertion that current-item and local-first truths remain explicit.

```ts
expect(source).toContain("Drafts shown here stay on this device until you accept them.");
expect(source).toContain("Nothing goes to Google Calendar until you approve it.");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/phase4aPersistence.test.tsx -t "Capture|Triage|Calendar"`

Expected: FAIL because the new primary card markers and rebalanced hierarchy are not present yet.

- [ ] **Step 3: Write the minimal implementation**

Make Capture writing-first.

```tsx
<WorkflowPageHeader
  eyebrow="Capture"
  title="Get it out fast"
  description="Write first. Decide what to do with it second."
/>
<Card data-testid="capture-primary-card" className="workflow-primary-card">
  <Textarea ... />
</Card>
```

Make Triage current-item-first.

```tsx
<Card id="triage-current-item" data-testid="triage-current-item" className="workflow-flagship-card">
  <CardHeader><CardTitle>{activeQueueItem?.draft.title}</CardTitle></CardHeader>
</Card>
```

Group Planning by intent instead of status leakage.

```tsx
<section aria-labelledby="planning-needs-time">...</section>
<section aria-labelledby="planning-suggested">...</section>
<section aria-labelledby="planning-planned">...</section>
<DiagnosticsDisclosure>
  <p>Technical save mode id: <strong>{saveModeLabel(provider)}</strong></p>
</DiagnosticsDisclosure>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/capture/page.tsx apps/web/src/app/triage/page.tsx apps/web/src/app/calendar/page.tsx apps/web/src/__tests__/capture.test.tsx apps/web/src/__tests__/phase4aPersistence.test.tsx apps/web/src/__tests__/sourceOfTruth.test.ts apps/web/tests/e2e/interaction-feedback.spec.ts
git commit -m "feat: modernize Capture Triage and Planning UX"
```

## Task 5: Modernize Review, Health, and Areas as quieter supporting surfaces

**Files:**
- Modify: `apps/web/src/app/review/page.tsx`
- Modify: `apps/web/src/app/health/page.tsx`
- Modify: `apps/web/src/app/settings/areas/page.tsx`
- Modify: `apps/web/src/__tests__/healthPage.test.tsx`
- Modify: `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
- Modify: `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- Modify: `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- Modify: `apps/web/tests/e2e/areas-color-edit.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a health-page assertion that the reliability answer still leads visually.

```ts
it("keeps Health centered on the top-level reliability answer", async () => {
  render(<HealthPage />);
  expect(screen.getByText(/Can I rely on LifeOS today\?/i)).toBeInTheDocument();
  expect(screen.getByTestId("health-trust-summary")).toBeInTheDocument();
});
```

Add an areas assertion that admin truth stays available while the page becomes quieter.

```ts
expect(normalizeWhitespace(readRepoFile("apps/web/src/app/settings/areas/page.tsx"))).toContain(
  "Save mode:",
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/phase4aPersistence.test.tsx -t "Health|Areas|Review"`

Expected: FAIL because the new summary markers and quieter hierarchy do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Reshape Review around closure-first groupings.

```tsx
<WorkflowPageHeader
  eyebrow="Review"
  title="Close the loop"
  description="Resolve what moved, what finished, and what still needs a real next step."
/>
```

Keep Health answer-first.

```tsx
<Card data-testid="health-trust-summary" className="workflow-primary-card">
  <CardHeader>
    <CardTitle>Can I rely on LifeOS today?</CardTitle>
  </CardHeader>
</Card>
```

Keep Areas/admin cleaner but truthful.

```tsx
<WorkflowPageHeader
  eyebrow="Areas"
  title="Shape the system without clutter"
  description="Manage areas, colors, and account-connected behavior in one quieter place."
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/review/page.tsx apps/web/src/app/health/page.tsx apps/web/src/app/settings/areas/page.tsx apps/web/src/__tests__/healthPage.test.tsx apps/web/src/__tests__/workflowAreaAccent.test.tsx apps/web/src/__tests__/phase4aPersistence.test.tsx apps/web/tests/e2e/p0-ux-regression.spec.ts apps/web/tests/e2e/areas-color-edit.spec.ts
git commit -m "feat: modernize Review Health and Areas surfaces"
```

## Task 6: Reconcile docs, refresh proofs, and close the modernization pass

**Files:**
- Modify: `docs/UX_FLOWS.md`
- Modify: `docs/PROJECT_STATE.md`
- Modify: `apps/web/src/__tests__/sourceOfTruth.test.ts`
- Modify: `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

- [ ] **Step 1: Write the failing tests or assertions**

If visible truthfulness or disclosure wording changed intentionally, update the static guardrail in one pass rather than leaving drift.

```ts
expect(appShell).toContain("System details");
expect(health).toContain("Can I rely on LifeOS today?");
expect(calendar).toContain("Nothing goes to Google Calendar until you approve it.");
```

Refresh the browser hierarchy proof with the new flagship card markers.

```ts
await expect(page.getByTestId("home-next-action-card")).toBeVisible();
await expect(page.getByTestId("execute-focus-hero")).toBeVisible();
```

- [ ] **Step 2: Run the focused proofs**

Run:

```bash
pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/page.test.tsx src/__tests__/capture.test.tsx src/__tests__/executeFocusPolish.test.tsx src/__tests__/healthPage.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/workflowAreaAccent.test.tsx
pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts
pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts
```

Expected: PASS

- [ ] **Step 3: Update the docs to match the proven runtime direction**

Revise `docs/UX_FLOWS.md` only where current shipped labels, disclosure handling, or screen framing were intentionally modernized and protected by tests.

```md
- Home remains read-only and acts as the daily orientation cockpit.
- System details are available through consistent disclosure rather than inline technical clutter.
- Home and Execute now carry the strongest visual emphasis within the six-screen workflow.
```

Update `docs/PROJECT_STATE.md` with factual shipped behavior only.

```md
- UI modernization now delivers a premium shell, flagship Home and Execute surfaces, and quieter system-details disclosures across the primary workflow screens without changing persistence or approval-gated behavior.
```

- [ ] **Step 4: Run the full required validation**

Run:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/UX_FLOWS.md docs/PROJECT_STATE.md apps/web/src/__tests__/sourceOfTruth.test.ts apps/web/tests/e2e/workflow-hierarchy.spec.ts
git commit -m "docs: reconcile UI modernization behavior and proofs"
```

## Self-review

### Spec coverage

- Shared premium visual system: covered by Task 1
- Home flagship treatment: covered by Task 2
- Execute flagship treatment: covered by Task 3
- Baseline modernization across remaining primary screens: covered by Tasks 4 and 5
- Contradiction resolution and doc updates: covered by Task 6
- Validation and browser proof: covered by Task 6

### Placeholder scan

- No `TBD`, `TODO`, or deferred placeholders remain.
- Every task lists exact files, commands, and target code snippets.

### Type consistency

- Shared header component is introduced once in Task 1 and reused consistently afterward.
- `System details`, `home-next-action-card`, and `execute-focus-hero` names stay consistent across implementation and test tasks.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-lifeos-ui-ux-modernization-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
