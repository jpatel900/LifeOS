"use client";

import { Focus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * R4-B (premium push #483, round 4): the no-active-block state
 * (`flow-moment-empty` in FlowMoment.tsx) composed a single small card and
 * left the rest of the canvas empty — ~543px of unexplained void below it at
 * 1440x900, measured with nothing else on the page (no drift, no first-move
 * task, so `TaskMapSection`'s rail-fallback branch renders nothing either).
 * Round 3 fixed the element; the page composition was still unfinished.
 *
 * The owner already ratified the fix for this exact class of problem on the
 * Start moment's empty day (#478): fill the void with real orientation
 * content, not more padding, not a stretched/centered layout. See
 * `LoopOrientation.tsx`'s doc comment for the full ruling.
 *
 * Flow's identity is narrower than Start's: Start orients across the whole
 * five-stage pipeline; Flow *is* one stage in it — "one task, one focus"
 * (see CurrentBlockHero.tsx's UX-INV-1: exactly one visually-primary
 * action). This card says only that. It deliberately does NOT repeat "go to
 * Start" — that real affordance already lives one card up in
 * `flow-moment-empty` — and it does NOT clone LoopOrientation's five-stage
 * node rail: that diagram is Start's job, and the masthead's MomentSwitcher
 * tabs already show Flow selected, so a second "you are here" positional
 * cue here would be the same fact said a third time, not new information.
 *
 * Data-free by design: mock and live state both have nothing to say about
 * what will fill this space once a block starts (no next-block preview
 * exists in the reproduced quiet-day scenario — see momentsViewModel/
 * flow.ts), so nothing here previews or implies one. The copy is evergreen
 * and unconditionally true every time this state renders — this is seen on
 * every quiet Flow visit, not a one-time tutorial to dismiss.
 */
export function FlowIdleOrientation() {
  return (
    <Card
      className="workflow-support-card moments-card"
      data-testid="flow-idle-orientation"
    >
      <CardContent className="grid justify-items-center gap-3 p-6 text-center sm:p-8">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in oklch, var(--acc) 16%, transparent)",
          }}
        >
          <Focus className="size-5" style={{ color: "var(--acc)" }} />
        </span>
        <p className="workflow-surface-body max-w-sm text-sm text-muted-foreground">
          Flow holds one task at a time — a countdown and a single primary
          action, nothing else competing for attention.
        </p>
      </CardContent>
    </Card>
  );
}
