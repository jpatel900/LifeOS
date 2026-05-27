import type { DataProvider } from "./data/workflow";

export type AiSortingAvailability =
  | "ai_configured"
  | "ai_unavailable"
  | "mock";

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
      return "AI sorting is unavailable here. Save and organize will use on-device sorting.";
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
