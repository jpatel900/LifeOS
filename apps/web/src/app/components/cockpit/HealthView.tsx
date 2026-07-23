import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  ChevronDown,
  HeartPulse,
  RefreshCw,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
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

type ViewCheck = {
  id: string;
  subsystem: string;
  status: "healthy" | "watch" | "critical";
  score: number;
  summary: string;
  details?: HealthDashboardCheck["details"];
};

/**
 * #692 / NFR-006 — the three layers of this surface.
 *
 * GLANCE   the ring, the headline, and one line saying whether anything needs
 *          the person. One calm read, no counts the reader has to decode.
 * DETAIL   the groups below, each opening on demand into its own checks in
 *          plain words. Every check is reachable — layered, never truncated.
 * DEVELOPER the disclosure at the bottom, visually marked as diagnostic, where
 *          the technical names (`subsystem`), raw statuses, scores, and the
 *          `details` payload live. That is the only place implementation
 *          vocabulary is allowed to appear.
 */
export type HealthGroupId = "work" | "connections" | "privacy";

export const HEALTH_GROUPS: ReadonlyArray<{
  id: HealthGroupId;
  label: string;
}> = [
  { id: "work", label: "Your work and account" },
  { id: "connections", label: "Connected apps" },
  { id: "privacy", label: "What leaves this app" },
];

/**
 * Plain names for each check, keyed by check id so the data layer keeps its
 * own persisted `subsystem` identifier untouched. Covers both check sets: the
 * live ones from `lib/data/health.ts` and the demo ones from `lib/mockData.ts`.
 * `healthCheckPresentationCoverage` in the tests keeps this map honest.
 */
export const HEALTH_CHECK_PRESENTATION: Record<
  string,
  { group: HealthGroupId; label: string }
> = {
  // live checks — apps/web/src/lib/data/health.ts
  "health-mock-mode": { group: "work", label: "Saving on this device" },
  "health-supabase-config": { group: "work", label: "Your account" },
  "health-auth-session": { group: "work", label: "Signed in" },
  "health-areas": { group: "work", label: "Your areas" },
  "health-capture-persistence": {
    group: "work",
    label: "Thoughts you capture",
  },
  "health-transition-rpcs": {
    group: "work",
    label: "Moving work between steps",
  },
  "health-core-reads": { group: "work", label: "Loading your saved work" },
  "health-ai-parser": { group: "connections", label: "AI helper" },
  "health-ai-provider-incidents": {
    group: "connections",
    label: "AI helper reliability",
  },
  "health-google-calendar": { group: "connections", label: "Google Calendar" },
  "health-observability-privacy": {
    group: "privacy",
    label: "What is shared",
  },
  "health-observability-sentry": { group: "privacy", label: "Crash reports" },
  "health-observability-posthog": { group: "privacy", label: "Usage counting" },
  "health-observability-langfuse": {
    group: "privacy",
    label: "AI activity logging",
  },
  // demo checks — apps/web/src/lib/mockData.ts
  "health-auth": { group: "work", label: "Signed in" },
  "health-database": { group: "work", label: "Where your work is kept" },
  "health-ai": { group: "connections", label: "AI helper" },
  "health-calendar": { group: "connections", label: "Google Calendar" },
};

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
        // #692: the person is told where their work went, not which mode the
        // code took.
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
      setMessage("The check could not finish. Reload the page and try again.");
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
  // #692 glance layer: the headline answers "is everything working" and the
  // line under it answers "does anything need me". Both in plain words; the
  // 0–100 score moved to the developer layer because it has no meaning the
  // reader can act on.
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
    <Panel className="min-h-[560px]">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        {/* GLANCE layer — one calm read. #692: `content-start` (was
            `place-items-center`) keeps the answer at the top of the column,
            where the eye lands first, instead of floating to the vertical
            middle of a column whose height is set by the detail side. */}
        <div className="grid content-start justify-items-center gap-0 pt-2 text-center lg:sticky lg:top-6 lg:self-start">
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
            aria-label={`Check the system again. ${headline}. ${needsYou}`}
            style={{
              boxShadow:
                "0 0 0 6px color-mix(in oklch, var(--grn-fg) 14%, transparent)",
            }}
            className={cn(
              "grid size-56 place-items-center rounded-full border bg-[var(--sf)]",
              attention === 0
                ? "border-[var(--grn-rng)] text-[var(--grn-fg)]"
                : "border-[var(--amb-rng)] text-[var(--amb-fg)]",
              pulse && "animate-pulse",
            )}
          >
            <HeartPulse size={64} />
          </button>
          {/* H1 (#660 surface audit): text-4xl font-extrabold was already
              2.25rem numerically but exceeded the 700-weight cap; pinned
              onto the shared h1 grammar (.moments-greeting). */}
          <h1 className="moments-greeting mt-6">{headline}</h1>
          <p
            className="mt-2 max-w-[28ch] text-sm text-[var(--mut)]"
            data-testid="health-glance-needs-you"
          >
            {needsYou}
          </p>
        </div>
        {/* DETAIL layer — grouped, opened on demand. */}
        <div className="grid content-center gap-3">
          {groups.map((group) => (
            <details
              key={group.id}
              className="group rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
              data-testid={`health-group-${group.id}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-col text-left">
                  <span className="font-bold text-[var(--ink)]">
                    {group.label}
                  </span>
                  <span className="mt-1 text-sm text-[var(--mut)]">
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
                    className="text-[var(--mut)] transition-transform group-open:rotate-180"
                  />
                </span>
              </summary>
              <div className="mt-3 grid gap-3 border-t border-[var(--ln)] pt-3">
                {group.checks.map((check) => (
                  <div key={check.id}>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {presentationFor(check.id).label}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--mut)]">
                      {check.summary}
                    </p>
                    {/* #688 minimal additive: the sign-in door on signed-out rows. */}
                    {isSignedOutCheck(check) ? (
                      <Link
                        href={`/login?next=${encodeURIComponent(pathname ?? "/health")}`}
                        className="mt-1 inline-flex text-sm font-semibold text-[var(--ink)] underline underline-offset-2"
                        data-testid={`health-signin-link-${check.id}`}
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
            data-testid="health-aging-signals"
            className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
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
            <p className="mt-1 text-sm text-[var(--mut)]">
              {agingAttention === 0
                ? "Nothing has been waiting on someone else for too long."
                : `${vm.agingSummary.agingWaitingOnCount} waiting on someone else · ${
                    vm.agingSummary.staleCommitmentCount
                  } promise${
                    vm.agingSummary.staleCommitmentCount === 1 ? "" : "s"
                  } going quiet`}
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
            Check again
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
          {/* DEVELOPER layer (#692 / NFR-006): the only place technical
              names, raw statuses, scores, and the `details` payload appear.
              The dashed border marks it as diagnostic rather than ordinary
              user copy; H3 (#660) surface grammar otherwise unchanged. */}
          <details
            className="rounded-[var(--surface-radius-sm)] border border-dashed border-[var(--ln2)] bg-[var(--sf2)] p-4 text-[var(--mut)]"
            data-testid="health-developer-details"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
              <Wrench aria-hidden size={16} className="text-[var(--mut)]" />
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
                  className="rounded-[var(--surface-radius-sm)] border border-[var(--ln)] p-3"
                >
                  <p className="mono text-xs text-[var(--ink)]">
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
    </Panel>
  );
}
