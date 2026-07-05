"use client";

import { useState } from "react";
import { FirstMoveCard } from "../components/moments/FirstMoveCard";
import { ScheduleList } from "../components/moments/ScheduleList";
import {
  CountdownClockToggle,
  type CountdownClockValue,
} from "../components/moments/CountdownClockToggle";
import { AreaHealthDots } from "../components/moments/AreaHealthDots";
import { SideRail } from "../components/moments/SideRail";
import {
  MomentSwitcher,
  type MomentValue,
} from "../components/moments/MomentSwitcher";
import { CaptureAffordance } from "../components/moments/CaptureAffordance";
import { CaptureOverlay } from "../components/moments/CaptureOverlay";
import type {
  AreaHealthVM,
  ScheduleBlockVM,
  WaitingVM,
} from "../components/moments/momentsViewModel";

/**
 * Moments pass P2 — dev-only preview route.
 *
 * Renders every P2 presentation primitive against plausible fixture data,
 * pinned to a fixed base date (never Date.now()). Not linked from anywhere
 * in the app; imports fixtures only, no WorkflowContext, no fetches.
 */

const BASE_DATE = new Date("2026-07-05T15:00:00.000Z");

const FIXTURE_BLOCKS: ScheduleBlockVM[] = [
  {
    id: "block-1",
    title: "Draft Q3 review notes",
    meta: "Work",
    state: "done",
    startAt: "2026-07-05T13:00:00.000Z",
    endAt: "2026-07-05T14:00:00.000Z",
  },
  {
    id: "block-2",
    title: "Deep work: LifeOS moments pass",
    meta: "Work",
    state: "now",
    startAt: "2026-07-05T14:30:00.000Z",
    endAt: "2026-07-05T15:30:00.000Z",
  },
  {
    id: "block-3",
    title: "",
    meta: "",
    state: "free",
    startAt: "2026-07-05T15:30:00.000Z",
    endAt: "2026-07-05T16:00:00.000Z",
  },
  {
    id: "block-4",
    title: "1:1 with Priya",
    meta: "Work",
    state: "upcoming",
    startAt: "2026-07-05T16:00:00.000Z",
    endAt: "2026-07-05T16:30:00.000Z",
  },
];

const FIXTURE_WAITING: WaitingVM[] = [
  {
    taskId: "task-w1",
    title: "Contract redline from legal",
    since: "2026-06-27T09:00:00.000Z",
    daysWaiting: 8,
    status: "risk",
  },
  {
    taskId: "task-w2",
    title: "Design feedback from Sam",
    since: "2026-07-02T09:00:00.000Z",
    daysWaiting: 3,
    status: "watch",
  },
];

const FIXTURE_AREAS: AreaHealthVM[] = [
  {
    id: "area-work",
    name: "Work",
    status: "watch",
    note: "4 open · 1 waiting",
  },
  { id: "area-health", name: "Health", status: "ok", note: "2 open" },
  { id: "area-home", name: "Home", status: "idle", note: "0 open" },
  {
    id: "area-finance",
    name: "Finance",
    status: "risk",
    note: "1 open · 1 waiting",
  },
];

const CAPTURE_KINDS = ["Task", "Note", "Idea"];

export default function MomentsPreviewPage() {
  const [timeDisplay, setTimeDisplay] =
    useState<CountdownClockValue>("countdown");
  const [moment, setMoment] = useState<MomentValue>("start");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [savedCaptures, setSavedCaptures] = useState<
    { text: string; kind: string }[]
  >([]);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <header className="mb-6 grid gap-1">
        <h1 className="text-xl font-semibold">
          Moments preview (dev-only, packet P2 — not linked from the app)
        </h1>
        <p className="text-sm text-muted-foreground">
          Fixtures pinned to {BASE_DATE.toISOString()}. Presentation primitives
          only — no fetches, no WorkflowContext.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <MomentSwitcher value={moment} onChange={setMoment} />
        <CountdownClockToggle value={timeDisplay} onChange={setTimeDisplay} />
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Current moment tab: <strong>{moment}</strong>
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          <FirstMoveCard
            move={{
              title: "Deep work: LifeOS moments pass",
              why: "Scheduled now",
              areaLabel: "Work",
              estMinutes: 60,
              followOn: "1:1 with Priya at 4:00pm",
            }}
            onStart={() => window.alert("start")}
            onSnooze={() => window.alert("snooze")}
            onSwap={() => window.alert("swap")}
          />

          <section className="grid gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Today&apos;s schedule
            </h2>
            <ScheduleList
              blocks={FIXTURE_BLOCKS}
              timeDisplay={timeDisplay}
              now={BASE_DATE}
            />
          </section>

          <section className="grid gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Area health (standalone)
            </h2>
            <AreaHealthDots areas={FIXTURE_AREAS} />
          </section>

          {savedCaptures.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Saved captures (this session)
              </h2>
              <ul className="grid gap-1 text-sm">
                {savedCaptures.map((c, i) => (
                  <li key={i}>
                    <strong>{c.kind}:</strong> {c.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <SideRail
          waitingOn={FIXTURE_WAITING}
          areas={FIXTURE_AREAS}
          onOpenHealth={() => window.alert("open health")}
        />
      </div>

      <CaptureAffordance onOpen={() => setCaptureOpen(true)} />

      <CaptureOverlay
        open={captureOpen}
        kinds={CAPTURE_KINDS}
        onSave={(text, kind) => {
          setSavedCaptures((prev) => [...prev, { text, kind }]);
          setCaptureOpen(false);
        }}
        onClose={() => setCaptureOpen(false)}
      />
    </div>
  );
}
