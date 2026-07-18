import { computeMirrorTrend } from "@/lib/mirror/mirrorTrendKernel";

/**
 * FR-047 slice 1 (issue #668) — Mirror: observation-only panel.
 *
 * Renders the FR-033 purpose-gauge trend against the four FIXED proxy
 * gauges (docs/REQUIREMENTS.md FR-047, merged #666). Doctrine, binding:
 * - Observation-only: no coaching, tips, recommendations, streaks,
 *   badges, or AI commentary anywhere on this surface.
 * - I0/asked-only: lives on the vital-signs (health) surface the operator
 *   navigates to; it never pushes, interjects, or notifies.
 * - Proxy gauges describe the SYSTEM's health and calibration, never the
 *   person's — copy below must never rate, score, or shame the operator.
 * - The four proxy gauges are the fixed set; NOT individually hideable in
 *   this slice (OWNER-GATE on #668). Their computations are follow-up
 *   AGENT-TODOs on shipped mechanisms; until wired, each slot shows an
 *   honest "No reading yet" — never a fabricated value.
 * - Below MIRROR_MIN_TREND_SAMPLE_COUNT valid samples the kernel reports
 *   insufficient data and this panel shows a calm empty state, never a
 *   single point, an interpolated line, or a flat default.
 */

const TREND_COPY = {
  up: "Recent check-ins sit lighter than earlier ones.",
  flat: "Check-ins are holding even.",
  down: "Recent check-ins sit heavier than earlier ones.",
} as const;

const TREND_LABEL = {
  up: "Lighter",
  flat: "Even",
  down: "Heavier",
} as const;

// The fixed four (FR-047 acceptance criteria). System-framed names only.
const PROXY_GAUGES = [
  { id: "inflow-outflow", label: "Capture inflow vs completion outflow" },
  { id: "override-rate", label: "Override rate per policy class" },
  { id: "re-entry-latency", label: "Re-entry latency" },
  { id: "build-use", label: "Build:use ratio" },
] as const;

function TrendSparkline({ points }: { points: readonly number[] }) {
  const width = 240;
  const height = 56;
  const pad = 6;
  const step =
    points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  // Ordinals are -1 (heavier) .. +1 (lighter); +1 plots highest.
  const y = (ordinal: number) =>
    pad + ((1 - ordinal) / 2) * (height - pad * 2);
  const path = points
    .map(
      (ordinal, index) =>
        `${index === 0 ? "M" : "L"}${(pad + index * step).toFixed(1)},${y(ordinal).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-14 w-full max-w-60"
      role="img"
      aria-label={`Purpose gauge trend across ${points.length} check-ins`}
      data-testid="mirror-trend-sparkline"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((ordinal, index) => (
        <circle
          key={index}
          cx={pad + index * step}
          cy={y(ordinal)}
          r="3"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function MirrorPanel({ samples }: { samples: unknown }) {
  const trend = computeMirrorTrend(samples);

  return (
    <section
      aria-label="Mirror"
      data-testid="mirror-panel"
      className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-[var(--ink)]">Mirror</h2>
        <span className="text-xs text-[var(--mut)]">
          Observation only — these gauges describe the system, not you.
        </span>
      </div>

      <div className="mt-3" data-testid="mirror-purpose-trend">
        <p className="text-sm font-semibold text-[var(--ink)]">
          Purpose gauge
        </p>
        {trend.status === "insufficient_data" ? (
          <p
            className="mt-1 text-sm text-[var(--mut)]"
            data-testid="mirror-insufficient-data"
          >
            Not enough check-ins yet to show a trend. Nothing is owed here —
            it fills in on its own whenever check-ins happen.
          </p>
        ) : (
          <div className="mt-1 text-[var(--ink)]">
            <p className="text-sm text-[var(--mut)]">
              <span
                className="font-semibold text-[var(--ink)]"
                data-testid={`mirror-trend-${trend.status}`}
              >
                {TREND_LABEL[trend.status]}
              </span>{" "}
              · {TREND_COPY[trend.status]} ({trend.sampleCount} check-ins)
            </p>
            <TrendSparkline points={trend.points} />
          </div>
        )}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Proxy gauges">
        {PROXY_GAUGES.map((gauge) => (
          <li
            key={gauge.id}
            data-testid={`mirror-proxy-${gauge.id}`}
            className="rounded-xl border border-[var(--ln)] p-3"
          >
            <p className="text-sm font-semibold text-[var(--ink)]">
              {gauge.label}
            </p>
            <p className="mt-0.5 text-xs text-[var(--mut)]">No reading yet.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
