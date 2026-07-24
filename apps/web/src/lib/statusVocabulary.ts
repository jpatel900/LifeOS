import type { DataProvider } from "./data/workflow";

export type AiSortingAvailability = "ai_configured" | "ai_unavailable" | "mock";

export type CalendarConnectionState =
  | "connected"
  | "disconnected"
  | "unavailable"
  | "not_checked";

export type SaveOutcome =
  | "persisted"
  | "skipped"
  | "unavailable"
  | "not_applicable";

export function saveModeLabel(provider: DataProvider) {
  return provider === "supabase"
    ? "Saved to account"
    : "Saved on this device only";
}

export function saveModeShortLabel(provider: DataProvider) {
  return provider === "supabase" ? "Saved to account" : "Device only";
}

export function savedViaLabel(provider: DataProvider) {
  return provider === "supabase"
    ? "saved to your account"
    : "saved on this device";
}

export function saveDestinationLabel(provider: DataProvider) {
  return provider === "supabase" ? "to your account" : "on this device";
}

/**
 * ONE PHRASE FOR "IT IS SAVED HERE, IT IS NOT IN YOUR ACCOUNT YET" (#692)
 * ======================================================================
 * REUSE THIS. DO NOT WRITE A NEW SENTENCE FOR THIS FACT.
 *
 * A dozen surfaces across the app report the same single state: the user's
 * work is safely on this device, and it has not reached their account yet.
 * Before #692 they each said it differently — "waiting to sync", "saved
 * locally — account sync pending", "Local-only data stays on this device".
 * Several plain-English phrasings for one state are WORSE for the reader than
 * one consistent piece of jargon, because the reader then has to work out
 * whether the surfaces mean different things. They do not.
 *
 * So this is the single home for that sentence. #692 Slice C (toasts and
 * inline notices) converted the first five sites. Slice B (the sync and
 * storage banners in `cockpit/StatusBanners.tsx`, `WorkflowContext.tsx`,
 * `workflowContext/persistenceSync.ts`, `workflowContext/reducerCore.ts`,
 * `workflowContext/taskMapDraft.ts`) and every future surface MUST import
 * from here rather than re-phrase. If a surface genuinely needs different
 * words, that is a signal it is reporting a DIFFERENT state — say what makes
 * it different, do not paraphrase this one.
 *
 * It lives beside `saveModeLabel` / `savedViaLabel` / `saveDestinationLabel`
 * on purpose: those already ship "saved on this device" and "to your account"
 * to the user, and this phrase has to stay the same words as they do.
 *
 * SHORT vs LONG — both say the same thing, at two lengths:
 *  - SHORT is a lower-case clause for places with no room: a toast tail after
 *    the event that happened, a nav badge, a status pill. It is always
 *    appended to something ("Review …", "Day closed — …", "3 captures …"),
 *    never used as a standalone sentence.
 *  - LONG is the standalone sentence for banners, alerts, and panels that have
 *    room to add what happens next.
 *
 * Tone bar: this is a NORMAL state, not an error and not data loss. It must
 * read as calm and factual. Do not add warning words, and do not promise a
 * time — LifeOS cannot know when the account becomes reachable.
 */
export const SAVED_ON_THIS_DEVICE_SHORT =
  "saved on this device and not in your account yet";

export const SAVED_ON_THIS_DEVICE_LONG =
  "Saved on this device and not in your account yet. LifeOS will add it to your account as soon as it can.";

/**
 * The two ways Google Calendar can be off the table, in plain words (#692).
 *
 * Both sentences are the ones #731 shipped on the Google Calendar settings
 * panel for the same two conditions; they are lifted here verbatim so the
 * approval bridge and the settings screen cannot drift apart. The conditions
 * stay distinct because the remedy is distinct: UNAVAILABLE_HERE means this
 * LifeOS install has no account connection at all, NOT_SET_UP means the
 * Google integration itself was never configured.
 *
 * `workflowContext/calendarApproval.ts` still carries the pre-#692 wording of
 * UNAVAILABLE_HERE as a literal; #692 Slice B owns that file and should point
 * it at this constant rather than write a third version.
 */
export const GOOGLE_CALENDAR_UNAVAILABLE_HERE =
  "LifeOS isn't fully set up here, so Google Calendar isn't available. Local planning still works.";

export const GOOGLE_CALENDAR_NOT_SET_UP =
  "Google Calendar isn't set up on LifeOS yet. Local planning still works without it.";

export function aiSortingAvailabilityLabel(status: AiSortingAvailability) {
  switch (status) {
    case "ai_configured":
      return "AI sorting on";
    case "ai_unavailable":
      return "AI sorting unavailable";
    case "mock":
      return "On-device sorting ready";
  }
}

export function aiSortingAvailabilityDetail(status: AiSortingAvailability) {
  switch (status) {
    case "ai_configured":
      return "Save and organize will use AI sorting.";
    case "ai_unavailable":
      return "AI sorting is unavailable here. Save and organize will use on-device sorting. Add AI setup later if you want AI-assisted sorting.";
    case "mock":
      return "Save and organize will use on-device sorting.";
  }
}

export function calendarConnectionLabel(status: CalendarConnectionState) {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "unavailable":
      return "Unavailable";
    case "not_checked":
      return "Not checked";
  }
}

export function systemCheckSaveLabel(status: SaveOutcome) {
  switch (status) {
    case "persisted":
      return "Saved";
    case "skipped":
      return "Not saved";
    case "unavailable":
      return "Save failed";
    case "not_applicable":
      return "Not applicable";
  }
}
