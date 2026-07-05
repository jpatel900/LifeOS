// Prompt construction for capture parsing moved to the NS-INV-1 context-assembly
// choke point (`../contextAssembly.ts`, issue #254). This module is a pure
// re-export shim so existing importers keep their import paths; it constructs no
// prompt messages itself. Do not add prompt-construction logic here — it belongs
// in `contextAssembly.ts` (enforced by contextAssemblyChokePoint.test.ts).
export {
  PARSE_CAPTURE_PROMPT_VERSION,
  buildParseCaptureMessages,
} from "../contextAssembly";
export type {
  BuildParseCaptureMessagesInput,
  CompensationRuleContext,
  OperatorProfileContext,
  ParseCaptureAreaContext,
  ParseCaptureMessage,
} from "../contextAssembly";
