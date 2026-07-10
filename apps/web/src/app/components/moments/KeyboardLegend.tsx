import {
  MOMENT_KEY_BINDINGS,
  type MomentKeyActionId,
  momentKeyLabel,
} from "@/lib/keys/keymap";

/**
 * D-6 (#483) — quiet bottom-left keyboard legend, ported from the prototype's
 * `.kbdhelp` strip. Display-only: it reads `MOMENT_KEY_BINDINGS` (the same
 * single source of truth `useMomentKeyboard` matches against and
 * `CaptureAffordance`/`CommandPalette` render hints from) so the chips shown
 * here can never drift from what a keypress actually does. Every binding in
 * the keymap is wired to a live handler on the moments home whenever
 * `useMomentKeyboard` is enabled (TodayMoments.tsx) — so every id this
 * component could show is "actually active" (nothing here is aspirational or
 * copied from the prototype's unimplemented A/T/D/M shortcuts) — but only a
 * subset is actually surfaced; see `DISPLAYED_ACTION_IDS` below for why.
 *
 * Grouping/description text is presentational copy only (the keymap has no
 * human-readable descriptions); the key glyphs themselves always come from
 * `momentKeyLabel`. Hidden below `sm` to keep density in check on narrow
 * viewports (owner feedback on #483, 2026-07-10) and to stay clear of the
 * fixed capture pill, which also centers itself in that space.
 *
 * `DISPLAYED_ACTION_IDS` narrows to the three shortcuts a first-time user
 * would not otherwise guess (moment switching, capture, the command
 * palette) — Enter/Escape are standard UI conventions the ratified prototype
 * itself didn't call out either, and the pill's own ported microcopy
 * ("Something on your mind? ...") already runs wide at desktop widths, so
 * every extra group here is real risk of crowding it (owner density
 * feedback again). This is a curation of *which* active bindings are worth
 * surfacing, not a fabricated one: every id below still exists in
 * `MOMENT_KEY_BINDINGS` and every glyph rendered still comes from
 * `momentKeyLabel`, so it can't drift from what a keypress actually does.
 */

const DISPLAYED_ACTION_IDS: readonly MomentKeyActionId[] = [
  "switch-start",
  "switch-flow",
  "switch-close",
  "open-capture",
  "open-command-palette",
];

const ACTION_DESCRIPTIONS: Partial<Record<MomentKeyActionId, string>> = {
  "switch-start": "moments",
  "switch-flow": "moments",
  "switch-close": "moments",
  "open-capture": "capture",
  "open-command-palette": "palette",
};

interface LegendGroup {
  description: string;
  ids: MomentKeyActionId[];
}

function buildLegendGroups(): LegendGroup[] {
  const order: string[] = [];
  const byDescription = new Map<string, MomentKeyActionId[]>();
  const displayed = new Set<MomentKeyActionId>(DISPLAYED_ACTION_IDS);

  for (const binding of MOMENT_KEY_BINDINGS) {
    if (!displayed.has(binding.id)) continue;
    const description =
      ACTION_DESCRIPTIONS[binding.id] ?? binding.id.replace(/-/g, " ");
    if (!byDescription.has(description)) {
      byDescription.set(description, []);
      order.push(description);
    }
    byDescription.get(description)!.push(binding.id);
  }

  return order.map((description) => ({
    description,
    ids: byDescription.get(description)!,
  }));
}

const LEGEND_GROUPS = buildLegendGroups();

export function KeyboardLegend() {
  return (
    <div
      role="group"
      aria-label="Keyboard shortcuts"
      className="pointer-events-none fixed bottom-6 left-6 z-30 hidden items-center gap-3 text-xs text-muted-foreground sm:flex"
      data-testid="keyboard-legend"
    >
      {LEGEND_GROUPS.map((group) => (
        <span key={group.description} className="flex items-center gap-1.5">
          {group.ids.map((id) => (
            <kbd
              key={id}
              className="rounded border border-border bg-background px-1.5 py-0.5 font-semibold text-foreground/80"
            >
              {momentKeyLabel(id)}
            </kbd>
          ))}
          <span>{group.description}</span>
        </span>
      ))}
    </div>
  );
}
