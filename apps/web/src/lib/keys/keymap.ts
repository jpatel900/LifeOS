export type MomentValue = "start" | "flow" | "close";

export type MomentKeyActionId =
  | "switch-start"
  | "switch-flow"
  | "switch-close"
  | "open-capture"
  | "cycle-area"
  | "toggle-theme"
  | "open-command-palette"
  | "primary-action"
  | "escape";

export interface MomentKeyBinding {
  id: MomentKeyActionId;
  key: string;
  label: string;
  chord?: {
    metaOrCtrl?: boolean;
  };
  caseInsensitive?: boolean;
  moment?: MomentValue;
}

export const MOMENT_KEY_BINDINGS = [
  { id: "switch-start", key: "1", label: "1", moment: "start" },
  { id: "switch-flow", key: "2", label: "2", moment: "flow" },
  { id: "switch-close", key: "3", label: "3", moment: "close" },
  {
    id: "open-capture",
    key: "c",
    label: "C",
    caseInsensitive: true,
  },
  // D-10 (#483): the masthead area picker (AreaSelector.tsx) cycles through
  // "All areas" + each area on "A" — mirrors the design prototype's
  // cycleArea() binding. Not wired through useMomentKeyboard (that hook's
  // ownership sits outside this packet's file list); AreaSelector attaches
  // its own guarded window listener, matching this same collision-checked
  // definition.
  {
    id: "cycle-area",
    key: "a",
    label: "A",
    caseInsensitive: true,
  },
  // D-10 (#483): the masthead theme toggle (MastheadThemeToggle.tsx) flips
  // light/dark on "D" — mirrors the design prototype's toggleTheme()
  // binding. Same not-through-useMomentKeyboard note as cycle-area above.
  {
    id: "toggle-theme",
    key: "d",
    label: "D",
    caseInsensitive: true,
  },
  {
    id: "open-command-palette",
    key: "k",
    label: "⌘K",
    chord: { metaOrCtrl: true },
    caseInsensitive: true,
  },
  { id: "primary-action", key: "Enter", label: "↵" },
  { id: "escape", key: "Escape", label: "Esc" },
] as const satisfies readonly MomentKeyBinding[];

export function momentKeyBindingById(id: MomentKeyActionId): MomentKeyBinding {
  const binding = MOMENT_KEY_BINDINGS.find((candidate) => candidate.id === id);
  if (!binding) {
    throw new Error(`Unknown moment key binding: ${id}`);
  }
  return binding;
}

export function momentKeyLabel(id: MomentKeyActionId): string {
  return momentKeyBindingById(id).label;
}

export function momentKeyCollisionKey(binding: MomentKeyBinding): string {
  const key = binding.caseInsensitive ? binding.key.toLowerCase() : binding.key;
  const modifiers = binding.chord?.metaOrCtrl ? "metaOrCtrl+" : "";
  return `${modifiers}${key}`;
}

export function matchesMomentKeyBinding(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">,
  binding: MomentKeyBinding,
): boolean {
  const eventKey = binding.caseInsensitive
    ? event.key.toLowerCase()
    : event.key;
  const bindingKey = binding.caseInsensitive
    ? binding.key.toLowerCase()
    : binding.key;

  if (eventKey !== bindingKey) return false;
  if (binding.chord?.metaOrCtrl) return event.metaKey || event.ctrlKey;
  return true;
}
