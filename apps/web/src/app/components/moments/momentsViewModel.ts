/**
 * Moments pass P1 — packet: structural moments (Start/Flow/Close cockpit).
 *
 * #590 slice 3: this file is now a barrel over the per-moment view-model
 * modules in `./momentsViewModel/` (shared helpers, then start/flow/close),
 * preserving the existing import surface (`./momentsViewModel` /
 * `@/app/components/moments/momentsViewModel`) for every call site and test
 * unchanged. See `./momentsViewModel/shared.ts` for the pure-selector
 * contract that applies to every builder re-exported here.
 */

export * from "./momentsViewModel/shared";
export * from "./momentsViewModel/start";
export * from "./momentsViewModel/flow";
export * from "./momentsViewModel/close";
