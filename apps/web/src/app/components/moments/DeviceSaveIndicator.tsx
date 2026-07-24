"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { resolveDeviceSaveNotice } from "@/lib/deviceSaveNotice";
import {
  DEVICE_ONLY_SHORT_LABEL,
  SAVE_PROBLEM_SHORT_LABEL,
} from "@/lib/statusVocabulary";
import type { WorkflowSyncStatus } from "@/lib/WorkflowContext";
import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * #734 — where your work is, on the surface you actually use.
 *
 * The moments home is the shipping surface. Until now it read
 * `syncStatus.signedOut` for one toast tail and nothing else: the sync notice
 * that reports "this is on your device, not in your account yet" renders only
 * inside `LifeOSCockpit`. So the most frequent state in the app was invisible
 * exactly where a person spends their day. NFR-006 counts hiding state as a
 * violation of the same weight as jargon.
 *
 * SHOWS ONLY WHEN SOMETHING IS WAITING
 * ------------------------------------
 * When every write has reached the account this renders nothing. Silence is
 * the honest signal, and it is the one that keeps the indicator meaningful: a
 * permanent "all synced" marker is furniture, and the eye stops seeing
 * furniture long before the day it finally says something different. The
 * design handoff's own critique names this failure mode ("Housekeeping shown
 * first" — device-only drafts expanded before the user has typed a word) and
 * its principles say to disclose progressively and quiet the chrome.
 *
 * `resolveDeviceSaveNotice` returning `null` is the whole seam: a persistent
 * marker, if it is ever wanted, is a resting state rendered here on `null` and
 * nothing else in the app changes.
 *
 * GLANCE -> DETAIL (NFR-006)
 * --------------------------
 * Glance is two words and a dot in the masthead line — enough to know your
 * work is here and not there, at a cost of one saccade. Detail is the full
 * sentence (and the sign-in door when that is the reason), and it unfolds
 * only when asked for. Nothing is truncated: the glance layer is a summary of
 * a sentence that is always one tap underneath it.
 *
 * TONE
 * ----
 * This state fires through ordinary offline use and can hold for minutes at a
 * time, so the resting treatment is a quiet line in the masthead's own voice —
 * no fill, no border, no badge count, nothing that reads as data loss. Only a
 * real failure (`alarm`) takes the watch color, and it still never blocks
 * anything. The label changes with it: "Device only" would be untrue when the
 * browser is refusing to hold the work on this device at all.
 */

export interface DeviceSaveIndicatorProps {
  status: WorkflowSyncStatus;
}

export function DeviceSaveIndicator({ status }: DeviceSaveIndicatorProps) {
  const pathname = usePathname();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const notice = resolveDeviceSaveNotice(status);

  // A state that resolves while the detail is open must not leave an empty
  // popover floating over the masthead.
  useEffect(() => {
    if (!notice) setOpen(false);
  }, [notice]);

  // Same close behavior as AreaSelector's popup, so the masthead has one
  // idiom: outside pointer-down closes, Escape closes and hands focus back.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (!notice) return null;

  const alarm = notice.tone === "alarm";
  const label = alarm ? SAVE_PROBLEM_SHORT_LABEL : DEVICE_ONLY_SHORT_LABEL;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      className="relative self-center"
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !containerRef.current?.contains(next)) setOpen(false);
      }}
      data-testid="device-save-indicator"
      data-tone={notice.tone}
    >
      {/* The announcement is the sentence, not the two-word label — a screen
          reader should hear what actually happened the moment it happens,
          without having to go looking for a control to open. */}
      <span role="status" aria-live="polite" className="sr-only">
        {notice.message}
      </span>

      <button
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          HIT_TARGET_ROW,
          "group inline-flex items-center gap-2 rounded-full px-1 text-sm text-muted-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
        )}
        data-testid="device-save-indicator-trigger"
      >
        {/* Never the only signal: the label beside it says the same thing.
            Inline style, not a border/background utility — globals.css's
            unlayered `* { @apply border-border; }` reset outranks Tailwind's
            color utilities (see AreaSelector.tsx for the full explanation). */}
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{
            background: alarm
              ? "var(--state-watch)"
              : "var(--muted-foreground)",
          }}
        />
        <span>{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:duration-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-lg"
          data-testid="device-save-indicator-detail"
        >
          <p>{notice.message}</p>
          {/* #688: the one state that has a door gets the door, right here. */}
          {notice.signedOut ? (
            <Link
              href={`/login?next=${encodeURIComponent(pathname ?? "/")}`}
              className={cn(
                HIT_TARGET_ROW,
                "mt-3 inline-flex items-center rounded-full border border-border bg-muted/40 px-4 text-sm font-semibold text-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
              )}
              data-testid="device-save-indicator-signin-link"
            >
              Sign in
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
