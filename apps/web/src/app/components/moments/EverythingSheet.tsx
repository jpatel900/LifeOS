"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import {
  buildEverythingList,
  EVERYTHING_GROUPINGS,
  EVERYTHING_GROUPING_LABEL,
  EVERYTHING_NO_AREA,
  EVERYTHING_SOURCE_YOU,
  EVERYTHING_TRAIL_STEPS,
  type EverythingGrouping,
  type EverythingItem,
  type EverythingStage,
} from "@/lib/everything/everythingList";
import { MomentSheet } from "./MomentSheet";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * The Everything sheet (#1160, FR-050): every thought, draft and task the
 * owner has given LifeOS, in one read-only list.
 *
 * It answers one question: "where did the thing I told LifeOS go, and what
 * state is it in?" It is a sheet, not a page (UX_FLOWS "Future Operating-View
 * Containment"), and it changes nothing: every decision still happens in
 * Sort, Plan and Flow.
 *
 * All rules (one item one truth, stages, groups, filters, counts) live in
 * `lib/everything/everythingList.ts`. This file only draws.
 *
 * Hook-free while closed, like `AreasSheet`: the outer component returns
 * before any hook runs, so a closed sheet costs the home nothing.
 */
export interface EverythingSheetProps {
  open: boolean;
  onClose(): void;
  now: Date;
}

export function EverythingSheet({ open, ...rest }: EverythingSheetProps) {
  if (!open) return null;
  return <OpenEverythingSheet {...rest} />;
}

// Stage is always written out as a word. The mark beside it is a second,
// redundant read (shape and fill differ, not only colour).
// Set as inline styles: the sheet shell's own border rule outranks a colour
// utility class here, which left every ring the same faint grey.
const STAGE_MARK: Record<
  EverythingStage,
  { color: string; filled: boolean; dashed?: boolean }
> = {
  thought: { color: "var(--muted-foreground)", filled: false },
  draft: { color: "var(--foreground)", filled: false, dashed: true },
  ready: { color: "var(--blu-fg)", filled: false },
  scheduled: { color: "var(--blu-fg)", filled: true },
  waiting: { color: "var(--state-watch)", filled: false },
  done: { color: "var(--state-ok)", filled: true },
  sorted: { color: "var(--muted-foreground)", filled: true },
  letgo: { color: "var(--muted-foreground)", filled: false, dashed: true },
};

const CONTROL =
  "h-11 rounded-[var(--surface-radius-sm)] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ROW_COLUMNS =
  "sm:grid sm:grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_5.5rem_5.5rem] sm:items-center sm:gap-x-3";

function Trail({ item }: { item: EverythingItem }) {
  return (
    <span
      role="img"
      aria-label={`Got as far as: ${EVERYTHING_TRAIL_STEPS[item.trailStep]}`}
      className="flex w-20 shrink-0 items-center"
      data-testid="everything-trail"
      data-step={item.trailStep}
    >
      {EVERYTHING_TRAIL_STEPS.map((step, index) => (
        <span key={step} aria-hidden="true" className="contents">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full border",
              index <= item.trailStep
                ? "border-foreground bg-foreground"
                : "border-border",
            )}
          />
          {index < EVERYTHING_TRAIL_STEPS.length - 1 ? (
            <span
              className={cn(
                "h-px flex-1",
                index < item.trailStep ? "bg-foreground" : "bg-border",
              )}
            />
          ) : null}
        </span>
      ))}
    </span>
  );
}

function Row({
  item,
  showTrail,
}: {
  item: EverythingItem;
  showTrail: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 text-sm",
        ROW_COLUMNS,
      )}
      data-testid={`everything-item-${item.id}`}
      data-stage={item.stage}
    >
      <span className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 sm:basis-auto">
        <span
          className={cn(
            "min-w-0 font-medium [overflow-wrap:anywhere]",
            item.closed && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </span>
        {item.source ? (
          <span
            className="shrink-0 rounded-[5px] border px-1.5 text-[11px] leading-5 text-[var(--blu-fg)]"
            style={{ borderColor: "var(--blu-fg)" }}
            data-testid="everything-source"
          >
            via {item.source}
          </span>
        ) : null}
        {showTrail ? <Trail item={item} /> : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-[3px] border border-border"
          style={item.areaColor ? { background: item.areaColor } : undefined}
        />
        <span className="truncate">{item.areaName}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border-2"
          style={{
            borderColor: STAGE_MARK[item.stage].color,
            borderStyle: STAGE_MARK[item.stage].dashed ? "dashed" : "solid",
            background: STAGE_MARK[item.stage].filled
              ? STAGE_MARK[item.stage].color
              : "transparent",
          }}
          data-testid="everything-stage-mark"
        />
        {item.stageLabel}
      </span>
      <span className="text-xs tabular-nums">
        {item.dueLabel ? (
          <>
            <span className="text-muted-foreground sm:sr-only">Due </span>
            {item.dueLabel}
          </>
        ) : (
          <span className="hidden text-muted-foreground sm:inline">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No due date</span>
          </span>
        )}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        <span className="sm:sr-only">Entered </span>
        {item.enteredLabel}
      </span>
    </li>
  );
}

function OpenEverythingSheet({
  onClose,
  now,
}: Omit<EverythingSheetProps, "open">) {
  const { state } = useWorkflow();
  const [grouping, setGrouping] = useState<EverythingGrouping>("due");
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const searchId = useId();
  const areaSelectId = useId();
  const sourceSelectId = useId();

  const list = useMemo(
    () =>
      buildEverythingList(
        state,
        { grouping, showClosed, search, areaId, source },
        now,
      ),
    [state, grouping, showClosed, search, areaId, source, now],
  );

  const closedCount = list.closed;
  const narrowed = list.narrowed;

  function clearFilters() {
    setSearch("");
    setAreaId(null);
    setSource(null);
  }

  return (
    <MomentSheet open title="Everything" onClose={onClose} width="wide">
      <div className="grid gap-5" data-testid="everything-sheet">
        <p
          className="text-sm text-muted-foreground"
          data-testid="everything-summary"
        >
          {list.total === 0
            ? "Nothing here yet."
            : `${list.total} ${list.total === 1 ? "item" : "items"}. ${list.open} still open.`}{" "}
          Every thought, draft and task you have given LifeOS.
        </p>
        <p className="sr-only" role="status" data-testid="everything-shown">
          {list.total === 0 ? "" : `Showing ${list.shown} of ${list.total}.`}
        </p>

        {list.total > 0 ? (
          <div className="grid gap-3">
            <div
              role="group"
              aria-label="Group the list"
              className="flex flex-wrap gap-1.5"
              data-testid="everything-groupings"
            >
              {EVERYTHING_GROUPINGS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={grouping === option}
                  onClick={() => setGrouping(option)}
                  className={cn(
                    HIT_TARGET_ROW,
                    "rounded-[var(--surface-radius-sm)] border px-3 text-sm outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                    grouping === option
                      ? "border-foreground bg-muted font-semibold"
                      : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  data-testid={`everything-grouping-${option}`}
                >
                  {EVERYTHING_GROUPING_LABEL[option]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-[12rem] flex-1 gap-1">
                <label
                  htmlFor={searchId}
                  className="text-xs text-muted-foreground"
                >
                  Search
                </label>
                <input
                  id={searchId}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search everything"
                  autoComplete="off"
                  className={cn(CONTROL, "w-full")}
                  data-testid="everything-search"
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor={areaSelectId}
                  className="text-xs text-muted-foreground"
                >
                  Area
                </label>
                <select
                  id={areaSelectId}
                  value={areaId ?? ""}
                  onChange={(event) => setAreaId(event.target.value || null)}
                  className={cn(CONTROL, "max-w-[11rem]")}
                  data-testid="everything-area"
                >
                  <option value="">All areas</option>
                  {state.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                  {list.hasNoAreaItems ? (
                    <option value={EVERYTHING_NO_AREA}>No area</option>
                  ) : null}
                </select>
              </div>
              {list.sources.length > 0 ? (
                <div className="grid gap-1">
                  <label
                    htmlFor={sourceSelectId}
                    className="text-xs text-muted-foreground"
                  >
                    Entered by
                  </label>
                  <select
                    id={sourceSelectId}
                    value={source ?? ""}
                    onChange={(event) => setSource(event.target.value || null)}
                    className={cn(CONTROL, "max-w-[11rem]")}
                    data-testid="everything-source-filter"
                  >
                    <option value="">Anyone</option>
                    <option value={EVERYTHING_SOURCE_YOU}>You</option>
                    {list.sources.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <button
                type="button"
                aria-pressed={showClosed}
                onClick={() => setShowClosed((value) => !value)}
                className={cn(
                  CONTROL,
                  "touch-manipulation transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none",
                  showClosed
                    ? "border-foreground bg-muted font-semibold"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                data-testid="everything-show-closed"
              >
                Show closed
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {closedCount}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {list.total === 0 ? (
          <p className="text-sm" data-testid="everything-empty">
            Capture a thought and it shows up here, and stays here.
          </p>
        ) : list.shown === 0 ? (
          <div className="grid gap-2 text-sm" data-testid="everything-no-match">
            <p>
              {narrowed
                ? "Nothing matches these filters."
                : "Nothing is open. Everything you entered is closed."}
            </p>
            <div className="flex flex-wrap gap-2">
              {narrowed ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className={cn(CONTROL, "touch-manipulation font-semibold")}
                  data-testid="everything-clear-filters"
                >
                  Clear filters
                </button>
              ) : null}
              {!showClosed && closedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowClosed(true)}
                  className={cn(CONTROL, "touch-manipulation font-semibold")}
                  data-testid="everything-reveal-closed"
                >
                  Show {closedCount} closed
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-5" data-testid="everything-groups">
            <div
              aria-hidden="true"
              className={cn(
                "hidden border-b border-border pb-2 text-xs text-muted-foreground",
                ROW_COLUMNS,
              )}
            >
              <span>Task</span>
              <span>Area</span>
              <span>Stage</span>
              <span>Due</span>
              <span>Entered</span>
            </div>
            {list.groups.map((group) => (
              <section
                key={group.id}
                aria-label={group.label}
                data-testid={`everything-group-${group.id}`}
              >
                <h3 className="flex items-baseline gap-2 border-b border-border pb-1.5 text-sm font-semibold">
                  {group.label}
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {group.items.length}
                  </span>
                </h3>
                <ul>
                  {group.items.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      showTrail={grouping === "entered"}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </MomentSheet>
  );
}
