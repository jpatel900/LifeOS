import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { Panel } from "./shared";

// Overview ("All areas") stage screen (extracted from LifeOSCockpit.tsx,
// issue #590 slice 2 — mechanical split, no behavior change).
export function OverviewView({
  vm,
  onSelectArea,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onSelectArea: (areaId: string) => void;
}) {
  const total = Math.max(
    vm.overview.reduce((sum, item) => sum + item.openCount, 0),
    1,
  );
  return (
    <div className="grid gap-5">
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          {/* O3 (#660 surface audit): pinned off text-2xl/font-extrabold
              onto the fixed h1 grammar (2.25rem/700, .moments-greeting in
              globals.css) shared by the other stage screens' hero titles. */}
          <h1 className="moments-greeting">All areas overview</h1>
          <span className="text-sm text-[var(--mut)]">Global scope</span>
        </div>
        <div className="flex h-12 overflow-hidden rounded-full border border-[var(--ln2)]">
          {vm.overview.map((item) => (
            <button
              key={item.area.id}
              type="button"
              onClick={() => onSelectArea(item.area.id)}
              className="min-w-5"
              style={{
                flex: Math.max(item.openCount / total, 0.05),
                background: item.area.color,
              }}
              aria-label={`${item.area.name}: ${item.openCount} open`}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {vm.overview.map((item) => (
            <button
              key={item.area.id}
              type="button"
              onClick={() => onSelectArea(item.area.id)}
              className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--sf3)] px-3 text-sm"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: item.area.color }}
              />
              {item.area.name}
              <span className="mono text-[var(--fnt)]">{item.openCount}</span>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          {
            title: "To triage",
            items: vm.global.inbox,
            what: "Nothing is waiting for a decision.",
            next: "Capture a thought to fill this column.",
          },
          {
            title: "To plan",
            items: vm.global.today,
            what: "Nothing has been triaged into today yet.",
            next: "Triage an item to move it here.",
          },
          {
            title: "Scheduled",
            items: vm.global.planned,
            what: "Nothing is on the calendar yet.",
            next: "Plan a triaged item to schedule it.",
          },
          {
            title: "Done",
            items: vm.global.done,
            what: "Nothing has been finished yet.",
            next: "Complete a scheduled block to see it here.",
          },
        ].map((column) => (
          <Panel key={column.title}>
            <h2 className="font-bold">{column.title}</h2>
            <div className="mt-3 grid gap-2">
              {column.items.length ? (
                column.items.map((item) => (
                  <div
                    key={item.id}
                    // O1 (#660 surface audit, the sole detector hit): the
                    // side-tab borderLeft stripe is replaced with a
                    // full-perimeter 1px tint on the existing border — the
                    // same pattern moments-card--emphasis cards use
                    // (StartMoment.tsx, FirstMoveCard.tsx) — plus the area
                    // dot below, which already carries the same signal.
                    className="rounded-2xl border p-3 text-sm"
                    style={{
                      background: item.cardColor,
                      borderColor: item.area.color,
                    }}
                  >
                    <span className="block font-semibold">{item.title}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--mut)]">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: item.area.color }}
                      />
                      {item.area.name}
                    </span>
                  </div>
                ))
              ) : (
                // O2 (#660 surface audit): the empty state now says what
                // this column is and one next step, instead of a bare
                // "Empty" label with no orientation.
                <div className="text-sm text-[var(--mut)]">
                  <p>{column.what}</p>
                  <p className="mt-1">{column.next}</p>
                </div>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
