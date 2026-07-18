import { useEffect, useState } from "react";
import { Check, HeartPulse, RefreshCw, Users } from "lucide-react";
import {
  getHealthDashboard,
  type HealthDashboardCheck,
} from "@/lib/data/health";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { cn } from "@/lib/utils";
import { MirrorPanel } from "./MirrorPanel";
import { Panel } from "./shared";

// Health stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change).
export function HealthView({
  vm,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
}) {
  const [pulse, setPulse] = useState(false);
  const [checks, setChecks] = useState<
    Array<(typeof vm.healthChecks)[number] | HealthDashboardCheck>
  >(vm.healthChecks);
  const [message, setMessage] = useState<string | null>(null);
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
          <button
            type="button"
            onClick={() => {
              void runSystemCheck();
            }}
            aria-label={`Run health system check. ${headline}. Score ${score} out of 100.`}
            className={cn(
              "grid size-56 place-items-center rounded-full border border-[var(--grn-rng)] bg-[var(--grn-sf)] text-[var(--grn-fg)]",
              pulse && "animate-pulse",
            )}
          >
            <HeartPulse size={64} />
          </button>
          <h1 className="mt-6 text-4xl font-extrabold">{headline}</h1>
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
              No FR-033 sample store is shipped yet, so the honest sample
              set is empty; the kernel fails closed to the calm
              insufficient-data state until samples exist. */}
          <MirrorPanel samples={[]} />
          <details className="rounded-2xl border border-[var(--ln)] p-4 text-[var(--mut)]">
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
