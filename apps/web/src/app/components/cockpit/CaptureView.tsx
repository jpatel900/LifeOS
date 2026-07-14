import type { CaptureParseState } from "@/lib/WorkflowContext";
import { CaptureCore, type CaptureCoreOutcome } from "../moments/CaptureCore";
import { Panel } from "./shared";

// Capture stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change).
//
// #556: the /capture route composes the same shared CaptureCore as the
// moments overlay and Execute side-capture. This keeps its page-specific
// chrome (the large borderless hero textarea, the "Saves raw text
// first"/"Create an area before capture" caption) but delegates the raw-save,
// parse-wait containment, degraded-parse offer, and "back to: <hook>"
// conclusion to CaptureCore — the same logic, not a reimplementation of it.
export function CaptureView({
  hasArea,
  captureParse,
  onLockChange,
  onRetryWithMock,
  onSubmitParse,
  onSubmitRaw,
  onResolved,
}: {
  hasArea: boolean;
  captureParse: CaptureParseState;
  onLockChange: (locked: boolean) => void;
  onRetryWithMock: () => void;
  onSubmitParse: (text: string, returnHook: string | null) => void;
  onSubmitRaw: (text: string, returnHook: string | null) => void;
  onResolved: (outcome: CaptureCoreOutcome) => void;
}) {
  return (
    <Panel className="grid min-h-[560px] place-items-center">
      <div className="w-full max-w-2xl">
        <h1 className="sr-only">Capture</h1>
        <CaptureCore
          mode="parse"
          testIdPrefix="capture-page"
          submitShortcut="mod-enter"
          placeholder="Drop the thought here."
          textareaClassName="min-h-64 resize-none border-0 bg-transparent text-3xl font-semibold leading-tight text-[var(--ink)] outline-none placeholder:text-[var(--fnt)] focus-visible:ring-0 focus:caret-[var(--acc)]"
          saveButtonClassName="min-h-12 rounded-full px-6 font-bold bg-[var(--acc)] text-[var(--on-acc)] disabled:cursor-not-allowed disabled:bg-[var(--sf3)] disabled:text-[var(--fnt)]"
          saveRawButtonClassName="text-[var(--mut)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:text-[var(--fnt)]"
          disabledReason={hasArea ? null : "Create an area before capture"}
          hint={
            hasArea ? "Saves raw text first" : "Create an area before capture"
          }
          captureParse={captureParse}
          onLockChange={onLockChange}
          onRetryWithMock={onRetryWithMock}
          onSubmitParse={onSubmitParse}
          onSubmitRaw={onSubmitRaw}
          onResolved={onResolved}
        />
      </div>
    </Panel>
  );
}
