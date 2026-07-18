import { ChevronRight } from "lucide-react";
import {
  buildCockpitViewModel,
  type CockpitStage,
} from "@/lib/cockpit/viewModel";
import { Panel } from "./shared";

// Today stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2 —
// mechanical split, no behavior change).
export function TodayView({
  vm,
  onNavigate,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onNavigate: (stage: CockpitStage) => void;
}) {
  const next =
    vm.inbox.length > 0
      ? {
          label: "Triage next",
          stage: "triage" as const,
          title: vm.inbox[0].title,
        }
      : vm.today.length > 0
        ? {
            label: "Plan next",
            stage: "plan" as const,
            title: vm.today[0].title,
          }
        : vm.planned.length > 0
          ? {
              label: "Start focus",
              stage: "execute" as const,
              title: vm.planned[0].task.title,
            }
          : {
              label: "Capture thought",
              stage: "capture" as const,
              title: "Nothing is waiting",
            };
  const bands = [
    { label: "To triage", count: vm.inbox.length, stage: "triage" as const },
    { label: "To plan", count: vm.today.length, stage: "plan" as const },
    { label: "Scheduled", count: vm.planned.length, stage: "execute" as const },
    { label: "Done", count: vm.done.length, stage: "review" as const },
  ];

  return (
    <div className="grid gap-5">
      <Panel className="min-h-72 content-center">
        <div className="mx-auto max-w-2xl text-center">
          {/* T2 (#660 surface audit): the ad-hoc mono eyebrow is now the
              shared .moments-label grammar (sentence case in JSX, the CSS
              class handles the uppercase/tracking treatment) instead of a
              one-off accent-colored mono label. */}
          <p className="moments-label">One move now</p>
          {/* T1 (#660 surface audit): pinned off text-4xl/sm:text-6xl
              font-extrabold (which both overshoots the fixed type scale and
              exceeds the 700 weight cap) onto the shared h1 grammar
              (2.25rem/700, .moments-greeting). */}
          <h1 className="moments-greeting mt-3">{next.title}</h1>
          <button
            type="button"
            onClick={() => onNavigate(next.stage)}
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]"
          >
            {next.label}
            <ChevronRight size={18} />
          </button>
        </div>
      </Panel>
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">At a glance</h2>
          <span className="mono text-sm text-[var(--fnt)]">
            {vm.activeArea.name}
          </span>
        </div>
        {/* T3 (#660 surface audit): the segments were solid state-surface
            fills (--amb-sf/--grn-sf/--blu-sf) covering the full cell — calm
            accent discipline elsewhere is border/tint, not fills (see
            .moments-card--tint-watch, globals.css). Muted to a soft
            color-mix tint over the base row surface, with the state color
            carried by the count/label text and a bottom accent border
            instead of a full-cell wash. */}
        <div className="flex h-16 overflow-hidden rounded-2xl border border-[var(--ln2)]">
          {bands.map((band) => {
            const accent =
              band.stage === "triage"
                ? "var(--amb-fg)"
                : band.stage === "review"
                  ? "var(--grn-fg)"
                  : "var(--blu-fg)";
            return (
              <button
                key={band.label}
                type="button"
                onClick={() => onNavigate(band.stage)}
                className="min-w-12 border-r border-[var(--bd)] px-3 text-left last:border-r-0"
                style={{
                  flex: Math.max(1, band.count) + 0.6,
                  background: `color-mix(in oklch, ${accent} 12%, var(--sf2))`,
                  borderBottom: `2px solid ${accent}`,
                  color: accent,
                }}
              >
                <span className="mono block text-lg font-bold">
                  {band.count}
                </span>
                <span className="text-xs">{band.label}</span>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
