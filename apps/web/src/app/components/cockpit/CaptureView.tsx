import { CaptureCore } from "../moments/CaptureCore";
import { Panel } from "./shared";

// Capture stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change).
//
// #556: the /capture route composes the same shared CaptureCore as the
// moments overlay and Execute side-capture. This keeps its page-specific
// chrome (the large borderless hero textarea, the "Saves raw text
// first"/"Create an area before capture" caption) but delegates the raw-save,
// save and "back to: <hook>" conclusion to CaptureCore — the same logic, not
// a reimplementation of it. #703: one action; parsing moved to triage.
export function CaptureView({
  hasArea,
  onLockChange,
  onSubmit,
  onResolved,
}: {
  hasArea: boolean;
  onLockChange: (locked: boolean) => void;
  onSubmit: (text: string, returnHook: string | null) => void;
  onResolved: () => void;
}) {
  return (
    <Panel className="grid min-h-[560px] place-items-center">
      <div className="w-full max-w-2xl">
        <h1 className="sr-only">Capture</h1>
        <CaptureCore
          mode="full"
          testIdPrefix="capture-page"
          submitShortcut="mod-enter"
          placeholder="Drop the thought here."
          textareaClassName="min-h-64 resize-none border-0 bg-transparent text-3xl font-semibold leading-tight text-[var(--ink)] outline-none placeholder:text-[var(--fnt)] focus-visible:ring-0 focus:caret-[var(--acc)]"
          saveButtonClassName="min-h-12 rounded-full px-6 font-bold bg-[var(--acc)] text-[var(--on-acc)] disabled:cursor-not-allowed disabled:bg-[var(--sf3)] disabled:text-[var(--fnt)]"
          disabledReason={hasArea ? null : "Create an area before capture"}
          hint={
            hasArea
              ? "Saved exactly as you write it. Sort it into a task later, in Triage."
              : "Create an area before capture"
          }
          onLockChange={onLockChange}
          onSubmit={onSubmit}
          onResolved={onResolved}
        />
      </div>
    </Panel>
  );
}
