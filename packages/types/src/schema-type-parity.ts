/**
 * Compile-time guard: `@lifeos/types` must remain thin re-exports of Zod-inferred types
 * from `@lifeos/schemas`. Replacing `index.ts` with manual interfaces risks drift from
 * runtime validation; this module fails `tsc` when exported shapes diverge.
 */
import type { Area, Capture, CaptureItem } from "@lifeos/schemas";
import type {
  Area as TypesArea,
  Capture as TypesCapture,
  CaptureItem as TypesCaptureItem,
} from "./index";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;

type Expect<T extends true> = T;

type _AreaAligned = Expect<Equal<TypesArea, Area>>;
type _CaptureItemAligned = Expect<Equal<TypesCaptureItem, CaptureItem>>;
type _CaptureAliasAligned = Expect<Equal<TypesCapture, Capture>>;
