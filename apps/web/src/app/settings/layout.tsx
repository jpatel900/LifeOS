import type { ReactNode } from "react";
import { AdminShell } from "../components/AppShell";

/**
 * Part of #687 (defect 2, fresh-eyes judge): gives `/settings/*` its own
 * structural boundary for `AdminShell` (header, nav, skip link, centered
 * wrapper) instead of `AppShell.tsx` guessing "are we under /settings" from
 * `usePathname()` — see that file's own comment for the full diagnosis of
 * why the guess produced a hydration mismatch (#418) on every 404 nested
 * under this segment.
 *
 * A plain server layout: it calls no dynamic API (no `cookies()`/
 * `headers()`/`searchParams`), so it does not change `/settings` or
 * `/settings/areas` out of their existing static (`○`) classification —
 * `lib/momentsPreferencesCookie.ts`'s header records that trade-off as
 * already-decided; this file does not touch it. Next only ever enters this
 * layout for a REQUEST that matched a real page under `/settings/*`; a
 * genuinely unmatched deep path (`/settings/nope`) falls straight through to
 * the app-wide `/_not-found` boundary under the root layout instead, so this
 * layout — and therefore `AdminShell` — is never in play for that case,
 * consistently on the server and any client hydration.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
