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
// redundant read (shape and fill differ, not only colour), and the soft
// surface behind the word is a third.
// Set as inline styles: the sheet shell's own border rule outranks a colour
// utility class here, which left every ring the same faint grey.
const NEUTRAL_SURFACE =
  "color-mix(in srgb, var(--foreground) 11%, transparent)";

const STAGE_TONE: Record<
  EverythingStage,
  { color: string; surface: string; filled: boolean; dashed?: boolean }
> = {
  thought: {
    color: "var(--muted-foreground)",
    surface: NEUTRAL_SURFACE,
    filled: false,
  },
  draft: {
    color: "var(--foreground)",
    surface: NEUTRAL_SURFACE,
    filled: false,
    dashed: true,
  },
  ready: { color: "var(--blu-fg)", surface: "var(--blu-sf)", filled: false },
  scheduled: { color: "var(--blu-fg)", surface: "var(--blu-sf)", filled: true },
  waiting: {
    color: "var(--state-watch)",
    surface: "var(--amb-sf)",
    filled: false,
  },
  done: { color: "var(--state-ok)", surface: "var(--grn-sf)", filled: true },
  sorted: {
    color: "var(--muted-foreground)",
    surface: NEUTRAL_SURFACE,
    filled: true,
  },
  letgo: {
    color: "var(--muted-foreground)",
    surface: NEUTRAL_SURFACE,
    filled: false,
    dashed: true,
  },
};

const CONTROL =
  "h-11 rounded-[var(--surface-radius-sm)] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

// One row shape at every width (#1162): the phone is the first screen this
// is read on, so the title leads and the details sit underneath it. Desktop
// gets the same shape with more air, not a different table.
function Row({
  item,
  showTrail,
}: {
  item: EverythingItem;
  showTrail: boolean;
}) {
  const tone = STAGE_TONE[item.stage];
  return (
    <li
      className="grid grid-cols-[4px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border py-3"
      data-testid={`everything-item-${item.id}`}
      data-stage={item.stage}
    >
      <span
        aria-hidden="true"
        className="self-stretch rounded-full"
        style={{
          background:
            item.closed || item.stage === "draft"
              ? "var(--muted-foreground)"
              : tone.color,
          opacity: item.closed ? 0.4 : 1,
        }}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]",
            item.closed && "font-medium text-muted-foreground line-through",
          )}
        >
          {item.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-2 pr-2.5 text-foreground"
            style={{ background: tone.surface }}
            data-testid="everything-stage"
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full border-2"
              style={{
                borderColor: tone.color,
                borderStyle: tone.dashed ? "dashed" : "solid",
                background: tone.filled ? tone.color : "transparent",
              }}
              data-testid="everything-stage-mark"
            />
            {item.stageLabel}
          </span>
          <span
            className="inline-block max-w-[11rem] truncate rounded-[5px] px-2 py-0.5 text-foreground"
            style={{
              background: item.areaColor
                ? `color-mix(in srgb, ${item.areaColor} 22%, transparent)`
                : NEUTRAL_SURFACE,
            }}
            data-testid="everything-area-tag"
          >
            {item.areaName}
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
          <span className="tabular-nums">Entered {item.enteredLabel}</span>
          {showTrail ? <Trail item={item} /> : null}
        </div>
      </div>
      {item.dueLabel ? (
        <p
          className="self-start pt-0.5 text-right text-[13px] tabular-nums leading-tight"
          data-testid="everything-due"
        >
          <span className="sr-only">Due </span>
          {item.dueLabel}
          <span
            aria-hidden="true"
            className="block text-[11px] text-muted-foreground"
          >
            due
          </span>
        </p>
      ) : (
        <span className="sr-only">No due date</span>
      )}
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
  // Which groups are folded, keyed by grouping so "Today" under one grouping
  // never folds a group of another. Display state only.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const groupsId = useId();
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

  function toggleFold(key: string) {
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Narrowing the list opens every group again: a folded group must never
  // hide the thing a search or filter just found.
  function unfoldAll() {
    setFolded((current) => (current.size === 0 ? current : new Set()));
  }

  function clearFilters() {
    unfoldAll();
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
              aria-label="Group the list by"
              className="flex overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]"
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
                    "shrink-0 touch-manipulation whitespace-nowrap border-b-2 px-2.5 text-sm outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                    grouping === option
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  style={{
                    borderBottomColor:
                      grouping === option ? "var(--foreground)" : "transparent",
                  }}
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
                  onChange={(event) => {
                    unfoldAll();
                    setSearch(event.target.value);
                  }}
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
                  onChange={(event) => {
                    unfoldAll();
                    setAreaId(event.target.value || null);
                  }}
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
                    onChange={(event) => {
                      unfoldAll();
                      setSource(event.target.value || null);
                    }}
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
          <div className="grid gap-4" data-testid="everything-groups">
            {list.groups.map((group, index) => {
              const foldKey = `${grouping}:${group.id}`;
              const isFolded = folded.has(foldKey);
              const listId = `${groupsId}-${index}`;
              return (
                <section
                  key={group.id}
                  aria-label={group.label}
                  data-testid={`everything-group-${group.id}`}
                >
                  <h3 className="border-b border-border">
                    <button
                      type="button"
                      aria-expanded={!isFolded}
                      aria-controls={listId}
                      onClick={() => toggleFold(foldKey)}
                      className={cn(
                        HIT_TARGET_ROW,
                        "flex w-full touch-manipulation items-center gap-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      )}
                      data-testid={`everything-fold-${group.id}`}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 10 10"
                        className={cn(
                          "size-2.5 shrink-0 fill-current transition-transform duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
                          isFolded ? "" : "rotate-90",
                        )}
                      >
                        <path d="M3 1.5 7.5 5 3 8.5z" />
                      </svg>
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {group.label}
                      </span>
                      <span
                        className="font-normal tabular-nums"
                        data-testid={`everything-count-${group.id}`}
                      >
                        {group.items.length}
                        <span className="sr-only">
                          {group.items.length === 1 ? " item" : " items"}
                        </span>
                      </span>
                    </button>
                  </h3>
                  <ul id={listId} hidden={isFolded}>
                    {isFolded
                      ? null
                      : group.items.map((item) => (
                          <Row
                            key={item.id}
                            item={item}
                            showTrail={grouping === "entered"}
                          />
                        ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </MomentSheet>
  );
}
