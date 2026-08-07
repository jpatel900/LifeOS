"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { MomentSheet } from "./MomentSheet";
import { HIT_TARGET_ROW } from "./hitTarget";
import { buildAreasOverview, type AreasOverviewItem } from "./areasOverview";

/**
 * Final UX Loop C2-S5 (#687) — the All-areas surface, ported.
 *
 * ## What changes for the person using it
 *
 * The legacy `/areas` screen answered one question the moments home could not:
 * *across everything I own, where does my work actually sit?* The home's
 * `SideRail` shows area health dots and a count of areas; it has never shown
 * the work. Reaching the answer meant leaving the moments shell for the old
 * cockpit design — the exact shape Target Card 2 forbids twice (an old-design
 * screen renders, and Back leaves the shell).
 *
 * Unlike S2/S3/S4 there was nothing to re-point: no file under `moments/`
 * linked to `/areas` at all, so this slice had to CREATE the way in. It is
 * `SideRail`'s "See all areas →", one interaction from the home, plus a
 * command-palette entry — the palette being the entry that is the same
 * distance from every moment and every viewport, which is what Card 2's
 * "≤2 interactions" asks for at 390px (the same reasoning S4 recorded).
 *
 * ## Closed means closed
 *
 * `TodayMoments` mounts every sheet on every home render — `open` is a prop,
 * not a mount condition — so the outer component here is deliberately
 * hook-free and ALL the work lives in `OpenAreasSheet`, which only exists
 * while the sheet is open. This is S4's shape (`HealthSheet`), adopted for the
 * same measured reason: a view model built in a closed sheet's body is rebuilt
 * on every render of a shell whose clock ticks every second, forever, for a
 * surface nobody opened.
 *
 * ## Picking an area here is picking it everywhere
 *
 * The legacy screen's segments and pills called a local `onSelectArea`. Here
 * that writes the ONE shared selection (#691's single source of truth), so the
 * masthead picker, the Pipeline rail and every sheet agree the instant this
 * closes. The sheet closes on the pick precisely so the change is visible:
 * this surface is global, so staying open would show a person nothing at all
 * in response to their click.
 *
 * ## The proportional bar is a picture, not a second set of buttons
 *
 * On the legacy screen the bar segments and the pills below them were two
 * controls doing the identical thing, and a thin area's segment could be 20px
 * wide — under the 44px floor Card 8 pins. The bar is now `aria-hidden`
 * decoration over the real numbers, and the pills are the one control. No
 * capability is lost: the pills always did the whole job.
 */

export interface AreasSheetProps {
  open: boolean;
  onClose(): void;
  selectedAreaId: string | null;
  /** Writes the one shared selection. `null` means All areas. */
  onSelectArea(areaId: string | null): void;
}

/**
 * The whole component is the gate. Deliberately hook-free: `open` flipping
 * MOUNTS and UNMOUNTS the body below, so nothing computes while it is closed.
 */
export function AreasSheet({ open, ...rest }: AreasSheetProps) {
  if (!open) return null;
  return <OpenAreasSheet {...rest} />;
}

function ItemRow({ item }: { item: AreasOverviewItem }) {
  return (
    <li
      className="rounded-2xl border p-3 text-sm"
      style={{ borderColor: item.areaColor }}
      data-testid={`areas-sheet-item-${item.id}`}
    >
      <span className="block font-semibold">{item.title}</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: item.areaColor }}
        />
        {item.areaName}
      </span>
    </li>
  );
}

function OpenAreasSheet({
  onClose,
  selectedAreaId,
  onSelectArea,
}: Omit<AreasSheetProps, "open">) {
  const { state } = useWorkflow();
  const vm = useMemo(() => buildAreasOverview(state), [state]);

  // The bar's widths are a picture OF `openCount`, derived from the same
  // numbers printed on the pills — never a second measurement.
  const barTotal = Math.max(vm.totalOpen, 1);

  function pick(areaId: string | null) {
    onSelectArea(areaId);
    onClose();
  }

  return (
    <MomentSheet
      // This body only exists while the sheet is open, so the shell is on.
      open
      title="All areas"
      onClose={onClose}
      width="wide"
    >
      <div className="grid gap-6" data-testid="areas-sheet">
        <p
          className="text-sm text-muted-foreground"
          data-testid="areas-sheet-summary"
        >
          {vm.rows.length === 0
            ? "You have no areas yet. Add one in Settings to start sorting work by where it belongs."
            : vm.totalOpen === 0
              ? `Nothing is open across your ${vm.rows.length === 1 ? "area" : `${vm.rows.length} areas`}.`
              : `${vm.totalOpen} ${vm.totalOpen === 1 ? "thing is" : "things are"} open across your ${vm.rows.length === 1 ? "area" : `${vm.rows.length} areas`}.`}
        </p>

        {vm.rows.length > 0 ? (
          <div className="grid gap-3">
            {vm.totalOpen > 0 ? (
              <div
                aria-hidden="true"
                data-testid="areas-sheet-bar"
                className="flex h-3 overflow-hidden rounded-full border border-border"
              >
                {vm.rows.map((row) => (
                  <span
                    key={row.area.id}
                    className="block"
                    style={{
                      flex: Math.max(row.openCount / barTotal, 0.02),
                      background: row.area.color,
                    }}
                  />
                ))}
              </div>
            ) : null}

            <ul
              className="flex flex-wrap gap-2"
              data-testid="areas-sheet-pills"
            >
              <li>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  aria-pressed={selectedAreaId === null}
                  className={cn(
                    HIT_TARGET_ROW,
                    "inline-flex items-center gap-2 rounded-full border px-3.5 text-sm outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
                    selectedAreaId === null
                      ? "border-foreground bg-muted font-semibold"
                      : "border-border hover:bg-muted/60",
                  )}
                  data-testid="areas-sheet-pill-all"
                >
                  All areas
                  <span className="tabular-nums text-muted-foreground">
                    {vm.totalOpen}
                  </span>
                </button>
              </li>
              {vm.rows.map((row) => (
                <li key={row.area.id}>
                  <button
                    type="button"
                    onClick={() => pick(row.area.id)}
                    aria-pressed={selectedAreaId === row.area.id}
                    // Says what the number means, for a reader who cannot see
                    // the column headings this pill is summarising.
                    aria-label={`${row.area.name}: ${row.openCount} open. Show only this area.`}
                    className={cn(
                      HIT_TARGET_ROW,
                      "inline-flex items-center gap-2 rounded-full border px-3.5 text-sm outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
                      selectedAreaId === row.area.id
                        ? "border-foreground bg-muted font-semibold"
                        : "border-border hover:bg-muted/60",
                    )}
                    data-testid={`areas-sheet-pill-${row.area.id}`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: row.area.color }}
                    />
                    <span aria-hidden="true">{row.area.name}</span>
                    <span
                      aria-hidden="true"
                      className="tabular-nums text-muted-foreground"
                    >
                      {row.openCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-4">
          {vm.columns.map((col) => (
            <section
              key={col.id}
              className="rounded-2xl border border-border bg-muted/30 p-4"
              aria-labelledby={`areas-sheet-heading-${col.id}`}
              data-testid={`areas-sheet-column-${col.id}`}
            >
              <h3
                id={`areas-sheet-heading-${col.id}`}
                className="flex items-baseline justify-between gap-2 font-bold"
              >
                {col.title}
                <span
                  className="tabular-nums text-sm font-normal text-muted-foreground"
                  data-testid={`areas-sheet-count-${col.id}`}
                >
                  {col.items.length}
                </span>
              </h3>
              {col.items.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {col.items.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <div
                  className="mt-3 text-sm text-muted-foreground"
                  data-testid={`areas-sheet-empty-${col.id}`}
                >
                  <p>{col.emptyWhat}</p>
                  <p className="mt-1">{col.emptyNext}</p>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </MomentSheet>
  );
}
