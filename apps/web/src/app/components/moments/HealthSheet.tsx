"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  HeartPulse,
  RefreshCw,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import {
  getHealthDashboard,
  type HealthDashboardCheck,
} from "@/lib/data/health";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readPurposeGaugeSamples } from "@/lib/data/purposeGaugeSamples";
import type { MirrorPurposeSample } from "@/lib/mirror/mirrorTrendKernel";
import { MirrorPanel } from "../cockpit/MirrorPanel";
import {
  HEALTH_CHECK_PRESENTATION,
  HEALTH_GROUPS,
  type HealthGroupId,
} from "../cockpit/HealthView";
import { MomentSheet } from "./MomentSheet";
import { HIT_TARGET_MIN } from "./hitTarget";

/**
 * Final UX Loop C2-S4 (#687) — the Health surface, ported.
 *
 * ## What this slice actually changes for the person using it
 *
 * Until now the moments home's ONE route to Health was `SideRail`'s "View area
 * health →", wired in `TodayMoments` to a router push at the legacy health
 * route — a jump clean OUT of the moments shell into the old cockpit. That is
 * the exact shape Target Card 2 forbids twice over: a screen that renders the
 * old design, and a Back button that leaves the moments shell instead of
 * stepping a moment. Health now opens as a sheet at `?sheet=health`, so it is
 * in the address bar, survives a refresh, and Back closes it.
 *
 * ## The check runs when the sheet OPENS — not when the home renders
 *
 * `HealthView` runs its system check in a mount effect, which is right for a
 * screen you navigated to. This component is mounted by `TodayMoments` on
 * every home render (that is how all four sheets work: `open` is a prop, not a
 * mount condition), so the same mount effect would fire the whole probe suite
 * — including four deliberate 400s and a `health_checks` write — on every
 * single visit to the home, for every user, whether or not they ever asked
 * about health.
 *
 * So the effect is gated on `open`. That is not merely an optimisation; it is
 * FR-047's own I0/asked-only doctrine (`MirrorPanel.tsx`: "it never pushes,
 * interjects, or notifies") applied to the surface that hosts it. The
 * behaviour a person sees is identical to the legacy screen: arrive at Health,
 * the check has already run.
 *
 * ## The four 400s are the probe working, not a fault
 *
 * `lib/data/health.ts`'s `transitionRpcProbes` calls four transition RPCs with
 * a dummy id precisely so that a "not found" 400 proves the RPC exists and is
 * reachable under the caller's own RLS. Ported unchanged — silencing them
 * would turn a working liveness check into a decorative one. What that costs
 * the test tier, and why the answer is a spec-scoped allowlist rather than a
 * wider guard, is documented in `tests/e2e/health-port-truth.spec.ts`.
 *
 * ## Nothing about the checks themselves is re-implemented
 *
 * The check data, the plain-language name of every check, the three groups and
 * the five FR-047 Mirror gauges are all IMPORTED. `HEALTH_CHECK_PRESENTATION`
 * is kept honest by `src/__tests__/healthPage.test.tsx`'s coverage assertion —
 * a second copy here would be a second thing for that guard to fall behind, in
 * the same way the inbound and outbound sheet lists drifted before
 * `sheetValues.ts` made them one list.
 *
 * NOTE for C2-S6: this file imports two things from `../cockpit/` (the
 * presentation maps above, and `MirrorPanel`). Retiring the cockpit means
 * moving those two, not deleting them. `PlanSheet` carries the same kind of
 * edge on `../cockpit/shared`.
 */

type ViewCheck = {
  id: string;
  subsystem: string;
  status: "healthy" | "watch" | "critical";
  score: number;
  summary: string;
  details?: HealthDashboardCheck["details"];
};

/**
 * #688, ported: a live check whose only finding is "nobody is signed in" gets
 * a door, not just a description. Demo checks carry no `details`, so this is
 * false for them.
 */
function isSignedOutCheck(check: unknown): boolean {
  if (!check || typeof check !== "object") return false;
  const details = (check as HealthDashboardCheck).details;
  return Boolean(details && details.mode === "signed_out");
}

function presentationFor(id: string) {
  return (
    HEALTH_CHECK_PRESENTATION[id] ?? {
      group: "work" as HealthGroupId,
      label: "Another check",
    }
  );
}

function needsAttention(check: ViewCheck) {
  return check.status !== "healthy";
}

function attentionLine(count: number) {
  if (count === 0) return "All good.";
  return count === 1 ? "1 thing needs a look." : `${count} things need a look.`;
}

function formatDetailValue(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(none)";
  return String(value);
}

export interface HealthSheetProps {
  open: boolean;
  onClose(): void;
  selectedAreaId: string | null;
  now: Date;
}

export function HealthSheet({
  open,
  onClose,
  selectedAreaId,
  now,
}: HealthSheetProps) {
  const { state } = useWorkflow();

  // The shipped derivation, not a second one — same reason PlanSheet and
  // ReviewSheet use it. Only `agingSummary` and the demo `healthChecks` are
  // read from it here.
  const vm = useMemo(
    () => buildCockpitViewModel(state, selectedAreaId, true, { now }),
    [state, selectedAreaId, now],
  );

  const [pulse, setPulse] = useState(false);
  const [checks, setChecks] = useState<
    Array<(typeof vm.healthChecks)[number] | HealthDashboardCheck>
  >(vm.healthChecks);
  const [message, setMessage] = useState<string | null>(null);
  const [purposeSamples, setPurposeSamples] = useState<MirrorPurposeSample[]>(
    [],
  );

  async function runSystemCheck() {
    setPulse(true);
    setMessage(null);
    try {
      const client = createSupabaseBrowserClient();
      if (!client) {
        // #692, ported verbatim: the person is told where their work went,
        // not which mode the code took.
        setMessage("Checked. Your work is kept on this device.");
        return;
      }
      const result = await getHealthDashboard(client);
      setChecks(result.checks);
      setMessage(
        result.persistence === "persisted"
          ? "Checked. A record of this check was saved to your account."
          : (result.persistenceMessage ??
              (result.provider === "mock"
                ? "Checked. Your work is kept on this device."
                : "Checked. No record of this check was saved.")),
      );
    } catch {
      setMessage("The check could not finish. Close this and open it again.");
    } finally {
      window.setTimeout(() => setPulse(false), 1400);
    }
  }

  // Gated on `open` — see this file's doc comment. Opening the sheet is the
  // ask; a home render is not.
  useEffect(() => {
    if (!open) return;
    void runSystemCheck();
    void readPurposeGaugeSamples(createSupabaseBrowserClient()).then(
      (samples) => setPurposeSamples(samples),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const viewChecks = checks as ViewCheck[];
  const critical = viewChecks.filter(
    (check) => check.status === "critical",
  ).length;
  const watch = viewChecks.filter((check) => check.status === "watch").length;
  const healthy = viewChecks.filter(
    (check) => check.status === "healthy",
  ).length;
  const attention = critical + watch;
  const score = Math.round(
    viewChecks.reduce((sum, check) => sum + check.score, 0) /
      Math.max(viewChecks.length, 1),
  );

  // #692 glance layer, ported unchanged in meaning: the headline answers "is
  // everything working" and the line under it answers "does anything need me".
  // The 0-100 score stays in the developer layer, where it was moved because
  // it has no meaning the reader can act on.
  const headline =
    attention === 0
      ? "Everything is working"
      : attention === 1
        ? "1 thing needs a look"
        : `${attention} things need a look`;
  const needsYou =
    attention === 0
      ? "Nothing needs you right now."
      : `Needs a look: ${viewChecks
          .filter(needsAttention)
          .map((check) => presentationFor(check.id).label)
          .join(", ")}.`;

  const groups = HEALTH_GROUPS.map((group) => {
    const groupChecks = viewChecks.filter(
      (check) => presentationFor(check.id).group === group.id,
    );
    return {
      ...group,
      checks: groupChecks,
      attention: groupChecks.filter(needsAttention).length,
    };
  }).filter((group) => group.checks.length > 0);

  const agingAttention =
    vm.agingSummary.agingWaitingOnCount + vm.agingSummary.staleCommitmentCount;

  return (
    <MomentSheet
      open={open}
      title="How LifeOS is doing"
      onClose={onClose}
      width="wide"
    >
      <div className="grid gap-6" data-testid="health-sheet">
        {/* GLANCE layer — one calm read, at the top of the sheet where the eye
            lands. The legacy screen put this in a sticky left column of a
            two-column page; a sheet is one column, so it becomes the first
            band instead. */}
        <div className="grid justify-items-center gap-0 text-center">
          <button
            type="button"
            onClick={() => {
              void runSystemCheck();
            }}
            aria-label={`Check the system again. ${headline}. ${needsYou}`}
            style={{
              boxShadow:
                "0 0 0 6px color-mix(in oklch, var(--grn-fg) 14%, transparent)",
            }}
            className={cn(
              "grid size-40 place-items-center rounded-full border bg-[var(--sf)] sm:size-48",
              attention === 0
                ? "border-[var(--grn-rng)] text-[var(--grn-fg)]"
                : "border-[var(--amb-rng)] text-[var(--amb-fg)]",
              pulse && "animate-pulse",
            )}
            data-testid="health-sheet-glance"
          >
            <HeartPulse size={56} />
          </button>
          <h3
            className="moments-card-title mt-5"
            data-testid="health-sheet-headline"
          >
            {headline}
          </h3>
          <p
            className="mt-2 max-w-[28ch] text-sm text-muted-foreground"
            data-testid="health-sheet-needs-you"
          >
            {needsYou}
          </p>
        </div>

        {/* DETAIL layer — grouped, opened on demand. Every check is reachable;
            nothing is truncated. */}
        <div className="grid gap-3">
          {groups.map((group) => (
            <details
              key={group.id}
              className="group rounded-2xl border border-border bg-muted/30 p-4"
              data-testid={`health-sheet-group-${group.id}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-col text-left">
                  <span className="font-bold">{group.label}</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {attentionLine(group.attention)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {group.attention === 0 ? (
                    <Check className="text-[var(--grn-fg)]" size={20} />
                  ) : (
                    <TriangleAlert className="text-[var(--amb-fg)]" size={20} />
                  )}
                  <ChevronDown
                    aria-hidden
                    size={18}
                    className="text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </span>
              </summary>
              <div className="mt-3 grid gap-3 border-t border-border pt-3">
                {group.checks.map((check) => (
                  <div key={check.id}>
                    <p className="text-sm font-semibold">
                      {presentationFor(check.id).label}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {check.summary}
                    </p>
                    {/* #688's sign-in door, ported. The `next` now points at
                        this sheet's own URL rather than `/health`, so signing
                        in returns the person to where they actually were. */}
                    {isSignedOutCheck(check) ? (
                      <Link
                        href="/login?next=%2F%3Fsheet%3Dhealth"
                        className="mt-1 inline-flex text-sm font-semibold underline underline-offset-2"
                        data-testid={`health-sheet-signin-link-${check.id}`}
                      >
                        Sign in
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ))}

          <div
            data-testid="health-sheet-aging-signals"
            className="rounded-2xl border border-border bg-muted/30 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">People &amp; commitments</span>
              <Users
                className={
                  agingAttention === 0
                    ? "text-[var(--grn-fg)]"
                    : "text-[var(--amb-fg)]"
                }
                size={20}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {agingAttention === 0
                ? "Nothing has been waiting on someone else for too long."
                : `${vm.agingSummary.agingWaitingOnCount} waiting on someone else · ${
                    vm.agingSummary.staleCommitmentCount
                  } promise${
                    vm.agingSummary.staleCommitmentCount === 1 ? "" : "s"
                  } going quiet`}
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                void runSystemCheck();
              }}
              className={cn(
                HIT_TARGET_MIN,
                "inline-flex touch-manipulation items-center justify-center gap-2 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]",
              )}
              data-testid="health-sheet-check-again"
            >
              <RefreshCw size={18} aria-hidden />
              Check again
            </button>
          </div>
          {message ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="health-sheet-message"
            >
              {message}
            </p>
          ) : null}

          {/* FR-047 — the same panel, imported. Observation-only, asked-only. */}
          <MirrorPanel samples={purposeSamples} />

          {/* DEVELOPER layer (#692 / NFR-006): the only place technical names,
              raw statuses, scores and the `details` payload may appear. The
              dashed border marks it as diagnostic rather than ordinary user
              copy. */}
          <details
            className="rounded-[var(--surface-radius-sm)] border border-dashed border-border bg-muted/30 p-4 text-muted-foreground"
            data-testid="health-sheet-developer-details"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <Wrench aria-hidden size={16} className="text-muted-foreground" />
              Developer details
            </summary>
            <p className="mt-2 text-xs">
              Technical names and raw values, for someone debugging LifeOS. You
              do not need any of this for normal use.
            </p>
            <p className="mono mt-2 text-xs">
              overall score {score}/100 · {healthy} healthy · {watch} watch ·{" "}
              {critical} critical
            </p>
            <div className="mt-3 grid gap-2">
              {viewChecks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-[var(--surface-radius-sm)] border border-border p-3"
                >
                  <p className="mono text-xs text-foreground">
                    {check.subsystem} · {check.status} · {check.score}
                  </p>
                  <p className="mt-1 text-sm">{check.summary}</p>
                  {check.details ? (
                    <dl className="mono mt-2 grid gap-1 text-xs">
                      {Object.entries(check.details)
                        .filter(([key]) => key !== "summary")
                        .map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <dt className="shrink-0">{key}</dt>
                            <dd className="min-w-0 break-words">
                              {formatDetailValue(value)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </MomentSheet>
  );
}
