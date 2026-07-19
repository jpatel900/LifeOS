import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, HeartPulse, RefreshCw, Users } from "lucide-react";
import {
  getHealthDashboard,
  type HealthDashboardCheck,
} from "@/lib/data/health";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { readPurposeGaugeSamples } from "@/lib/data/purposeGaugeSamples";
import type { MirrorPurposeSample } from "@/lib/mirror/mirrorTrendKernel";
import { cn } from "@/lib/utils";
import { MirrorPanel } from "./MirrorPanel";
import { Panel } from "./shared";

// #688 (minimal additive): a live health check whose only finding is "nobody
// is signed in" gets a door, not just a description. Mock checks in the
// static view model carry no `details`, so this is false for them.
function isSignedOutCheck(check: unknown): boolean {
  if (!check || typeof check !== "object") return false;
  const details = (check as HealthDashboardCheck).details;
  return Boolean(details && details.mode === "signed_out");
}

// Health stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change).
export function HealthView({
  vm,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
}) {
  const pathname = usePathname();
  const [pulse, setPulse] = useState(false);
  const [checks, setChecks] = useState<
    Array<(typeof vm.healthChecks)[number] | HealthDashboardCheck>
  >(vm.healthChecks);
  const [message, setMessage] = useState<string | null>(null);
  // FR-047 slice 2 (#686): the Mirror trend reads real persisted FR-033
  // check-ins instead of the empty-set placeholder slice 1 shipped. Read once
  // on mount; demo/mock mode (no Supabase client) yields no samples, so the
  // kernel honestly reports the calm insufficient-data state.
  const [purposeSamples, setPurposeSamples] = useState<MirrorPurposeSample[]>(
    [],
  );
  async function runSystemCheck() {
    setPulse(true);
    setMessage(null);
    try {
      const client = createSupabaseBrowserClient();
      if (!client) {
        setMessage("Mock-only health check completed.");
        return;
      }
      const result = await getHealthDashboard(client);
      setChecks(result.checks);
      setMessage(
        result.persistence === "persisted"
          ? "Persisted health snapshot for this session."
          : (result.persistenceMessage ??
              (result.provider === "mock"
                ? "Mock-only health check completed."
                : "Health check completed without persistence.")),
      );
    } catch {
      setMessage(
        "Unable to complete the health check. Refresh, sign in again, then retry.",
      );
    } finally {
      window.setTimeout(() => setPulse(false), 1400);
    }
  }

  useEffect(() => {
    void runSystemCheck();
    // Run once when the health view mounts so persisted mode never shows mock-only copy as truth.
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readPurposeGaugeSamples(createSupabaseBrowserClient()).then(
      (samples) => {
        if (!cancelled) setPurposeSamples(samples);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const critical = checks.filter((check) => check.status === "critical").length;
  const watch = checks.filter((check) => check.status === "watch").length;
  const healthy = checks.filter((check) => check.status === "healthy").length;
  const attention = critical + watch;
  const score = Math.round(
    checks.reduce((sum, check) => sum + check.score, 0) /
      Math.max(checks.length, 1),
  );
  const headline =
    attention === 0
      ? "All systems healthy"
      : `${attention} checks need attention`;

  return (
    <Panel className="min-h-[560px]">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid place-items-center text-center">
          {/* H2 (#660 surface audit): the 224px (size-56) circle was a
              solid bg-[var(--grn-sf)] fill — the loudest fill in the app.
              Calm-accent discipline elsewhere is border/tint plus a quiet
              ring (see .moments-card--emphasis, globals.css) rather than a
              full-shape wash, so the fill drops to the quiet base surface
              and the accent moves to the border plus a soft halo ring. */}
          <button
            type="button"
            onClick={() => {
              void runSystemCheck();
            }}
            aria-label={`Run health system check. ${headline}. Score ${score} out of 100.`}
            style={{
              boxShadow:
                "0 0 0 6px color-mix(in oklch, var(--grn-fg) 14%, transparent)",
            }}
            className={cn(
              "grid size-56 place-items-center rounded-full border border-[var(--grn-rng)] bg-[var(--sf)] text-[var(--grn-fg)]",
              pulse && "animate-pulse",
            )}
          >
            <HeartPulse size={64} />
          </button>
          {/* H1 (#660 surface audit): text-4xl font-extrabold was already
              2.25rem numerically but exceeded the 700-weight cap; pinned
              onto the shared h1 grammar (.moments-greeting). */}
          <h1 className="moments-greeting mt-6">{headline}</h1>
          <p className="mono mt-2 text-[var(--grn-fg)]">
            {score}/100 · {healthy}/{checks.length}
          </p>
        </div>
        <div className="grid content-center gap-3">
          {checks.slice(0, 3).map((check) => (
            <div
              key={check.id}
              className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{check.subsystem}</span>
                <Check
                  className={
                    check.status === "healthy"
                      ? "text-[var(--grn-fg)]"
                      : "text-[var(--amb-fg)]"
                  }
                  size={20}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--mut)]">{check.summary}</p>
              {/* #688 minimal additive: the sign-in door on signed-out rows. */}
              {isSignedOutCheck(check) ? (
                <Link
                  href={`/login?next=${encodeURIComponent(pathname ?? "/health")}`}
                  className="mt-2 inline-flex text-sm font-semibold text-[var(--ink)] underline underline-offset-2"
                  data-testid={`health-signin-link-${check.id}`}
                >
                  Sign in
                </Link>
              ) : null}
            </div>
          ))}
          <div
            data-testid="health-aging-signals"
            className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">People &amp; commitments</span>
              <Users
                className={
                  vm.agingSummary.agingWaitingOnCount +
                    vm.agingSummary.staleCommitmentCount ===
                  0
                    ? "text-[var(--grn-fg)]"
                    : "text-[var(--amb-fg)]"
                }
                size={20}
              />
            </div>
            <p className="mt-1 text-sm text-[var(--mut)]">
              {vm.agingSummary.agingWaitingOnCount === 0 &&
              vm.agingSummary.staleCommitmentCount === 0
                ? "No aging waiting-ons or stale commitments."
                : `${vm.agingSummary.agingWaitingOnCount} aging waiting-on${
                    vm.agingSummary.agingWaitingOnCount === 1 ? "" : "s"
                  } · ${vm.agingSummary.staleCommitmentCount} stale commitment${
                    vm.agingSummary.staleCommitmentCount === 1 ? "" : "s"
                  }`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void runSystemCheck();
            }}
            className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--btn)] font-bold text-[var(--btn-fg)]"
          >
            <RefreshCw size={18} />
            Run system check
          </button>
          {message ? (
            <p className="text-sm text-[var(--mut)]">{message}</p>
          ) : null}
          {/* FR-047 slice 1 (#668): Mirror on the vital-signs surface the
              operator navigates to (I0/asked-only — no push, no notify).
              Slice 2 (#686) wires the persisted FR-033 check-ins in; until
              enough samples exist the kernel still fails closed to the calm
              insufficient-data state. */}
          <MirrorPanel samples={purposeSamples} />
          {/* H3 (#660 surface audit): quiet disclosure treatment — the
              bare bordered details gets the nested-row surface
              (--sf2 + --surface-radius-sm), matching the sibling check
              rows above so the disclosure reads as part of the same
              family instead of an unstyled afterthought. */}
          <details className="rounded-[var(--surface-radius-sm)] border border-[var(--ln)] bg-[var(--sf2)] p-4 text-[var(--mut)]">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Full breakdown
            </summary>
            <div className="mt-3 grid gap-2">
              {checks.map((check) => (
                <p key={check.id}>
                  <span className="font-semibold text-[var(--ink)]">
                    {check.subsystem}:
                  </span>{" "}
                  {check.summary}
                </p>
              ))}
            </div>
          </details>
        </div>
      </div>
    </Panel>
  );
}
