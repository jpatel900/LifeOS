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
 * inline notices) converted the first five sites. Slice B converted the sync
 * and storage banners in `cockpit/StatusBanners.tsx`, `WorkflowContext.tsx`,
 * `workflowContext/persistenceSync.ts`, `workflowContext/reducerCore.ts`,
 * `workflowContext/taskMapDraft.ts` and `workflowContext/calendarApproval.ts`
 * — 39 strings, every one of which now reads its words from this file. Slice
 * D (AI failure copy) and Slice E (data-layer messages) and every future
 * surface MUST import from here rather than re-phrase. If a surface genuinely
 * needs different words, that is a signal it is reporting a DIFFERENT state —
 * say what makes it different, do not paraphrase this one.
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
 * The banner form of the same fact, for the surfaces #692 Slice B owns.
 *
 * Every `markLocalOnly(...)` call in `WorkflowContext.tsx`,
 * `workflowContext/persistenceSync.ts` and `workflowContext/taskMapDraft.ts`
 * reports one state — the write landed here, it is not in the account — and
 * differs only in WHICH piece of work it is about. Before #692 each site
 * spelled that out again ("Plan saved locally; account sync is pending.",
 * "Win saved locally; account sync is pending.", …): 24 call sites, 20
 * different sentences for one fact.
 *
 * So the sentence lives here once and the call site passes only its subject:
 *
 *   markLocalOnly(savedOnThisDeviceBanner("Your plan"));
 *   -> "Your plan is saved on this device and not in your account yet."
 *
 * `subject` is a capitalised noun phrase and nothing else — no verb, no
 * punctuation. If a call site wants to add words after the phrase, that is the
 * signal it is reporting a different state; give that state its own constant
 * in this file rather than growing a second shape here.
 *
 * WHY IT STOPS AT THE FACT. `SAVED_ON_THIS_DEVICE_LONG` adds "LifeOS will add
 * it to your account as soon as it can." That promise is true of captures
 * (`lib/capture/offlineQueue.ts` really does re-send them) and NOT true of the
 * other local-only writes: when the account becomes reachable,
 * `syncPersistedWorkflowRows` re-READS account rows and never re-pushes a
 * local-only write. So this form states where the work is and promises
 * nothing. Do not "improve" it by appending the LONG tail without first making
 * the retry real.
 */
export function savedOnThisDeviceBanner(subject: string) {
  return `${subject} is ${SAVED_ON_THIS_DEVICE_SHORT}.`;
}

/**
 * The four whole-account states the sync banner can be in (#692 Slice B).
 *
 * These are NOT variants of `savedOnThisDeviceBanner` — that one is about a
 * single piece of work the user just touched, these are about the account
 * connection itself, so they say what LifeOS could not do BEFORE saying where
 * the work ended up. They still close on `SAVED_ON_THIS_DEVICE_SHORT`, so a
 * reader who sees both in one session reads the same words for the same fact.
 *
 * Tone split, and it is the whole point on this surface: UNREACHABLE and
 * SOME_WORK are ordinary states that fire during normal use (they are what a
 * signed-out or offline session shows on every save), so they carry no failure
 * words. SAVE_FAILED and NEEDS_APP_UPDATE are real failures and are allowed to
 * say so plainly.
 */
export const ACCOUNT_UNREACHABLE_NOW = `LifeOS can't reach your account right now, so your work is ${SAVED_ON_THIS_DEVICE_SHORT}.`;

export const SOME_WORK_ON_THIS_DEVICE =
  savedOnThisDeviceBanner("Some of your work");

export const ACCOUNT_SAVE_FAILED = `Saving to your account didn't work. Your work is ${SAVED_ON_THIS_DEVICE_SHORT}.`;

export const ACCOUNT_NEEDS_APP_UPDATE =
  "LifeOS needs an update before it can save this to your account. Open Health to see the next step.";

/**
 * The browser refuses to hold anything on this device (private mode, a storage
 * quota, a blocking extension). This one IS alarming and should read that way:
 * unlike every other state in this file the work is not safely anywhere, and
 * reloading the page loses it.
 */
export const DEVICE_STORAGE_BLOCKED =
  "This browser is blocking LifeOS from keeping your work on this device, so anything you do may be lost if you reload the page.";

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
 * `workflowContext/calendarApproval.ts` carried the pre-#692 wording of
 * UNAVAILABLE_HERE as a literal until Slice B pointed it at this constant.
 * Both users of UNAVAILABLE_HERE now read it from here.
 */
export const GOOGLE_CALENDAR_UNAVAILABLE_HERE =
  "LifeOS isn't fully set up here, so Google Calendar isn't available. Local planning still works.";

export const GOOGLE_CALENDAR_NOT_SET_UP =
  "Google Calendar isn't set up on LifeOS yet. Local planning still works without it.";

/**
 * The two Google blockers that are really the SAVED_ON_THIS_DEVICE state in
 * disguise (#692 Slice B, `workflowContext/calendarApproval.ts`).
 *
 * LifeOS writes to Google from the account copy of a row, so a proposal or
 * block that has not reached the account cannot be sent. Before #692 these
 * said "has not synced to your account yet … Try again after sync", which is
 * the same fact as `SAVED_ON_THIS_DEVICE_SHORT` in different words — they now
 * open with that phrase and then say what it blocks. Keep the two separate:
 * the objects differ, and so does the blocked action.
 */
export const PROPOSAL_NOT_IN_ACCOUNT_FOR_GOOGLE = `This proposal is ${SAVED_ON_THIS_DEVICE_SHORT}, so LifeOS can't add it to Google Calendar. Try again once it reaches your account.`;

export const BLOCK_NOT_IN_ACCOUNT_FOR_GOOGLE = `This block is ${SAVED_ON_THIS_DEVICE_SHORT}, so LifeOS can't cancel its Google event from here.`;

/**
 * What the capture parser did, in the words this module already ships (#692
 * Slice B, `cockpit/StatusBanners.tsx`).
 *
 * These three replaced "the built-in mock parser drafted this capture" and
 * "Parse with mock parser". The user-facing name for that fallback is NOT new
 * wording: `aiSortingAvailabilityLabel` / `aiSortingAvailabilityDetail` a few
 * lines below already ship "On-device sorting ready" and "Save and organize
 * will use on-device sorting" for the identical condition, so these reuse
 * "AI sorting" and "on your device" rather than invent a fourth name for it.
 *
 * #692 Slice D owns the remaining "mock parser" copy in `lib/ai/*` and
 * `api/parse-capture`. It should import these instead of writing its own.
 */
export const AI_SORTING_UNAVAILABLE_SORTED_HERE =
  "AI sorting is unavailable right now, so LifeOS sorted this capture on your device.";

export const AI_SORTING_OFF_SORTED_HERE =
  "AI sorting is turned off, so LifeOS sorted this capture on your device.";

export const SORT_ON_THIS_DEVICE_ACTION = "Sort on this device";

/**
 * WHEN A SORT DOES NOT PRODUCE DRAFTS (#692 Slice D).
 *
 * The two constants below are the only Slice D strings a person can actually
 * read. `/api/parse-capture` and `parseCaptureClient.ts` each used to carry
 * their own sentence about "the mock parser"; both now read from here, and
 * both render in two places with opposite amounts of surrounding help:
 *
 *  - `moments/UnsortedCaptures.tsx` folds the sentence into a "What happened?"
 *    disclosure, under its own reassurance line. Detail layer.
 *  - `cockpit/StatusBanners.tsx` (`CaptureParseNotice`) renders it BARE, as the
 *    only sentence in the banner, with no reassurance around it.
 *
 * The bare case is why each sentence carries its own "your thought is still
 * saved" guarantee instead of leaning on a wrapper. That guarantee is not
 * decoration: raw captures surviving AI failure is a binding invariant
 * (AGENTS.md), and since #703 a sort only ever runs on a capture that is
 * already stored, so the sentence is literally true on both paths.
 *
 * WHY TWO AND NOT ONE. They are different states with different odds:
 * UNAVAILABLE means AI sorting is not on the table at all right now, so trying
 * again changes nothing. FAILED means AI sorting is set up and this attempt did
 * not work, so trying again might. Collapsing them would tell a person to retry
 * something that cannot succeed.
 *
 * WHY NOT THREE. `AI_SORTING_UNAVAILABLE_SORTED_HERE` above is NOT a substitute
 * for either: it reports a sort that SUCCEEDED on this device, and these two
 * report no drafts at all. Reusing it would claim work that did not happen.
 *
 * KNOWN LIMIT, recorded rather than papered over: FAILED still covers both "the
 * AI could not be reached" and "the AI answered with something LifeOS could not
 * use". Those are different causes with the same remedy, and separating them in
 * copy would mean adding a branch to `safeParserFailureMessage` — a behavior
 * change this slice deliberately does not make. Tracked on #692.
 */
const THOUGHT_STILL_SAVED_SORT_HERE =
  "Your thought is still saved, exactly as you wrote it. You can sort it on this device instead.";

export const AI_SORTING_UNAVAILABLE_NOT_SORTED = `AI sorting is unavailable right now, so this one hasn't been sorted. ${THOUGHT_STILL_SAVED_SORT_HERE}`;

export const AI_SORTING_FAILED_NOT_SORTED = `LifeOS couldn't sort this one just now. ${THOUGHT_STILL_SAVED_SORT_HERE}`;

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
